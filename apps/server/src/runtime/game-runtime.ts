import type { JoinedRoomPayload, LiveRoomRuntimeSnapshot } from "@jprty/shared";
import { calculateMaxWager } from "../game/config";
import type {
  FinalJeopardyAnswer,
  GameState,
  GameStateSnapshot,
} from "../game/state";

type LegacyBoardPayload = NonNullable<JoinedRoomPayload["gameState"]>["board"];

type GameStateUpdatePayload = Omit<GameStateSnapshot, "board"> & {
  board: LegacyBoardPayload | null;
};

type RoomStatePayload =
  | {
      room: LiveRoomRuntimeSnapshot;
      board: LegacyBoardPayload;
      phase: GameStateSnapshot["phase"];
      currentQuestion?: GameStateSnapshot["currentQuestion"];
      selectorPlayerId?: string;
    }
  | {
      room: LiveRoomRuntimeSnapshot;
      board: null;
      phase: "LOBBY";
    };

type GameStartedPayload = {
  state: GameStateSnapshot;
  board: LegacyBoardPayload;
};

function toLegacyBoard(board: GameStateSnapshot["board"] | undefined): LegacyBoardPayload | null {
  if (!board?.grid) {
    return null;
  }

  return {
    categories: board.categories,
    answeredQuestions: board.grid
      .filter((cell) => cell.isUsed)
      .map((cell) => `${board.categories[cell.col]}_${cell.value}`),
  };
}

function toSortedScores(scores: Map<string, number>): Array<[string, number]> {
  return Array.from(scores.entries()).sort((a, b) => b[1] - a[1]);
}

function toFinalJeopardyAnswers(answers: Map<string, FinalJeopardyAnswer> | undefined) {
  return answers
    ? Array.from(answers.entries()).map(([playerId, answer]) => ({
        playerId,
        wager: answer.wager,
        answer: answer.answer,
        revealed: answer.revealed,
      }))
    : [];
}

export class GameRuntimeService {
  buildActiveGameState(snapshot: GameStateSnapshot | null): JoinedRoomPayload["gameState"] {
    const board = toLegacyBoard(snapshot?.board);

    if (!snapshot || !board) {
      return null;
    }

    return {
      board,
      phase: snapshot.phase,
      currentQuestion: snapshot.currentQuestion,
      selectorPlayerId: snapshot.selectorPlayerId,
    };
  }

  buildStateUpdate(snapshot: GameStateSnapshot | null): GameStateUpdatePayload | null {
    if (!snapshot) {
      return null;
    }

    return {
      ...snapshot,
      board: toLegacyBoard(snapshot.board),
    };
  }

  buildIncrementalStateUpdate(state: GameState) {
    return {
      phase: state.phase,
      currentPlayerId: state.currentPlayerId,
      selectorPlayerId: state.selectorPlayerId,
      timeRemaining: state.timeRemaining,
      correctAnswer: state.phase === "REVEALING" ? state.currentQuestion?.answer : undefined,
    };
  }

  buildRoomState(room: LiveRoomRuntimeSnapshot, snapshot: GameStateSnapshot | null): RoomStatePayload {
    const board = toLegacyBoard(snapshot?.board);

    if (!snapshot || !board) {
      return {
        room,
        board: null,
        phase: "LOBBY",
      };
    }

    return {
      room,
      board,
      phase: snapshot.phase,
      currentQuestion: snapshot.currentQuestion,
      selectorPlayerId: snapshot.selectorPlayerId,
    };
  }

  buildGameStarted(snapshot: GameStateSnapshot | null): GameStartedPayload {
    if (!snapshot) {
      throw new Error("Game state snapshot unavailable");
    }

    const board = toLegacyBoard(snapshot.board);
    if (!board) {
      throw new Error("Game board unavailable");
    }

    return {
      state: snapshot,
      board,
    };
  }

  buildDailyDoublePayload(state: GameState, playerId: string, questionId: string) {
    const playerScore = state.scores.get(playerId) || 0;

    return {
      playerId,
      questionId,
      maxWager: calculateMaxWager(playerScore, state.roundType),
      question: state.currentQuestion
        ? {
            ...state.currentQuestion,
            category: state.currentQuestionCategory,
            value: state.currentQuestionValue,
          }
        : undefined,
      value: state.currentQuestionValue,
      category: state.currentQuestionCategory,
    };
  }

  buildQuestionSelectedPayload(
    state: GameState,
    questionId: string,
    options?: { isDailyDouble?: boolean },
  ) {
    if (!state.currentQuestion || state.currentQuestionValue === undefined) {
      throw new Error("Current question unavailable");
    }

    return {
      questionId,
      question: {
        ...state.currentQuestion,
        category: state.currentQuestionCategory,
        value: state.currentQuestionValue,
      },
      value: options?.isDailyDouble ? state.currentWager || 0 : state.currentQuestionValue,
      phase: state.phase,
      isDailyDouble: options?.isDailyDouble,
      category: state.currentQuestionCategory,
    };
  }

  buildPlayerBuzzedPayload(state: GameState, playerId: string, playerName: string) {
    return {
      playerId,
      playerName,
      position: state.buzzQueue.indexOf(playerId) + 1,
      isAnswering: state.currentPlayerId === playerId,
      timeRemaining: state.timeRemaining,
    };
  }

  buildAnswerResultPayload(
    state: GameState,
    playerId: string,
    playerName: string,
    answer: string,
    previousScore: number,
  ) {
    const newScore = state.scores.get(playerId) || 0;

    return {
      playerId,
      playerName,
      answer,
      correctAnswer: state.currentQuestion?.answer || "",
      isCorrect: newScore > previousScore,
      pointChange: newScore - previousScore,
      newScore,
      phase: state.phase,
      selectorPlayerId: state.selectorPlayerId,
    };
  }

  buildRoundEndPayload(state: GameState) {
    return {
      roundNumber: state.roundNumber,
      scores: Array.from(state.scores.entries()),
    };
  }

  buildGameEndPayload(state: GameState) {
    const finalScores = toSortedScores(state.scores);
    const winner = finalScores[0];

    if (!winner) {
      throw new Error("Game winner unavailable");
    }

    return {
      winner,
      finalScores,
    };
  }

  buildFinalJeopardyRevealPayload(state: GameState) {
    return {
      correctAnswer: state.finalJeopardyQuestion?.answer || "",
      answers: toFinalJeopardyAnswers(state.finalJeopardyAnswers),
      finalScores: Array.from(state.scores.entries()),
    };
  }
}

export const gameRuntime = new GameRuntimeService();
