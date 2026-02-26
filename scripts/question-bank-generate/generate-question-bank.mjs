#!/usr/bin/env node
/**
 * Question bank generator: total = page_count × questions_per_page, distributed by strategy.
 * Reads strategy-icse-history-civics.yaml and stub_page_counts.yaml.
 * Output: sample_questions_Ch{N}_{discipline}.json for curation:import.
 *
 * Usage:
 *   File: node generate-question-bank.mjs --grade=9 --book=... --chapter=1 --discipline=history [--notes-dir=path] [--pages=N] [--out-dir=out]
 *   DB:   node generate-question-bank.mjs --from-db (--chapter-id=uuid | --grade=N --book=... --chapter=N --discipline=history) [--pages=N] [--out-dir=out]
 * Options:
 *   --structure-images-dir=path — folder of chapter structure images (camelCase names). Default: Books/ICSE/{grade}/HistoryCivics/{book}/Ch{N}_{discipline}_images. Used for 60% within-structure visual/picture-study questions.
 *   --resume — load existing output, generate only missing questions per (type, difficulty), merge and overwrite. When set, concurrency is capped at 2.
 *   --only-types=picture_study_linked,mcq_visual_scenario — load existing output, remove those types, generate only those types, merge back.
 *   --concurrency=N — run up to N plan entries in parallel (default 4; with --resume, max 2).
 *   --delay-ms=N — per-slot delay in ms after each API call (default 2000).
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

// Load .env from script dir, then repo root, then sibling script folders that may have GEMINI_API_KEY
dotenv.config({ path: path.join(__dirname, '.env') });
// Load backend .env for DATABASE_URL when using --from-db
try {
  const backendEnv = path.join(ROOT, 'backend', '.env');
  if (fs.existsSync(backendEnv)) {
    const lines = fs.readFileSync(backendEnv, 'utf8').split('\n');
    for (const line of lines) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
    }
  }
} catch (_) {}
if (!process.env.GEMINI_API_KEY?.trim()) dotenv.config({ path: path.join(ROOT, '.env') });
if (!process.env.GEMINI_API_KEY?.trim()) dotenv.config({ path: path.join(ROOT, 'scripts', 'study-notes-generate', '.env') });
if (!process.env.GEMINI_API_KEY?.trim()) dotenv.config({ path: path.join(ROOT, 'scripts', 'question-extract-sample', '.env') });
const STRATEGY_PATH = path.join(__dirname, 'strategy-icse-history-civics.yaml');
const STUB_PAGES_PATH = path.join(__dirname, 'stub_page_counts.yaml');

const DIFFICULTY_TAGS = { 1: 'easy', 2: 'medium', 3: 'difficult', 4: 'complex' };
const BATCH_SIZE = 10;
const DEFAULT_DELAY_MS = 2000;
const MAX_RETRIES = 3;
const DEFAULT_CONCURRENCY = 4;
const RESUME_MAX_CONCURRENCY = 2;

function getArg(name, def = null) {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!arg) return def;
  return arg.slice(`--${name}=`.length).trim();
}

function hasFlag(name) {
  return process.argv.some((a) => a === `--${name}`);
}

function getConcurrency(resume) {
  const arg = process.argv.find((a) => a.startsWith('--concurrency='));
  const n = arg ? parseInt(arg.slice('--concurrency='.length).trim(), 10) : DEFAULT_CONCURRENCY;
  const cap = Number.isFinite(n) && n >= 1 ? Math.min(10, Math.max(1, n)) : DEFAULT_CONCURRENCY;
  return resume ? Math.min(RESUME_MAX_CONCURRENCY, cap) : cap;
}

function getDelayMs() {
  const arg = process.argv.find((a) => a.startsWith('--delay-ms='));
  const n = arg ? parseInt(arg.slice('--delay-ms='.length).trim(), 10) : null;
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_DELAY_MS;
}

function hasFromDb() {
  return process.argv.includes('--from-db');
}

function getChapterIdArg() {
  const arg = process.argv.find((a) => a.startsWith('--chapter-id='));
  if (!arg) return null;
  return arg.slice('--chapter-id='.length).trim() || null;
}

function loadPublications() {
  const p = path.join(ROOT, 'docs', 'icse_publications.json');
  const raw = fs.readFileSync(p, 'utf8');
  return JSON.parse(raw).publications || [];
}

function stripHtmlToText(html) {
  if (!html || typeof html !== 'string') return '';
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Parse --only-types=picture_study_linked,mcq_visual_scenario into a Set of type names, or null if not set. */
function getOnlyTypesFlag() {
  const arg = process.argv.find((a) => a.startsWith('--only-types='));
  if (!arg) return null;
  const list = arg.slice('--only-types='.length).split(',').map((s) => s.trim()).filter(Boolean);
  return list.length > 0 ? new Set(list) : null;
}

function loadStrategy() {
  const raw = fs.readFileSync(STRATEGY_PATH, 'utf8');
  return yaml.load(raw);
}

function loadStubPageCounts() {
  if (!fs.existsSync(STUB_PAGES_PATH)) return [];
  const raw = fs.readFileSync(STUB_PAGES_PATH, 'utf8');
  const doc = yaml.load(raw);
  return doc?.stub_page_counts ?? [];
}

function getPageCount(cliPages, chapterNum, discipline, stubConfig) {
  if (cliPages != null && Number.isFinite(Number(cliPages))) return Math.max(1, Math.round(Number(cliPages)));
  const stub = stubConfig.find((s) => s.chapter === chapterNum && (s.discipline || '') === (discipline || ''));
  if (stub?.page_count != null) return Math.max(1, Math.round(stub.page_count));
  return null;
}

/** Key for (type, difficulty) in existing map. */
function planKey(question_type, difficulty_level) {
  return `${question_type}|${difficulty_level}`;
}

/** Normalize path string for resume key matching (trim, collapse spaces). */
function normalizePath(pathStr) {
  if (pathStr == null || typeof pathStr !== 'string') return '';
  return pathStr.trim().replace(/\s+/g, ' ');
}

/** Progress bar string for batch index. */
function progressBar(current, total, width = 24) {
  if (total <= 0) return '[░░░░░░░░░░░░░░░░░░░░░░░░] 0%';
  const pct = Math.min(1, current / total);
  const filled = Math.round(width * pct);
  const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
  return `[${bar}] ${Math.round(pct * 100)}%`;
}

/**
 * Parse (a), (b), (c), (d) options from question text. Returns array of { letter, text } in order a,b,c,d.
 */
function parseMcqOptionsFromText(questionText) {
  if (!questionText || typeof questionText !== 'string') return [];
  const parts = questionText.split(/\s*\(\s*([a-dA-D])\s*\)\s*/);
  const options = [];
  for (let i = 1; i + 1 < parts.length && options.length < 4; i += 2) {
    const letter = (parts[i] || '').trim().toLowerCase();
    const text = (parts[i + 1] || '').trim().replace(/\n+/g, ' ').slice(0, 2000);
    if (letter && 'abcd'.includes(letter)) options.push({ letter, text });
  }
  return options;
}

/**
 * Ensure rubric has a structured options block for choice/MCQ questions when missing.
 * If rubric.blocks already has type "options" with options array, returns rubric as-is.
 * Otherwise parses (a)(b)(c)(d) from questionText and adds a block with option_text and is_correct.
 */
function ensureMcqOptionsInRubric(questionText, rubric, questionType) {
  if (!rubric || typeof rubric !== 'object') return rubric;
  const isChoice =
    (questionType && String(questionType).startsWith('mcq_')) ||
    (rubric.answer_input_type === 'choice');
  if (!isChoice) return rubric;

  const blocks = Array.isArray(rubric.blocks) ? rubric.blocks : [];
  const hasOptionsBlock = blocks.some(
    (b) => b && b.type === 'options' && Array.isArray(b.options) && b.options.length >= 1
  );
  if (hasOptionsBlock) return rubric;

  const parsed = parseMcqOptionsFromText(questionText);
  if (parsed.length < 2) return rubric;

  let correctLetter = null;
  const ak = rubric.answer_key;
  if (ak && typeof ak === 'object') {
    const raw = ak.correct_option ?? ak.options;
    if (raw != null && typeof raw === 'string') {
      const m = raw.trim().replace(/[()]/g, '').toLowerCase().match(/^([a-d])/);
      if (m) correctLetter = m[1];
    }
  }
  if (!correctLetter) correctLetter = 'a';

  const options = parsed.map(({ letter, text }) => ({
    option_text: text || `Option ${letter}`,
    is_correct: letter === correctLetter,
  }));

  const newBlocks = [...blocks, { type: 'options', options }];
  return { ...rubric, blocks: newBlocks };
}

/** Regex to find [Image: <caption>] placeholders in notes content. */
const IMAGE_PLACEHOLDER_REGEX = /\[Image:\s*[^\]]*\]/g;

const STRUCTURE_IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);

/** Default directory for chapter structure images: Books/ICSE/{grade}/HistoryCivics/{book_slug}/Ch{N}_{discipline}_images */
function getStructureImagesDir(grade, bookSlug, chapterNum, discipline) {
  const ch = String(chapterNum).padStart(2, '0');
  return path.join(ROOT, 'Books', 'ICSE', String(grade), 'HistoryCivics', bookSlug, `Ch${ch}_${discipline || 'history'}_images`);
}

