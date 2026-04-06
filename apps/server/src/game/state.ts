import { db, Question, RoundType } from '@jprty/db';
import {
  selectQuestionSet,
  getBoardQuestions,
  markQuestionUsed,
  isBoardComplete,
  getBoardCell,
} from './board';
import {
  QuestionSetFilter,
  GameBoard,
  GAME_CONFIG,
  getNextRoundType,
  calculateMaxWager,
} from './config';
import { judge } from './judge';
import { gameHistory, type GameHistoryWriter } from './history';

export type GamePhase =
  | 'LOBBY'
  | 'SELECTING'        // Player selecting a question from the board
  | 'READING'          // Question is being read/displayed
  | 'BUZZING'          // Buzzer is open for all players
  | 'ANSWERING'        // A player is answering
  | 'DAILY_DOUBLE'     // Daily Double - waiting for wager
  | 'DAILY_DOUBLE_ANSWER' // Daily Double - player answering after wager
  | 'REVEALING'        // Answer is being revealed
  | 'ROUND_END'        // Round has ended, transitioning to next
  | 'FINAL_JEOPARDY_WAGER'  // Final Jeopardy - all players wagering
  | 'FINAL_JEOPARDY_ANSWER' // Final Jeopardy - all players answering
  | 'FINAL_JEOPARDY_REVEAL' // Final Jeopardy - revealing answers
  | 'GAME_END';        // Game is over

export interface FinalJeopardyAnswer {
  playerId: string;
  wager: number;
  wagerSubmitted: boolean;  // Bug #3: Track submission separately from wager amount
  answer?: string;
  revealed: boolean;
}

export interface TimingConfig {
  buzzWindowMs: number;
  answerWindowMs: number;
  revealWindowMs: number;
  readingDelayMs: number;
  dailyDoubleWagerMs: number;
  finalJeopardyWagerMs: number;
  finalJeopardyAnswerMs: number;
}

export interface GameState {
  roomId: string;
  sessionId?: string;
  roundId?: string;
  phase: GamePhase;
  roundType: RoundType;
  currentQuestion?: Question;
  currentQuestionValue?: number;
  currentQuestionCategory?: string;  // Category name for the current question
  currentPlayerId?: string;  // Player whose turn it is (for Daily Double or answering)
  selectorPlayerId?: string; // Player who gets to select next question
  questionAnsweredCorrectly?: boolean; // Track if current question was answered correctly
  playersWhoAnsweredWrong: Set<string>; // Track who already got it wrong (can't buzz again)
  buzzQueue: string[];
  scores: Map<string, number>;
  roundNumber: number;
  totalRounds: number;
  timeRemaining?: number;
  board?: GameBoard;
  // Room-specific timing configuration
  timing: TimingConfig;
  // Daily Double specific
  currentWager?: number;
  // Final Jeopardy specific
  finalJeopardyAnswers?: Map<string, FinalJeopardyAnswer>;
  finalJeopardyQuestion?: Question;
}

export interface GameStateSnapshot {
  roomId: string;
  phase: GamePhase;
  roundType: RoundType;
  roundNumber: number;
  totalRounds: number;
  scores: [string, number][];
  board?: {
    categories: string[];
    grid?: Array<{
      questionId: string;
      value: number;
      isUsed: boolean;
      isDailyDouble: boolean;
      col: number;
    }>;
  };
  currentQuestion?: {
    id: string;
    clue: string;
    category?: string;
    value?: number;
  };
  currentPlayerId?: string;
  selectorPlayerId?: string;
  buzzQueue: string[];
  timeRemaining?: number;
  currentWager?: number;
  maxWager?: number;
}

class GameStateManager {
  private games: Map<string, GameState> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private callbacks: Map<string, (state: GameState) => void> = new Map();

  constructor(private readonly history: GameHistoryWriter = gameHistory) {}

  create(roomId: string): GameState {
    const totalRounds = 1;
    const state: GameState = {
      roomId,
      phase: 'LOBBY',
      roundType: 'SINGLE_JEOPARDY',
      buzzQueue: [],
      playersWhoAnsweredWrong: new Set(),
      scores: new Map(),
      roundNumber: 0,
      totalRounds,
      // Default timing from GAME_CONFIG, will be overwritten by room config on start
      timing: {
        buzzWindowMs: GAME_CONFIG.timing.buzzWindow,
        answerWindowMs: GAME_CONFIG.timing.answerWindow,
        revealWindowMs: GAME_CONFIG.timing.revealDelay,
        readingDelayMs: GAME_CONFIG.timing.readingDelay,
        dailyDoubleWagerMs: GAME_CONFIG.timing.dailyDoubleWager,
        finalJeopardyWagerMs: GAME_CONFIG.timing.finalJeopardyWager,
        finalJeopardyAnswerMs: GAME_CONFIG.timing.finalJeopardyAnswer,
      },
    };
    this.games.set(roomId, state);
    return state;
  }

