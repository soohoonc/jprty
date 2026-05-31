import { writeFile } from "node:fs/promises";
import { chromium, type Page } from "playwright";

const WEB_URL = process.env.WEB_URL || "https://www.jprty.io";
const SPACETIME_URL = process.env.SPACETIME_URL || "https://maincloud.spacetimedb.com";
const SPACETIME_DB = process.env.SPACETIME_DB || "jprty-4wnd1";
const OUT_DIR = process.env.SMOKE_OUT_DIR || process.cwd();
const RUN_LABEL = process.env.SMOKE_LABEL || "run";

const OUT_JSON = `${OUT_DIR}/prod-ui-click-smoke-${RUN_LABEL}.json`;
const OUT_NET = `${OUT_DIR}/prod-ui-click-smoke-${RUN_LABEL}-network.json`;
const OUT_HOST_LOBBY = `${OUT_DIR}/prod-ui-click-smoke-${RUN_LABEL}-host-lobby.png`;
const OUT_PLAYER_LOBBY = `${OUT_DIR}/prod-ui-click-smoke-${RUN_LABEL}-player-lobby.png`;
const OUT_GAMEPLAY_A = `${OUT_DIR}/prod-ui-click-smoke-${RUN_LABEL}-pageA-gameplay.png`;
const OUT_GAMEPLAY_B = `${OUT_DIR}/prod-ui-click-smoke-${RUN_LABEL}-pageB-gameplay.png`;
const OUT_CLUE_A = `${OUT_DIR}/prod-ui-click-smoke-${RUN_LABEL}-pageA-clue.png`;
const OUT_CLUE_B = `${OUT_DIR}/prod-ui-click-smoke-${RUN_LABEL}-pageB-clue.png`;
const OUT_RESULT_A = `${OUT_DIR}/prod-ui-click-smoke-${RUN_LABEL}-pageA-after-answer.png`;
const OUT_RESULT_B = `${OUT_DIR}/prod-ui-click-smoke-${RUN_LABEL}-pageB-after-answer.png`;

type AnyObj = Record<string, unknown>;
type Step = { step: string; ok: boolean; detail?: unknown };

type NetworkLog = {
  requests: string[];
  websockets: string[];
  apiJprtyRequests: string[];
  apiJprtyWebsockets: string[];
  socketIoTraffic: string[];
  flyTraffic: string[];
};

const steps: Step[] = [];
const network: NetworkLog = {
  requests: [],
  websockets: [],
  apiJprtyRequests: [],
  apiJprtyWebsockets: [],
  socketIoTraffic: [],
  flyTraffic: [],
};

function getToken(): string {
  const raw = process.env.SPACETIMEDB_TOKEN || "";
  const cands = raw.match(/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) || [];
  const token = cands.sort((a, b) => b.length - a.length)[0] || "";
  if (!token) {
    throw new Error("No usable SPACETIMEDB token found in env");
  }
  return token;
}