/** List image names (filename without extension, camelCase as-is) from a directory. Returns [] if dir missing or not a directory. */
function listStructureImageNames(structureImagesDir) {
  if (!structureImagesDir || !fs.existsSync(structureImagesDir)) return [];
  try {
    const stat = fs.statSync(structureImagesDir);
    if (!stat.isDirectory()) return [];
  } catch (_) {
    return [];
  }
  const names = [];
  for (const f of fs.readdirSync(structureImagesDir)) {
    const ext = path.extname(f).toLowerCase();
    if (STRUCTURE_IMAGE_EXTENSIONS.has(ext)) {
      const base = path.basename(f, ext);
      if (base) names.push(base);
    }
  }
  return names.sort();
}

/** Collect all [Image: ...] placeholders from notes (nodes, additional_sections, sections). Order preserved; duplicates possible. */
function collectImagePlaceholders(notes) {
  const out = [];

  function scanText(text) {
    if (!text || typeof text !== 'string') return;
    const matches = text.match(IMAGE_PLACEHOLDER_REGEX);
    if (matches) for (const m of matches) out.push(m);
  }

  if (notes.nodes && Array.isArray(notes.nodes)) {
    function walk(nodes) {
      for (const n of nodes) {
        for (const b of n.content_blocks || []) if (b?.content_md) scanText(b.content_md);
        if (n.children?.length) walk(n.children);
      }
    }
    walk(notes.nodes);
  }
  for (const s of notes.reconciliation?.additional_sections || []) scanText(s.content_md);
  if (notes.sections && Array.isArray(notes.sections)) {
    for (const sec of notes.sections) scanText(sec.content_md);
  }
  return out;
}

/** Load existing output file and return map of key -> questions[]. Key is planKey(type,diff) or planKey(type,diff)+"|"+normalized(section_ref) when section_ref present, so resume can match per-node. Preserves scenario_data per question. */
function loadExistingOutput(outFile) {
  if (!fs.existsSync(outFile)) return null;
  const data = JSON.parse(fs.readFileSync(outFile, 'utf8'));
  const map = new Map();
  for (const item of data.items || []) {
    const baseKey = planKey(item.question_type, item.difficulty_level);
    for (const q of item.questions || []) {
      const sectionRef = q.section_ref ?? (Array.isArray(q.section_refs) && q.section_refs[0]) ?? '';
      const pathPart = normalizePath(sectionRef);
      const key = pathPart ? `${baseKey}|${pathPart}` : baseKey;
      const list = map.get(key) || [];
      list.push({
        question_text: q.question_text ?? '',
        model_answer_text: q.model_answer_text ?? '',
        rubric: q.rubric ?? {},
        scenario_data: q.scenario_data ?? null,
        section_ref: q.section_ref,
        section_refs: q.section_refs,
      });
      map.set(key, list);
    }
  }
  return { existingByKey: map, meta: data };
}

/** All nodes ordered by depth descending, then tree order (for MCQ allocation: deepest first). */
function getNodeOrderDepthFirst(treeWithPaths) {
  return [...treeWithPaths]
    .map((n, i) => ({ ...n, _idx: i }))
    .sort((a, b) => {
      if (a.depth !== b.depth) return (b.depth ?? 0) - (a.depth ?? 0);
      return (a._idx ?? 0) - (b._idx ?? 0);
    });
}

/** Build node-level MCQ plan: same target per node, even split, deepest nodes first. Every node gets at least one when totalMCQ >= numNodes. */
function buildMcqNodePlan(treeWithPaths, strategy, totalQuestions) {
  const mcqSub = strategy.mcq_subtypes || {};
  const diffByType = strategy.difficulty_by_type || {};
  const types = strategy.types || {};
  const typeCount = Math.round((totalQuestions * (types.mcq ?? 0)) / 100);
  if (typeCount <= 0) return [];

  const slots = [];
  for (const [subType, subPct] of Object.entries(mcqSub)) {
    const subCount = Math.round((typeCount * subPct) / 100);
    if (subCount <= 0) continue;
    const diff = diffByType.mcq || { L1: 25, L2: 50, L3: 20, L4: 5 };
    for (let L = 1; L <= 4; L++) {
      const lpct = diff[`L${L}`] ?? 0;
      const dCount = Math.round((subCount * lpct) / 100);
      for (let k = 0; k < dCount; k++) slots.push({ question_type: subType, difficulty_level: L });
    }
  }
  const totalMCQ = slots.length;
  const nodeOrder = getNodeOrderDepthFirst(treeWithPaths);
  const numNodes = nodeOrder.length;
  if (numNodes === 0) return [];

  const perNode = new Map();
  for (let i = 0; i < slots.length; i++) {
    const node = nodeOrder[i % numNodes];
    const key = node.id;
    if (!perNode.has(key)) perNode.set(key, []);
    perNode.get(key).push(slots[i]);
  }

  const aggregated = new Map();
  for (const [nodeId, list] of perNode.entries()) {
    const node = nodeOrder.find((n) => n.id === nodeId);
    if (!node) continue;
    const byKey = new Map();
    for (const s of list) {
      const k = `${s.question_type}|${s.difficulty_level}`;
      byKey.set(k, (byKey.get(k) || 0) + 1);
    }
    for (const [k, count] of byKey) {
      const [question_type, difficulty_level] = k.split('|');
      const entryKey = `${nodeId}|${k}`;
      aggregated.set(entryKey, { question_type, difficulty_level: parseInt(difficulty_level, 10), count, nodeId, nodePath: node.path });
    }
  }

  return [...aggregated.values()];
}

/** Node plan for a single type (short_answer, short_source_interpretation, deductive_application): even split across all nodes, depth-desc, ≥1 per node when total ≥ numNodes. */
function buildFlatTypeNodePlan(treeWithPaths, strategy, typeKey, typeCount) {
  if (typeCount <= 0) return [];
  const diff = strategy.difficulty_by_type?.[typeKey] || { L2: 100 };
  const slots = [];
  for (let L = 1; L <= 4; L++) {
    const lpct = diff[`L${L}`] ?? 0;
    const dCount = Math.round((typeCount * lpct) / 100);
    for (let k = 0; k < dCount; k++) slots.push({ question_type: typeKey, difficulty_level: L });
  }
  const nodeOrder = getNodeOrderDepthFirst(treeWithPaths);
  const numNodes = nodeOrder.length;
  if (numNodes === 0) return [];

  const perNode = new Map();
  for (let i = 0; i < slots.length; i++) {
    const node = nodeOrder[i % numNodes];
    const key = node.id;
    if (!perNode.has(key)) perNode.set(key, []);
    perNode.get(key).push(slots[i]);
  }

  const aggregated = new Map();
  for (const [nodeId, list] of perNode.entries()) {
    const node = nodeOrder.find((n) => n.id === nodeId);
    if (!node) continue;
    const byKey = new Map();
    for (const s of list) {
      const k = `${s.question_type}|${s.difficulty_level}`;
      byKey.set(k, (byKey.get(k) || 0) + 1);
    }
    for (const [k, count] of byKey) {
      const [question_type, difficulty_level] = k.split('|');
      aggregated.set(`${nodeId}|${k}`, { question_type, difficulty_level: parseInt(difficulty_level, 10), count, nodeId, nodePath: node.path });
    }
  }
  return [...aggregated.values()];
}

/** Build list of { question_type, difficulty_level, count [, nodeId, nodePath ] } from strategy and total. */
function computePlan(strategy, totalQuestions, treeWithPaths = null) {
  const plan = [];
  const types = strategy.types || {};
  const mcqSub = strategy.mcq_subtypes || {};
  const diffByType = strategy.difficulty_by_type || {};

  for (const [typeKey, pct] of Object.entries(types)) {
    if (pct <= 0) continue;
    let typeCount = Math.round((totalQuestions * pct) / 100);
    if (typeCount <= 0) continue;

    if (typeKey === 'mcq') {
      if (treeWithPaths && treeWithPaths.length > 0) {
        const nodeEntries = buildMcqNodePlan(treeWithPaths, strategy, totalQuestions);
        for (const ne of nodeEntries) plan.push(ne);
      } else {
        for (const [subType, subPct] of Object.entries(mcqSub)) {
          const subCount = Math.round((typeCount * subPct) / 100);
          if (subCount <= 0) continue;
          const diff = diffByType.mcq || { L1: 25, L2: 50, L3: 20, L4: 5 };
          for (let L = 1; L <= 4; L++) {
            const lpct = diff[`L${L}`] ?? 0;
            const dCount = Math.round((subCount * lpct) / 100);
            if (dCount > 0) plan.push({ question_type: subType, difficulty_level: L, count: dCount });
          }
        }
      }
    } else if (['short_answer', 'short_source_interpretation', 'deductive_application'].includes(typeKey) && treeWithPaths?.length > 0) {
      const nodeEntries = buildFlatTypeNodePlan(treeWithPaths, strategy, typeKey, typeCount);
      for (const ne of nodeEntries) plan.push(ne);
    } else {
      const diff = diffByType[typeKey] || { L2: 100 };
      const longFormat = strategy.long_format || {};
      const longFormatTypes = new Set(['structured_essay']);
      for (let L = 1; L <= 4; L++) {
        const lpct = diff[`L${L}`] ?? 0;
        const dCount = Math.round((typeCount * lpct) / 100);
        if (dCount > 0) {
          if (treeWithPaths && longFormatTypes.has(typeKey) && Object.keys(longFormat).length > 0) {
            const nodeEntries = buildStructuredEssayNodePlan(dCount, L, treeWithPaths, longFormat);
            for (const ne of nodeEntries) plan.push({ question_type: typeKey, difficulty_level: L, count: ne.count, nodeId: ne.id, nodePath: ne.path });
          } else {
            plan.push({ question_type: typeKey, difficulty_level: L, count: dCount });
          }
        }
      }
    }
  }
  return plan;
}

