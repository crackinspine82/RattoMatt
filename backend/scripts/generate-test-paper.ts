#!/usr/bin/env node
/**
 * Temporary test: generate a board-style question paper PDF + answer key PDF from
 * draft_questions in the curation DB (Ch1 History + Ch1 Civics only).
 * Uses docs/paper-templates/icse-grade9-history-civics.yaml.
 * Run from backend/: npm run paper:test [-- --out-dir=./out]
 * Multiple runs produce different papers (randomized selection).
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import PDFDocument from 'pdfkit';
import { getPool } from '../src/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const TEMPLATE_PATH = path.join(ROOT, 'docs/paper-templates/icse-grade9-history-civics.yaml');

const DIFFICULTY_MAP: Record<string, number> = { easy: 1, medium: 2, difficult: 3, complex: 4 };

const MARGIN = 72; // 1 inch
const MARKS_WIDTH = 44;
const SPACE_AFTER_QUESTION_PART1 = 0.7;
const SPACE_AFTER_QUESTION_SECTION = 1;
/** Stub for paper recognition; replace with real UID later. */
const UID_STUB = 'UID: STUB-001';
const FOOTER_Y_OFFSET = 24; // space above bottom margin for page number
/** Width of the question number column so body text wraps indented (not under the number). */
const QUESTION_NUMBER_WIDTH = 28;
/** Width of the option label column (a), (b), (c), (d) so option text wraps indented. */
const OPTION_LABEL_WIDTH = 24;
/** Width of Part II sub-part label column (i), (ii), (iii) so body wraps indented. */
const SUBPART_LABEL_WIDTH = 28;
/** Width of nested list label (a)/(b)/(c) or (i)/(ii)/(iii) within Part II part text. */
const NESTED_LABEL_WIDTH = 24;
/** Width of Part II per-subquestion mark column so digit sits at right margin. */
const SUBMARK_WIDTH = 20;

/** Convert 1-based index to lowercase Roman numeral (1→i, 2→ii, … 16→xvi, 20→xx). */
function toRoman(n: number): string {
  const map: [number, string][] = [
    [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i'],
  ];
  let s = '';
  let v = n;
  for (const [val, sym] of map) {
    while (v >= val) {
      s += sym;
      v -= val;
    }
  }
  return s;
}

type ScenarioData = { image_placeholder_caption?: string; image_instruction?: string } | null;

type DraftQuestionRow = {
  id: string;
  question_text: string;
  question_type: string;
  discipline: string;
  difficulty_level: number;
  marks: number;
  model_answer_text: string | null;
  scenario_data: ScenarioData;
  source_material_url: string | null;
  rubric_json: unknown;
};

type SelectedQuestion = DraftQuestionRow & { displayIndex: number; sectionLabel: string };

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function pickFromPool(
  pool: DraftQuestionRow[],
  count: number,
  usedIds: Set<string>
): DraftQuestionRow[] {
  const available = pool.filter((q) => !usedIds.has(q.id));
  const picked = shuffle(available).slice(0, count);
  picked.forEach((q) => usedIds.add(q.id));
  return picked;
}

function getImagePlaceholderText(q: DraftQuestionRow): string | null {
  const sd = q.scenario_data;
  if (!sd || typeof sd !== 'object') return null;
  const caption = (sd as { image_placeholder_caption?: string }).image_placeholder_caption;
  const instruction = (sd as { image_instruction?: string }).image_instruction;
  if (caption) return `Image to be inserted – ${caption.replace(/^\[Image:\s*|\]$/g, '').trim()}`;
  if (instruction) return `Image to be inserted – ${instruction}`;
  return null;
}

function needsImagePlaceholder(q: DraftQuestionRow): boolean {
  return (
    q.question_type === 'picture_study_linked' ||
    (q.question_type === 'mcq_visual_scenario' && !q.source_material_url)
  );
}

/** Parse question text into sub-parts (i), (ii), (iii) and extract [n] marks from each part if present. */
function parseSubPartsFromText(questionText: string): { parts: string[]; marksFromText: (number | null)[] } {
  const parts: string[] = [];
  const marksFromText: (number | null)[] = [];
  const rest = questionText.trim();
  if (!rest) return { parts: [rest], marksFromText: [null] };
  const re = /\((?:i{1,3}|iv)\)\s*([\s\S]*?)(?=\((?:i{1,3}|iv)\)|$)/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(rest)) !== null) {
    const segment = match[1].trim();
    const markMatch = segment.match(/\[\s*(\d+)\s*\]\s*$/);
    const mark = markMatch ? parseInt(markMatch[1], 10) : null;
    const labelMatch = match[0].match(/\((?:i{1,3}|iv)\)/i);
    const label = labelMatch ? labelMatch[0] : '(i)';
    const text = markMatch ? segment.slice(0, -markMatch[0].length).trim() : segment;
    parts.push(`(${label}) ${text}`);
    marksFromText.push(mark);
  }
  if (parts.length === 0) return { parts: [questionText], marksFromText: [null] };
  return { parts, marksFromText };
}

