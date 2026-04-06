import { mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { io, type Socket } from "socket.io-client";
import { db } from "../packages/db/index";
import { GAME_EVENTS, ROOM_EVENTS } from "../packages/shared/src/events";

const WEB_URL = "http://127.0.0.1:3000";
const SERVER_URL = "http://127.0.0.1:8080";
const REPO_ARTIFACTS_DIR = fileURLToPath(new URL(".", import.meta.url));
const ATTEMPT_ARTIFACTS_DIR =
  process.env.ATTEMPT_ARTIFACTS_DIR ?? REPO_ARTIFACTS_DIR;
const VIDEO_DIR = join(ATTEMPT_ARTIFACTS_DIR, "full-game-demo-raw");
const OUTPUT_WEBM = join(ATTEMPT_ARTIFACTS_DIR, "jprty-full-game-demo.webm");
const OUTPUT_MP4 = join(ATTEMPT_ARTIFACTS_DIR, "jprty-full-game-demo.mp4");
const OUTPUT_JSON = join(ATTEMPT_ARTIFACTS_DIR, "jprty-full-game-demo.json");
const OUTPUT_SCREENSHOT = join(ATTEMPT_ARTIFACTS_DIR, "jprty-full-game-results.png");
const OUTPUT_HTML = join(ATTEMPT_ARTIFACTS_DIR, "jprty-full-game-demo.html");

type JoinedPayload = {
  player: {
    id: string;
    name?: string;
  };
};

type GameStateResponse = {
  phase: string;
  currentPlayerId?: string;
  selectorPlayerId?: string;
  currentQuestion?: {
    id: string;
    clue: string;
    value?: number;
    category?: string;
  };
  board?: {
    categories: string[];
    grid: Array<{
      questionId: string;
      value: number;
      isUsed: boolean;
      isDailyDouble: boolean;
      row: number;
      col: number;
    }>;
  };
  scores: Array<[string, number]>;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runCommand(command: string, args: string[]) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} exited with code ${code ?? "unknown"}`));
    });
  });
}

async function waitFor<T>(
  label: string,
  fn: () => Promise<T | null | undefined>,
  timeoutMs = 30_000,
  intervalMs = 200,
): Promise<T> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const result = await fn();
    if (result) {
      return result;
    }
    await sleep(intervalMs);
  }

  throw new Error(`Timed out waiting for ${label}`);
}

async function joinPlayer(roomCode: string, playerName: string) {
  const socket = io(SERVER_URL, {
    transports: ["websocket"],
    forceNew: true,
    reconnection: false,
  });

  await waitFor(`socket connect for ${playerName}`, async () => {
    if (socket.connected) {
      return true;
    }
    return null;
  });

  const joined = await new Promise<JoinedPayload>((resolve, reject) => {
    const onJoined = (payload: JoinedPayload) => {
      cleanup();
      resolve(payload);
    };
    const onError = (payload: { message: string }) => {
      cleanup();
      reject(new Error(payload.message));
    };
    const cleanup = () => {
      socket.off(ROOM_EVENTS.JOINED, onJoined);
      socket.off(ROOM_EVENTS.ERROR, onError);
    };

    socket.on(ROOM_EVENTS.JOINED, onJoined);
    socket.on(ROOM_EVENTS.ERROR, onError);
    socket.emit(ROOM_EVENTS.JOIN, { roomCode, playerName });
  });

  return {
    socket,
    playerId: joined.player.id,
    playerName,
  };
}

async function fetchGameState(roomCode: string) {
  const response = await fetch(`${SERVER_URL}/api/game-state/${roomCode}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch game state for ${roomCode}: ${response.status}`);
  }

  return response.json() as Promise<GameStateResponse>;
}

async function waitForPhase(roomCode: string, phases: string[], timeoutMs = 30_000) {
  return waitFor(
    `phase ${phases.join(", ")}`,
    async () => {
      const state = await fetchGameState(roomCode);
      return phases.includes(state.phase) ? state : null;
    },
    timeoutMs,
  );
}

async function getAnswer(questionId: string) {
  const question = await db.question.findUnique({
    where: { id: questionId },
    select: { answer: true },
  });

  if (!question) {
    throw new Error(`Question ${questionId} not found`);
  }

  return question.answer;
}

async function main() {
  await mkdir(VIDEO_DIR, { recursive: true });
  await mkdir(ATTEMPT_ARTIFACTS_DIR, { recursive: true });

  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    recordVideo: {
      dir: VIDEO_DIR,
      size: { width: 1440, height: 960 },
    },
  });

  const page = await context.newPage();
  const startedAt = new Date();
  await page.goto(WEB_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });

  const room = await waitFor("room record", async () =>
    db.room.findFirst({
      where: {
        createdAt: {
          gte: startedAt,
        },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, code: true },
    }),
  );
  const roomCode = room.code;

  await db.gameConfiguration.update({
    where: { roomId: room.id },
    data: {
      buzzWindowMs: 1_000,
      answerWindowMs: 5_000,
      revealWindowMs: 1_000,
      roundCount: 1,
      questionsPerCategory: 5,
    },
  });

  const ada = await joinPlayer(roomCode, "Ada");
  const grace = await joinPlayer(roomCode, "Grace");

  await page.getByText("Ada", { exact: true }).first().waitFor({ timeout: 15_000 });
  await page.getByText("Grace", { exact: true }).first().waitFor({ timeout: 15_000 });
  await sleep(1_500);

  await page.getByRole("button", { name: "Start Game" }).click();
  await page.waitForURL(new RegExp(`/room/${roomCode}/host`), { timeout: 60_000, waitUntil: "domcontentloaded" });

  const playerSockets: Record<string, Socket> = {
    [ada.playerId]: ada.socket,
    [grace.playerId]: grace.socket,
  };

  const questionHistory: Array<{
    questionId: string;
    selectorPlayerId?: string;
    answeringPlayerId?: string;
    category?: string;
    value?: number;
  }> = [];
  let questionIndex = 0;

  await waitForPhase(roomCode, ["SELECTING"]);

  while (true) {
    const state = await fetchGameState(roomCode);

    if (state.phase === "GAME_END") {
      break;
    }

    if (state.phase === "SELECTING") {
      const selectorSocket = state.selectorPlayerId ? playerSockets[state.selectorPlayerId] : ada.socket;
      const nextCell = state.board?.grid
        .filter((cell) => !cell.isUsed)
        .sort((a, b) => (a.row - b.row) || (a.col - b.col))[0];

      if (!selectorSocket || !nextCell) {
        throw new Error("Unable to select the next question");
      }

      questionHistory.push({
        questionId: nextCell.questionId,
        selectorPlayerId: state.selectorPlayerId,
      });
      selectorSocket.emit(GAME_EVENTS.SELECT_QUESTION, { questionId: nextCell.questionId });
      await waitForPhase(roomCode, ["READING", "DAILY_DOUBLE", "BUZZING", "REVEALING"]);
      continue;
    }

    if (state.phase === "READING") {
      await waitForPhase(roomCode, ["BUZZING", "DAILY_DOUBLE", "REVEALING"]);
      continue;
    }

    if (state.phase === "DAILY_DOUBLE") {
      const answeringSocket = state.currentPlayerId ? playerSockets[state.currentPlayerId] : null;
      if (!answeringSocket) {
        throw new Error("Daily Double player socket unavailable");
      }

      const wager = Math.max(5, Math.min(state.currentQuestion?.value ?? 1000, 1000));
      answeringSocket.emit(GAME_EVENTS.SUBMIT_WAGER, { wager });
      await waitForPhase(roomCode, ["DAILY_DOUBLE_ANSWER"]);
      continue;
    }

    if (state.phase === "BUZZING") {
      const currentPlayer = questionIndex % 2 === 0 ? ada : grace;
      currentPlayer.socket.emit(GAME_EVENTS.BUZZ);
      await waitForPhase(roomCode, ["ANSWERING", "REVEALING"]);
      continue;
    }

    if (state.phase === "ANSWERING" || state.phase === "DAILY_DOUBLE_ANSWER") {
      if (!state.currentPlayerId || !state.currentQuestion) {
        throw new Error(`Missing active player or question in phase ${state.phase}`);
      }

      const answeringSocket = playerSockets[state.currentPlayerId];
      const answer = await getAnswer(state.currentQuestion.id);
      questionHistory[questionHistory.length - 1] = {
        ...questionHistory[questionHistory.length - 1],
        answeringPlayerId: state.currentPlayerId,
        category: state.currentQuestion.category,
        value: state.currentQuestion.value,
      };

      answeringSocket.emit(GAME_EVENTS.SUBMIT_ANSWER, { answer });
      await waitForPhase(roomCode, ["REVEALING", "BUZZING", "SELECTING", "GAME_END"]);
      continue;
    }

    if (state.phase === "REVEALING") {
      await sleep(350);
      const selectorSocket = state.selectorPlayerId ? playerSockets[state.selectorPlayerId] : ada.socket;
      selectorSocket.emit(GAME_EVENTS.NEXT_QUESTION);
      questionIndex += 1;
      await waitForPhase(roomCode, ["SELECTING", "GAME_END"]);
      continue;
    }

    await sleep(100);
  }

  if (!page.url().includes(`/room/${roomCode}/results`)) {
    await page.goto(`${WEB_URL}/room/${roomCode}/results`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
  }
  await sleep(1_000);
  await page.screenshot({ path: OUTPUT_SCREENSHOT, fullPage: true });

  const finalRoom = await db.room.findUnique({
    where: { code: roomCode },
    include: {
      players: {
        orderBy: { score: "desc" },
        select: {
          id: true,
          name: true,
          score: true,
        },
      },
      gameSessions: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          winnerId: true,
          status: true,
          endedAt: true,
        },
      },
    },
  });

  await context.close();
  const rawVideoPath = await page.video()?.path();
  if (!rawVideoPath) {
    throw new Error("Playwright did not produce a video");
  }
  await rename(rawVideoPath, OUTPUT_WEBM);
  await browser.close();

  await runCommand("ffmpeg", [
    "-y",
    "-i",
    OUTPUT_WEBM,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    OUTPUT_MP4,
  ]);

  const summary = {
    roomCode,
    gameSession: finalRoom?.gameSessions[0] ?? null,
    players: finalRoom?.players ?? [],
    questionsPlayed: questionHistory.length,
    questionHistory,
    artifacts: {
      webm: "jprty-full-game-demo.webm",
      mp4: "jprty-full-game-demo.mp4",
      screenshot: "jprty-full-game-results.png",
      html: "jprty-full-game-demo.html",
    },
  };

  await writeFile(OUTPUT_JSON, JSON.stringify(summary, null, 2), "utf-8");
  await writeFile(
    OUTPUT_HTML,
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>jprty full game demo</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: "IBM Plex Sans", Arial, sans-serif;
      }
      body {
        margin: 0;
        background: #0f172a;
        color: #e2e8f0;
      }
      main {
        max-width: 1200px;
        margin: 0 auto;
        padding: 24px;
      }
      video, img {
        width: 100%;
        border-radius: 12px;
        border: 1px solid #334155;
        background: #020617;
      }
      a {
        color: #7dd3fc;
      }
      .meta {
        display: grid;
        gap: 12px;
        margin: 16px 0 24px;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>jprty full game gameplay demo</h1>
      <p>Recorded from a live local session with two real player sockets, visible clue selection, buzzing, answer submission, score changes, and final results.</p>
      <div class="meta">
        <div><strong>Room:</strong> ${roomCode}</div>
        <div><strong>Questions played:</strong> ${questionHistory.length}</div>
        <div><strong>Summary:</strong> <a href="./jprty-full-game-demo.json">JSON metadata</a></div>
        <div><strong>Results:</strong> <a href="./jprty-full-game-results.png">Final screenshot</a></div>
      </div>
      <video controls preload="metadata" src="./jprty-full-game-demo.mp4"></video>
      <h2>Final results</h2>
      <img src="./jprty-full-game-results.png" alt="Final results screen" />
    </main>
  </body>
</html>
`,
    "utf-8",
  );

  ada.socket.close();
  grace.socket.close();

  console.log(JSON.stringify({
    roomCode,
    video: OUTPUT_WEBM,
    mp4: OUTPUT_MP4,
    html: OUTPUT_HTML,
    screenshot: OUTPUT_SCREENSHOT,
    summary: OUTPUT_JSON,
    winner: finalRoom?.players[0] ?? null,
  }));
}

await main();
