#!/usr/bin/env node
/**
 * Apply MVP1 schema to the database specified by DATABASE_URL.
 * Uses backend/.env (dotenv). Run from backend folder: npm run schema:apply
 *
 * Idempotent: uses CREATE TABLE IF NOT EXISTS. Default partitions for
 * papers/paper_questions/question_attempts may error if already present (safe to ignore).
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BAR = '════════════════════════════════════════';

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set. Set it in backend/.env or the environment.');
    process.exit(1);
  }

  const sqlPath = path.join(__dirname, 'schema-mvp1.sql');
  if (!fs.existsSync(sqlPath)) {
    console.error('Schema file not found:', sqlPath);
    process.exit(1);
  }

  console.log('Connecting to database...');
  const pool = new pg.Pool({ connectionString: url });

  try {
    await pool.query('SELECT 1');
    console.log('Connected.\nApplying schema...');

    const sql = fs.readFileSync(sqlPath, 'utf8');
    await pool.query(sql);

    const countResult = await pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema = 'public'`
    );
    const tableCount = countResult.rows[0]?.count ?? '0';

    console.log('');
    console.log(BAR);
    console.log('  MVP1 schema applied successfully.');
    console.log(`  Tables in public schema: ${tableCount}`);
    console.log(BAR);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // Default partitions may already exist on re-run
    if (msg.includes('already exists') && msg.includes('partition')) {
      console.log('');
      console.log(BAR);
      console.log('  Schema already applied (partition exists). No change needed.');
      console.log(BAR);
    } else {
      console.error('\nSchema apply failed:', msg);
      process.exit(1);
    }
  } finally {
    await pool.end();
  }
}

main();
