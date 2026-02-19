#!/usr/bin/env node
/**
 * HTML generator: Civics study notes + Q&A → Markdown and HTML (student view, Arial).
 * Prereqs: study-notes-extract, study-notes-generate, question-extract-sample for the chapter.
 * Usage: node generate-html.mjs [--chapter=N]
 *   Default: --chapter=1. Use --chapter=2 for Civics Ch2, etc.
 * Output: out/Civics_Ch{N}_Formatted.md, out/Civics_Ch{N}_Formatted.html
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const NOTES_EXTRACT = path.join(ROOT, 'scripts/study-notes-extract/out');
const NOTES_GENERATE = path.join(ROOT, 'scripts/study-notes-generate/out');
const QUESTIONS_OUT = path.join(ROOT, 'scripts/question-extract-sample/out');
const OUT_DIR = path.join(__dirname, 'out');

const BOOK_SLUG = 'TotalHistoryCivics_MorningStar_DollyESequeira';

function getChapterNumber() {
  const arg = process.argv.find((a) => a.startsWith('--chapter='));
  if (!arg) return 1;
  const n = parseInt(arg.slice('--chapter='.length).trim(), 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

function getFilenames(chapterNum) {
  const ch = String(chapterNum).padStart(2, '0');
  return {
    OUT_MD: path.join(OUT_DIR, `Civics_Ch${chapterNum}_Formatted.md`),
    OUT_HTML: path.join(OUT_DIR, `Civics_Ch${chapterNum}_Formatted.html`),
    NOTES_EXTRACT_FILE: `notes_ICSE_9_HistoryCivics_${BOOK_SLUG}_Ch${ch}_civics.json`,
    NOTES_GENERATE_FILE: `study_notes_Ch${ch}_HistoryCivics_${BOOK_SLUG}_civics.json`,
    QUESTIONS_FILE: `sample_questions_Ch${ch}_civics.json`,
  };
}

/** Escape HTML special characters. */
function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Apply inline italic *x* (do after bold, and only so list bullets aren't touched). */
function applyItalic(s) {
  return s.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
}

/** Roman numeral (I. II. III. IV. etc.) or single letter (A. B. C. D.) at line start. */
function isRomanOrLetterList(t) {
  return /^[IVXLCDM]+\.\s+/.test(t) || /^[A-Za-z]\.\s+/.test(t);
}

/** True if line is a list item: 1. 2. or * - or (i) (ii) or I. II. or A. B. or a) b) c) d) etc. */
function isListLine(t) {
  return (
    /^[\*\-]\s+/.test(t) ||
    /^\d+\.\s+/.test(t) ||
    /^[a-zA-Z]\)\s+/.test(t) ||
    /^\(\s*[iIvVxX0-9a-zA-Z]+\s*\)\s+/.test(t) ||
    isRomanOrLetterList(t)
  );
}

/** Strip list marker from line; leave content. */
function stripListPrefix(t) {
  return t
    .replace(/^[\*\-]\s+/, '')
    .replace(/^\d+\.\s+/, '')
    .replace(/^[a-zA-Z]\)\s+/, '')
    .replace(/^\(\s*[iIvVxX0-9a-zA-Z]+\s*\)\s+/, '')
    .replace(/^[IVXLCDM]+\.\s+/, '')
    .replace(/^[A-Za-z]\.\s+/, '')
    .trim();
}

/** 'ol' for numbered/parenthesized/Roman/letter or a) b) c), 'ul' for bullets. */
function getListTag(t) {
  if (
    /^\d+\.\s+/.test(t) ||
    /^[a-zA-Z]\)\s+/.test(t) ||
    /^\(\s*[iIvVxX0-9a-zA-Z]+\s*\)\s+/.test(t) ||
    isRomanOrLetterList(t)
  )
    return 'ol';
  return 'ul';
}

