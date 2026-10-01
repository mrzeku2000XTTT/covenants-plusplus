// db.ts — encrypted SQLite (SQLCipher) store for metered-chat sessions.
// The whole database file is encrypted at rest with DB_ENCRYPTION_KEY.

import Database from 'better-sqlite3-multiple-ciphers';

const DB_PATH = process.env.DB_PATH || '/data/sessions.db';
const KEY = process.env.DB_ENCRYPTION_KEY;

if (!KEY) throw new Error('DB_ENCRYPTION_KEY is required');

const db = new Database(DB_PATH);
db.pragma(`key='${KEY}'`);
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sessionId TEXT UNIQUE NOT NULL,
  address TEXT NOT NULL,
  network TEXT,
  status TEXT NOT NULL,
  covenantAddress TEXT,
  amountSompi TEXT,
  epochs INTEGER NOT NULL DEFAULT 0,
  repliesPerEpoch INTEGER NOT NULL DEFAULT 0,
  repliesRemaining INTEGER NOT NULL DEFAULT 0,
  epochsRemaining INTEGER NOT NULL DEFAULT 0,
  fundingTxId TEXT,
  chainJson TEXT,
  history TEXT NOT NULL DEFAULT '[]',
  lastSettleTx TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
`);

export interface Session {
  id: number;
  sessionId: string;
  address: string;
  network: string | null;
  status: string;
  covenantAddress: string | null;
  amountSompi: string | null;
  epochs: number;
  repliesPerEpoch: number;
  repliesRemaining: number;
  epochsRemaining: number;
  fundingTxId: string | null;
  chainJson: string | null;
  history: string;
  lastSettleTx: string | null;
  createdAt: string;
  updatedAt: string;
}

export const findSession = (sessionId: string): Session | null =>
  (db.prepare('SELECT * FROM sessions WHERE sessionId = ?').get(sessionId) as Session) ?? null;

export const findLatestByAddress = (address: string): Session | null =>
  (db.prepare('SELECT * FROM sessions WHERE address = ? ORDER BY id DESC LIMIT 1').get(address) as Session) ?? null;

export const createSession = (data: Pick<Session, 'sessionId' | 'address' | 'network' | 'status'>): Session => {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO sessions (sessionId, address, network, status, epochs, repliesPerEpoch, repliesRemaining, epochsRemaining, history, createdAt, updatedAt)
    VALUES (@sessionId, @address, @network, @status, 0, 0, 0, 0, '[]', @createdAt, @updatedAt)
  `).run({ ...data, createdAt: now, updatedAt: now });
  return findSession(data.sessionId)!;
};

export const updateSession = (sessionId: string, patch: Record<string, unknown>): Session => {
  const fields = Object.keys(patch);
  if (fields.length) {
    const set = fields.map((f) => `${f} = @${f}`).join(', ');
    db.prepare(`UPDATE sessions SET ${set}, updatedAt = @updatedAt WHERE sessionId = @sessionId`)
      .run({ ...patch, updatedAt: new Date().toISOString(), sessionId });
  }
  return findSession(sessionId)!;
};