/** Eligible nodes: depth 0, 1, or 2 and (word_count >= min_words OR descendant_count >= min_descendants). */
function getEligibleLongFormatNodes(treeWithPaths, minWords = 150, minDescendants = 3) {
  return treeWithPaths.filter(
    (n) =>
      (n.depth === 0 || n.depth === 1 || n.depth === 2) &&
      ((n.word_count ?? 0) >= minWords || (n.descendant_count ?? 0) >= minDescendants)
  );
}

/** Distribute count by depth (50% d2, 30% d1, 20% d0); when totalCount >= eligible.length, every eligible node gets ≥1 (round-robin), then remainder by depth. Returns [{ id, path, count }]. */
function buildStructuredEssayNodePlan(totalCount, difficultyLevel, treeWithPaths, longFormat) {
  const weights = longFormat.depth_weights || { 0: 20, 1: 30, 2: 50 };
  const minWords = longFormat.min_words ?? 150;
  const minDescendants = longFormat.min_descendants ?? 3;
  const eligible = getEligibleLongFormatNodes(treeWithPaths, minWords, minDescendants);
  if (eligible.length === 0) return [{ id: null, path: null, count: totalCount }];

  const byDepth = new Map();
  for (const n of eligible) {
    if (!byDepth.has(n.depth)) byDepth.set(n.depth, []);
    byDepth.get(n.depth).push(n);
  }
  const d2 = (byDepth.get(2) || []).slice();
  const d1 = (byDepth.get(1) || []).slice();
  const d0 = (byDepth.get(0) || []).slice();

  const out = [];
  function assign(nodes, need) {
    if (nodes.length === 0) return 0;
    const per = Math.floor(need / nodes.length);
    const extra = need % nodes.length;
    for (let i = 0; i < nodes.length; i++) {
      const count = per + (i < extra ? 1 : 0);
      if (count > 0) out.push({ id: nodes[i].id, path: nodes[i].path, count });
    }
    return 0;
  }

  if (totalCount >= eligible.length) {
    const remainder = totalCount - eligible.length;
    const c2 = Math.round((remainder * (weights[2] || 50)) / 100);
    const c1 = Math.round((remainder * (weights[1] || 30)) / 100);
    const c0 = remainder - c2 - c1;
    const countByNode = new Map();
    for (const n of eligible) countByNode.set(n.id, { ...n, count: 1 });
    function addByDepth(nodes, need) {
      if (nodes.length === 0) return;
      const per = Math.floor(need / nodes.length);
      const extra = need % nodes.length;
      for (let i = 0; i < nodes.length; i++) {
        const ent = countByNode.get(nodes[i].id);
        if (ent) ent.count += per + (i < extra ? 1 : 0);
      }
    }
    addByDepth(d2, c2);
    addByDepth(d1, c1);
    addByDepth(d0, c0);
    return [...countByNode.values()].map(({ id, path, count }) => ({ id, path, count }));
  }

  let c2 = Math.round((totalCount * (weights[2] || 50)) / 100);
  let c1 = Math.round((totalCount * (weights[1] || 30)) / 100);
  let c0 = totalCount - c2 - c1;
  if (c0 < 0) {
    c0 = 0;
    c1 = totalCount - c2;
  }
  let carry = assign(d2, c2);
  carry = assign(d1, c1 + carry);
  assign(d0, c0 + carry);
  return out.length ? out : [{ id: null, path: null, count: totalCount }];
}

function findNotesFile(notesDir, grade, bookSlug, chapterNum, discipline) {
  const ch = String(chapterNum).padStart(2, '0');
  const names = fs.readdirSync(notesDir);
  const extractPattern = new RegExp(`^notes_ICSE_${grade}_HistoryCivics_${bookSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}_Ch${ch}_${discipline}\\.json$`);
  const generatePattern = new RegExp(`^study_notes_Ch${ch}_HistoryCivics_${bookSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}_${discipline}\\.json$`);
  for (const n of names) {
    if (extractPattern.test(n) || generatePattern.test(n)) return path.join(notesDir, n);
  }
  return null;
}

function flattenNodesToText(nodes, prefix = '') {
  let s = '';
  if (!Array.isArray(nodes)) return s;
  for (const n of nodes) {
    s += prefix + (n.title || '') + '\n';
    for (const b of n.content_blocks || []) {
      if (b?.content_md) s += b.content_md + '\n';
    }
    s += flattenNodesToText(n.children || [], prefix + '  ');
  }
  return s;
}

/** If sectionIdsToInclude is provided (Set), only include sections whose id is in the set (or sections without id). */
function buildChapterContext(notes, sectionIdsToInclude = null) {
  if (notes.nodes) {
    let text = flattenNodesToText(notes.nodes || []);
    for (const s of notes.reconciliation?.additional_sections || []) {
      text += (s.title || '') + '\n' + (s.content_md || '') + '\n';
    }
    return text;
  }
  if (notes.sections && Array.isArray(notes.sections)) {
    let sections = notes.sections;
    if (sectionIdsToInclude && sectionIdsToInclude.size > 0) {
      sections = sections.filter((sec) => sec.id == null || sectionIdsToInclude.has(sec.id));
    }
    return sections.map((sec) => (sec.title || '') + '\n' + (sec.content_md || '')).join('\n\n');
  }
  return '';
}

function getGeminiModel() {
  return process.env.GEMINI_MODEL?.trim() || 'gemini-2.0-flash';
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetriableApiError(err) {
  const msg = String(err?.message ?? err ?? '');
  return (
    msg.includes('429') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('503') ||
    msg.includes('UNAVAILABLE') ||
    msg.includes('500') ||
    msg.includes('502')
  );
}

function stripCodeFence(text) {
  const trimmed = (text || '').trim();
  const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  return match ? match[1].trim() : trimmed;
}

/** Try to fix common JSON issues from model output (trailing commas, etc.). */
function sanitizeJsonString(s) {
  let t = (s || '').trim();
  t = stripCodeFence(t);
  // Remove trailing commas before ] or }
  t = t.replace(/,(\s*[}\]])/g, '$1');
  return t;
}

function parseResponse(text) {
  if (!text) throw new Error('Empty response from Gemini');
  let raw = stripCodeFence(text);
  try {
    return JSON.parse(raw);
  } catch (e) {
    raw = sanitizeJsonString(text);
    try {
      return JSON.parse(raw);
    } catch (e2) {
      throw e;
    }
  }
}

async function callGemini(apiKey, prompt) {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: getGeminiModel(),
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
  });
  const text = response?.text ?? response?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  return parseResponse(text);
}

async function runWithRetry(apiKey, prompt) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await callGemini(apiKey, prompt);
    } catch (err) {
      const isRetryable =
        attempt < MAX_RETRIES &&
        (isRetriableApiError(err) || err instanceof SyntaxError);
      if (isRetryable) {
        await delay(8000 * Math.pow(2, attempt - 1));
      } else {
        throw err;
      }
    }
  }
}

