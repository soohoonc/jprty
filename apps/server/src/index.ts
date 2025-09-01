import { Hono } from 'hono';
import { cors } from 'hono/cors';
import dotenv from 'dotenv';

dotenv.config();

const app = new Hono();

app.use('/*', cors({
  origin: process.env.CLIENT_URL || 'http://localhost:8080',
  credentials: true,
}));

app.get('/health', (c) => {
  return c.json({ status: 'ok' });
});

const PORT = Number(process.env.PORT) || 8080;

console.log(`Server running on port ${PORT}`);

export default {
  port: PORT,
  fetch: app.fetch,
}