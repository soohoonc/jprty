import { db } from '@jprty/db';

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function judge(question: string, answer: string): boolean {
  if (!answer || typeof answer !== 'string') return false;
  const trimmed = answer.trim();
  return trimmed.length >= 1 && trimmed.length <= 100;
}

export async function generateRoomCode(): Promise<string> {
  let code: string;
  let attempts = 0;
  const maxAttempts = 10;

  do {
    code = '';
    for (let i = 0; i < 4; i++) {
      code += CHARS[Math.floor(Math.random() * CHARS.length)];
    }

    const existing = await db.room.findUnique({
      where: { code },
    });

    if (!existing) {
      return code;
    }

    attempts++;
  } while (attempts < maxAttempts);

  throw new Error('Unable to generate unique room code');
}

export const EVENTS = {
  game: {
    question_revealed: 'game:select_question',
    buzz_window_open: 'game:buzz',
    player_buzzed: 'game:answer',
    answer_result: 'game:skip',
    scores_updated: 'game:end',
    question_skipped: 'game:skip',
    winner: 'game:winner',
    ready_for_next: 'game:ready_for_next',
  },
  room: {
    create: 'room:create',
    created: 'room:created',
    join: 'room:join',
    joined: 'room:joined',
    leave: 'room:leave',
    left: 'room:left',
    start: 'room:start',
    started: 'room:started',
  },
  system: {
    ping: 'system:ping',
    pong: 'system:pong',
    reconnect: 'system:reconnect',
    reconnected: 'system:reconnected',
    error: 'system:error',
  },
}