/** Get sub-part marks from rubric_json.blocks (sub_part_key or block_name; marks or max_marks). */
function getSubMarksFromRubric(rubricJson: unknown): number[] {
  const rubric = rubricJson as { blocks?: Array<{ sub_part_key?: string; block_name?: string; marks?: number; max_marks?: number }> } | null;
  if (!rubric?.blocks?.length) return [];
  const order = ['i', 'ii', 'iii', 'iv'];
  const byKey = new Map<string, number>();
  for (const b of rubric.blocks) {
    const key = (b.sub_part_key ?? b.block_name?.replace(/[()\s]/g, '') ?? '').toLowerCase();
    const mark = b.marks ?? b.max_marks;
    if (key && mark != null) byKey.set(key, mark);
  }
  return order.filter((k) => byKey.has(k)).map((k) => byKey.get(k)!);
}

/** Subquestion marks: from question text first, then rubric fallback. */
function getSubQuestionMarks(questionText: string, rubricJson: unknown): number[] {
  const { parts, marksFromText } = parseSubPartsFromText(questionText);
  const fromRubric = getSubMarksFromRubric(rubricJson);
  if (parts.length <= 1) return [];
  const out: number[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (marksFromText[i] != null) out.push(marksFromText[i]!);
    else if (i < fromRubric.length) out.push(fromRubric[i]);
    else out.push(0);
  }
  return out;
}

const ASSERTION_REASON_BOLD_REGEX = /(Assertion \(A\):|Reason \(R\):)/g;

/** Draw text with "Assertion (A):" and "Reason (R):" in bold; rest in normal weight. */
function drawTextWithAssertionReasonBold(
  doc: PDFKit.PDFDocument,
  text: string,
  opts: { x: number; y: number; width: number; lineGap?: number; align?: 'left' | 'justify' }
): void {
  const align = opts.align ?? 'left';
  const baseOpts = { width: opts.width, lineGap: opts.lineGap ?? 2, align };
  const parts = text.split(ASSERTION_REASON_BOLD_REGEX);
  if (parts.length === 1) {
    doc.font('Helvetica').text(text, opts.x, opts.y, { ...baseOpts });
    return;
  }
  doc.font('Helvetica');
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const isBold = part === 'Assertion (A):' || part === 'Reason (R):';
    if (isBold) doc.font('Helvetica-Bold');
    const continued = i < parts.length - 1;
    const textOpts = { ...baseOpts, ...(continued ? { continued: true as const } : {}) };
    if (i === 0) {
      doc.text(part, opts.x, opts.y, textOpts);
    } else {
      doc.text(part, textOpts);
    }
    if (isBold) doc.font('Helvetica');
  }
  doc.x = MARGIN;
}

/** Returns true if text looks like a table (pipe-separated or tab-separated rows). */
function looksLikeTable(text: string): boolean {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return false;
  const hasPipes = lines.some((l) => /\|/.test(l));
  const hasTabs = lines.some((l) => /\t/.test(l));
  return hasPipes || hasTabs;
}

/** True if line looks like an MCQ option or "Select the option" (not a table row). */
function isOptionOrSelectLine(line: string): boolean {
  const t = line.trim();
  return /^\([a-d]\)\s/i.test(t) || /^Select the option/i.test(t);
}

const OPTION_LINE_RE = /^\(([a-d])\)\s*(.*)/i;

/** Split body into stem (before first option line) and option lines (a)–(d) with label + text. */
function splitStemAndOptions(bodyText: string): { stem: string; options: { label: string; text: string }[] } {
  const lines = bodyText.split(/\r?\n/);
  let stemEnd = lines.length;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].trim().match(OPTION_LINE_RE);
    if (m) {
      stemEnd = i;
      break;
    }
  }
  const stem = lines.slice(0, stemEnd).join('\n').trimEnd();
  const options: { label: string; text: string }[] = [];
  for (let i = stemEnd; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const m = trimmed.match(OPTION_LINE_RE);
    if (m) {
      options.push({ label: `(${m[1].toLowerCase()})`, text: m[2].trim() });
    } else if (options.length > 0 && trimmed) {
      options[options.length - 1].text += ' ' + trimmed;
    }
  }
  return { stem, options };
}

/** Draw body text with option lines indented: (a)/(b)/(c)/(d) in left column, option text in column so wraps don't sit under label. */
function drawBodyWithOptionIndentation(
  doc: PDFKit.PDFDocument,
  bodyText: string,
  opts: { startX: number; bodyWidth: number; hasAssertionReason?: boolean; lineGap?: number }
): void {
  const { startX, bodyWidth, hasAssertionReason = false, lineGap = 2 } = opts;
  const { stem, options } = splitStemAndOptions(bodyText);
  const textOpts = { lineGap, align: 'justify' as const };

  if (options.length === 0) {
    if (hasAssertionReason) {
      drawTextWithAssertionReasonBold(doc, bodyText, { x: startX, y: doc.y, width: bodyWidth, ...textOpts });
    } else {
      doc.font('Helvetica').text(bodyText, startX, doc.y, { width: bodyWidth, ...textOpts });
    }
    doc.x = startX;
    return;
  }

  if (stem) {
    if (hasAssertionReason) {
      drawTextWithAssertionReasonBold(doc, stem, { x: startX, y: doc.y, width: bodyWidth, ...textOpts });
    } else {
      doc.font('Helvetica').text(stem, startX, doc.y, { width: bodyWidth, ...textOpts });
    }
    doc.x = startX;
  }

  for (const opt of options) {
    const y = doc.y;
    doc.text(opt.label, startX, y, { width: OPTION_LABEL_WIDTH });
    const optWidth = bodyWidth - OPTION_LABEL_WIDTH;
    doc.text(opt.text, startX + OPTION_LABEL_WIDTH, y, { width: optWidth, ...textOpts });
    doc.x = startX;
  }
}

