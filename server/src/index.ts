// index.ts — Express entry point for the Covenants++ local backend.
// Served behind nginx at /api/* (single origin with the PWA).

import express from 'express';
import { meteredChat } from './routes/meteredChat';
import { meteredChatWorker } from './routes/meteredChatWorker';

const app = express();
app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/functions/meteredChat', meteredChat);
app.use('/functions/meteredChatWorker', meteredChatWorker);

const PORT = Number(process.env.PORT || 8080);
app.listen(PORT, '0.0.0.0', () => console.log(`[api] listening on ${PORT}`));