/** CSS class for <ol> so markers match source. (a)(b)(c)(d) as option letters get list-alpha-lower; (i)(ii)(iii)(iv) get list-roman-lower. */
function getOrderedListClass(firstLine) {
  const t = (firstLine || '').trim();
  if (/^[a-zA-Z]\)\s+/.test(t)) return 'list-alpha-lower'; // a) b) c) d)
  const paren = /^\(\s*([iIvVxX0-9a-zA-Z]+)\s*\)\s+/.exec(t);
  if (paren) {
    const inner = paren[1].trim().toLowerCase();
    if (/^[abcd]$/.test(inner)) return 'list-alpha-lower'; // (a)(b)(c)(d) option letters not Roman
    if (/^[ivxlcdm]+$/.test(inner)) return 'list-roman-lower'; // (i) (ii) (iii) (iv)
    if (/^[a-z]$/.test(inner)) return 'list-alpha-lower';
    return '';
  }
  if (/^[A-Za-z]\.\s+/.test(t)) return 'list-alpha'; // A. B. C. D.
  if (/^[IVXLCDM]+\.\s+/.test(t)) return 'list-roman';
  return '';
}

/** Roman numeral string (I, II, III, IV, ...) to integer. */
function romanToInt(s) {
  const map = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  const str = (s || '').toUpperCase();
  let n = 0;
  let prev = 0;
  for (let i = str.length - 1; i >= 0; i--) {
    const val = map[str[i]] ?? 0;
    n += val < prev ? -val : val;
    prev = val;
  }
  return n;
}

/** Numeric start value for <ol> from first line's marker so display matches source (e.g. C. → 3). */
function getListStart(firstLine) {
  const t = (firstLine || '').trim();
  let m;
  if ((m = /^(\d+)\.\s+/.exec(t))) return Math.max(1, parseInt(m[1], 10));
  if ((m = /^([A-Za-z])\.\s+/.exec(t))) {
    const code = m[1].toUpperCase().charCodeAt(0);
    return code >= 65 && code <= 90 ? code - 64 : 1; // A=1 .. Z=26
  }
  if ((m = /^([IVXLCDM]+)\.\s+/.exec(t))) return Math.max(1, romanToInt(m[1]));
  if ((m = /^([a-zA-Z])\)\s+/.exec(t))) {
    const code = m[1].toUpperCase().charCodeAt(0);
    return code >= 65 && code <= 90 ? code - 64 : 1; // a)=1, b)=2, ...
  }
  if ((m = /^\(\s*([iIvVxX0-9]+)\s*\)\s+/.exec(t))) {
    const inner = m[1].trim().toLowerCase();
    if (/^\d+$/.test(inner)) return Math.max(1, parseInt(inner, 10));
    return Math.max(1, romanToInt(inner)); // (i)=1, (ii)=2, ...
  }
  if ((m = /^\(\s*([a-zA-Z])\s*\)\s+/.exec(t))) {
    const code = m[1].toUpperCase().charCodeAt(0);
    return code >= 65 && code <= 90 ? code - 64 : 1; // (a)=1, (b)=2, ...
  }
  return 1;
}

function emitList(lines, startIdx, out) {
  let i = startIdx;
  if (i >= lines.length) return i;
  const t = lines[i].trim();
  if (!isListLine(t)) return i;
  const tag = getListTag(t);
  const listClass = tag === 'ol' ? getOrderedListClass(lines[i]) : '';
  const startVal = tag === 'ol' ? getListStart(lines[i]) : 0;
  const startAttr = tag === 'ol' && startVal > 1 ? ' start="' + startVal + '"' : '';
  const openTag = tag + (listClass ? ' class="' + listClass + '"' : '') + startAttr;
  out.push('<' + openTag + '>');
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) break;
    if (!isListLine(trimmed)) break;
    const content = stripListPrefix(trimmed);
    out.push('<li>' + applyItalic(content) + '</li>');
    i++;
  }
  out.push('</' + tag + '>');
  return i;
}