/** Match line starting with (a)-(d) or (i)/(ii)/(iii)/(iv). */
const NESTED_LIST_LINE_RE = /^\s*\(([a-d]|i{1,3}|iv)\)\s*(.*)/i;

/** Split text into stem (before first nested bullet) and items with label + text for (a)-(d) or (i)-(iv) lines. */
function splitNestedList(text: string): { stem: string; items: { label: string; text: string }[] } {
  const lines = text.split(/\r?\n/);
  let stemEnd = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (NESTED_LIST_LINE_RE.test(lines[i].trim())) {
      stemEnd = i;
      break;
    }
  }
  const stem = lines.slice(0, stemEnd).join('\n').trimEnd();
  const items: { label: string; text: string }[] = [];
  for (let i = stemEnd; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const m = trimmed.match(NESTED_LIST_LINE_RE);
    if (m) {
      const raw = m[1].toLowerCase();
      items.push({ label: `(${raw})`, text: m[2].trim() });
    } else if (items.length > 0 && trimmed) {
      items[items.length - 1].text += ' ' + trimmed;
    }
  }
  return { stem, items };
}

/** Draw Part II part content with nested (a)/(b)/(c) or (i)/(ii)/(iii) indented (label column + body); no double bullets. */
function drawPartIIPartContent(
  doc: PDFKit.PDFDocument,
  partText: string,
  opts: { startX: number; bodyWidth: number; hasAssertionReason?: boolean; lineGap?: number }
): void {
  const { startX, bodyWidth, hasAssertionReason = false, lineGap = 2 } = opts;
  const textOpts = { lineGap, align: 'justify' as const };
  const { stem, items } = splitNestedList(partText);

  if (items.length === 0) {
    if (hasAssertionReason) {
      drawTextWithAssertionReasonBold(doc, partText, { x: startX, y: doc.y, width: bodyWidth, ...textOpts });
    } else {
      doc.font('Helvetica').text(partText, startX, doc.y, { width: bodyWidth, ...textOpts });
    }
    doc.x = startX;
    return;
  }

  if (stem) {
    if (hasAssertionReason) {
      drawTextWithAssertionReasonBold(doc, stem, { x: startX, y: doc.y, width: bodyWidth, ...textOpts });
    } else {
      doc.font('Helvetica').text(stem, startX, doc.y, { width: bodyWidth, ...textOpts });
    }
    doc.x = startX;
  }

  for (const item of items) {
    const y = doc.y;
    doc.text(item.label, startX, y, { width: NESTED_LABEL_WIDTH });
    const itemWidth = bodyWidth - NESTED_LABEL_WIDTH;
    doc.font('Helvetica').text(item.text, startX + NESTED_LABEL_WIDTH, y, { width: itemWidth, ...textOpts });
    doc.x = startX;
  }
}

/** Split body into intro, table block (grid only), and trailing text (e.g. options). */
function splitBodyIntoTableSections(bodyText: string): {
  beforeTable: string;
  tableBlock: string | null;
  afterTable: string;
} {
  const lines = bodyText.split(/\r?\n/);
  let before: string[] = [];
  let table: string[] = [];
  let after: string[] = [];
  let phase: 'before' | 'table' | 'after' = 'before';

  for (const line of lines) {
    const trimmed = line.trim();
    const hasTableChar = /\|/.test(line) || /\t/.test(line);
    const isOption = isOptionOrSelectLine(line);

    if (phase === 'before') {
      if (hasTableChar && !isOption) {
        phase = 'table';
        table.push(line);
      } else {
        before.push(line);
      }
    } else if (phase === 'table') {
      if (hasTableChar && !isOption) {
        table.push(line);
      } else {
        phase = 'after';
        after.push(line);
      }
    } else {
      after.push(line);
    }
  }

  const beforeTable = before.join('\n').trimEnd();
  const tableBlock = table.length > 0 ? table.join('\n') : null;
  const afterTable = after.join('\n').trim();
  return { beforeTable, tableBlock, afterTable };
}

/** Parse pipe or tab separated lines into rows of cells. Strips leading/trailing empty cells so | A | B | yields 2 columns. */
function parseTableText(text: string): string[][] {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
  const rows = lines.map((line) => {
    let cells: string[];
    if (/\|/.test(line)) {
      cells = line.split('|').map((c) => c.trim());
    } else {
      cells = line.split(/\t+/).map((c) => c.trim());
    }
    while (cells.length && cells[0] === '') cells.shift();
    while (cells.length && cells[cells.length - 1] === '') cells.pop();
    return cells;
  });
  return rows;
}

const CELL_PADDING = 4;