const TOKEN = getToken();

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function step<T>(name: string, fn: () => Promise<T>): Promise<T> {
  try {
    const detail = await fn();
    steps.push({ step: name, ok: true, detail });
    return detail;
  } catch (error) {
    steps.push({
      step: name,
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

async function waitFor<T>(label: string, fn: () => Promise<T | null>, timeoutMs = 90_000, intervalMs = 500): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const value = await fn();
    if (value !== null) return value;
    await sleep(intervalMs);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function escapeSqlString(input: string): string {
  return input.replace(/'/g, "''");
}

async function sqlQuery(sql: string): Promise<AnyObj[]> {
  const res = await fetch(`${SPACETIME_URL}/v1/database/${SPACETIME_DB}/sql`, {
    method: "POST",
    headers: {
      "content-type": "text/plain",
      authorization: `Bearer ${TOKEN}`,
    },
    body: sql,
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`SQL failed (${res.status}): ${text}`);

  const parsed = JSON.parse(text) as any;
  const first = Array.isArray(parsed) ? parsed[0] : parsed;
  const rows = first?.rows ?? [];
  const schemaElements = first?.schema?.elements ?? [];

  if (!Array.isArray(rows) || !Array.isArray(schemaElements)) return [];

  if (rows.length > 0 && Array.isArray(rows[0])) {
    return rows.map((row: unknown[]) => {
      const obj: AnyObj = {};
      schemaElements.forEach((e: any, idx: number) => {
        const name = e?.name?.some;
        if (name) obj[name] = row[idx];
      });
      return obj;
    });
  }

  return rows as AnyObj[];
}

function collectUrl(url: string) {
  network.requests.push(url);
  if (url.includes("api.jprty.io")) network.apiJprtyRequests.push(url);
  if (url.includes("socket.io")) network.socketIoTraffic.push(url);
  if (url.includes("fly.dev")) network.flyTraffic.push(url);
}

function attachNetwork(page: Page) {
  page.on("request", (request) => {
    collectUrl(request.url());
  });

  page.on("websocket", (ws) => {
    const url = ws.url();
    network.websockets.push(url);
    if (url.includes("api.jprty.io")) network.apiJprtyWebsockets.push(url);
    if (url.includes("socket.io")) network.socketIoTraffic.push(url);
    if (url.includes("fly.dev")) network.flyTraffic.push(url);
  });
}

async function readRoomCodeFromHost(pageA: Page): Promise<string> {
  const codeEl = pageA.locator("span.text-5xl.font-mono.font-bold").first();
  await codeEl.waitFor({ timeout: 90_000 });
  const code = (await codeEl.innerText()).trim();
  if (!/^[A-Z]{4}$/.test(code)) {
    throw new Error(`Unexpected room code: ${code}`);
  }
  return code;
}

async function readClueFromPlayer(pageB: Page): Promise<string> {
  return waitFor("clue text on player page", async () => {
    const candidates = await pageB.locator("p, h1, h2, h3").allTextContents();
    const clue = candidates.map((t) => t.trim()).find((t) =>
      t.length > 20 &&
      !t.includes("YOUR SCORE") &&
      !t.includes("Get ready") &&
      !t.includes("BUZZ")
    );
    return clue || null;
  }, 60_000);
}

async function findAnswerForClue(roomId: string, clueText: string): Promise<string> {
  const escaped = escapeSqlString(clueText);
  const rows = await sqlQuery(
    `select answer from live_game_board_cell where room_id = '${escapeSqlString(roomId)}' and clue = '${escaped}' limit 1`,
  );
  const answer = String(rows[0]?.answer || "").trim();
  if (!answer) {
    throw new Error("Could not resolve answer from SpacetimeDB for selected clue");
  }
  return answer;
}

async function main() {
  const result: AnyObj = {
    startedAt: new Date().toISOString(),
    webUrl: WEB_URL,
    spacetime: { url: SPACETIME_URL, database: SPACETIME_DB },
    runLabel: RUN_LABEL,
    steps,
  };

  const browser = await chromium.launch({ headless: true, executablePath: "/usr/bin/chromium" });
  const ctxA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();

  attachNetwork(pageA);
  attachNetwork(pageB);

  try {
    const roomCode = await step("page A open host UI and create room", async () => {
      await pageA.goto(`${WEB_URL}/`, { waitUntil: "domcontentloaded", timeout: 90_000 });
      await pageA.waitForSelector('h1:has-text("JPRTY!")', { timeout: 60_000 });
      return readRoomCodeFromHost(pageA);
    });
    result.roomCode = roomCode;

    await pageA.screenshot({ path: OUT_HOST_LOBBY, fullPage: true });

    const roomRow = await step("verify room exists in SpacetimeDB", async () =>
      waitFor("live_room row", async () => {
        const rows = await sqlQuery(
          `select room_id, room_code, phase, num_players from live_room where room_code = '${roomCode}' limit 1`,
        );
        return rows[0] ?? null;
      }),
    );

    const roomId = String((roomRow as AnyObj).room_id || "");
    if (!roomId) throw new Error("Missing room_id from live_room");
    result.roomId = roomId;

    const playerName = `E12P-${RUN_LABEL}`;
    await step("page B join same room via UI", async () => {
      await pageB.goto(`${WEB_URL}/`, { waitUntil: "domcontentloaded", timeout: 90_000 });
      const joinSwitch = pageB.getByRole("button", { name: "Join a game instead" });
      if (await joinSwitch.count()) {
        await joinSwitch.first().click();
      }
      await pageB.getByPlaceholder("Enter your name").fill(playerName);
      await pageB.getByPlaceholder("ABCD").fill(roomCode);
      await pageB.getByRole("button", { name: "Join Room" }).click();
      await pageB.waitForURL(new RegExp(`/room/${roomCode}$`), { timeout: 60_000 });
      await pageB.waitForSelector("text=Waiting for host to start the game", { timeout: 60_000 });
      return { joined: true, playerName };
    });

    await pageB.screenshot({ path: OUT_PLAYER_LOBBY, fullPage: true });

    await step("verify two players mirrored in SpacetimeDB", async () =>
      waitFor(">=2 live_room_player rows", async () => {
        const rows = await sqlQuery(
          `select player_id, room_id, guest_name, score from live_room_player where room_id = '${escapeSqlString(roomId)}'`,
        );
        return rows.length >= 2 ? { count: rows.length, players: rows } : null;
      }),
    );

    await step("page A start game via UI", async () => {
      await pageA.getByRole("button", { name: "Start Game" }).click({ timeout: 60_000 });
      await pageA.waitForURL(new RegExp(`/room/${roomCode}/host$`), { timeout: 60_000 });
      await pageA.waitForSelector("text=Loading game board", { timeout: 60_000 });
      return { started: true };
    });

    await step("both pages reach gameplay view", async () => {
      await pageB.waitForURL(new RegExp(`/room/${roomCode}/play$`), { timeout: 60_000 });
      await pageB.waitForSelector("text=is choosing", { timeout: 90_000 });
      await pageA.waitForURL(new RegExp(`/room/${roomCode}/host$`), { timeout: 60_000 });
      await pageA.waitForSelector("span.text-white.text-sm.font-mono", { timeout: 90_000 });
      return {
        pageA: pageA.url(),
        pageB: pageB.url(),
      };
    });

    await pageA.screenshot({ path: OUT_GAMEPLAY_A, fullPage: true });
    await pageB.screenshot({ path: OUT_GAMEPLAY_B, fullPage: true });

    const selectedValue = await step("select clue from host route UI on page A", async () => {
      const clueButton = pageA
        .locator("button")
        .filter({ hasText: /^\$\d+$/ })
        .first();
      await clueButton.waitFor({ timeout: 90_000 });
      const value = (await clueButton.innerText()).trim();
      await clueButton.click();
      await pageB.waitForSelector("text=Get ready to buzz", { timeout: 60_000 });
      await pageB.waitForSelector("text=BUZZ", { timeout: 60_000 });
      return { selectedValue: value };
    });
    result.selectedValue = selectedValue;

    const clueText = await step("verify clue state visible on player and host stays in gameplay", async () => {
      const clue = await readClueFromPlayer(pageB);
      await pageA.waitForURL(new RegExp(`/room/${roomCode}/host$`), { timeout: 60_000 });
      return { clue, pageA: pageA.url() };
    });

    await pageA.screenshot({ path: OUT_CLUE_A, fullPage: true });
    await pageB.screenshot({ path: OUT_CLUE_B, fullPage: true });

    const answer = await step("resolve selected clue answer from SpacetimeDB", async () =>
      findAnswerForClue(roomId, String((clueText as AnyObj).clue || "")),
    );

    await step("buzz and answer from player UI on page B", async () => {
      const buzzButton = pageB.getByRole("button", { name: "BUZZ" });
      await buzzButton.waitFor({ timeout: 60_000 });
      await buzzButton.click();
      await pageB.waitForSelector("text=You buzzed! Answer", { timeout: 60_000 });

      const input = pageB.getByPlaceholder("What is...");
      await input.fill(answer);
      await pageB.getByRole("button", { name: "Submit" }).click();

      await pageB.waitForSelector("text=You answered:", { timeout: 60_000 });
      await pageA.waitForSelector(`text=${playerName}`, { timeout: 60_000 });
      return { submittedLength: answer.length };
    });

    const dbState = await step("verify score/turn update in SpacetimeDB", async () =>
      waitFor("score + selector update", async () => {
        const scores = await sqlQuery(
          `select player_id, score from live_game_score where room_id = '${escapeSqlString(roomId)}'`,
        );
        const p2 = scores.find((row) => String(row.player_id || "") !== "" && Number(row.score || 0) > 0);
        if (!p2) return null;

        const game = await sqlQuery(
          `select phase, selector_player_id from live_game_state where room_id = '${escapeSqlString(roomId)}' limit 1`,
        );
        const selector = String(game[0]?.selector_player_id || "");
        if (!selector || selector !== String(p2.player_id)) return null;

        return { game: game[0], scores };
      }, 90_000),
    );
    result.dbState = dbState;

    await step("verify UI sync reflects updated turn/score", async () => {
      await pageA.waitForSelector(`text=${playerName} is choosing`, { timeout: 60_000 });
      const scoreFooter = await pageB.locator("text=YOUR SCORE").locator("xpath=..")
        .innerText();
      return { pageAStatus: `${playerName} is choosing`, pageBScoreFooter: scoreFooter };
    });

    await pageA.screenshot({ path: OUT_RESULT_A, fullPage: true });
    await pageB.screenshot({ path: OUT_RESULT_B, fullPage: true });

    await step("network proof: zero api.jprty.io and no Fly/Socket.IO gameplay dependency", async () => {
      const noApi = network.apiJprtyRequests.length === 0 && network.apiJprtyWebsockets.length === 0;
      const noSocketIo = network.socketIoTraffic.length === 0;
      const noFly = network.flyTraffic.length === 0;
      return {
        noApi,
        noSocketIo,
        noFly,
        apiJprtyRequests: network.apiJprtyRequests,
        apiJprtyWebsockets: network.apiJprtyWebsockets,
        socketIoTraffic: network.socketIoTraffic,
        flyTraffic: network.flyTraffic,
      };
    });

    result.networkAssertions = {
      noApiJprtyRequests: network.apiJprtyRequests.length === 0,
      noApiJprtyWebsockets: network.apiJprtyWebsockets.length === 0,
      noSocketIoTraffic: network.socketIoTraffic.length === 0,
      noFlyTraffic: network.flyTraffic.length === 0,
    };

    result.ok = Object.values(result.networkAssertions as Record<string, boolean>).every(Boolean) &&
      steps.every((s) => s.ok);
    result.finishedAt = new Date().toISOString();
  } catch (error) {
    result.ok = false;
    result.error = error instanceof Error ? error.message : String(error);
    result.finishedAt = new Date().toISOString();
  } finally {
    await writeFile(OUT_NET, JSON.stringify(network, null, 2));
    await writeFile(OUT_JSON, JSON.stringify(result, null, 2));
    await ctxA.close();
    await ctxB.close();
    await browser.close();
  }

  if (!result.ok) {
    process.exit(1);
  }
}

main().catch(async (error) => {
  const failed = {
    ok: false,
    fatal: error instanceof Error ? error.message : String(error),
    at: new Date().toISOString(),
    steps,
    network,
  };
  await writeFile(OUT_NET, JSON.stringify(network, null, 2));
  await writeFile(OUT_JSON, JSON.stringify(failed, null, 2));
  process.exit(1);
});