/** True if line looks like a Markdown pipe table row (| cell | cell |). */
function isTableRow(t) {
  return typeof t === 'string' && t.length > 2 && t.startsWith('|') && t.endsWith('|');
}

/** True if line is a table separator (|---|---| or |:---|:---|). */
function isTableSeparator(t) {
  if (!isTableRow(t)) return false;
  const inner = t.slice(1, -1).trim();
  return /^[\s\-:|]+$/.test(inner);
}

/** Parse a table row into array of cell contents (trimmed). */
function parseTableRow(line) {
  const cells = line.split('|').map((c) => c.trim()).filter((c) => c.length > 0);
  return cells;
}

/** Consume consecutive pipe-table lines and emit <table>. Returns new index. */
function emitPipeTable(lines, startIdx, out) {
  let i = startIdx;
  if (i >= lines.length || !isTableRow(lines[i].trim())) return i;
  const rows = [];
  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (!trimmed) break;
    if (!isTableRow(trimmed)) break;
    if (isTableSeparator(trimmed)) {
      i++;
      continue;
    }
    rows.push(parseTableRow(lines[i]));
    i++;
  }
  if (rows.length === 0) return i;
  out.push('<table class="match-table">');
  const first = rows[0];
  out.push('<thead><tr>');
  for (const cell of first) {
    out.push('<th>' + cell + '</th>');
  }
  out.push('</tr></thead>');
  if (rows.length > 1) {
    out.push('<tbody>');
    for (let r = 1; r < rows.length; r++) {
      out.push('<tr>');
      for (const cell of rows[r]) {
        out.push('<td>' + cell + '</td>');
      }
      out.push('</tr>');
    }
    out.push('</tbody>');
  }
  out.push('</table>');
  return i;
}