/** Draw table with borders. Uses padding so text does not overlap borders; row height fits ~2 lines. */
function drawTable(
  doc: PDFKit.PDFDocument,
  rows: string[][],
  options: { startY: number; colWidths?: number[]; fontSize?: number }
): number {
  const fontSize = options.fontSize ?? 9;
  const lineHeight = fontSize * 1.3;
  const rowHeight = lineHeight * 2.5 + 2 * CELL_PADDING;
  doc.fontSize(fontSize).font('Helvetica');
  const pageWidth = doc.page.width;
  const contentWidth = pageWidth - 2 * MARGIN;
  const nCols = Math.max(...rows.map((r) => r.length), 1);
  const widths = options.colWidths ?? Array(nCols).fill(contentWidth / nCols);
  let y = options.startY;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    let x = MARGIN;
    const rowY = y;
    for (let c = 0; c < nCols; c++) {
      const w = widths[c] ?? widths[0];
      const cell = (row[c] ?? '').trim();
      doc.text(cell, x + CELL_PADDING, y + CELL_PADDING, {
        width: w - 2 * CELL_PADDING,
        height: rowHeight - 2 * CELL_PADDING,
      });
      doc.rect(x, rowY, w, rowHeight).stroke();
      x += w;
    }
    y = rowY + rowHeight;
  }
  return y;
}

/** Draw question line. bodyOnNewLine: "Question N" on first line, body on next. subMarks: per (i)/(ii)/(iii) marks on right; when set, marksStr ignored for main. */
function drawQuestionLineWithMarks(
  doc: PDFKit.PDFDocument,
  leftText: string,
  marksStr: string,
  bodyText: string,
  opts: { isTable?: boolean; bodyOnNewLine?: boolean; subMarks?: number[] }
): void {
  const pageWidth = doc.page.width;
  const contentWidth = pageWidth - 2 * MARGIN - MARKS_WIDTH;
  const startY = doc.y;
  doc.fontSize(10).font('Helvetica');
  const lineHeight = 14;
  const textOpts = { width: contentWidth, lineGap: 2, align: 'justify' as const };
  const hasAssertionReason = /Assertion \(A\):|Reason \(R\):/.test(bodyText);

  const drawBodyText = (x: number, y: number, body: string, width = contentWidth + (marksStr ? 0 : MARKS_WIDTH)) => {
    if (hasAssertionReason) {
      drawTextWithAssertionReasonBold(doc, body, { x, y, width, lineGap: 2, align: 'justify' });
    } else {
      doc.font('Helvetica').text(body, x, y, { width, lineGap: 2, align: 'justify' });
    }
    doc.x = MARGIN;
  };

  const isTableQuestion = opts.isTable && looksLikeTable(bodyText);
  const sections = isTableQuestion ? splitBodyIntoTableSections(bodyText) : null;

  if (sections && sections.tableBlock) {
    doc.text(leftText, MARGIN, startY, { width: QUESTION_NUMBER_WIDTH });
    const bodyWidth = contentWidth - QUESTION_NUMBER_WIDTH;
    const introText = sections.beforeTable ?? '';
    doc.text(introText, MARGIN + QUESTION_NUMBER_WIDTH, startY, { width: bodyWidth, lineGap: 2, align: 'justify' });
    const endY = doc.y;
    if (marksStr) {
      doc.text(marksStr, pageWidth - MARGIN - MARKS_WIDTH, startY, { width: MARKS_WIDTH, align: 'right' });
    }
    doc.y = endY;
    doc.x = MARGIN;
    const tableStartY = endY;
    const rows = parseTableText(sections.tableBlock);
    const nextY = drawTable(doc, rows, { startY: tableStartY, fontSize: 9 });
    doc.y = nextY;
    doc.x = MARGIN;
    if (sections.afterTable) {
      doc.fontSize(10);
      const afterWidth = contentWidth + MARKS_WIDTH - QUESTION_NUMBER_WIDTH;
      drawBodyWithOptionIndentation(doc, sections.afterTable, {
        startX: MARGIN + QUESTION_NUMBER_WIDTH,
        bodyWidth: afterWidth,
        hasAssertionReason,
        lineGap: 2,
      });
    }
  } else if (opts.bodyOnNewLine && opts.subMarks?.length) {
    // Part II: "Question N" on first line; intro then each (i)/(ii)/(iii) with label column + indented body; nested (a)/(b)/(c) or (i)/(ii)/(iii) indented; sub-marks right-aligned (digits only).
    doc.font('Helvetica-Bold').text(leftText, MARGIN, startY, { width: contentWidth });
    doc.y = startY + lineHeight;
    doc.x = MARGIN;
    doc.font('Helvetica').fontSize(10);
    const firstPartMatch = bodyText.match(/\s*\((?:i{1,3}|iv)\)/i);
    const intro = firstPartMatch ? bodyText.slice(0, bodyText.indexOf(firstPartMatch[0])).trim() : '';
    if (intro) {
      drawBodyText(MARGIN, doc.y, intro, contentWidth + MARKS_WIDTH);
    }
    const { parts } = parseSubPartsFromText(bodyText);
    const partBodyWidth = contentWidth - SUBPART_LABEL_WIDTH;
    for (let i = 0; i < parts.length; i++) {
      const partY = doc.y;
      const partStr = parts[i];
      const subpartMatch = partStr.match(/^\((i{1,3}|iv)\)\s*(.*)/i);
      const subpartLabel = subpartMatch ? `(${subpartMatch[1].toLowerCase()})` : '(i)';
      const partText = subpartMatch ? subpartMatch[2].trim() : partStr;
      doc.text(subpartLabel, MARGIN, partY, { width: SUBPART_LABEL_WIDTH });
      drawPartIIPartContent(doc, partText, {
        startX: MARGIN + SUBPART_LABEL_WIDTH,
        bodyWidth: partBodyWidth,
        hasAssertionReason,
        lineGap: 2,
      });
      const endY = doc.y;
      const mark = opts.subMarks[i];
      if (mark != null && mark > 0) {
        doc.font('Helvetica').text(String(mark), pageWidth - MARGIN - SUBMARK_WIDTH, partY, { width: SUBMARK_WIDTH, align: 'right' });
      }
      doc.y = endY;
      doc.x = MARGIN;
    }
  } else if (opts.bodyOnNewLine) {
    doc.font('Helvetica-Bold').text(leftText, MARGIN, startY, { width: contentWidth });
    if (marksStr) {
      doc.font('Helvetica').text(marksStr, pageWidth - MARGIN - MARKS_WIDTH, startY, { width: MARKS_WIDTH, align: 'right' });
    }
    doc.y = startY + lineHeight;
    doc.x = MARGIN;
    doc.font('Helvetica').fontSize(10);
    drawBodyText(MARGIN, doc.y, bodyText, contentWidth + MARKS_WIDTH);
  } else {
    // Part I MCQ/short: number in left column, body (and options) indented so wrapped lines don't sit under number or (a)/(b)/(c)/(d).
    doc.text(leftText, MARGIN, startY, { width: QUESTION_NUMBER_WIDTH });
    const bodyWidth = contentWidth - QUESTION_NUMBER_WIDTH;
    const bodyStartX = MARGIN + QUESTION_NUMBER_WIDTH;
    doc.y = startY;
    drawBodyWithOptionIndentation(doc, bodyText, {
      startX: bodyStartX,
      bodyWidth,
      hasAssertionReason,
      lineGap: 2,
    });
    const endY = doc.y;
    if (marksStr) {
      doc.text(marksStr, pageWidth - MARGIN - MARKS_WIDTH, startY, { width: MARKS_WIDTH, align: 'right' });
    }
    doc.y = endY;
    doc.x = MARGIN;
  }
}