function buildPrompt(notes, questionType, difficultyLevel, count, isPlaceholder, opts = {}) {
  const { treeLines = null, nodePathForScope = null, sectionIdsToInclude = null, requireSectionRefs = false } = opts;
  const difficultyTag = DIFFICULTY_TAGS[difficultyLevel];
  const chapterTitle = notes.chapter_title || '';
  const discipline = notes.discipline || 'history';
  const context = buildChapterContext(notes, sectionIdsToInclude);

  const civicsGuidance =
    discipline === 'civics'
      ? ' For Civics: use precise constitutional/institutional terminology; include Article/Schedule references where relevant.'
      : ' For History: use cause-effect, chronology, significance; "State two causes/consequences", "Name the movement/event/leader", "Explain the importance of".';

  const spreadInstruction =
    'Distribute the requested questions evenly across all sections, topics, subtopics and content blocks in the chapter. Do not cluster all questions on one section or topic.';

  if (isPlaceholder) {
    return `You are generating ICSE History & Civics exam-style questions. Chapter: "${chapterTitle}". Discipline: ${discipline}.${civicsGuidance}

Question type: ${questionType} (image-based). Difficulty: ${difficultyTag}.

Generate exactly 1 placeholder question: the question text should describe the image theme and sub-questions (e.g. "Image: [Describe the historical event/figure shown]. (i) Identify... (ii) Explain... (iii) Significance..."). Provide a brief model_answer_text and a minimal rubric (rubric_version 2, total_marks, answer_input_type "typed", blocks for each sub-part). Output only a JSON object: { "questions": [ { "question_text": "...", "model_answer_text": "...", "rubric": { ... } } ] }. No markdown fences.`;
  }

  return `You are generating ICSE History & Civics exam-style questions. Board style: ${discipline === 'civics' ? 'Civics' : 'History'}.
Chapter: "${chapterTitle}". Discipline: ${discipline}.${civicsGuidance}

Question type: ${questionType}. Difficulty: ${difficultyTag} (level ${difficultyLevel}).

${nodePathForScope ? `Generate questions only for this section and its subtopics: "${nodePathForScope}". Each question must refer to a path within this section. ` : ''}${spreadInstruction}

${treeLines && treeLines.length > 0 ? `Syllabus tree (path from root; use these exact path strings for section_ref/section_refs):\n${treeLines.map((p) => `- ${p}`).join('\n')}\n\n` : ''}Chapter content (use only this for factual accuracy):
---
${context.slice(0, 28000)}
---

Generate exactly ${count} distinct questions of this type and difficulty, each with a model answer and a rubric. Do not duplicate or repeat the same question (including rephrased versions); each question must be unique in content and meaning.

Rules:
- Rubric must be valid JSON: rubric_version (2), total_marks, question_type ("${questionType}"), difficulty_level (${difficultyLevel}), difficulty_tag ("${difficultyTag}"), answer_input_type ("typed" or "choice"), blocks array with id, label, selection (min/max), match_mode, criteria (id, keywords, score). For MCQ use answer_input_type "choice" and optionally answer_key (correct_option, logic_explanation for assertion-reason). For typed answers include scoring_rules where appropriate.
${questionType.startsWith('mcq_') ? `- For MCQs: (1) question_text must include the full question stem followed by all four options on separate lines: (a) ..., (b) ..., (c) ..., (d) .... Do not omit the options. (2) rubric must include a block with type "options" and an "options" array of exactly four objects, each with "option_text" (string) and "is_correct" (true for the correct option, false otherwise). (3) rubric.answer_key must include "correct_option" (letter "a", "b", "c", or "d"). model_answer_text should be the correct option letter and optionally the answer text, e.g. (b) 1921.` : ''}
${questionType === 'structured_essay' ? `- For structured_essay only: Each question must have exactly three sub-parts labeled (i), (ii), (iii) — do not use (a)(b)(c). Total 10 marks. Use only one of these splits: 3+3+4 (preferred) or 2+4+4 (fallback). No sub-part may be 5 marks; each sub-part must be 2, 3, or 4 marks. In question_text, end each sub-part with the mark in brackets, e.g. (i) ... [3], (ii) ... [3], (iii) ... [4] or (i) ... [2], (ii) ... [4], (iii) ... [4]. Mark allocation rule: a 2-mark sub-part must expect 2–3 key points; a 3-mark sub-part must expect 3–4 key points; a 4-mark sub-part must expect 4 or more key points. Rubric must have exactly three blocks, each with sub_part_key "i", "ii", or "iii" (matching the sub-parts) and a "marks" (or "max_marks") field set to that part's marks (2, 3, or 4).` : ''}
${questionType === 'mcq_logic_table' ? `- For mcq_logic_table only: This type is a match-the-columns / table question, NOT assertion-reason. (1) question_text must include the question stem and the table in HTML only: use <table>, <thead>, <tbody>, <tr>, <th>, <td>. Do not use markdown table syntax (e.g. pipes). Example: <table><thead><tr><th></th><th>Column A</th><th>Column B</th></tr></thead><tbody><tr><td>(a)</td><td>...</td><td>...</td></tr>...</tbody></table>. (2) Exactly four options (rows or combinations), each with (a)(b)(c)(d). (3) rubric.blocks must include a block with type "options" and an "options" array of exactly four objects, each with "option_text" (string) and "is_correct" (true for the correct option). rubric.answer_key must include "correct_option" (a, b, c, or d). (4) Do not use Assertion (A) and Reason (R). Rubric question_type must be "mcq_logic_table".` : ''}
${questionType === 'mcq_assertion_reason' ? `- For mcq_assertion_reason only: (1) question_text must have exactly two statements labelled Assertion (A) and Reason (R), followed by the four standard A/R options: (a) Both A and R are true and R is the correct explanation of A; (b) Both A and R are true but R is not the correct explanation of A; (c) A is true but R is false; (d) A is false but R is true. (2) rubric.answer_key must include "correct_option" (a, b, c, or d) and "logic_explanation" (a short explanation of why that option is correct). Rubric question_type must be "mcq_assertion_reason".` : ''}
${questionType === 'mcq_source_connection' ? `- For mcq_source_connection only: (1) question_text must start with a short text source (a quote, excerpt, or constitutional/article snippet), then one question asking the student to connect the source to a concept, event, or correct option. (2) Exactly four options (a)(b)(c)(d); one correct. (3) Do not use Assertion (A) and Reason (R). No A/R statements and no "Both A and R true" style options. This type is source plus connection question, not assertion-reason. Rubric question_type must be "mcq_source_connection".` : ''}
- Output only a single JSON object, no markdown fences. Escape double quotes inside strings with backslash (\\"). Do not use unescaped newlines inside JSON string values.
${requireSectionRefs ? '\n- For each question include exactly one of: "section_ref" (single path string from the syllabus tree) or "section_refs" (array of path strings when the question spans multiple topics). Use the exact path strings from the syllabus tree above.' : ''}

Output format:
{
  "questions": [
    { "question_text": "<full question stem>", "model_answer_text": "<model answer or key>", "rubric": { ... }${requireSectionRefs ? ', "section_ref": "<path>" or "section_refs": ["<path1>", "<path2>"]' : ''} }
  ]
}`;
}

/** Prompt for one picture_study_linked question: image caption from extract; generate (i)(ii)(iii) sub-questions + model answer + rubric. opts: { sectionIdsToInclude, nodePathForScope, treeLines, requireSectionRefs }. */
function buildPictureStudyPrompt(notes, imagePlaceholderCaption, difficultyLevel, opts = {}) {
  const { sectionIdsToInclude = null, nodePathForScope = null, treeLines = null, requireSectionRefs = false } = opts;
  const difficultyTag = DIFFICULTY_TAGS[difficultyLevel];
  const chapterTitle = notes.chapter_title || '';
  const discipline = notes.discipline || 'history';
  const context = buildChapterContext(notes, sectionIdsToInclude);

  const civicsGuidance =
    discipline === 'civics'
      ? ' For Civics: use precise constitutional/institutional terminology; include Article/Schedule references where relevant.'
      : ' For History: use cause-effect, chronology, significance.';

  return `You are generating one ICSE History & Civics picture study question. Chapter: "${chapterTitle}". Discipline: ${discipline}.${civicsGuidance}

The textbook extract references this image placeholder: ${imagePlaceholderCaption}

${nodePathForScope ? `Generate the question only for this section and its subtopics: "${nodePathForScope}". ` : ''}Using the chapter content below, generate exactly one picture study question that will be shown alongside this image (the SME will upload the image later). The question must have exactly three sub-parts labeled (i), (ii), (iii): (i) Identify / describe what is shown, (ii) Explain significance or context, (iii) Significance/consequence or connection to the chapter.

Marks and format (strict):
- Total 10 marks. Use only one of these splits: 3+3+4 (preferred) or 2+4+4 (fallback). No sub-part may be 5 marks; each sub-part must be 2, 3, or 4 marks.
- In question_text, end each sub-part with the mark in brackets, e.g. (i) ... [3], (ii) ... [3], (iii) ... [4].
- Mark allocation rule: a 2-mark sub-part must expect 2–3 key points; a 3-mark sub-part must expect 3–4 key points; a 4-mark sub-part must expect 4 or more key points.
- Rubric must have exactly three blocks, each with sub_part_key "i", "ii", or "iii" and a "marks" (or "max_marks") field set to that part's marks (2, 3, or 4).

Difficulty: ${difficultyTag} (level ${difficultyLevel}).

${treeLines?.length ? `Syllabus tree (use exact path strings for section_ref):\n${treeLines.map((p) => `- ${p}`).join('\n')}\n\n` : ''}Chapter content (use only this for factual accuracy):
---
${context.slice(0, 20000)}
---

Generate one JSON object with a single question: question_text must include the full stem and the three sub-questions (i), (ii), (iii) each ending with [n] as above. Provide model_answer_text and a rubric (rubric_version 2, total_marks 10, question_type "picture_study_linked", difficulty_level ${difficultyLevel}, answer_input_type "typed", blocks with sub_part_key and marks per sub-part).${requireSectionRefs ? ' Include "section_ref": "<path>" using an exact path from the syllabus tree above.' : ''} Do not include scenario_data or image fields in the output.

Output format (no markdown fences, escape double quotes in strings with \\"):
{
  "questions": [
    { "question_text": "<Study the image. (i) ... (ii) ... (iii) ...>", "model_answer_text": "<model answer>", "rubric": { ... }${requireSectionRefs ? ', "section_ref": "<path>"' : ''} }
  ]
}`;
}

/** Prompt for mcq_visual_scenario: generate questions + image_instruction per question (SME will upload image later). */
function buildVisualScenarioPrompt(notes, difficultyLevel, count) {
  const difficultyTag = DIFFICULTY_TAGS[difficultyLevel];
  const chapterTitle = notes.chapter_title || '';
  const discipline = notes.discipline || 'history';
  const context = buildChapterContext(notes);

  const civicsGuidance =
    discipline === 'civics'
      ? ' For Civics: use precise constitutional/institutional terminology.'
      : ' For History: use cause-effect, chronology, maps, sources.';

  return `You are generating ICSE History & Civics MCQ visual scenario questions. Chapter: "${chapterTitle}". Discipline: ${discipline}.${civicsGuidance}

Question type: mcq_visual_scenario. Each question is an MCQ that refers to an image (e.g. map, diagram, photograph). The image will be uploaded later by an editor. You must provide for each question:
1. question_text: the question stem and four options (a)–(d) on separate lines, referring to "the image" or "the diagram" etc. Do not omit any of the four options.
2. model_answer_text: the correct option and brief explanation.
3. rubric: rubric_version 2, total_marks, question_type "mcq_visual_scenario", difficulty_level ${difficultyLevel}, answer_input_type "choice". rubric.blocks must include one block with type "options" and an "options" array of exactly four objects: { "option_text": "...", "is_correct": true/false }. rubric.answer_key must include "correct_option" (letter a, b, c, or d).
4. image_instruction: a short instruction for the editor describing exactly what image to use (e.g. "A map of India showing Harappan sites with Lothal and Mohenjo-daro marked" or "Photograph of the Great Bath at Mohenjo-daro"). Be specific so the right image can be chosen.

Difficulty: ${difficultyTag}. Generate exactly ${count} distinct questions. Do not duplicate; each question and image_instruction must be unique.

Chapter content:
---
${context.slice(0, 22000)}
---

Output only a single JSON object (no markdown fences, escape double quotes with \\"):
{
  "questions": [
    { "question_text": "...", "model_answer_text": "...", "rubric": { ... }, "image_instruction": "..." }
  ]
}`;
}

/** Prompt for one picture_study_linked question using an image from the structure (by camelCase name). Question must be relevant to that image. opts: { sectionIdsToInclude, nodePathForScope, treeLines, requireSectionRefs }. */
function buildPictureStudyPromptForStructureImage(notes, structureImageName, difficultyLevel, opts = {}) {
  const { sectionIdsToInclude = null, nodePathForScope = null, treeLines = null, requireSectionRefs = false } = opts;
  const difficultyTag = DIFFICULTY_TAGS[difficultyLevel];
  const chapterTitle = notes.chapter_title || '';
  const discipline = notes.discipline || 'history';
  const context = buildChapterContext(notes, sectionIdsToInclude);

  const civicsGuidance =
    discipline === 'civics'
      ? ' For Civics: use precise constitutional/institutional terminology; include Article/Schedule references where relevant.'
      : ' For History: use cause-effect, chronology, significance.';

  return `You are generating one ICSE History & Civics picture study question. Chapter: "${chapterTitle}". Discipline: ${discipline}.${civicsGuidance}

The question must be based on the following image from the chapter structure. Image name (camelCase): **${structureImageName}**. Generate a question that is clearly relevant to what this image shows (e.g. a map, photograph, or diagram with that theme). The question will be displayed alongside this image.

${nodePathForScope ? `Generate the question only for this section and its subtopics: "${nodePathForScope}". ` : ''}The question must have exactly three sub-parts labeled (i), (ii), (iii): (i) Identify / describe what is shown, (ii) Explain significance or context, (iii) Significance/consequence or connection to the chapter.

Marks and format (strict):
- Total 10 marks. Use only one of these splits: 3+3+4 (preferred) or 2+4+4 (fallback). No sub-part may be 5 marks; each sub-part must be 2, 3, or 4 marks.
- In question_text, end each sub-part with the mark in brackets, e.g. (i) ... [3], (ii) ... [3], (iii) ... [4].
- Rubric must have exactly three blocks, each with sub_part_key "i", "ii", or "iii" and a "marks" (or "max_marks") field set to that part's marks.

Difficulty: ${difficultyTag} (level ${difficultyLevel}).

${treeLines?.length ? `Syllabus tree (use exact path strings for section_ref):\n${treeLines.map((p) => `- ${p}`).join('\n')}\n\n` : ''}Chapter content (use only this for factual accuracy):
---
${context.slice(0, 20000)}
---

Generate one JSON object with a single question.${requireSectionRefs ? ' Include "section_ref": "<path>" using an exact path from the syllabus tree above.' : ''} Do not include scenario_data or image fields in the output.

Output format (no markdown fences, escape double quotes with \\"):
{
  "questions": [
    { "question_text": "<Study the image. (i) ... (ii) ... (iii) ...>", "model_answer_text": "<model answer>", "rubric": { ... }${requireSectionRefs ? ', "section_ref": "<path>"' : ''} }
  ]
}`;
}

/** Prompt for mcq_visual_scenario questions each tied to a structure image (by name). Each question must be tailored to that image. imageNames: array of camelCase names. */
function buildVisualScenarioPromptForStructureImages(notes, difficultyLevel, imageNames) {
  const difficultyTag = DIFFICULTY_TAGS[difficultyLevel];
  const chapterTitle = notes.chapter_title || '';
  const discipline = notes.discipline || 'history';
  const context = buildChapterContext(notes);

  const civicsGuidance =
    discipline === 'civics'
      ? ' For Civics: use precise constitutional/institutional terminology.'
      : ' For History: use cause-effect, chronology, maps, sources.';

  const namesList = imageNames.map((n) => `"${n}"`).join(', ');

  return `You are generating ICSE History & Civics MCQ visual scenario questions. Chapter: "${chapterTitle}". Discipline: ${discipline}.${civicsGuidance}

Question type: mcq_visual_scenario. Each question is an MCQ that refers to an image from the chapter structure. For each of the following image names (camelCase), generate exactly one MCQ that is **tailored to that specific image**: ${namesList}.

Each question must be clearly relevant to what that image shows (e.g. map, diagram, photograph). The question will be displayed alongside that image. You must provide for each question:
1. question_text: the question stem and four options (a)–(d) on separate lines, referring to "the image" or "the diagram" etc.
2. model_answer_text: the correct option and brief explanation.
3. rubric: rubric_version 2, total_marks, question_type "mcq_visual_scenario", difficulty_level ${difficultyLevel}, answer_input_type "choice". rubric.blocks must include one block with type "options" and an "options" array of exactly four objects. rubric.answer_key must include "correct_option" (a, b, c, or d).
4. structure_image_name: the exact camelCase image name from the list above that this question is for.

Difficulty: ${difficultyTag}. Generate exactly ${imageNames.length} distinct questions, one per image. Order of questions in the output must match the order of image names: ${namesList}.

Chapter content:
---
${context.slice(0, 22000)}
---

Output only a single JSON object (no markdown fences, escape double quotes with \\"):
{
  "questions": [
    { "question_text": "...", "model_answer_text": "...", "rubric": { ... }, "structure_image_name": "<exact name>" }
  ]
}`;
}

/**
 * Run one plan entry (all batches sequential). Uses shared state for batchIndex/done logging.
 * structureImageNames: list of camelCase names from chapter structure images folder; withinPct: 0–1 for 60% within structure.
 * @returns {{ planIndex: number, item: object | null }}
 */
async function runOnePlanEntry(apiKey, notes, entry, imagePlaceholders, state, totalBatches, delayMs, treeWithPaths = null, descendantMap = null, structureImageNames = [], withinPct = 0.6) {
  const { planIndex, question_type, difficulty_level, count, existingList, need, nodeId, nodePath } = entry;

  if (question_type === 'picture_study_linked' && count > 0) {
    const questionsForItem = existingList.map((q) => ({
      question_text: q.question_text,
      model_answer_text: q.model_answer_text,
      rubric: q.rubric,
      scenario_data: q.scenario_data ?? null,
      section_ref: q.section_ref,
      section_refs: q.section_refs,
    }));
    const needWithin = structureImageNames.length > 0 ? Math.round(need * withinPct) : 0;
    const needOutside = need - needWithin;
    const captions = imagePlaceholders.length > 0 ? imagePlaceholders : ['[Image: Refer to chapter illustration]'];

    const nImages = structureImageNames.length;
    const withinAllocation = [];
    if (nImages > 0 && needWithin > 0) {
      if (needWithin >= nImages) {
        const remainder = needWithin - nImages;
        const per = Math.floor(remainder / nImages);
        const extra = remainder % nImages;
        for (let i = 0; i < nImages; i++) {
          withinAllocation.push({ imageName: structureImageNames[i], count: 1 + per + (i < extra ? 1 : 0) });
        }
      } else {
        for (let i = 0; i < needWithin; i++) {
          withinAllocation.push({ imageName: structureImageNames[i], count: 1 });
        }
      }
    }

    const useNodeScope = treeWithPaths?.length > 0 && descendantMap != null;
    let withinSlots = [];
    let outsideAllocation = [];
    let treeLines = null;
    if (useNodeScope) {
      for (const { imageName, count: perImage } of withinAllocation) {
        for (let k = 0; k < perImage; k++) withinSlots.push({ imageName });
      }
      const nodeOrder = getNodeOrderDepthFirst(treeWithPaths);
      const numNodes = nodeOrder.length;
      for (let i = 0; i < withinSlots.length; i++) {
        const node = nodeOrder[i % numNodes];
        withinSlots[i].nodeId = node.id;
        withinSlots[i].nodePath = node.path;
      }
      const usedNodeIds = new Set(withinSlots.map((s) => s.nodeId));
      let nodesForOutside = nodeOrder.filter((n) => !usedNodeIds.has(n.id));
      if (nodesForOutside.length === 0) nodesForOutside = [...nodeOrder];
      const nOut = nodesForOutside.length;
      const per = Math.floor(needOutside / nOut);
      const extra = needOutside % nOut;
      for (let i = 0; i < nOut; i++) {
        const c = per + (i < extra ? 1 : 0);
        if (c > 0) outsideAllocation.push({ nodeId: nodesForOutside[i].id, nodePath: nodesForOutside[i].path, count: c });
      }
      treeLines = treeWithPaths.map((n) => n.path);
    }

    if (useNodeScope && withinSlots.length > 0) {
      for (const slot of withinSlots) {
        state.batchIndex++;
        const sectionIdsToInclude =
          slot.nodeId && descendantMap
            ? new Set([slot.nodeId, ...(descendantMap.get(slot.nodeId) || [])])
            : null;
        const promptOpts = {
          sectionIdsToInclude: sectionIdsToInclude || undefined,
          nodePathForScope: slot.nodePath || undefined,
          treeLines: treeLines || undefined,
          requireSectionRefs: true,
        };
        try {
          const prompt = buildPictureStudyPromptForStructureImage(notes, slot.imageName, difficulty_level, promptOpts);
          const result = await runWithRetry(apiKey, prompt);
          const one = Array.isArray(result?.questions) ? result.questions[0] : null;
          if (one) {
            questionsForItem.push({
              question_text: one.question_text ?? '',
              model_answer_text: one.model_answer_text ?? '',
              rubric: one.rubric ?? {},
              scenario_data: { structure_image_name: slot.imageName },
              section_ref: one.section_ref ?? slot.nodePath,
              section_refs: Array.isArray(one.section_refs) ? one.section_refs : undefined,
            });
            state.done++;
            console.log(`  ${progressBar(state.batchIndex, totalBatches)} [${state.batchIndex}/${totalBatches}] picture_study_linked L${difficulty_level} (structure): +1 (${state.done} total)`);
          }
        } catch (err) {
          console.error(`  [${state.batchIndex}/${totalBatches}] picture_study_linked L${difficulty_level} structure failed:`, err.message);
        }
        await delay(delayMs);
      }
    } else {
      for (const { imageName, count: perImage } of withinAllocation) {
        for (let k = 0; k < perImage; k++) {
          state.batchIndex++;
          try {
            const prompt = buildPictureStudyPromptForStructureImage(notes, imageName, difficulty_level);
            const result = await runWithRetry(apiKey, prompt);
            const one = Array.isArray(result?.questions) ? result.questions[0] : null;
            if (one) {
              questionsForItem.push({
                question_text: one.question_text ?? '',
                model_answer_text: one.model_answer_text ?? '',
                rubric: one.rubric ?? {},
                scenario_data: { structure_image_name: imageName },
              });
              state.done++;
              console.log(`  ${progressBar(state.batchIndex, totalBatches)} [${state.batchIndex}/${totalBatches}] picture_study_linked L${difficulty_level} (structure): +1 (${state.done} total)`);
            }
          } catch (err) {
            console.error(`  [${state.batchIndex}/${totalBatches}] picture_study_linked L${difficulty_level} structure failed:`, err.message);
          }
          await delay(delayMs);
        }
      }
    }

    if (useNodeScope && outsideAllocation.length > 0) {
      let outsideIndex = 0;
      for (const { nodeId, nodePath, count: nodeCount } of outsideAllocation) {
        const sectionIdsToInclude = descendantMap ? new Set([nodeId, ...(descendantMap.get(nodeId) || [])]) : null;
        const promptOpts = {
          sectionIdsToInclude: sectionIdsToInclude || undefined,
          nodePathForScope: nodePath || undefined,
          treeLines: treeLines || undefined,
          requireSectionRefs: true,
        };
        for (let k = 0; k < nodeCount; k++) {
          const imageCaption = captions[(existingList.length + needWithin + outsideIndex + k) % captions.length];
          state.batchIndex++;
          try {
            const prompt = buildPictureStudyPrompt(notes, imageCaption, difficulty_level, promptOpts);
            const result = await runWithRetry(apiKey, prompt);
            const one = Array.isArray(result?.questions) ? result.questions[0] : null;
            if (one) {
              questionsForItem.push({
                question_text: one.question_text ?? '',
                model_answer_text: one.model_answer_text ?? '',
                rubric: one.rubric ?? {},
                scenario_data: { image_placeholder_caption: imageCaption },
                section_ref: one.section_ref ?? nodePath,
                section_refs: Array.isArray(one.section_refs) ? one.section_refs : undefined,
              });
              state.done++;
              console.log(`  ${progressBar(state.batchIndex, totalBatches)} [${state.batchIndex}/${totalBatches}] picture_study_linked L${difficulty_level}: +1 (${state.done} total)`);
            }
          } catch (err) {
            console.error(`  [${state.batchIndex}/${totalBatches}] picture_study_linked L${difficulty_level} failed:`, err.message);
          }
          await delay(delayMs);
        }
        outsideIndex += nodeCount;
      }
    } else {
      for (let k = 0; k < needOutside; k++) {
        const imageCaption = captions[(existingList.length + needWithin + k) % captions.length];
        state.batchIndex++;
        try {
          const prompt = buildPictureStudyPrompt(notes, imageCaption, difficulty_level);
          const result = await runWithRetry(apiKey, prompt);
          const one = Array.isArray(result?.questions) ? result.questions[0] : null;
          if (one) {
            questionsForItem.push({
              question_text: one.question_text ?? '',
              model_answer_text: one.model_answer_text ?? '',
              rubric: one.rubric ?? {},
              scenario_data: { image_placeholder_caption: imageCaption },
            });
            state.done++;
            console.log(`  ${progressBar(state.batchIndex, totalBatches)} [${state.batchIndex}/${totalBatches}] picture_study_linked L${difficulty_level}: +1 (${state.done} total)`);
          }
        } catch (err) {
          console.error(`  [${state.batchIndex}/${totalBatches}] picture_study_linked L${difficulty_level} failed:`, err.message);
        }
        await delay(delayMs);
      }
    }
    if (questionsForItem.length > 0) {
      return { planIndex, item: { question_type: 'picture_study_linked', difficulty_level, difficulty_tag: DIFFICULTY_TAGS[difficulty_level], questions: questionsForItem.slice(0, count) } };
    }
    return { planIndex, item: null };
  }

  if (question_type === 'mcq_visual_scenario' && count > 0) {
    const questionsForItem = existingList.map((q) => ({
      question_text: q.question_text,
      model_answer_text: q.model_answer_text,
      rubric: q.rubric,
      scenario_data: q.scenario_data ?? null,
    }));
    const needWithin = structureImageNames.length > 0 ? Math.round(need * withinPct) : 0;
    const needOutside = need - needWithin;

    let remainingWithin = needWithin;
    let withinIndex = 0;
    while (remainingWithin > 0) {
      const batchNames = structureImageNames.slice(withinIndex, withinIndex + Math.min(BATCH_SIZE, remainingWithin));
      withinIndex += batchNames.length;
      remainingWithin -= batchNames.length;
      state.batchIndex++;
      try {
        const prompt = buildVisualScenarioPromptForStructureImages(notes, difficulty_level, batchNames);
        const result = await runWithRetry(apiKey, prompt);
        const batch = Array.isArray(result?.questions) ? result.questions : [];
        for (let i = 0; i < batch.length; i++) {
          const q = batch[i];
          const rubric = ensureMcqOptionsInRubric(q.question_text ?? '', q.rubric ?? {}, 'mcq_visual_scenario');
          const imageName = q.structure_image_name ?? batchNames[i] ?? batchNames[0];
          questionsForItem.push({
            question_text: q.question_text ?? '',
            model_answer_text: q.model_answer_text ?? '',
            rubric,
            scenario_data: { structure_image_name: imageName },
          });
        }
        state.done += batch.length;
        console.log(`  ${progressBar(state.batchIndex, totalBatches)} [${state.batchIndex}/${totalBatches}] mcq_visual_scenario L${difficulty_level} (structure): +${batch.length} (${state.done} total)`);
      } catch (err) {
        console.error(`  [${state.batchIndex}/${totalBatches}] mcq_visual_scenario L${difficulty_level} structure failed:`, err.message);
      }
      await delay(delayMs);
    }

    let remainingOutside = needOutside;
    while (remainingOutside > 0) {
      const batchCount = Math.min(BATCH_SIZE, remainingOutside);
      state.batchIndex++;
      try {
        const prompt = buildVisualScenarioPrompt(notes, difficulty_level, batchCount);
        const result = await runWithRetry(apiKey, prompt);
        const batch = Array.isArray(result?.questions) ? result.questions.slice(0, batchCount) : [];
        for (const q of batch) {
          const rubric = ensureMcqOptionsInRubric(q.question_text ?? '', q.rubric ?? {}, 'mcq_visual_scenario');
          questionsForItem.push({
            question_text: q.question_text ?? '',
            model_answer_text: q.model_answer_text ?? '',
            rubric,
            scenario_data: q.image_instruction != null ? { image_instruction: String(q.image_instruction) } : null,
          });
        }
        state.done += batch.length;
        remainingOutside -= batch.length;
        console.log(`  ${progressBar(state.batchIndex, totalBatches)} [${state.batchIndex}/${totalBatches}] mcq_visual_scenario L${difficulty_level}: +${batch.length} (${state.done} total)`);
      } catch (err) {
        console.error(`  [${state.batchIndex}/${totalBatches}] mcq_visual_scenario L${difficulty_level} failed:`, err.message);
        remainingOutside -= batchCount;
      }
      await delay(delayMs);
    }
    if (questionsForItem.length > 0) {
      return { planIndex, item: { question_type: 'mcq_visual_scenario', difficulty_level, difficulty_tag: DIFFICULTY_TAGS[difficulty_level], questions: questionsForItem.slice(0, count) } };
    }
    return { planIndex, item: null };
  }

  const questionsForItem = existingList.map((q) => ({
    question_text: q.question_text,
    model_answer_text: q.model_answer_text,
    rubric: q.rubric,
    scenario_data: q.scenario_data ?? null,
    section_ref: q.section_ref,
    section_refs: q.section_refs,
  }));
  const treeLines = treeWithPaths && treeWithPaths.length > 0 ? treeWithPaths.map((n) => n.path) : null;
  const sectionIdsToInclude = nodeId && descendantMap ? (() => { const s = new Set([nodeId]); for (const id of descendantMap.get(nodeId) || []) s.add(id); return s; })() : null;
  const promptOpts = {
    treeLines: treeLines || undefined,
    nodePathForScope: nodePath || undefined,
    sectionIdsToInclude: sectionIdsToInclude || undefined,
    requireSectionRefs: !!treeWithPaths,
  };
  let remaining = need;
  while (remaining > 0) {
    const batchCount = Math.min(BATCH_SIZE, remaining);
    state.batchIndex++;
    try {
      const prompt = buildPrompt(notes, question_type, difficulty_level, batchCount, false, promptOpts);
      const result = await runWithRetry(apiKey, prompt);
      const batch = Array.isArray(result?.questions) ? result.questions.slice(0, batchCount) : [];
      for (const q of batch) {
        const rubric = ensureMcqOptionsInRubric(q.question_text ?? '', q.rubric ?? {}, question_type);
        questionsForItem.push({
          question_text: q.question_text ?? '',
          model_answer_text: q.model_answer_text ?? '',
          rubric,
          scenario_data: null,
          section_ref: q.section_ref ?? undefined,
          section_refs: Array.isArray(q.section_refs) ? q.section_refs : undefined,
        });
      }
      state.done += batch.length;
      remaining -= batch.length;
      console.log(`  ${progressBar(state.batchIndex, totalBatches)} [${state.batchIndex}/${totalBatches}] ${question_type} L${difficulty_level}: +${batch.length} (${state.done} total)`);
    } catch (err) {
      console.error(`  [${state.batchIndex}/${totalBatches}] ${question_type} L${difficulty_level} failed:`, err.message);
      remaining -= batchCount;
    }
    await delay(delayMs);
  }
  if (questionsForItem.length > 0) {
    return { planIndex, item: { question_type, difficulty_level, difficulty_tag: DIFFICULTY_TAGS[difficulty_level], questions: questionsForItem.slice(0, count) } };
  }
  return { planIndex, item: null };
}

/** Run async tasks with a concurrency limit. Each task returns a value; all are collected. */
async function runWithConcurrency(tasks, concurrency) {
  const results = [];
  const executing = new Set();
  for (const task of tasks) {
    const p = task().then((r) => {
      results.push(r);
      executing.delete(p);
      return r;
    });
    executing.add(p);
    while (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }
  await Promise.all([...executing]);
  return results;
}

async function main() {
  let grade = getArg('grade');
  let book = getArg('book');
  let chapterNum = parseInt(getArg('chapter'), 10);
  let discipline = getArg('discipline');
  const notesDir = getArg('notes-dir', path.join(__dirname, '../study-notes-extract/out'));
  const cliPages = getArg('pages');
  const outDir = getArg('out-dir', path.join(__dirname, 'out'));
  let notes;
  let nodeIdsForRoundRobin = null;

  let treeWithPaths = null;
  let descendantMap = null;
  if (hasFromDb()) {
    const { getPool, resolveChapter, loadNodesWithNoteBlocks, loadTreeWithPathsAndEligibility } = await import('../shared/db-published.mjs');
    const pool = getPool();
    const chapterIdArg = getChapterIdArg();
    if (chapterIdArg) {
      const resolved = await resolveChapter(pool, { chapterId: chapterIdArg });
      if (!resolved) {
        console.error('Chapter not found for --chapter-id=', chapterIdArg);
        process.exit(1);
      }
      grade = String(resolved.grade);
      book = loadPublications().find((p) => p.grade === resolved.grade && p.book_name === resolved.subjectName)?.book_slug || resolved.subjectName?.replace(/\s+/g, '') || 'book';
      chapterNum = resolved.sequenceNumber;
      discipline = resolved.discipline || 'history';
      const nodes = await loadNodesWithNoteBlocks(pool, resolved.chapterId);
      if (nodes.length === 0) {
        console.error('No published syllabus nodes or note_blocks for this chapter. Publish structure and full extract first.');
        process.exit(1);
      }
      nodeIdsForRoundRobin = nodes.map((n) => n.id);
      treeWithPaths = await loadTreeWithPathsAndEligibility(pool, resolved.chapterId);
      const children = new Map();
      for (const n of treeWithPaths) {
        if (n.parent_id) {
          if (!children.has(n.parent_id)) children.set(n.parent_id, []);
          children.get(n.parent_id).push(n.id);
        }
      }
      function descendantIds(id) {
        const out = [];
        const stack = [id];
        while (stack.length) {
          const cur = stack.pop();
          for (const cid of children.get(cur) || []) {
            out.push(cid);
            stack.push(cid);
          }
        }
        return out;
      }
      descendantMap = new Map(treeWithPaths.map((n) => [n.id, new Set(descendantIds(n.id))]));
      const pageCountRow = await pool.query('SELECT page_count FROM chapters WHERE id = $1', [resolved.chapterId]).then((r) => r.rows[0]?.page_count ?? null);
      notes = {
        board: 'ICSE',
        grade: resolved.grade,
        subject: resolved.subjectName,
        book_slug: book,
        book_meta: { book_name: resolved.subjectName },
        chapter_sequence_number: resolved.sequenceNumber,
        chapter_title: resolved.chapterTitle,
        discipline: resolved.discipline || 'history',
        sections: nodes.map((n) => ({ id: n.id, title: n.title, content_md: stripHtmlToText(n.content_html) })),
        _pageCountFromDb: pageCountRow != null ? Math.max(1, Math.round(pageCountRow)) : null,
      };
    } else {
      if (!grade || !book || !Number.isFinite(chapterNum) || !discipline) {
        console.error('--from-db requires either --chapter-id=uuid OR --grade=N --book=... --chapter=N --discipline=history');
        process.exit(1);
      }
      const pubs = loadPublications().filter((p) => p.grade === Number(grade) && p.book_slug === book);
      if (pubs.length === 0) {
        console.error('No publication found for grade', grade, 'book', book);
        process.exit(1);
      }
      const resolved = await resolveChapter(pool, {
        board: 'ICSE',
        grade: Number(grade),
        subjectName: pubs[0].book_name,
        chapterNum,
        discipline: discipline || null,
      });
      if (!resolved) {
        console.error('Chapter not found in DB. Publish structure first.');
        process.exit(1);
      }
      const nodes = await loadNodesWithNoteBlocks(pool, resolved.chapterId);
      if (nodes.length === 0) {
        console.error('No published syllabus nodes or note_blocks for this chapter. Publish structure and full extract first.');
        process.exit(1);
      }
      nodeIdsForRoundRobin = nodes.map((n) => n.id);
      treeWithPaths = await loadTreeWithPathsAndEligibility(pool, resolved.chapterId);
      const children = new Map();
      for (const n of treeWithPaths) {
        if (n.parent_id) {
          if (!children.has(n.parent_id)) children.set(n.parent_id, []);
          children.get(n.parent_id).push(n.id);
        }
      }
      function descendantIds(id) {
        const out = [];
        const stack = [id];
        while (stack.length) {
          const cur = stack.pop();
          for (const cid of children.get(cur) || []) {
            out.push(cid);
            stack.push(cid);
          }
        }
        return out;
      }
      descendantMap = new Map(treeWithPaths.map((n) => [n.id, new Set(descendantIds(n.id))]));
      const pageCountRow = await pool.query('SELECT page_count FROM chapters WHERE id = $1', [resolved.chapterId]).then((r) => r.rows[0]?.page_count ?? null);
      notes = {
        board: 'ICSE',
        grade: Number(grade),
        subject: resolved.subjectName,
        book_slug: book,
        book_meta: { book_name: resolved.subjectName },
        chapter_sequence_number: chapterNum,
        chapter_title: resolved.chapterTitle,
        discipline: discipline || 'history',
        sections: nodes.map((n) => ({ id: n.id, title: n.title, content_md: stripHtmlToText(n.content_html) })),
        _pageCountFromDb: pageCountRow != null ? Math.max(1, Math.round(pageCountRow)) : null,
      };
    }
  } else {
    if (!grade || !book || !Number.isFinite(chapterNum) || !discipline) {
      console.error('Usage: node generate-question-bank.mjs --grade=9 --book=... --chapter=1 --discipline=history [--notes-dir=path] [--pages=N] [--out-dir=out] [--resume] [--only-types=type1,type2]');
      process.exit(1);
    }
    const notesPath = findNotesFile(notesDir, grade, book, chapterNum, discipline);
    if (!notesPath || !fs.existsSync(notesPath)) {
      console.error('Notes file not found in', notesDir, 'for grade', grade, 'book', book, 'chapter', chapterNum, discipline);
      process.exit(1);
    }
    notes = JSON.parse(fs.readFileSync(notesPath, 'utf8'));
  }

  const strategy = loadStrategy();
  const stubConfig = loadStubPageCounts();
  const pageCount = hasFromDb() ? (cliPages != null ? Math.max(1, Math.round(Number(cliPages))) : notes._pageCountFromDb) : getPageCount(cliPages, chapterNum, discipline, stubConfig);
  if (pageCount == null && !hasFromDb()) {
    console.error('Page count required. Set --pages=N, add an entry in stub_page_counts.yaml, or run study-notes-generate + curation import so chapters.page_count is set.');
    process.exit(1);
  }
  const effectivePageCount = hasFromDb() ? (notes._pageCountFromDb ?? (cliPages != null ? Math.max(1, Math.round(Number(cliPages))) : 1)) : (pageCount ?? 1);
  if (effectivePageCount == null || effectivePageCount < 1) {
    console.error('Page count required. Set --pages=N or ensure chapters.page_count is set in DB.');
    process.exit(1);
  }

  const qPerPage = strategy.questions_per_page ?? 25;
  const totalQuestions = effectivePageCount * qPerPage;
  console.log(`Chapter ${chapterNum} ${discipline}: ${effectivePageCount} pages × ${qPerPage} = ${totalQuestions} questions` + (hasFromDb() ? ' (from DB)' : ''));

  const plan = computePlan(strategy, totalQuestions, treeWithPaths);
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    console.error('Set GEMINI_API_KEY in .env (script dir, repo root, or scripts/study-notes-generate/.env)');
    process.exit(1);
  }

  const ch = String(chapterNum).padStart(2, '0');
  const outFile = path.join(outDir, `sample_questions_Ch${ch}_${discipline}.json`);
  const resume = hasFlag('resume');
  const onlyTypes = getOnlyTypesFlag();

  let existingByKey = new Map();
  let existingMeta = null;
  if (resume || onlyTypes) {
    const loaded = loadExistingOutput(outFile);
    if (onlyTypes && !loaded) {
      console.error('--only-types requires an existing output file:', outFile);
      process.exit(1);
    }
    if (loaded) {
      existingByKey = loaded.existingByKey;
      existingMeta = loaded.meta;
      if (resume) {
        const totalExisting = [...existingByKey.values()].reduce((s, arr) => s + arr.length, 0);
        console.log('Resume: loaded', outFile, '(', totalExisting, 'existing questions). Filling shortfalls.');
      }
      if (onlyTypes) {
        console.log('Only-types:', [...onlyTypes].join(', '), '— replacing those items and merging into', outFile);
      }
    } else if (resume) {
      console.error('--resume requires an existing output file:', outFile);
      process.exit(1);
    }
  }

  const imagePlaceholders = collectImagePlaceholders(notes);
  if (imagePlaceholders.length > 0) {
    console.log('Image placeholders in chapter:', imagePlaceholders.length);
  }

  const structureImagesDir = getArg('structure-images-dir') || getStructureImagesDir(grade, book, chapterNum, discipline);
  const structureImageNames = listStructureImageNames(structureImagesDir);
  const withinPct = (strategy.structure_images?.within_structure_pct ?? 60) / 100;
  if (structureImageNames.length > 0) {
    console.log('Structure images (60%% within):', structureImageNames.length, 'in', structureImagesDir);
  }

  fs.mkdirSync(outDir, { recursive: true });

  const planEntriesWithMeta = plan
    .map((p, planIndex) => {
      if (onlyTypes && !onlyTypes.has(p.question_type)) return null;
      const baseKey = planKey(p.question_type, p.difficulty_level);
      const key =
        p.nodeId != null
          ? `${baseKey}|${normalizePath(p.nodePath ?? '')}`
          : baseKey;
      const existingList =
        onlyTypes && onlyTypes.has(p.question_type)
          ? []
          : (existingByKey.get(key) || []).slice(0, p.count);
      const need = p.count - existingList.length;
      return { planIndex, question_type: p.question_type, difficulty_level: p.difficulty_level, count: p.count, existingList, need, nodeId: p.nodeId, nodePath: p.nodePath };
    })
    .filter(Boolean);

  const workEntries = planEntriesWithMeta.filter((p) => p.need > 0);
  const concurrency = getConcurrency(resume);
  const delayMs = getDelayMs();
  const totalBatches = planEntriesWithMeta.reduce((acc, p) => {
    if (p.need <= 0) return acc;
    if (p.question_type === 'picture_study_linked') return acc + p.need;
    if (p.question_type === 'mcq_visual_scenario') {
      const needWithin = structureImageNames.length > 0 ? Math.round(p.need * withinPct) : 0;
      const needOutside = p.need - needWithin;
      return acc + Math.ceil(needWithin / BATCH_SIZE) + Math.ceil(needOutside / BATCH_SIZE);
    }
    return acc + Math.ceil(p.need / BATCH_SIZE);
  }, 0);

  if (workEntries.length > 0) {
    console.log(`Concurrency: ${concurrency}, delay: ${delayMs}ms per API call`);
    console.log(`Generating ${totalBatches} batches (${workEntries.length} plan entries), ${totalQuestions} questions target.\n`);
  }

  const state = { batchIndex: 0, done: 0 };
  const tasks = workEntries.map((entry) => () =>
    runOnePlanEntry(apiKey, notes, entry, imagePlaceholders, state, totalBatches, delayMs, treeWithPaths, descendantMap, structureImageNames, withinPct)
  );
  const results = await runWithConcurrency(tasks, concurrency);
  const resultByIndex = new Map(
    results.filter((r) => r && r.item != null).map((r) => [r.planIndex, r.item])
  );

  const items = [];
  for (const p of planEntriesWithMeta) {
    const item = resultByIndex.get(p.planIndex);
    if (item) {
      items.push(item);
    } else if (p.need === 0 && p.existingList.length > 0) {
      items.push({
        question_type: p.question_type,
        difficulty_level: p.difficulty_level,
        difficulty_tag: DIFFICULTY_TAGS[p.difficulty_level],
        questions: p.existingList.map((q) => ({
          question_text: q.question_text,
          model_answer_text: q.model_answer_text,
          rubric: q.rubric,
          scenario_data: q.scenario_data ?? null,
          section_ref: q.section_ref,
          section_refs: q.section_refs,
        })),
      });
    }
  }

  let outItems = items;
  if (onlyTypes && existingMeta?.items?.length) {
    const otherItems = existingMeta.items.filter((i) => !onlyTypes.has(i.question_type || ''));
    outItems = [...otherItems, ...items];
  }
  if (nodeIdsForRoundRobin && nodeIdsForRoundRobin.length > 0 && !treeWithPaths) {
    outItems = outItems.map((item, i) => ({
      ...item,
      syllabus_node_id: nodeIdsForRoundRobin[i % nodeIdsForRoundRobin.length],
    }));
  }

  const out = {
    board: notes.board || 'ICSE',
    grade: Number(grade) || 9,
    subject: notes.subject || 'HistoryCivics',
    book_slug: notes.book_slug || book,
    book_meta: notes.book_meta || { book_name: notes.chapter_title || '' },
    chapter_sequence_number: chapterNum,
    chapter_title: notes.chapter_title,
    discipline,
    generated_at: new Date().toISOString(),
    items: outItems,
  };
  fs.writeFileSync(outFile, JSON.stringify(out, null, 2), 'utf8');
  console.log('Wrote', outFile, `(${outItems.length} items, ${outItems.reduce((s, i) => s + i.questions.length, 0)} questions)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