/** Convert Markdown to HTML (bold, italic, paragraphs, headings, lists, tables). Student-facing. */
function mdToHtml(md) {
  if (!md || !String(md).trim()) return '';
  let raw = String(md).trim();
  raw = raw.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  const lines = raw.split(/\r?\n/);
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) {
      i++;
      continue;
    }
    if (/^###\s+/.test(line)) {
      out.push('<h3>' + escapeHtml(trimmed.slice(3).trim()) + '</h3>');
      i++;
      continue;
    }
    if (/^##\s+/.test(line)) {
      out.push('<h2>' + escapeHtml(trimmed.slice(2).trim()) + '</h2>');
      i++;
      continue;
    }
    if (/^#\s+/.test(line)) {
      out.push('<h1>' + escapeHtml(trimmed.slice(1).trim()) + '</h1>');
      i++;
      continue;
    }
    if (isListLine(trimmed)) {
      i = emitList(lines, i, out);
      continue;
    }
    if (isTableRow(trimmed)) {
      i = emitPipeTable(lines, i, out);
      continue;
    }
    const paraLines = [];
    while (i < lines.length) {
      const ln = lines[i];
      const t = ln.trim();
      if (!t) break;
      if (isListLine(t)) {
        if (paraLines.length > 0) {
          const para = paraLines.join(' ');
          if (/^\[Image:/.test(para)) {
            out.push('<p class="image-placeholder">' + escapeHtml(para) + '</p>');
          } else {
            out.push('<p>' + applyItalic(para) + '</p>');
          }
          paraLines.length = 0;
        }
        i = emitList(lines, i, out);
        continue;
      }
      if (isTableRow(t)) {
        if (paraLines.length > 0) {
          const para = paraLines.join(' ');
          if (/^\[Image:/.test(para)) {
            out.push('<p class="image-placeholder">' + escapeHtml(para) + '</p>');
          } else {
            out.push('<p>' + applyItalic(para) + '</p>');
          }
          paraLines.length = 0;
        }
        i = emitPipeTable(lines, i, out);
        continue;
      }
      paraLines.push(t);
      i++;
    }
    if (paraLines.length > 0) {
      const para = paraLines.join(' ');
      if (/^\[Image:/.test(para)) {
        out.push('<p class="image-placeholder">' + escapeHtml(para) + '</p>');
      } else {
        out.push('<p>' + applyItalic(para) + '</p>');
      }
    }
  }
  return out.join('\n');
}

/** Student-facing HTML document styles (Arial, clear hierarchy per docs). */
const HTML_STYLES = `
  * { box-sizing: border-box; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 15px;
    line-height: 1.55;
    color: #222;
    background: #fff;
    margin: 0;
    padding: 24px 20px 48px;
    max-width: 720px;
    margin-left: auto;
    margin-right: auto;
  }
  h1 {
    font-size: 1.5em;
    font-weight: 700;
    margin: 0 0 0.5em;
    color: #111;
    border-bottom: 2px solid #333;
    padding-bottom: 8px;
  }
  h2 {
    font-size: 1.25em;
    font-weight: 600;
    margin: 1.25em 0 0.4em;
    color: #111;
  }
  h3 {
    font-size: 1.1em;
    font-weight: 600;
    margin: 1em 0 0.35em;
    color: #222;
  }
  p { margin: 0.5em 0; }
  ul, ol { padding-left: 1.5em; margin: 0.5em 0; }
  li { margin: 0.25em 0; }
  ol.list-roman { list-style-type: upper-roman; }
  ol.list-alpha { list-style-type: upper-alpha; }
  ol.list-roman-lower { list-style-type: lower-roman; }
  ol.list-alpha-lower { list-style-type: lower-alpha; }
  strong { font-weight: 600; }
  .section-label {
    font-size: 0.9em;
    color: #555;
    margin: 2em 0 0.5em;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }
  .section-label:first-of-type { margin-top: 0; }
  hr.section-divider { border: none; border-top: 1px solid #ddd; margin: 1.5em 0; }
  .image-placeholder { font-style: italic; color: #555; }
  h2.difficulty-section { margin-top: 1.25em; margin-bottom: 0.6em; }
  h2.difficulty-section:first-of-type { margin-top: 0.75em; }
  h3.subsection { font-size: 1.05em; margin: 1em 0 0.5em; color: #333; }
  .question-block {
    margin: 1.25em 0;
    padding: 12px 14px;
    background: #f8f9fa;
    border-left: 4px solid #2563eb;
    border-radius: 0 6px 6px 0;
  }
  .question-first-line { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; flex-wrap: wrap; margin-bottom: 4px; }
  .question-first-line .q-label { font-weight: 600; color: #111; flex-shrink: 0; }
  .question-first-line .question-intro { flex: 1 1 auto; min-width: 0; }
  .question-last-line { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; margin: 0.35em 0 0.5em; }
  .question-last-line .question-last-text { flex: 1 1 auto; min-width: 0; }
  .question-marks { font-weight: 600; color: #333; flex-shrink: 0; white-space: nowrap; }
  .question-block .question-content { margin: 0.35em 0; }
  .question-block .question-options { margin: 0.5em 0 0; }
  .question-block .a-label { font-weight: 600; color: #166534; margin: 8px 0 4px; }
  .question-meta { font-size: 0.85em; color: #555; margin-top: 6px; }
  .match-table { border-collapse: collapse; width: 100%; margin: 0.5em 0; font-size: 14px; }
  .match-table th, .match-table td { border: 1px solid #ccc; padding: 6px 10px; text-align: left; }
  .match-table th { background: #f0f0f0; font-weight: 600; }
`;

/** Walk extract notes nodes (tree): emit heading + content_blocks for each node. */
function nodesToMarkdown(nodes, headingLevel = 2) {
  if (!Array.isArray(nodes)) return '';
  let out = '';
  const prefix = '#'.repeat(Math.min(headingLevel, 6));
  for (const n of nodes) {
    if (n.title) out += `${prefix} ${n.title}\n\n`;
    const blocks = n.content_blocks || [];
    for (const b of blocks) {
      if (b.content_md) out += b.content_md + '\n\n';
    }
    if (n.children && n.children.length) {
      out += nodesToMarkdown(n.children, headingLevel + 1);
    }
  }
  return out;
}

function sectionToMarkdown(section) {
  let out = '';
  if (section.title) out += `### ${section.title}\n\n`;
  if (section.content_md) out += section.content_md + '\n\n';
  return out;
}

function formatExtractNotes(notes) {
  let md = `# ${notes.chapter_title || 'Civics Chapter 1'}\n\n`;
  md += '*Full study notes (extract)*\n\n---\n\n';
  md += nodesToMarkdown(notes.nodes || [], 2);
  const extra = notes.reconciliation?.additional_sections || [];
  for (const s of extra) {
    md += sectionToMarkdown(s);
  }
  return md;
}

function formatGeneratedNotes(notes) {
  let md = `## Revision notes (concise)\n\n`;
  const sections = notes.sections || [];
  for (const s of sections) {
    if (s.title) md += `### ${s.title}\n\n`;
    if (s.content_md) md += s.content_md + '\n\n';
  }
  return md;
}

function formatQuestions(data) {
  let md = `---\n\n# Questions & model answers\n\n`;
  const items = data.items || [];
  let qIndex = 0;
  for (const item of items) {
    const typeTag = item.question_type || '';
    const diffTag = item.difficulty_tag || '';
    const questions = item.questions || [];
    for (const q of questions) {
      qIndex++;
      md += `## Q${qIndex}\n\n`;
      md += `**Question:** ${(q.question_text || '').replace(/\n/g, ' ')}\n\n`;
      md += `**Model answer:** ${(q.model_answer_text || '').replace(/\n/g, ' ')}\n\n`;
      if (q.rubric?.total_marks != null) md += `*Marks: ${q.rubric.total_marks}*`;
      if (typeTag || diffTag) md += ` *(${[typeTag, diffTag].filter(Boolean).join(', ')})*`;
      md += '\n\n';
    }
  }
  return md;
}

// --- HTML output (student-facing) ---

function nodesToHtml(nodes, notes) {
  if (!Array.isArray(nodes)) return '';
  let out = '';
  for (const n of nodes) {
    if (n.title) out += '<h2>' + escapeHtml(n.title) + '</h2>';
    const blocks = n.content_blocks || [];
    for (const b of blocks) {
      if (b.content_md) out += mdToHtml(b.content_md);
    }
    if (n.children && n.children.length) {
      out += nodesToHtml(n.children, notes);
    }
  }
  return out;
}

function formatExtractNotesHtml(notes) {
  let html = '<h1>' + escapeHtml(notes.chapter_title || 'Civics Chapter 1') + '</h1>';
  html += '<p class="section-label">Full study notes (extract)</p>';
  html += nodesToHtml(notes.nodes || [], notes);
  const extra = notes.reconciliation?.additional_sections || [];
  for (const s of extra) {
    if (s.title) html += '<h3>' + escapeHtml(s.title) + '</h3>';
    if (s.content_md) html += mdToHtml(s.content_md);
  }
  return html;
}

function formatGeneratedNotesHtml(notes) {
  let html = '<p class="section-label">Revision notes (concise)</p>';
  const sections = notes.sections || [];
  for (const s of sections) {
    if (s.title) html += '<h3>' + escapeHtml(s.title) + '</h3>';
    if (s.content_md) html += mdToHtml(s.content_md);
  }
  return html;
}

/** Standard assertion-reason options to inject when question has A/R but no options in JSON. */
const STANDARD_AR_OPTIONS =
  '\n\n**Options:**\n\na) Both A and R are true, and R is the correct explanation of A.\nb) Both A and R are true, but R is not the correct explanation of A.\nc) A is true, but R is false.\nd) A is false, but R is true.';

/** True if question text has Assertion (A) and Reason (R) but no option list (a) b) c) d)). */
function needsAssertionReasonOptions(questionText) {
  const raw = (questionText || '').trim();
  if (!raw.includes('Assertion (A)') || !raw.includes('Reason (R)')) return false;
  return !/\n\s*a\)\s+Both\s+A\s+and\s+R/i.test(raw) && !/\(\s*a\s*\)\s+Both\s+A\s+and\s+R/i.test(raw);
}

