#!/usr/bin/env node
/**
 * Merge syllabus_node_id into study_notes_*.json (from study-notes-generate).
 * Matches sections to published syllabus_nodes by title (and level_label when useful).
 * Run after structure is published. Usage: npm run curation:merge-revision-node-ids -- <chapter_id> <path-to-study_notes_*.json>
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { getPool } from '../src/db.js';

function normalizeTitle(s: string | undefined): string {
  return (s ?? '').trim();
}

function levelLabelMatches(a: string | undefined, b: string | undefined): boolean {
  const x = (a ?? '').trim().toLowerCase();
  const y = (b ?? '').trim().toLowerCase();
  if (!x || !y) return true;
  return x === y;
}

async function main(): Promise<void> {
  const chapterId = process.argv[2]?.trim();
  const filePath = process.argv[3]?.trim();
  if (!chapterId || !filePath) {
    console.error('Usage: npm run curation:merge-revision-node-ids -- <chapter_id> <path-to-study_notes_*.json>');
    process.exit(1);
  }
  const absPath = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(absPath)) {
    console.error('File not found:', absPath);
    process.exit(1);
  }

  const pool = getPool();
  const nodes = await pool.query<{ id: string; title: string; level_label: string | null }>(
    `WITH RECURSIVE tree AS (
      SELECT id, title, level_label, ARRAY[sequence_number] AS sort_path
      FROM syllabus_nodes
      WHERE chapter_id = $1 AND parent_id IS NULL
      UNION ALL
      SELECT n.id, n.title, n.level_label, t.sort_path || n.sequence_number
      FROM syllabus_nodes n
      JOIN tree t ON n.parent_id = t.id
    )
    SELECT id, title, level_label FROM tree ORDER BY sort_path`,
    [chapterId]
  );
  if (nodes.rows.length === 0) {
    console.error('No published syllabus nodes for chapter', chapterId, '- publish structure first.');
    process.exit(1);
  }

  const raw = fs.readFileSync(absPath, 'utf8');
  const data = JSON.parse(raw) as { sections?: Array<{ title?: string; level_label?: string; content_md?: string; syllabus_node_id?: string }> };
  const sections = data.sections ?? [];
  const usedNodeIds = new Set<string>();
  let matched = 0;

  for (const section of sections) {
    const sectionTitle = normalizeTitle(section.title);
    const sectionLevel = section.level_label?.trim();
    let best: { id: string } | null = null;

    for (const node of nodes.rows) {
      if (usedNodeIds.has(node.id)) continue;
      if (normalizeTitle(node.title) !== sectionTitle) continue;
      if (!levelLabelMatches(sectionLevel, node.level_label ?? undefined)) continue;
      best = { id: node.id };
      break;
    }
    if (!best && sectionTitle) {
      for (const node of nodes.rows) {
        if (usedNodeIds.has(node.id)) continue;
        if (normalizeTitle(node.title) !== sectionTitle) continue;
        best = { id: node.id };
        break;
      }
    }
    if (best) {
      section.syllabus_node_id = best.id;
      usedNodeIds.add(best.id);
      matched++;
    } else {
      section.syllabus_node_id = undefined;
    }
  }

  fs.writeFileSync(absPath, JSON.stringify(data, null, 2), 'utf8');
  console.log('Merged', matched, 'syllabus_node_id(s) into', absPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