  get(roomId: string): GameState | undefined {
    return this.games.get(roomId);
  }

  getSnapshot(roomId: string): GameStateSnapshot | null {
    const state = this.games.get(roomId);
    if (!state) return null;

    // Flatten cells 2D array to grid for client consumption
    const grid = state.board?.cells.flat().map(cell => ({
      questionId: cell.questionId,
      value: cell.value,
      isUsed: cell.isUsed,
      isDailyDouble: cell.isDailyDouble,
      col: cell.col,
    }));

    return {
      roomId: state.roomId,
      phase: state.phase,
      roundType: state.roundType,
      roundNumber: state.roundNumber,
      totalRounds: state.totalRounds,
      scores: Array.from(state.scores.entries()),
      board: state.board ? {
        categories: state.board.categories,
        grid,
      } : undefined,
      currentQuestion: state.currentQuestion ? {
        id: state.currentQuestion.id,
        clue: state.currentQuestion.clue,
        category: state.currentQuestionCategory,
        value: state.currentQuestionValue,
      } : undefined,
      currentPlayerId: state.currentPlayerId,
      selectorPlayerId: state.selectorPlayerId,
      buzzQueue: state.buzzQueue,
      timeRemaining: state.timeRemaining,
      currentWager: state.currentWager,
      maxWager: state.phase === 'DAILY_DOUBLE' || state.phase === 'DAILY_DOUBLE_ANSWER'
        ? calculateMaxWager(state.scores.get(state.currentPlayerId || '') || 0, state.roundType)
        : undefined,
    };
  }

  onStateChange(roomId: string, callback: (state: GameState) => void): void {
    this.callbacks.set(roomId, callback);
  }

  hasCallback(roomId: string): boolean {
    return this.callbacks.has(roomId);
  }

  private notifyChange(state: GameState): void {
    const callback = this.callbacks.get(state.roomId);
    console.log(`[GameState] notifyChange called for room ${state.roomId}, phase: ${state.phase}, callback exists: ${!!callback}`);
    if (callback) {
      callback(state);
    } else {
      console.log(`[GameState] WARNING: No callback registered for room ${state.roomId}`);
    }
  }

  async start(roomId: string, filter?: QuestionSetFilter): Promise<GameState> {
    const state = this.games.get(roomId);
    if (!state) throw new Error('Game not found');

    // Load room configuration for timing settings
    const roomConfig = await db.gameConfiguration.findUnique({
      where: { roomId },
    });
    if (roomConfig) {
      state.timing = {
        buzzWindowMs: roomConfig.buzzWindowMs,
        answerWindowMs: roomConfig.answerWindowMs,
        revealWindowMs: roomConfig.revealWindowMs,
        readingDelayMs: GAME_CONFIG.timing.readingDelay, // Not configurable yet
        dailyDoubleWagerMs: GAME_CONFIG.timing.dailyDoubleWager, // Not configurable yet
        finalJeopardyWagerMs: GAME_CONFIG.timing.finalJeopardyWager, // Not configurable yet
        finalJeopardyAnswerMs: GAME_CONFIG.timing.finalJeopardyAnswer, // Not configurable yet
      };
      console.log('[GameState] Loaded room config:', state.timing);
    }

    const session = await this.history.startSession(roomId);

    if (!session) throw new Error('Failed to create game session');

    state.sessionId = session.id;
    state.roundNumber = 1;
    state.roundType = 'SINGLE_JEOPARDY';

    const players = await db.player.findMany({
      where: { roomId, isActive: true },
      orderBy: { joinedAt: 'asc' }, // First player to join should select first
    });
    console.log('[GameState] Players for selector:', players.map(p => ({ id: p.id, name: p.name })));

    players.forEach((p: any) => state.scores.set(p.id, 0));

    // Initialize first round
    await this.initializeRoundState(state, filter);

    // First player to join selects first
    state.selectorPlayerId = players[0]?.id;
    state.phase = 'SELECTING';

    console.log('[GameState] Game started - selectorPlayerId:', state.selectorPlayerId, 'phase:', state.phase);

    this.notifyChange(state);
    return state;
  }