/** Build map of option letter -> full option line from question text (A. ... or (A) ... style). */
function getOptionMapFromQuestion(questionText) {
  const map = {};
  const lines = (questionText || '').split(/\r?\n/);
  for (const line of lines) {
    const t = line.trim();
    const m = t.match(/^([A-D])\.\s+(.+)$/) || t.match(/^\(\s*([A-D])\s*\)\s+(.+)$/);
    if (m) map[m[1].toUpperCase()] = m[1].toUpperCase() + '. ' + m[2].trim();
  }
  return map;
}

/** If model answer is just (C) or C, resolve to full option text from question when available. */
function resolveAnswerToOptionText(modelAnswer, questionText) {
  const raw = (modelAnswer || '').trim();
  const letterOnly = raw.replace(/^\(\s*([A-Da-d])\s*\)\s*$/, '$1').trim();
  if (!/^[A-Da-d]$/.test(letterOnly)) return null;
  const map = getOptionMapFromQuestion(questionText);
  const key = letterOnly.toUpperCase();
  return map[key] || null;
}

/** Remove trailing explanation sentences from answer text; keep option letter + option text only. */
function stripAnswerExplanations(text) {
  if (!text || !String(text).trim()) return text;
  let t = String(text).trim();
  const explanationLabel = /\n\nExplanation:\s*/i;
  const idx = t.search(explanationLabel);
  if (idx !== -1) t = t.slice(0, idx).trim();
  const explanationAfter = /\.[ \t]+(this is because|the reason is|according to|the text states|therefore|thus,?\s|it is because|option [a-d] is correct because|this is so because|the relationship in|the provided text|the scenario|as per the|based on the|following this relationship)/i;
  const m = t.match(explanationAfter);
  if (m) return t.slice(0, t.indexOf(m[0]) + 1).trim();
  return t;
}

