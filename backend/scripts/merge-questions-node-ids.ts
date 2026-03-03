#!/usr/bin/env node
/**
 * Merge syllabus_node_id into sample_questions_*.json (from question-bank-generate).
 * - If questions have section_ref or section_refs (path strings), resolves them to node ids
 *   (path match, then normalized title match; multiple refs → LCA) and sets question.syllabus_node_id.
 * - Unresolved refs → question.syllabus_node_id = null and a warning is logged.
 * - If no refs on questions, falls back to round-robin item-level syllabus_node_id (backward compat).
 * Run after structure is published.
 * Usage: npm run curation:merge-questions-node-ids -- <chapter_id> <path-to-sample_questions_*.json>
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { getPool } from '../src/db.js';

type NodeRow = { id: string; parent_id: string | null; title: string; path: string };

function normalizePath(p: string): string {
  return (p || '').trim().replace(/\s+/g, ' ').replace(/\s*>\s*/g, ' > ').trim();
}

function normalizeTitle(t: string): string {
  return (t || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Build path -> first node id (tree order), and normalized title -> first node id. Path keys are lowercased for case-insensitive match. */
function buildPathMaps(rows: NodeRow[]): { pathToId: Map<string, string>; titleToId: Map<string, string> } {
  const pathToId = new Map<string, string>();
  const titleToId = new Map<string, string>();
  for (const r of rows) {
    const normPath = normalizePath(r.path);
    if (normPath) {
      const key = normPath.toLowerCase();
      if (!pathToId.has(key)) pathToId.set(key, r.id);
    }
    const normTitle = normalizeTitle(r.title);
    if (normTitle && !titleToId.has(normTitle)) titleToId.set(normTitle, r.id);
  }
  return { pathToId, titleToId };
}

function resolveRef(ref: string, pathToId: Map<string, string>, titleToId: Map<string, string>): string | null {
  const norm = normalizePath(ref);
  const pathKey = norm.toLowerCase();
  if (pathToId.has(pathKey)) return pathToId.get(pathKey)!;
  const byTitle = titleToId.get(normalizeTitle(ref));
  if (byTitle) return byTitle;
  return null;
}

/** Path from node to root (node first, then parent, ...). */
function pathToRoot(nodeId: string, parentOf: Map<string, string>): string[] {
  const out: string[] = [];
  let cur: string | undefined = nodeId;
  while (cur) {
    out.push(cur);
    cur = parentOf.get(cur);
  }
  return out;
}

function lca(id1: string, id2: string, parentOf: Map<string, string>): string {
  const p1 = pathToRoot(id1, parentOf);
  const p2 = pathToRoot(id2, parentOf);
  const set2 = new Set(p2);
  for (const id of p1) {
    if (set2.has(id)) return id;
  }
  return id1;
}

function lcaMany(ids: string[], parentOf: Map<string, string>): string {
  if (ids.length === 0) return '';
  let acc = ids[0];
  for (let i = 1; i < ids.length; i++) acc = lca(acc, ids[i], parentOf);
  return acc;
}

async function main(): Promise<void> {
  const chapterId = process.argv[2]?.trim();
  const filePath = process.argv[3]?.trim();
  if (!chapterId || !filePath) {
    console.error('Usage: npm run curation:merge-questions-node-ids -- <chapter_id> <path-to-sample_questions_*.json>');
    process.exit(1);
  }
  const absPath = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(absPath)) {
    console.error('File not found:', absPath);
    process.exit(1);
  }

  const pool = getPool();
  const treeResult = await pool.query<NodeRow>(
    `WITH RECURSIVE tree AS (
      SELECT id, parent_id, title, ARRAY[sequence_number] AS sort_path, title::text AS path
      FROM syllabus_nodes
      WHERE chapter_id = $1 AND parent_id IS NULL
      UNION ALL
      SELECT n.id, n.parent_id, n.title, t.sort_path || n.sequence_number, t.path || ' > ' || n.title
      FROM syllabus_nodes n
      JOIN tree t ON n.parent_id = t.id
    )
    SELECT id, parent_id, title, path FROM tree ORDER BY sort_path`,
    [chapterId]
  );
  const rows = treeResult.rows;
  if (rows.length === 0) {
    console.error('No published syllabus nodes for chapter', chapterId, '- publish structure first.');
    process.exit(1);
  }

  const parentOf = new Map<string, string>();
  for (const r of rows) {
    if (r.parent_id) parentOf.set(r.id, r.parent_id);
  }
  const { pathToId, titleToId } = buildPathMaps(rows);
  const nodeIds = rows.map((r) => r.id);

  const raw = fs.readFileSync(absPath, 'utf8');
  type SubPartRef = { sub_part_key?: string; path?: string };
  type Q = {
    question_text?: string;
    model_answer_text?: string;
    question_type?: string;
    section_ref?: string;
    section_refs?: string[] | SubPartRef[];
    sub_part_syllabus_node_ids?: Array<{ sub_part_key: string; syllabus_node_id: string }>;
    syllabus_node_id?: string | null;
    rubric?: { answer_input_type?: string; total_marks?: number; [k: string]: unknown };
    question_group_id?: string | null;
    [k: string]: unknown;
  };
  type Item = { syllabus_node_id?: string; questions?: Q[]; [k: string]: unknown };
  const data = JSON.parse(raw) as { items?: Item[] };
  const items = data.items ?? [];

  let refResolved = 0;
  let refUnresolved = 0;
  for (const item of items) {
    const questions = item.questions ?? [];
    let anyRefUsed = false;
    for (const q of questions) {
      // structured_essay: per-sub-part refs -> sub_part_syllabus_node_ids; no single syllabus_node_id
      const isStructuredEssay = (q.question_type ?? item.question_type) === 'structured_essay';
      const subPartRefs = isStructuredEssay && Array.isArray(q.section_refs) && q.section_refs.length > 0
        && typeof q.section_refs[0] === 'object' && q.section_refs[0] !== null && 'sub_part_key' in (q.section_refs[0] as SubPartRef)
        ? (q.section_refs as SubPartRef[])
        : null;
      if (subPartRefs && subPartRefs.length > 0) {
        anyRefUsed = true;
        const subPartNodes: Array<{ sub_part_key: string; syllabus_node_id: string }> = [];
        const order = ['i', 'ii', 'iii'];
        for (const key of order) {
          const entry = subPartRefs.find((e) => (e.sub_part_key ?? '').toLowerCase() === key);
          const pathStr = entry?.path && typeof entry.path === 'string' ? entry.path : (q.section_ref as string) ?? '';
          const nodeId = pathStr ? resolveRef(pathStr, pathToId, titleToId) : null;
          if (nodeId) {
            subPartNodes.push({ sub_part_key: key, syllabus_node_id: nodeId });
            refResolved++;
          } else if (pathStr) {
            refUnresolved++;
            console.warn('Unresolved structured_essay sub_part path:', key, pathStr.slice(0, 50));
          }
        }
        q.sub_part_syllabus_node_ids = subPartNodes.length > 0 ? subPartNodes : undefined;
        q.syllabus_node_id = null;
        continue;
      }

      const refs: string[] = [];
      if (q.section_ref && typeof q.section_ref === 'string') refs.push(q.section_ref);
      if (Array.isArray(q.section_refs)) refs.push(...q.section_refs.filter((s): s is string => typeof s === 'string'));
      if (refs.length === 0) continue;
      anyRefUsed = true;
      const resolved = refs.map((r) => resolveRef(r, pathToId, titleToId)).filter((id): id is string => id != null);
      if (resolved.length === 0) {
        q.syllabus_node_id = null;
        refUnresolved++;
        console.warn('Unresolved section_ref(s):', refs.slice(0, 3).join('; '), refs.length > 3 ? '...' : '');
        continue;
      }
      const nodeId = resolved.length === 1 ? resolved[0] : lcaMany(resolved, parentOf);
      q.syllabus_node_id = nodeId;
      refResolved++;
    }
  }

  let itemIndex = 0;
  for (const item of items) {
    const questions = item.questions ?? [];
    const hasPerQuestionNode = questions.some((q) => q.syllabus_node_id != null);
    if (!hasPerQuestionNode && questions.length > 0) {
      item.syllabus_node_id = nodeIds[itemIndex % nodeIds.length];
      itemIndex++;
    }
  }

  // Build node + descendants set for "same node and subnodes" pairing.
  const childrenOf = new Map<string, string[]>();
  for (const r of rows) {
    if (r.parent_id) {
      const list = childrenOf.get(r.parent_id) ?? [];
      list.push(r.id);
      childrenOf.set(r.parent_id, list);
    }
  }
  function collectDescendants(id: string): Set<string> {
    const set = new Set<string>([id]);
    const stack = [id];
    while (stack.length > 0) {
      const cur = stack.pop()!;
      for (const child of childrenOf.get(cur) ?? []) {
        set.add(child);
        stack.push(child);
      }
    }
    return set;
  }
  const nodeAndDescendants = new Map<string, Set<string>>();
  for (const r of rows) {
    nodeAndDescendants.set(r.id, collectDescendants(r.id));
  }

  // Flatten: (itemIdx, qIdx, nodeId, marks, answerInputType, modelAnswerHtml)
  type FlatQ = { itemIdx: number; qIdx: number; nodeId: string | null; marks: number; answerInputType: string; modelAnswerHtml: string; q: Q };
  const flat: FlatQ[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const questions = item.questions ?? [];
    const rubric = questions[0]?.rubric;
    const answerInputType = (rubric?.answer_input_type === 'typed' || rubric?.answer_input_type === 'choice') ? rubric.answer_input_type : 'typed';
    for (let j = 0; j < questions.length; j++) {
      const q = questions[j];
      const r = q.rubric ?? {};
      const at = (r.answer_input_type === 'typed' || r.answer_input_type === 'choice') ? r.answer_input_type : answerInputType;
      const marks = Math.max(1, Math.min(100, Number(r.total_marks) ?? 2));
      const nodeId = q.syllabus_node_id ?? (q.sub_part_syllabus_node_ids?.[0]?.syllabus_node_id) ?? item.syllabus_node_id ?? null;
      flat.push({
        itemIdx: i,
        qIdx: j,
        nodeId,
        marks,
        answerInputType: at,
        modelAnswerHtml: (q.model_answer_text ?? '').toString(),
        q,
      });
    }
  }

  function countListItems(html: string): number {
    const m = html.match(/<li[^>]*>/gi);
    return m ? m.length : 0;
  }
  function minPointsForMarks(marks: number): number {
    if (marks >= 4) return 4;
    if (marks >= 3) return 3;
    if (marks >= 2) return 2;
    return 1;
  }

  const needsPairing: number[] = []; // indices into flat
  for (let idx = 0; idx < flat.length; idx++) {
    const f = flat[idx];
    if (f.answerInputType !== 'typed' || f.marks < 2 || f.marks > 4) continue;
    const minP = minPointsForMarks(f.marks);
    if (countListItems(f.modelAnswerHtml) >= minP) continue;
    if (f.nodeId == null) continue;
    needsPairing.push(idx);
  }

  const paired = new Set<number>();
  let groupsAssigned = 0;
  for (const idx of needsPairing) {
    if (paired.has(idx)) continue;
    const f = flat[idx];
    const nodeId = f.nodeId!;
    const validNodes = nodeAndDescendants.get(nodeId);
    if (!validNodes) continue;
    let partnerIdx: number | null = null;
    for (let k = 0; k < flat.length; k++) {
      if (k === idx || paired.has(k)) continue;
      if (flat[k].nodeId == null) continue;
      if (!validNodes.has(flat[k].nodeId!)) continue;
      partnerIdx = k;
      break;
    }
    if (partnerIdx == null) continue;
    const groupId = crypto.randomUUID();
    f.q.question_group_id = groupId;
    flat[partnerIdx].q.question_group_id = groupId;
    paired.add(idx);
    paired.add(partnerIdx);
    groupsAssigned++;
  }

  // Normalize match_mode "word" -> "keyword_match" in rubrics before writing
  for (const item of items) {
    for (const q of item.questions ?? []) {
      const blocks = q.rubric?.blocks;
      if (Array.isArray(blocks)) {
        for (const b of blocks) {
          if (typeof b === 'object' && b !== null && (b as { match_mode?: string }).match_mode === 'word') {
            (b as { match_mode: string }).match_mode = 'keyword_match';
          }
        }
      }
    }
  }

  fs.writeFileSync(absPath, JSON.stringify(data, null, 2), 'utf8');
  console.log(
    'Merged syllabus_node_id:',
    refResolved,
    'questions from refs',
    refUnresolved ? `, ${refUnresolved} unresolved (null)` : '',
    ',',
    items.length,
    'items.',
    groupsAssigned > 0 ? ` Assigned ${groupsAssigned} question_group_id pair(s) for insufficient-points questions.` : ''
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