  private async initializeRoundState(state: GameState, filter?: QuestionSetFilter): Promise<void> {
    if (!state.sessionId) throw new Error('No session');

    const questionSet = await selectQuestionSet(filter);
    const round = await this.history.createRound({
      gameSessionId: state.sessionId,
      roundNumber: state.roundNumber,
      roundType: state.roundType,
      questionSetId: questionSet.id,
    });
    state.roundId = round.id;

    // Load board data
    const { board } = await getBoardQuestions(questionSet.id, state.roundType);
    state.board = board;
  }

  async selectQuestion(roomId: string, questionId: string, playerId: string): Promise<GameState> {
    const state = this.games.get(roomId);
    if (!state) throw new Error('Game not found');
    if (state.phase !== 'SELECTING') throw new Error('Not in selecting phase');

    // Verify it's the selector's turn (optional - can be removed for more casual play)
    // if (state.selectorPlayerId && state.selectorPlayerId !== playerId) {
    //   throw new Error('Not your turn to select');
    // }

    if (!state.board) throw new Error('No board loaded');

    const cell = getBoardCell(state.board, questionId);
    if (!cell) throw new Error('Question not found on board');
    if (cell.isUsed) throw new Error('Question already used');

    // Mark question as used immediately on selection
    state.board = markQuestionUsed(state.board, cell.questionId);

    // Bug #1 Fix: Fetch question from database using the actual questionId
    const question = await db.question.findUnique({
      where: { id: cell.questionId },
    });

    if (!question) {
      throw new Error(`Question not found in database: ${cell.questionId}`);
    }

    state.currentQuestion = question;
    state.currentQuestionValue = cell.value;
    state.currentQuestionCategory = state.board?.categories[cell.col];
    state.currentPlayerId = playerId;
    state.buzzQueue = [];
    state.questionAnsweredCorrectly = false; // Reset for new question
    state.playersWhoAnsweredWrong = new Set(); // Reset for new question

    // Check if it's a Daily Double
    if (cell.isDailyDouble) {
      state.phase = 'DAILY_DOUBLE';
      state.currentWager = undefined;

      // Timer for Daily Double wager
      this.setTimer(roomId, () => {
        // Auto-wager minimum if no wager submitted
        this.submitDailyDoubleWager(roomId, playerId, GAME_CONFIG.wager.minimumWager);
      }, state.timing.dailyDoubleWagerMs);
    } else {
      state.phase = 'READING';

      // Timer to open buzzer after reading
      this.setTimer(roomId, () => {
        this.openBuzzer(roomId);
      }, state.timing.readingDelayMs);
    }

    this.notifyChange(state);
    return state;
  }

  submitDailyDoubleWager(roomId: string, playerId: string, wager: number): GameState {
    const state = this.games.get(roomId);
    if (!state) throw new Error('Game not found');
    if (state.phase !== 'DAILY_DOUBLE') throw new Error('Not in Daily Double phase');
    if (state.currentPlayerId !== playerId) throw new Error('Not your Daily Double');

    // Validate wager
    const playerScore = state.scores.get(playerId) || 0;
    const maxWager = calculateMaxWager(playerScore, state.roundType);
    const validWager = Math.max(
      GAME_CONFIG.wager.minimumWager,
      Math.min(wager, maxWager)
    );

    state.currentWager = validWager;
    state.phase = 'DAILY_DOUBLE_ANSWER';
    state.timeRemaining = state.timing.answerWindowMs / 1000;

    this.clearTimer(roomId);
    this.setTimer(roomId, () => {
      // Timeout - treat as wrong answer
      this.submitAnswer(roomId, playerId, '', false);
    }, state.timing.answerWindowMs);

    this.notifyChange(state);
    return state;
  }

  openBuzzer(roomId: string): GameState {
    const state = this.games.get(roomId);
    if (!state) throw new Error('Game not found');

    state.phase = 'BUZZING';
    state.timeRemaining = state.timing.buzzWindowMs / 1000;

    this.setTimer(roomId, () => {
      // No one buzzed - reveal answer and move on
      this.revealAnswer(roomId);
    }, state.timing.buzzWindowMs);

    this.notifyChange(state);
    return state;
  }

