import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Server } from 'socket.io';
import { createServer } from 'http';
import dotenv from 'dotenv';
import { db } from '@jprty/db';
import { registerEventHandlers } from './events';
import { gameState } from './game/state';

dotenv.config();

const app = new Hono();

// Allow multiple origins for local development
const CORS_ORIGINS = process.env.CLIENT_URL?.split(',') || [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
];

app.use('/*', cors({
  origin: CORS_ORIGINS,
  credentials: true,
}));

app.get('/health', (c) => {
  return c.json({ status: 'ok' });
});

// Get game state snapshot for a room
app.get('/api/game-state/:roomCode', async (c) => {
  const roomCode = c.req.param('roomCode').toUpperCase();

  const room = await db.room.findUnique({
    where: { code: roomCode },
  });

  if (!room) {
    return c.json({ error: 'Room not found' }, 404);
  }

  const snapshot = gameState.getSnapshot(room.id);

  if (!snapshot) {
    return c.json({ error: 'Game not started' }, 404);
  }

  console.log(`[API] /api/game-state/${roomCode} - phase: ${snapshot.phase}, selectorPlayerId: ${snapshot.selectorPlayerId}, currentQuestion: ${snapshot.currentQuestion?.id || 'null'}`);

  return c.json(snapshot);
});

const PORT = Number(process.env.PORT) || 8080;

// Create HTTP server and attach Socket.io
const httpServer = createServer(async (req, res) => {
  // Handle regular HTTP requests through Hono
  const response = await app.fetch(new Request(`http://localhost${req.url}`, {
    method: req.method,
    headers: req.headers as any,
  }));
  
  res.statusCode = response.status;
  response.headers.forEach((value: string, key: string) => {
    res.setHeader(key, value);
  });
  
  const body = await response.text();
  res.end(body);
});

const io = new Server(httpServer, {
  cors: {
    origin: CORS_ORIGINS,
    credentials: true,
  },
});

registerEventHandlers(io);

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default httpServer;