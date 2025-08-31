import { Room, Player } from './room-manager';

export type GameStatus = 
  | 'LOBBY'
  | 'STARTING'
  | 'CATEGORY_REVEAL'
  | 'SELECTING'
  | 'QUESTION_DISPLAY'
  | 'BUZZER_OPEN'
  | 'ANSWERING'
  | 'ANSWER_REVEAL'
  | 'ROUND_END'
  | 'FINAL_JEOPARDY'
  | 'GAME_OVER';

export interface Question {
  id: string;
  question: string;
  answer: string;
  value: number;
  category: string;
  isDailyDouble?: boolean;
}

export interface GameBoard {
  categories: string[];
  questions: Map<string, Question[]>; // category -> questions
  answeredQuestions: Set<string>; // question IDs
}

export interface GameSession {
  id: string;
  roomId: string;
  status: GameStatus;
  currentRound: number;
  currentPlayer?: Player;
  currentQuestion?: Question;
  board?: GameBoard;
  buzzedPlayers: string[]; // Player IDs who have buzzed in
  startedAt?: Date;
  timers: {
    buzz?: NodeJS.Timeout;
    response?: NodeJS.Timeout;
    reveal?: NodeJS.Timeout;
  };
}

class GameManager {
  private sessions: Map<string, GameSession> = new Map();

  createGameSession(room: Room): GameSession {
    const sessionId = this.generateSessionId();
    
    const session: GameSession = {
      id: sessionId,
      roomId: room.id,
      status: 'LOBBY',
      currentRound: 1,
      buzzedPlayers: [],
      timers: {}
    };

    this.sessions.set(sessionId, session);
    room.gameSessionId = sessionId;

    return session;
  }

  startGame(sessionId: string): GameSession | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    session.status = 'STARTING';
    session.startedAt = new Date();
    
    // Initialize game board (mock data for now)
    session.board = this.createMockBoard();
    
    return session;
  }

  updateGameStatus(sessionId: string, status: GameStatus): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = status;
    }
  }

  selectQuestion(sessionId: string, questionId: string): Question | null {
    const session = this.sessions.get(sessionId);
    if (!session || !session.board) return null;

    // Find question in board
    for (const questions of session.board.questions.values()) {
      const question = questions.find(q => q.id === questionId);
      if (question) {
        session.currentQuestion = question;
        session.status = 'QUESTION_DISPLAY';
        return question;
      }
    }
    return null;
  }

  openBuzzer(sessionId: string, duration: number): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.status = 'BUZZER_OPEN';
    session.buzzedPlayers = [];

    // Clear existing timer
    if (session.timers.buzz) {
      clearTimeout(session.timers.buzz);
    }

    // Set new timer
    session.timers.buzz = setTimeout(() => {
      this.closeBuzzer(sessionId);
    }, duration);
  }

  closeBuzzer(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    if (session.timers.buzz) {
      clearTimeout(session.timers.buzz);
      session.timers.buzz = undefined;
    }

    // If no one buzzed, reveal answer
    if (session.buzzedPlayers.length === 0) {
      session.status = 'ANSWER_REVEAL';
    }
  }

  playerBuzz(sessionId: string, playerId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    if (session.status !== 'BUZZER_OPEN') return false;
    if (session.buzzedPlayers.includes(playerId)) return false;

    session.buzzedPlayers.push(playerId);
    
    // First player to buzz gets to answer
    if (session.buzzedPlayers.length === 1) {
      session.status = 'ANSWERING';
      this.closeBuzzer(sessionId);
      return true;
    }

    return false;
  }

  submitAnswer(sessionId: string, playerId: string, answer: string): { correct: boolean; points: number } {
    const session = this.sessions.get(sessionId);
    if (!session || !session.currentQuestion) {
      return { correct: false, points: 0 };
    }

    // Validate answer (simplified for now)
    const correct = answer.toLowerCase().includes(session.currentQuestion.answer.toLowerCase());
    const points = correct ? session.currentQuestion.value : -session.currentQuestion.value;

    // Mark question as answered
    if (session.board && correct) {
      session.board.answeredQuestions.add(session.currentQuestion.id);
    }

    return { correct, points };
  }

  markQuestionAnswered(sessionId: string, questionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session && session.board) {
      session.board.answeredQuestions.add(questionId);
    }
  }

  endGame(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.status = 'GAME_OVER';
    
    // Clear all timers
    Object.values(session.timers).forEach(timer => {
      if (timer) clearTimeout(timer);
    });

    // Clean up session after a delay
    setTimeout(() => {
      this.sessions.delete(sessionId);
    }, 60000); // Keep session for 1 minute for stats
  }

  getSession(sessionId: string): GameSession | undefined {
    return this.sessions.get(sessionId);
  }

  private generateSessionId(): string {
    return `game_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  private createMockBoard(): GameBoard {
    // Create mock board with sample questions
    const categories = ['Science', 'History', 'Literature', 'Geography', 'Pop Culture', 'Sports'];
    const values = [200, 400, 600, 800, 1000];
    
    const board: GameBoard = {
      categories,
      questions: new Map(),
      answeredQuestions: new Set()
    };

    categories.forEach(category => {
      const categoryQuestions: Question[] = values.map((value, index) => ({
        id: `${category}_${value}`,
        question: `This is a ${category} question for $${value}`,
        answer: `Sample answer for ${category} $${value}`,
        value,
        category,
        isDailyDouble: Math.random() < 0.05 // 5% chance of daily double
      }));
      board.questions.set(category, categoryQuestions);
    });

    return board;
  }
}

export const gameManager = new GameManager();