  buzz(roomId: string, playerId: string): GameState {
    const state = this.games.get(roomId);
    if (!state || state.phase !== 'BUZZING') throw new Error('Cannot buzz now');

    // Can't buzz if already answered wrong for this question
    if (state.playersWhoAnsweredWrong.has(playerId)) {
      throw new Error('You already answered this question');
    }

    if (!state.buzzQueue.includes(playerId)) {
      state.buzzQueue.push(playerId);
    }

    // First to buzz gets to answer
    if (state.buzzQueue.length === 1) {
      state.currentPlayerId = playerId;
      state.phase = 'ANSWERING';
      state.timeRemaining = state.timing.answerWindowMs / 1000;
      this.clearTimer(roomId);

      this.setTimer(roomId, () => {
        this.handleTimeout(roomId);
      }, state.timing.answerWindowMs);
    }

    this.notifyChange(state);
    return state;
  }

  async submitAnswer(roomId: string, playerId: string, answer: string, isCorrectOverride?: boolean): Promise<GameState> {
    const state = this.games.get(roomId);
    if (!state) throw new Error('Game not found');

    const validPhases: GamePhase[] = ['ANSWERING', 'DAILY_DOUBLE_ANSWER'];
    if (!validPhases.includes(state.phase)) throw new Error('Cannot submit answer now');
    if (state.currentPlayerId !== playerId) throw new Error('Not your turn');

    this.clearTimer(roomId);

    // Judge the answer
    const isCorrect = isCorrectOverride !== undefined
      ? isCorrectOverride
      : judge(state.currentQuestion?.answer || '', answer);

    // Calculate points
    let points: number;
    if (state.phase === 'DAILY_DOUBLE_ANSWER') {
      points = state.currentWager || 0;
    } else {
      points = state.currentQuestionValue || 0;
    }

    // Update score
    const currentScore = state.scores.get(playerId) || 0;
    if (isCorrect) {
      state.scores.set(playerId, currentScore + points);
      state.selectorPlayerId = playerId; // Correct answerer selects next
      state.questionAnsweredCorrectly = true;
    } else {
      state.scores.set(playerId, currentScore - points);
      state.playersWhoAnsweredWrong.add(playerId); // Track who got it wrong
    }

    // Record answer in database
    if (state.roundId && state.currentQuestion) {
      await this.history.recordAnswer({
        roundId: state.roundId,
        questionId: state.currentQuestion.id,
        playerId,
        answer,
        correct: isCorrect,
        wager: state.phase === 'DAILY_DOUBLE_ANSWER' ? state.currentWager : undefined,
      });
    }

    // Handle post-answer logic
    if (isCorrect || state.phase === 'DAILY_DOUBLE_ANSWER') {
      // Correct answer or Daily Double (only one chance) - reveal and continue
      state.phase = 'REVEALING';
      this.setTimer(roomId, () => {
        this.afterReveal(roomId);
      }, state.timing.revealWindowMs);
    } else {
      // Wrong answer in regular play
      this.clearTimer(roomId);
      state.buzzQueue = []; // Clear the queue
      state.currentPlayerId = undefined;

      // Check if all players have answered wrong
      const totalPlayers = state.scores.size;
      const wrongAnswerCount = state.playersWhoAnsweredWrong.size;

      if (wrongAnswerCount >= totalPlayers) {
        // Everyone got it wrong - reveal answer
        this.revealAnswer(roomId);
      } else {
        // Reopen buzzer for remaining players
        this.openBuzzer(roomId);
      }
    }

    this.notifyChange(state);
    return state;
  }

  handleTimeout(roomId: string): GameState {
    const state = this.games.get(roomId);
    if (!state) throw new Error('Game not found');

    // Treat timeout as wrong answer (no point deduction for timeout)
    state.buzzQueue.shift();

    if (state.buzzQueue.length > 0) {
      state.currentPlayerId = state.buzzQueue[0];
      state.phase = 'ANSWERING';
      state.timeRemaining = state.timing.answerWindowMs / 1000;
      this.setTimer(roomId, () => {
        this.handleTimeout(roomId);
      }, state.timing.answerWindowMs);
    } else {
      this.revealAnswer(roomId);
    }

    this.notifyChange(state);
    return state;
  }

  revealAnswer(roomId: string): GameState {
    const state = this.games.get(roomId);
    if (!state) throw new Error('Game not found');

    this.clearTimer(roomId);
    state.phase = 'REVEALING';
    state.timeRemaining = undefined;

    this.setTimer(roomId, () => {
      this.afterReveal(roomId);
    }, state.timing.revealWindowMs);

    this.notifyChange(state);
    return state;
  }

