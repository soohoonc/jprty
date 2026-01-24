// Player role in a room
export type PlayerRole = 'host' | 'player';

// Room status
export type RoomStatus = 'WAITING' | 'IN_GAME' | 'FINISHED' | 'CLOSED';

// Game phases
export type GamePhase =
  | 'LOBBY'
  | 'SELECTING'
  | 'READING'
  | 'BUZZING'
  | 'ANSWERING'
  | 'DAILY_DOUBLE'
  | 'DAILY_DOUBLE_ANSWER'
  | 'REVEALING'
  | 'ROUND_END'
  | 'FINAL_JEOPARDY_WAGER'
  | 'FINAL_JEOPARDY_ANSWER'
  | 'FINAL_JEOPARDY_REVEAL'
  | 'GAME_END';

// Round types
export type RoundType = 'SINGLE_JEOPARDY' | 'DOUBLE_JEOPARDY' | 'FINAL_JEOPARDY';

// Player info
export interface Player {
  id: string;
  name?: string;
  guestName?: string;
  score: number;
  isHost: boolean;
  isActive: boolean;
}

// Question info
export interface Question {
  id: string;
  clue: string;
  answer: string;
  difficulty: string;
  questionSetId: string;
  category?: string;
  value?: number;
}

// Board cell
export interface BoardCell {
  questionId: string;
  value: number;
  isUsed: boolean;
  isDailyDouble: boolean;
  row: number;
  col: number;
}

// Game board
export interface GameBoard {
  categories: string[];
  cells: BoardCell[][];
  answeredCount: number;
  totalQuestions: number;
}

// Game state snapshot (sent to clients)
export interface GameStateSnapshot {
  roomId: string;
  phase: GamePhase;
  roundType: RoundType;
  roundNumber: number;
  totalRounds: number;
  scores: [string, number][];
  board?: GameBoard;
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
}

// Socket event payloads

// Room events
export interface JoinRoomPayload {
  roomCode: string;
  playerName: string;
  role?: PlayerRole;
}

export interface JoinedRoomPayload {
  players: Player[];
  isHost: boolean;
  player: Player;
}

export interface PlayerJoinedPayload {
  players: Player[];
  player: Player;
}

export interface PlayerLeftPayload {
  players: Player[];
  player: Partial<Player>;
}

export interface GameStartedPayload {
  state: GameStateSnapshot;
  board: {
    categories: string[];
    answeredQuestions: string[];
  };
}

// Game events
export interface SelectQuestionPayload {
  questionId: string;
}

export interface QuestionSelectedPayload {
  questionId: string;
  question: Question;
  value: number;
  phase: GamePhase;
  isDailyDouble?: boolean;
}

export interface BuzzerOpenPayload {
  timeRemaining: number;
}

export interface PlayerBuzzedPayload {
  playerId: string;
  playerName?: string;
  position: number;
  isAnswering: boolean;
  timeRemaining?: number;
}

export interface SubmitAnswerPayload {
  answer: string;
}

export interface AnswerResultPayload {
  playerId: string;
  answer: string;
  correctAnswer: string;
  isCorrect: boolean;
  pointChange: number;
  newScore: number;
  phase: GamePhase;
}

export interface SubmitWagerPayload {
  wager: number;
}

export interface DailyDoublePayload {
  playerId: string;
  questionId: string;
  maxWager: number;
}

export interface RoundEndPayload {
  roundNumber: number;
  scores: [string, number][];
}

export interface FinalJeopardyStartPayload {
  question: Question;
  timeRemaining: number;
}

export interface FinalJeopardyRevealPayload {
  correctAnswer: string;
  answers: {
    playerId: string;
    wager: number;
    answer?: string;
    revealed: boolean;
  }[];
  finalScores: [string, number][];
}

export interface GameEndPayload {
  winner: [string, number];
  finalScores: [string, number][];
}

export interface ErrorPayload {
  message: string;
}