async function loadTemplate(): Promise<Record<string, unknown>> {
  const raw = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  return (yaml.load(raw) as Record<string, unknown>) ?? {};
}

async function getDraftQuestions(
  pool: Awaited<ReturnType<typeof getPool>>,
  chapterIds: [string, string]
): Promise<DraftQuestionRow[]> {
  const res = await pool.query<DraftQuestionRow & { rubric_json: unknown }>(
    `SELECT q.id, q.question_text, q.question_type, q.discipline, q.difficulty_level, q.marks, q.model_answer_text, q.scenario_data, q.source_material_url, r.rubric_json
     FROM draft_questions q
     LEFT JOIN draft_rubrics r ON r.draft_question_id = q.id
     WHERE q.chapter_id = $1 OR q.chapter_id = $2
     ORDER BY q.question_type, q.discipline, q.id`,
    [chapterIds[0], chapterIds[1]]
  );
  return res.rows.map((r) => ({
    id: r.id,
    question_text: r.question_text,
    question_type: r.question_type,
    discipline: r.discipline,
    difficulty_level: r.difficulty_level,
    marks: r.marks,
    model_answer_text: r.model_answer_text,
    scenario_data: r.scenario_data as ScenarioData,
    source_material_url: r.source_material_url ?? null,
    rubric_json: r.rubric_json,
  }));
}

function buildPoolsByTypeAndDiscipline(questions: DraftQuestionRow[]): Map<string, DraftQuestionRow[]> {
  const map = new Map<string, DraftQuestionRow[]>();
  for (const q of questions) {
    const key = `${q.question_type}|${q.discipline}`;
    const list = map.get(key) ?? [];
    list.push(q);
    map.set(key, list);
  }
  return map;
}

function selectWithSubstitution(
  pools: Map<string, DraftQuestionRow[]>,
  typeMix: Array<{ question_type: string; count: number }>,
  disciplineRatio: { history: number; civics: number },
  usedIds: Set<string>
): DraftQuestionRow[] {
  const selected: DraftQuestionRow[] = [];
  const subs: Record<string, string[]> = {
    mcq_logic_table: ['mcq_relationship_analogy', 'mcq_standard'],
    mcq_visual_scenario: ['mcq_standard', 'mcq_source_connection'],
    mcq_assertion_reason: ['mcq_standard'],
    short_source_interpretation: ['short_answer'],
  };

  for (const entry of typeMix) {
    let need = entry.count;
    const totalH = Math.round(need * disciplineRatio.history);
    const totalC = need - totalH;
    let typesToTry = [entry.question_type, ...(subs[entry.question_type] ?? [])];

    for (const discipline of ['history', 'civics'] as const) {
      const needD = discipline === 'history' ? totalH : totalC;
      if (needD <= 0) continue;
      let found = 0;
      for (const qType of typesToTry) {
        const pool = pools.get(`${qType}|${discipline}`) ?? [];
        const available = pool.filter((q) => !usedIds.has(q.id));
        const take = Math.min(needD - found, available.length);
        if (take > 0) {
          const picked = shuffle(available).slice(0, take);
          picked.forEach((q) => {
            usedIds.add(q.id);
            selected.push(q);
          });
          found += take;
        }
        if (found >= needD) break;
      }
    }
  }
  return shuffle(selected);
}

