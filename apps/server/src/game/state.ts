import { db, Question } from '@jprty/db';
import { initializeRound, getBoardQuestions } from './board';
import { QuestionSetFilter, RoundEvent } from './config';

export type GamePhase = 'LOBBY' | 'SELECTING' | 'READING' | 'BUZZING' | 'ANSWERING' | 'REVEALING' | 'ROUND_END' | 'GAME_END';

export interface GameState {
  roomId: string;
  sessionId?: string;
  roundId?: string;
  phase: GamePhase;
  currentQuestion?: Question;
  currentPlayerId?: string;
  buzzQueue: string[];
  scores: Map<string, number>;
  roundNumber: number;
  timeRemaining?: number;
  board?: any;
}

class GameStateManager {
  private games: Map<string, GameState> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();

  create(roomId: string): GameState {
    const state: GameState = {
      roomId,
      phase: 'LOBBY',
      buzzQueue: [],
      scores: new Map(),
      roundNumber: 0,
    };
    this.games.set(roomId, state);
    return state;
  }

  get(roomId: string): GameState | undefined {
    return this.games.get(roomId);
  }

  async start(roomId: string, filter?: QuestionSetFilter): Promise<GameState> {
    const state = this.games.get(roomId);
    if (!state) throw new Error('Game not found');

    const session = await db.gameSession.create({
      data: {
        roomId,
        status: 'ACTIVE',
      },
    });

    if (!session) throw new Error('Failed to create game session');

    state.sessionId = session.id;
    state.phase = 'SELECTING';
    state.roundNumber = 1;

    const players = await db.player.findMany({
      where: { roomId, isActive: true },
    });

    players.forEach((p: any) => state.scores.set(p.id, 0));

    // Initialize first round
    const round = await initializeRound(session.id, 1, 'SINGLE_JEOPARDY', filter);
    state.roundId = round.id;

    // Load board data
    const { board } = await getBoardQuestions(round.questionSetId);
    state.board = board;

    return state;
  }

  selectQuestion(roomId: string, questionId: string): GameState {
    const state = this.games.get(roomId);
    if (!state) throw new Error('Game not found');

    // Find question from board
    const question = state.board?.flatMap((cat: any) => cat.questions)
      .find((q: Question) => q.id === questionId);

    if (!question) throw new Error('Question not found');

    state.currentQuestion = question;
    state.phase = 'READING';
    state.buzzQueue = [];

    this.setTimer(roomId, () => {
      this.openBuzzer(roomId);
    }, 3000);

    return state;
  }

  openBuzzer(roomId: string): GameState {
    const state = this.games.get(roomId);
    if (!state) throw new Error('Game not found');

    state.phase = 'BUZZING';
    state.timeRemaining = 10;

    this.setTimer(roomId, () => {
      this.revealAnswer(roomId);
    }, 10000);

    return state;
  }

  buzz(roomId: string, playerId: string): GameState {
    const state = this.games.get(roomId);
    if (!state || state.phase !== 'BUZZING') throw new Error('Cannot buzz now');

    if (!state.buzzQueue.includes(playerId)) {
      state.buzzQueue.push(playerId);
    }

    if (state.buzzQueue.length === 1) {
      state.currentPlayerId = playerId;
      state.phase = 'ANSWERING';
      state.timeRemaining = 15;
      this.clearTimer(roomId);

      this.setTimer(roomId, () => {
        this.handleTimeout(roomId);
      }, 15000);
    }

    return state;
  }

  async submitAnswer(roomId: string, playerId: string, answer: string, isCorrect: boolean): Promise<GameState> {
    const state = this.games.get(roomId);
    if (!state || state.currentPlayerId !== playerId) throw new Error('Not your turn');

    this.clearTimer(roomId);

    // Record answer in database
    if (state.roundId && state.currentQuestion) {
      await this.recordAnswer(state.roundId, state.currentQuestion.id, playerId, answer, isCorrect);
    }

    if (isCorrect) {
      const currentScore = state.scores.get(playerId) || 0;
      state.scores.set(playerId, currentScore + 100);

      state.phase = 'REVEALING';
      this.setTimer(roomId, () => {
        state.phase = 'SELECTING';
        state.currentQuestion = undefined;
        state.currentPlayerId = undefined;
        state.buzzQueue = [];
      }, 3000);
    } else {
      state.buzzQueue.shift();
      if (state.buzzQueue.length > 0) {
        state.currentPlayerId = state.buzzQueue[0];
        state.phase = 'ANSWERING';
        state.timeRemaining = 15;
        this.setTimer(roomId, () => {
          this.handleTimeout(roomId);
        }, 15000);
      } else {
        this.revealAnswer(roomId);
      }
    }

    return state;
  }

  handleTimeout(roomId: string): GameState {
    const state = this.games.get(roomId);
    if (!state) throw new Error('Game not found');

    state.buzzQueue.shift();
    if (state.buzzQueue.length > 0) {
      state.currentPlayerId = state.buzzQueue[0];
      state.phase = 'ANSWERING';
      state.timeRemaining = 15;
      this.setTimer(roomId, () => {
        this.handleTimeout(roomId);
      }, 15000);
    } else {
      this.revealAnswer(roomId);
    }

    return state;
  }

  revealAnswer(roomId: string): GameState {
    const state = this.games.get(roomId);
    if (!state) throw new Error('Game not found');

    this.clearTimer(roomId);
    state.phase = 'REVEALING';
    state.timeRemaining = undefined;

    this.setTimer(roomId, () => {
      state.phase = 'SELECTING';
      state.currentQuestion = undefined;
      state.currentPlayerId = undefined;
      state.buzzQueue = [];
    }, 5000);

    return state;
  }

  async recordAnswer(
    roundId: string,
    questionId: string,
    playerId: string,
    answer: string,
    correct: boolean
  ): Promise<void> {
    const round = await db.round.findUnique({
      where: { id: roundId },
    });

    if (!round) throw new Error('Round not found');

    const event: RoundEvent = {
      questionId,
      playerId,
      eventType: 'answered',
      answer,
      correct,
      timestamp: new Date(),
    };

    const currentEvents = (round as any).events || [];

    await db.round.update({
      where: { id: roundId },
      data: {
        events: [...currentEvents, event] as any,
      } as any,
    });
  }

  getBoard(roomId: string): any {
    const state = this.games.get(roomId);
    if (!state) throw new Error('Game not found');
    return state.board;
  }

  end(roomId: string): void {
    this.clearTimer(roomId);
    this.games.delete(roomId);
  }

  private setTimer(roomId: string, callback: () => void, delay: number): void {
    this.clearTimer(roomId);
    const timer = setTimeout(callback, delay);
    this.timers.set(roomId, timer);
  }

  private clearTimer(roomId: string): void {
    const timer = this.timers.get(roomId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(roomId);
    }
  }
}

export const gameState = new GameStateManager();