  private afterReveal(roomId: string): void {
    const state = this.games.get(roomId);
    if (!state || !state.board) return;

    // Question was already marked as used in selectQuestion()

    // If no one answered correctly, the original selector keeps control
    // (selectorPlayerId is already set to whoever selected the question, so no change needed)

    // Check if round is complete
    if (isBoardComplete(state.board)) {
      this.endRound(roomId);
    } else {
      // Continue with next question selection
      state.phase = 'SELECTING';
      state.currentQuestion = undefined;
      state.currentPlayerId = undefined;
      state.currentWager = undefined;
      state.questionAnsweredCorrectly = undefined; // Reset for next question
      state.playersWhoAnsweredWrong = new Set(); // Reset for next question
      state.buzzQueue = [];
      this.notifyChange(state);
    }
  }

  private async endRound(roomId: string): Promise<void> {
    const state = this.games.get(roomId);
    if (!state) return;

    state.phase = 'ROUND_END';
    this.notifyChange(state);

    // Check if there's a next round
    const nextRoundType = getNextRoundType(state.roundType);

    if (nextRoundType && state.roundNumber < state.totalRounds) {
      // Transition to next round after a delay
      setTimeout(async () => {
        state.roundNumber++;
        state.roundType = nextRoundType;

        if (nextRoundType === 'FINAL_JEOPARDY') {
          await this.startFinalJeopardy(roomId);
        } else {
          await this.initializeRoundState(state);
          state.phase = 'SELECTING';
          // Player with lowest score selects first in Double Jeopardy
          const sortedPlayers = Array.from(state.scores.entries())
            .sort((a, b) => a[1] - b[1]);
          state.selectorPlayerId = sortedPlayers[0]?.[0];
          this.notifyChange(state);
        }
      }, 3000);
    } else {
      // Game is over
      await this.endGame(roomId);
    }
  }

  private async startFinalJeopardy(roomId: string): Promise<void> {
    const state = this.games.get(roomId);
    if (!state) return;

    // Initialize Final Jeopardy
    state.phase = 'FINAL_JEOPARDY_WAGER';
    state.finalJeopardyAnswers = new Map();

    // Issue #4 Fix: Include players with $0 (>= 0 instead of > 0)
    // Players with negative scores remain excluded per game rules
    for (const [playerId, score] of state.scores.entries()) {
      if (score >= 0) {
        state.finalJeopardyAnswers.set(playerId, {
          playerId,
          wager: 0,
          wagerSubmitted: false,  // Bug #3: Track submission status separately
          revealed: false,
        });
      }
    }

    // Bug #2 Fix: Fetch Final Jeopardy question from database
    // Look for questions marked as "Final Jeopardy" round type, or use a random hard question
    const finalQuestion = await db.question.findFirst({
      where: {
        roundType: { contains: 'Final', mode: 'insensitive' },
      },
      orderBy: { id: 'asc' },
    });

    if (finalQuestion) {
      state.finalJeopardyQuestion = finalQuestion;
    } else {
      // Fallback: Get any hard difficulty question if no Final Jeopardy questions exist
      const fallbackQuestion = await db.question.findFirst({
        where: { difficulty: 'hard' },
        orderBy: { id: 'asc' },
      });

      if (fallbackQuestion) {
        state.finalJeopardyQuestion = fallbackQuestion;
      } else {
        // Last resort: Get any question
        const anyQuestion = await db.question.findFirst();
        if (!anyQuestion) {
          throw new Error('No questions available for Final Jeopardy');
        }
        state.finalJeopardyQuestion = anyQuestion;
      }
    }

    this.notifyChange(state);

    // Timer for wagers
    this.setTimer(roomId, () => {
      this.startFinalJeopardyAnswering(roomId);
    }, state.timing.finalJeopardyWagerMs);
  }