function selectSection(
  pools: Map<string, DraftQuestionRow[]>,
  typeMix: Array<{ question_type: string; count: number }>,
  discipline: 'history' | 'civics',
  usedIds: Set<string>
): DraftQuestionRow[] {
  const selected: DraftQuestionRow[] = [];
  const subs: Record<string, string[]> = {
    picture_study_linked: ['structured_essay'],
  };
  for (const entry of typeMix) {
    let need = entry.count;
    let typesToTry = [entry.question_type, ...(subs[entry.question_type] ?? [])];
    for (const qType of typesToTry) {
      const pool = pools.get(`${qType}|${discipline}`) ?? [];
      const available = pool.filter((q) => !usedIds.has(q.id));
      const take = Math.min(need, available.length);
      if (take > 0) {
        const picked = shuffle(available).slice(0, take);
        picked.forEach((q) => {
          usedIds.add(q.id);
          selected.push(q);
        });
        need -= take;
      }
      if (need <= 0) break;
    }
  }
  return selected;
}

async function buildPaper(
  template: Record<string, unknown>,
  questions: DraftQuestionRow[]
): Promise<SelectedQuestion[]> {
  const pools = buildPoolsByTypeAndDiscipline(questions);
  const usedIds = new Set<string>();
  const result: SelectedQuestion[] = [];
  let displayIndex = 0;

  const sections = template.sections as Array<Record<string, unknown>>;
  if (!sections?.length) throw new Error('Template has no sections');

  for (const section of sections) {
    const sectionId = section.section_id as string;
    const sectionName = section.display_name as string;

    if (sectionId === 'part_1') {
      const subsections = section.subsections as Array<Record<string, unknown>>;
      for (const sub of subsections ?? []) {
        const dist = sub.question_distribution as Record<string, unknown>;
        const typeMix = (dist?.type_mix as Array<{ question_type: string; count: number }>) ?? [];
        const ratio = (dist?.discipline_ratio as { history: number; civics: number }) ?? { history: 0.5, civics: 0.5 };
        const picked = selectWithSubstitution(pools, typeMix, ratio, usedIds);
        const qNum = sub.question_number as string;
        for (const q of picked) {
          displayIndex++;
          result.push({
            ...q,
            displayIndex,
            sectionLabel: qNum,
          });
        }
      }
      continue;
    }

    if (sectionId === 'part_2_section_a') {
      const dist = section.question_distribution as Record<string, unknown>;
      const typeMix = (dist?.type_mix as Array<{ question_type: string; count: number }>) ?? [];
      const picked = selectSection(pools, typeMix, 'civics', usedIds);
      for (let i = 0; i < picked.length; i++) {
        const q = picked[i];
        displayIndex++;
        result.push({
          ...q,
          displayIndex,
          sectionLabel: `Question ${3 + i}`,
        });
      }
      continue;
    }

    if (sectionId === 'part_2_section_b') {
      const dist = section.question_distribution as Record<string, unknown>;
      const typeMix = (dist?.type_mix as Array<{ question_type: string; count: number }>) ?? [];
      const picked = selectSection(pools, typeMix, 'history', usedIds);
      for (let i = 0; i < picked.length; i++) {
        const q = picked[i];
        displayIndex++;
        result.push({
          ...q,
          displayIndex,
          sectionLabel: `Question ${6 + i}`,
        });
      }
    }
  }

  return result;
}

/** Draw centered page number at bottom (numbers only: 1, 2, 3...). */
function drawFooter(doc: PDFKit.PDFDocument, pageNum: number): void {
  const pageHeight = doc.page.height;
  const pageWidth = doc.page.width;
  const y = pageHeight - MARGIN - FOOTER_Y_OFFSET;
  doc.fontSize(9).font('Helvetica').text(String(pageNum), 0, y, { width: pageWidth, align: 'center' });
}

function addHeader(doc: PDFKit.PDFDocument, template: Record<string, unknown>): void {
  const header = template.paper_header as Record<string, unknown>;
  const pageWidth = doc.page.width;
  const contentWidth = pageWidth - 2 * MARGIN;

  // Title centered; UID top-right on same baseline
  const titleY = doc.y;
  doc.fontSize(14).font('Helvetica-Bold').text((header?.title as string) ?? 'HISTORY & CIVICS', { align: 'center' });
  doc.fontSize(9).font('Helvetica').text(UID_STUB, pageWidth - MARGIN, titleY, { width: 120, align: 'right' });
  doc.fontSize(10).font('Helvetica').text((header?.subtitle as string) ?? '', { align: 'center' });
  doc.text((header?.grade_display as string) ?? 'Class-9th', { align: 'center' });
  doc.moveDown(0.5);

  // Max marks / time: left-aligned (board spec)
  doc.x = MARGIN;
  doc.fontSize(9).font('Helvetica');
  doc.text((header?.marks_display as string) ?? 'Maximum Marks: 80', MARGIN, doc.y, { width: contentWidth, align: 'left' });
  doc.text((header?.time_display as string) ?? 'Time Allotted: Two Hours', MARGIN, doc.y, { width: contentWidth, align: 'left' });
  doc.text((header?.reading_time_display as string) ?? 'Reading Time: Additional Fifteen Minutes', MARGIN, doc.y, { width: contentWidth, align: 'left' });
  doc.moveDown(1);

  // Instructions + Examiner in a full-width 2-row table (left margin to right margin)
  const tableX = MARGIN;
  const tableWidth = contentWidth;
  const instructions = (header?.instructions as Array<{ text: string; order: number }>) ?? [];
  const sorted = instructions.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const instText = sorted.map((inst, i) => `${i + 1}. ${inst.text}`).join('\n');
  const row1Y = doc.y;
  doc.fontSize(9).font('Helvetica').text(instText, tableX + CELL_PADDING, row1Y + CELL_PADDING, {
    width: tableWidth - 2 * CELL_PADDING,
    align: 'justify',
    lineGap: 2,
  });
  const row1Height = doc.y - row1Y + 2 * CELL_PADDING;
  doc.rect(tableX, row1Y, tableWidth, row1Height).stroke();
  const row2Y = doc.y;
  doc.fontSize(9).font('Helvetica-Bold').text('Instructions for the Supervising Examiner', tableX + CELL_PADDING, row2Y + CELL_PADDING, {
    width: tableWidth - 2 * CELL_PADDING,
    align: 'center',
  });
  doc.fontSize(8).font('Helvetica').text(
    'Kindly read aloud the Instructions given above to all the candidates present in the Examination Hall.',
    tableX + CELL_PADDING,
    doc.y + 4,
    { width: tableWidth - 2 * CELL_PADDING, align: 'center' }
  );
  const row2Height = doc.y - row2Y + 2 * CELL_PADDING;
  doc.rect(tableX, row2Y, tableWidth, row2Height).stroke();
  doc.y = row2Y + row2Height;
  doc.moveDown(1);
}

