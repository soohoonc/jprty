import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Server } from 'socket.io';
import { createServer } from 'http';
import dotenv from 'dotenv';
import { registerEventHandlers } from './events';

dotenv.config();

const app = new Hono();

app.use('/*', cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true,
}));

app.get('/health', (c) => {
  return c.json({ status: 'ok' });
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
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    credentials: true,
  },
});

registerEventHandlers(io);

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default httpServer;