/** Split question text into stem (before options) and options (list lines). */
function splitStemAndOptions(questionText) {
  const raw = (questionText || '').trim();
  const lines = raw.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const t = lines[i].trim();
    if (!t) {
      i++;
      continue;
    }
    if (/^Options:?\s*$/i.test(t)) {
      i++;
      break;
    }
    if (isListLine(t)) break;
    i++;
  }
  const stem = lines.slice(0, i).join('\n').trim();
  const options = lines.slice(i).join('\n').trim();
  return { stem, options };
}

/** Render a single paragraph as inline HTML (no <p> wrapper). */
function inlineParaHtml(para) {
  if (!para || !String(para).trim()) return '';
  const html = mdToHtml(String(para).trim());
  return html.replace(/^<p>|<\/p>$/g, '').trim();
}

/** Build question block HTML: Q number on first line (no per-question marks; marks are in subsection title). */
function buildQuestionBlockHtml(questionText, qIndex) {
  const { stem, options } = splitStemAndOptions(questionText);
  const paras = stem.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  let out = '';
  if (paras.length === 0) {
    out += '<div class="question-first-line"><span class="question-intro-wrap"><span class="q-label">Q' + qIndex + '.</span></span></div>';
  } else if (paras.length === 1) {
    out += '<div class="question-first-line"><span class="question-intro-wrap"><span class="q-label">Q' + qIndex + '.</span> <span class="question-intro">' + inlineParaHtml(paras[0]) + '</span></span></div>';
  } else {
    const first = paras[0];
    const last = paras[paras.length - 1];
    const middle = paras.slice(1, -1);
    out += '<div class="question-first-line"><span class="question-intro-wrap"><span class="q-label">Q' + qIndex + '.</span> <span class="question-intro">' + inlineParaHtml(first) + '</span></span></div>';
    if (middle.length) out += '<div class="question-content">' + mdToHtml(middle.join('\n\n')) + '</div>';
    out += '<div class="question-last-line"><span class="question-last-text">' + inlineParaHtml(last) + '</span></div>';
  }
  if (options) out += '<div class="question-options">' + mdToHtml(options) + '</div>';
  return out;
}

