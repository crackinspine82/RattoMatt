/**
 * SME auth for curation app: login with email + password (admin-created accounts).
 * Uses sme_users + sme_sessions; password hashed with scrypt (Node crypto).
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { getPool } from '../db.js';

const TOKEN_BYTES = 32;
const SESSION_DAYS = 7;
const SALT_LEN = 16;
const KEY_LEN = 64;

function hashPassword(password: string): string {
  const salt = randomBytes(SALT_LEN);
  const key = scryptSync(password, salt, KEY_LEN);
  return salt.toString('hex') + ':' + key.toString('hex');
}

function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, keyHex] = stored.split(':');
  if (!saltHex || !keyHex) return false;
  const salt = Buffer.from(saltHex, 'hex');
  const key = scryptSync(password, salt, KEY_LEN);
  const storedKey = Buffer.from(keyHex, 'hex');
  return key.length === storedKey.length && timingSafeEqual(key, storedKey);
}

export default async function curationAuthRoutes(app: FastifyInstance) {
  app.post<{
    Body: { email: string; password: string };
  }>('/curation/login', async (req: FastifyRequest<{ Body: { email: string; password: string } }>, reply: FastifyReply) => {
    const { email, password } = req.body ?? {};
    if (!email || !password) {
      return reply.status(400).send({ error: 'email and password required' });
    }
    const pool = getPool();
    const userRes = await pool.query<{ id: string; password_hash: string }>(
      'SELECT id, password_hash FROM sme_users WHERE email = $1',
      [email.trim().toLowerCase()]
    );
    if (userRes.rows.length === 0) {
      return reply.status(401).send({ error: 'Invalid email or password' });
    }
    const { id: smeUserId, password_hash } = userRes.rows[0];
    if (!verifyPassword(password, password_hash)) {
      return reply.status(401).send({ error: 'Invalid email or password' });
    }
    const token = randomBytes(TOKEN_BYTES).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + SESSION_DAYS);
    await pool.query(
      'INSERT INTO sme_sessions (sme_user_id, token, expires_at) VALUES ($1, $2, $3)',
      [smeUserId, token, expiresAt]
    );
    return reply.send({ token, expires_at: expiresAt.toISOString() });
  });

  app.post<{ Body: { email: string; password: string } }>(
    '/curation/logout',
    { preHandler: [requireCurationAuth] },
    async (req: FastifyRequest<{ Body: { email: string; password: string } }>, reply: FastifyReply) => {
      const token = (req as unknown as { curationToken?: string }).curationToken;
      if (token) {
        await getPool().query('DELETE FROM sme_sessions WHERE token = $1', [token]);
      }
      return reply.send({ ok: true });
    }
  );
}

export async function requireCurationAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const auth = req.headers.authorization;
  const token = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : null;
  if (!token) {
    reply.status(401).send({ error: 'Authorization required' });
    return;
  }
  const pool = getPool();
  const res = await pool.query<{ sme_user_id: string }>(
    'SELECT sme_user_id FROM sme_sessions WHERE token = $1 AND expires_at > CURRENT_TIMESTAMP',
    [token]
  );
  if (res.rows.length === 0) {
    reply.status(401).send({ error: 'Invalid or expired session' });
    return;
  }
  (req as unknown as { curationToken?: string; curationSmeUserId?: string }).curationToken = token;
  (req as unknown as { curationToken?: string; curationSmeUserId?: string }).curationSmeUserId = res.rows[0].sme_user_id;
}

/** Call from a script to create an SME user (e.g. seed script). */
export async function createSmeUser(email: string, password: string): Promise<string> {
  const pool = getPool();
  const hash = hashPassword(password);
  const res = await pool.query<{ id: string }>(
    'INSERT INTO sme_users (email, password_hash) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING RETURNING id',
    [email.trim().toLowerCase(), hash]
  );
  if (res.rows.length === 0) {
    const existing = await pool.query<{ id: string }>('SELECT id FROM sme_users WHERE email = $1', [email.trim().toLowerCase()]);
    return existing.rows[0]?.id ?? '';
  }
  return res.rows[0].id;
}