function drawQuestionPaper(doc: PDFKit.PDFDocument, template: Record<string, unknown>, selected: SelectedQuestion[]): void {
  addHeader(doc, template);
  doc.font('Helvetica');
  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const contentBottomY = pageHeight - MARGIN - FOOTER_Y_OFFSET - 80;
  let currentPage = 1;

  const addPageWithFooter = (): void => {
    drawFooter(doc, currentPage);
    doc.addPage();
    currentPage++;
  };

  let part1Q1Done = false;
  let part1Q2Done = false;
  let q1Index = 0;
  let q2Index = 0;
  let sectionAIndex = 0;
  let sectionBIndex = 0;

  for (const q of selected) {
    const label = q.sectionLabel;
    const imgText = needsImagePlaceholder(q) ? getImagePlaceholderText(q) : null;
    let body = imgText ? imgText + '\n\n' + q.question_text : q.question_text;

    if (label.startsWith('Question 1')) {
      if (!part1Q1Done) {
        doc.fontSize(11).font('Helvetica-Bold').text('PART I (30 Marks)', { align: 'center' });
        doc.font('Helvetica').fontSize(10).text('(Attempt all questions from this Part.)', { align: 'center' }).moveDown(0.6);
        doc.font('Helvetica-Bold').text('Question 1', MARGIN, doc.y);
        doc.font('Helvetica').text('[16]', pageWidth - MARGIN - MARKS_WIDTH, doc.y, { width: MARKS_WIDTH, align: 'right' });
        doc.y += 14;
        doc.x = MARGIN;
        doc.font('Helvetica').fontSize(9).text('Select the correct answers to the questions from the given options. (Do not copy the questions, write the correct answer only).').moveDown(0.6);
        part1Q1Done = true;
      }
      q1Index++;
      drawQuestionLineWithMarks(doc, `${toRoman(q1Index)}.`, '', body, { isTable: q.question_type === 'mcq_logic_table' });
      doc.moveDown(SPACE_AFTER_QUESTION_PART1);
    } else if (label.startsWith('Question 2')) {
      if (!part1Q2Done) {
        doc.font('Helvetica-Bold').fontSize(10).text('Question 2', MARGIN, doc.y);
        doc.font('Helvetica').text('[14]', pageWidth - MARGIN - MARKS_WIDTH, doc.y, { width: MARKS_WIDTH, align: 'right' });
        doc.y += 14;
        doc.moveDown(0.4);
        part1Q2Done = true;
      }
      q2Index++;
      drawQuestionLineWithMarks(doc, `${toRoman(q2Index)}.`, '', body, { isTable: false });
      doc.moveDown(SPACE_AFTER_QUESTION_PART1);
    } else if (label === 'Question 3' || label === 'Question 4' || label === 'Question 5') {
      sectionAIndex++;
      if (sectionAIndex === 1) {
        addPageWithFooter();
        doc.fontSize(11).font('Helvetica-Bold').text('PART II (50 Marks)', { align: 'center' });
        doc.font('Helvetica').fontSize(10).text('(Attempt any two questions from Section A and any three from Section B.)', { align: 'center' }).moveDown(0.6);
        doc.fontSize(11).font('Helvetica-Bold').text('SECTION A (20 Marks)', { align: 'center' });
        doc.font('Helvetica').text('(Attempt any two questions from this Section.)', { align: 'center' }).moveDown(0.6);
      }
      const part2Label = `Question ${2 + sectionAIndex}`;
      const subMarks = getSubQuestionMarks(q.question_text, q.rubric_json);
      drawQuestionLineWithMarks(doc, part2Label, subMarks.length > 0 ? '' : '[10]', body, {
        isTable: false,
        bodyOnNewLine: true,
        subMarks: subMarks.length > 0 ? subMarks : undefined,
      });
      doc.moveDown(SPACE_AFTER_QUESTION_SECTION);
    } else {
      sectionBIndex++;
      if (sectionBIndex === 1) {
        addPageWithFooter();
        doc.fontSize(11).font('Helvetica-Bold').text('SECTION B (30 Marks)', { align: 'center' });
        doc.font('Helvetica').text('(Attempt any three questions from this Section.)', { align: 'center' }).moveDown(0.6);
      }
      const part2Label = `Question ${5 + sectionBIndex}`;
      const subMarks = getSubQuestionMarks(q.question_text, q.rubric_json);
      drawQuestionLineWithMarks(doc, part2Label, subMarks.length > 0 ? '' : '[10]', body, {
        isTable: false,
        bodyOnNewLine: true,
        subMarks: subMarks.length > 0 ? subMarks : undefined,
      });
      doc.moveDown(SPACE_AFTER_QUESTION_SECTION);
    }

    if (doc.y > contentBottomY) addPageWithFooter();
  }

  drawFooter(doc, currentPage);
}