  submitFinalJeopardyWager(roomId: string, playerId: string, wager: number): GameState {
    const state = this.games.get(roomId);
    if (!state) throw new Error('Game not found');
    if (state.phase !== 'FINAL_JEOPARDY_WAGER') throw new Error('Not in Final Jeopardy wager phase');

    const playerAnswer = state.finalJeopardyAnswers?.get(playerId);
    if (!playerAnswer) throw new Error('Player not in Final Jeopardy');

    const playerScore = state.scores.get(playerId) || 0;
    const maxWager = calculateMaxWager(playerScore, 'FINAL_JEOPARDY');
    const validWager = Math.max(0, Math.min(wager, maxWager));

    playerAnswer.wager = validWager;
    playerAnswer.wagerSubmitted = true;  // Bug #3: Mark wager as submitted

    // Bug #3 Fix: Check submission status instead of wager amount (allows $0 wagers)
    const allWagersIn = Array.from(state.finalJeopardyAnswers?.values() || [])
      .every(a => a.wagerSubmitted);

    if (allWagersIn) {
      this.clearTimer(roomId);
      this.startFinalJeopardyAnswering(roomId);
    }

    this.notifyChange(state);
    return state;
  }

  private startFinalJeopardyAnswering(roomId: string): void {
    const state = this.games.get(roomId);
    if (!state) return;

    state.phase = 'FINAL_JEOPARDY_ANSWER';
    this.notifyChange(state);

    // Timer for answers
    this.setTimer(roomId, () => {
      this.revealFinalJeopardy(roomId);
    }, state.timing.finalJeopardyAnswerMs);
  }

  submitFinalJeopardyAnswer(roomId: string, playerId: string, answer: string): GameState {
    const state = this.games.get(roomId);
    if (!state) throw new Error('Game not found');
    if (state.phase !== 'FINAL_JEOPARDY_ANSWER') throw new Error('Not in Final Jeopardy answer phase');

    const playerAnswer = state.finalJeopardyAnswers?.get(playerId);
    if (!playerAnswer) throw new Error('Player not in Final Jeopardy');

    playerAnswer.answer = answer;

    // Check if all answers are in
    const allAnswersIn = Array.from(state.finalJeopardyAnswers?.values() || [])
      .every(a => a.answer !== undefined);

    if (allAnswersIn) {
      this.clearTimer(roomId);
      this.revealFinalJeopardy(roomId);
    }

    this.notifyChange(state);
    return state;
  }

  private async revealFinalJeopardy(roomId: string): Promise<void> {
    const state = this.games.get(roomId);
    if (!state || !state.finalJeopardyAnswers) return;

    state.phase = 'FINAL_JEOPARDY_REVEAL';

    // Judge all answers and update scores
    for (const [playerId, playerAnswer] of state.finalJeopardyAnswers.entries()) {
      const isCorrect = judge(
        state.finalJeopardyQuestion?.answer || '',
        playerAnswer.answer || ''
      );

      const currentScore = state.scores.get(playerId) || 0;
      if (isCorrect) {
        state.scores.set(playerId, currentScore + playerAnswer.wager);
      } else {
        state.scores.set(playerId, currentScore - playerAnswer.wager);
      }

      playerAnswer.revealed = true;
    }

    this.notifyChange(state);

    // End game after reveal
    setTimeout(() => {
      this.endGame(roomId);
    }, 5000);
  }

  // Selector (or host) can manually advance to next question
  nextQuestion(roomId: string): GameState {
    const state = this.games.get(roomId);
    if (!state) throw new Error('Game not found');

    // Clear any pending timers (e.g., reveal delay timer)
    this.clearTimer(roomId);

    // Question was already marked as used in selectQuestion()

    // Check if board is complete
    if (state.board && isBoardComplete(state.board)) {
      this.endRound(roomId);
      return state;
    }

    // Reset state for next question
    state.phase = 'SELECTING';
    state.currentQuestion = undefined;
    state.currentPlayerId = undefined;
    state.currentWager = undefined;
    state.questionAnsweredCorrectly = undefined;
    state.playersWhoAnsweredWrong = new Set();
    state.buzzQueue = [];
    state.timeRemaining = undefined;

    this.notifyChange(state);
    return state;
  }

  private async endGame(roomId: string): Promise<void> {
    const state = this.games.get(roomId);
    if (!state) return;

    state.phase = 'GAME_END';

    // Determine winner
    const sortedScores = Array.from(state.scores.entries())
      .sort((a, b) => b[1] - a[1]);
    const winnerId = sortedScores[0]?.[0];

    await this.history.finalizeGame({
      sessionId: state.sessionId,
      winnerId,
      scores: Array.from(state.scores.entries()),
    });

    this.notifyChange(state);
  }

  getBoard(roomId: string): GameBoard | undefined {
    const state = this.games.get(roomId);
    return state?.board;
  }

  end(roomId: string): void {
    this.clearTimer(roomId);
    this.callbacks.delete(roomId);
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
