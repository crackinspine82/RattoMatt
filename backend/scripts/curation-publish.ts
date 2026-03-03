#!/usr/bin/env node
/**
 * Publish: copy draft → published for curation items with status ready_to_publish.
 * Uses shared logic from ../src/services/curation-publish.ts.
 * Run from backend/: npm run curation:publish
 */

import 'dotenv/config';
import { getPool } from '../src/db.js';
import { publishCurationItems } from '../src/services/curation-publish.js';

async function main(): Promise<void> {
  const pool = getPool();
  const items = await pool.query<{ id: string }>(
    "SELECT id FROM curation_items WHERE status = 'ready_to_publish'"
  );
  if (items.rows.length === 0) {
    console.log('No items in ready_to_publish. Nothing to do.');
    return;
  }
  const result = await publishCurationItems(pool, items.rows.map((r) => r.id));
  console.log('Publish done. Items published:', result.published);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