function drawAnswerKey(doc: PDFKit.PDFDocument, template: Record<string, unknown>, selected: SelectedQuestion[]): void {
  doc.fontSize(14).font('Helvetica-Bold').text('ANSWER KEY', { align: 'center' });
  doc.fontSize(10).font('Helvetica').text('ICSE Grade 9 – History & Civics (Test Paper)', { align: 'center' });
  doc.moveDown(1);
  doc.font('Helvetica');

  let q1Index = 0;
  let q2Index = 0;

  for (const q of selected) {
    const label = q.sectionLabel;
    if (label.startsWith('Question 1')) {
      q1Index++;
      doc.fontSize(10).font('Helvetica-Bold').text(`Q1.${q1Index}`, { continued: true });
      doc.font('Helvetica').text(` ${q.model_answer_text ?? '—'}`);
    } else if (label.startsWith('Question 2')) {
      q2Index++;
      doc.font('Helvetica-Bold').text(`Q2.${q2Index}`, { continued: true });
      doc.font('Helvetica').text(` ${q.model_answer_text ?? '—'}`);
    } else {
      const qNum = label.replace('Question ', '');
      doc.font('Helvetica-Bold').text(`Q${qNum}.`, { continued: true });
      doc.font('Helvetica').text(` ${(q.model_answer_text ?? '—').slice(0, 600)}${(q.model_answer_text?.length ?? 0) > 600 ? '...' : ''}`);
    }
    doc.moveDown(0.3);
    if (doc.y > 700) doc.addPage();
  }
}

async function main(): Promise<void> {
  const outDirArg = process.argv.find((a) => a.startsWith('--out-dir='));
  const outDir = outDirArg ? outDirArg.slice('--out-dir='.length).trim() : path.join(__dirname, '..', 'out');
  fs.mkdirSync(outDir, { recursive: true });

  const template = await loadTemplate();
  const pool = getPool();

  const board = 'ICSE';
  const grade = 9;
  const subjectName = 'Total History & Civics';
  const subjectRes = await pool.query<{ id: string }>(
    'SELECT id FROM subjects WHERE board = $1 AND grade_level = $2 AND name = $3',
    [board, grade, subjectName]
  );
  if (subjectRes.rows.length === 0) {
    throw new Error(`Subject not found: ${board} Grade ${grade} "${subjectName}". Run syllabus + curation import first.`);
  }
  const subjectId = subjectRes.rows[0].id;

  const chHistory = await pool.query<{ id: string }>(
    'SELECT id FROM chapters WHERE subject_id = $1 AND sequence_number = 1 AND discipline = $2',
    [subjectId, 'history']
  );
  const chCivics = await pool.query<{ id: string }>(
    'SELECT id FROM chapters WHERE subject_id = $1 AND sequence_number = 1 AND discipline = $2',
    [subjectId, 'civics']
  );
  if (chHistory.rows.length === 0 || chCivics.rows.length === 0) {
    throw new Error('Ch1 History or Ch1 Civics chapter not found. Run syllabus + curation import first.');
  }
  const chapterIds: [string, string] = [chHistory.rows[0].id, chCivics.rows[0].id];

  const questions = await getDraftQuestions(pool, chapterIds);
  if (questions.length === 0) {
    throw new Error('No draft_questions found for Ch1 History and Ch1 Civics. Run curation:import with questions first.');
  }
  console.log('Loaded', questions.length, 'draft questions from Ch1 History + Ch1 Civics');

  const selected = await buildPaper(template, questions);
  console.log('Selected', selected.length, 'questions for paper');

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const paperPath = path.join(outDir, `test_paper_${timestamp}.pdf`);
  const answerPath = path.join(outDir, `test_paper_answer_key_${timestamp}.pdf`);

  const docPaper = new PDFDocument({ margin: 72, size: 'A4' });
  const paperStream = fs.createWriteStream(paperPath);
  docPaper.pipe(paperStream);
  drawQuestionPaper(docPaper, template, selected);
  docPaper.end();

  await new Promise<void>((resolve, reject) => {
    paperStream.on('finish', () => resolve());
    paperStream.on('error', reject);
    docPaper.on('error', reject);
  });

  const docKey = new PDFDocument({ margin: 72, size: 'A4' });
  const keyStream = fs.createWriteStream(answerPath);
  docKey.pipe(keyStream);
  drawAnswerKey(docKey, template, selected);
  docKey.end();

  await new Promise<void>((resolve, reject) => {
    keyStream.on('finish', () => resolve());
    keyStream.on('error', reject);
    docKey.on('error', reject);
  });

  console.log('Wrote', paperPath);
  console.log('Wrote', answerPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