/** Difficulty order and section titles (L1–L4). Numbering restarts per subsection. */
const DIFFICULTY_SECTIONS = [
  { tag: 'easy', title: 'Recall & Knowledge (Easy)' },
  { tag: 'medium', title: 'Understanding & Comprehension (Medium)' },
  { tag: 'difficult', title: 'Application & Reasoning (Difficult)' },
  { tag: 'complex', title: 'Analysis & Synthesis (Complex)' },
];

/** Human-friendly labels for non-MCQ question types. */
const QUESTION_TYPE_LABELS = {
  short_answer: 'Short Answer',
  match_columns: 'Match the Columns',
  structured_essay: 'Structured Essay',
  picture_study_linked: 'Picture Study',
  source_passage_analysis: 'Source Passage Analysis',
  deductive_application: 'Deductive Application',
};

function getSubsectionTitle(marks, questionType, isMcq) {
  if (isMcq) return marks === 2 ? 'Multiple Choice Questions (2 Marks Each)' : 'Multiple Choice Questions (1 Mark Each)';
  const label = QUESTION_TYPE_LABELS[questionType] || questionType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const m = marks != null ? marks : '?';
  return label + ' (' + m + (m === 1 ? ' Mark)' : ' Marks)');
}

function formatQuestionsHtml(data) {
  let html = '<hr class="section-divider"><p class="section-label">Questions &amp; model answers</p>';
  const items = data.items || [];
  const byDifficulty = new Map();
  for (const item of items) {
    const tag = (item.difficulty_tag || '').toLowerCase() || 'easy';
    if (!byDifficulty.has(tag)) byDifficulty.set(tag, []);
    const questions = item.questions || [];
    for (const q of questions) byDifficulty.get(tag).push({ item, q });
  }
  for (const section of DIFFICULTY_SECTIONS) {
    const entries = byDifficulty.get(section.tag);
    if (!entries || entries.length === 0) continue;
    html += '<h2 class="difficulty-section">' + escapeHtml(section.title) + '</h2>';
    const mcq1 = [];
    const mcq2 = [];
    const nonMcq = [];
    for (const e of entries) {
      const type = (e.item.question_type || '').toLowerCase();
      const marks = e.q.rubric?.total_marks;
      const isMcq = type.startsWith('mcq_');
      if (isMcq && marks === 2) mcq2.push(e);
      else if (isMcq) mcq1.push(e);
      else nonMcq.push(e);
    }
    const nonMcqByGroup = new Map();
    for (const e of nonMcq) {
      const type = e.item.question_type || 'other';
      const marks = e.q.rubric?.total_marks != null ? e.q.rubric.total_marks : 0;
      const key = marks + '\0' + type;
      if (!nonMcqByGroup.has(key)) nonMcqByGroup.set(key, { marks, type, entries: [] });
      nonMcqByGroup.get(key).entries.push(e);
    }
    const nonMcqGroups = [...nonMcqByGroup.values()].sort((a, b) => a.marks - b.marks || (a.type < b.type ? -1 : 1));
    const subsections = [
      { title: getSubsectionTitle(1, null, true), entries: mcq1 },
      { title: getSubsectionTitle(2, null, true), entries: mcq2 },
      ...nonMcqGroups.map((g) => ({ title: getSubsectionTitle(g.marks, g.type, false), entries: g.entries })),
    ];
    for (const sub of subsections) {
      if (!sub.entries || sub.entries.length === 0) continue;
      html += '<h3 class="subsection">' + escapeHtml(sub.title) + '</h3>';
      let qIndex = 0;
      for (const { item, q } of sub.entries) {
        qIndex++;
        let questionText = q.question_text || '';
        if (needsAssertionReasonOptions(questionText)) questionText += STANDARD_AR_OPTIONS;
        let answerText = q.model_answer_text || '';
        const resolved = resolveAnswerToOptionText(answerText, questionText);
        if (resolved != null) answerText = resolved;
        answerText = stripAnswerExplanations(answerText);
        html += '<div class="question-block">';
        html += buildQuestionBlockHtml(questionText, qIndex);
        html += '<div class="a-label">Answer:</div>';
        html += '<div class="answer-content">' + mdToHtml(answerText) + '</div>';
        html += '</div>';
      }
    }
  }
  return html;
}

