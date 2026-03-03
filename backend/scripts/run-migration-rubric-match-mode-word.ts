#!/usr/bin/env node
/**
 * One-off: replace match_mode "word" with "keyword_match" in all draft_rubrics and rubrics.
 * Run from backend/: npm run migration:rubric-match-mode-word
 */

import 'dotenv/config';
import { getPool } from '../src/db.js';

type RubricBlock = { match_mode?: string; [k: string]: unknown };
type RubricJson = { blocks?: RubricBlock[]; [k: string]: unknown };

function normalizeRubric(rubric: unknown): { updated: RubricJson; changed: boolean } {
  if (!rubric || typeof rubric !== 'object') return { updated: rubric as RubricJson, changed: false };
  const r = rubric as RubricJson;
  if (!Array.isArray(r.blocks)) return { updated: r, changed: false };
  let changed = false;
  const blocks = r.blocks.map((b) => {
    if (b && typeof b === 'object' && b.match_mode === 'word') {
      changed = true;
      return { ...b, match_mode: 'keyword_match' };
    }
    return b;
  });
  return { updated: { ...r, blocks }, changed };
}

async function main(): Promise<void> {
  const pool = getPool();

  let draftUpdated = 0;
  const draftRows = await pool.query<{ id: string; rubric_json: unknown }>(
    'SELECT id, rubric_json FROM draft_rubrics WHERE rubric_json IS NOT NULL'
  );
  for (const row of draftRows.rows) {
    const { updated, changed } = normalizeRubric(row.rubric_json);
    if (changed) {
      await pool.query('UPDATE draft_rubrics SET rubric_json = $1 WHERE id = $2', [
        JSON.stringify(updated),
        row.id,
      ]);
      draftUpdated++;
    }
  }
  if (draftUpdated > 0) console.log('draft_rubrics: updated', draftUpdated, 'rows.');

  let pubUpdated = 0;
  const pubRows = await pool.query<{ id: string; rubric_json: unknown }>(
    'SELECT id, rubric_json FROM rubrics WHERE rubric_json IS NOT NULL'
  );
  for (const row of pubRows.rows) {
    const { updated, changed } = normalizeRubric(row.rubric_json);
    if (changed) {
      await pool.query('UPDATE rubrics SET rubric_json = $1 WHERE id = $2', [JSON.stringify(updated), row.id]);
      pubUpdated++;
    }
  }
  if (pubUpdated > 0) console.log('rubrics: updated', pubUpdated, 'rows.');

  if (draftUpdated === 0 && pubUpdated === 0) console.log('No rows had match_mode "word".');
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
