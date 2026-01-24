import { db } from '@jprty/db';

// Re-export judge from the dedicated module
export { judge, judgeWithDetails } from './game/judge';

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

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

// Socket events are now defined in @jprty/shared
// See packages/shared/src/events.ts for ROOM_EVENTS, GAME_EVENTS, and SYSTEM_EVENTS