function buildFullHtml(extractHtml, revisionHtml, questionsHtml, missing, chapterNum = 1) {
  const parts = [];
  if (extractHtml) parts.push(extractHtml);
  if (missing.length) parts.push('<p><em>' + escapeHtml(missing.join(' ')) + '</em></p>');
  if (revisionHtml) parts.push('<hr class="section-divider">' + revisionHtml);
  if (questionsHtml) parts.push(questionsHtml);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Civics Ch${chapterNum} – Study notes &amp; Q&amp;A</title>
  <style>${HTML_STYLES}</style>
</head>
<body>
${parts.join('\n')}
</body>
</html>`;
}

function main() {
  const chapterNum = getChapterNumber();
  const files = getFilenames(chapterNum);
  fs.mkdirSync(OUT_DIR, { recursive: true });

  let fullMd = '';
  let extractHtml = '';
  let revisionHtml = '';
  let questionsHtml = '';
  const missing = [];

  const extractPath = path.join(NOTES_EXTRACT, files.NOTES_EXTRACT_FILE);
  if (fs.existsSync(extractPath)) {
    const notes = JSON.parse(fs.readFileSync(extractPath, 'utf8'));
    fullMd += formatExtractNotes(notes);
    extractHtml = formatExtractNotesHtml(notes);
  } else {
    fullMd += `*Extract notes not found: ${files.NOTES_EXTRACT_FILE}. Run study-notes-extract for Ch${chapterNum} civics.*\n\n`;
    missing.push(`Extract notes not found. Run study-notes-extract for Ch${chapterNum} civics.`);
  }

  const generatePath = path.join(NOTES_GENERATE, files.NOTES_GENERATE_FILE);
  if (fs.existsSync(generatePath)) {
    const notes = JSON.parse(fs.readFileSync(generatePath, 'utf8'));
    fullMd += formatGeneratedNotes(notes);
    revisionHtml = formatGeneratedNotesHtml(notes);
  } else {
    fullMd += `*Revision notes not found: ${files.NOTES_GENERATE_FILE}. Run study-notes-generate for Ch${chapterNum} civics.*\n\n`;
    missing.push('Revision notes not found.');
  }

  const questionsPath = path.join(QUESTIONS_OUT, files.QUESTIONS_FILE);
  if (fs.existsSync(questionsPath)) {
    const data = JSON.parse(fs.readFileSync(questionsPath, 'utf8'));
    fullMd += formatQuestions(data);
    questionsHtml = formatQuestionsHtml(data);
  } else {
    fullMd += `*Questions not found: ${files.QUESTIONS_FILE}. Run question-extract-sample --chapter=${chapterNum}.*\n\n`;
    missing.push('Questions not found.');
  }

  fs.writeFileSync(files.OUT_MD, fullMd, 'utf8');
  console.log('Written:', files.OUT_MD);

  const fullHtml = buildFullHtml(extractHtml, revisionHtml, questionsHtml, missing, chapterNum);
  fs.writeFileSync(files.OUT_HTML, fullHtml, 'utf8');
  console.log('Written:', files.OUT_HTML);
}

main();
