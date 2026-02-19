#!/usr/bin/env node
/**
 * Format Civics study notes + Q&A into Markdown and HTML (student view, Arial).
 * Prereqs: study-notes-extract, study-notes-generate, question-extract-sample for the chapter.
 * Usage: node format-civics-ch1.mjs [--chapter=N]
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

/** Convert Markdown to HTML (bold, italic, paragraphs, headings, lists). Student-facing. */
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
    if (/^[\*\-]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) {
      const tag = /^\d+\.\s+/.test(trimmed) ? 'ol' : 'ul';
      out.push('<' + tag + '>');
      while (i < lines.length) {
        const ln = lines[i];
        const t = ln.trim();
        const isUl = /^[\*\-]\s+/.test(t);
        const isOl = /^\d+\.\s+/.test(t);
        if (!t) break;
        if (isUl || isOl) {
          const content = t.replace(/^[\*\-]\s+/, '').replace(/^\d+\.\s+/, '');
          out.push('<li>' + applyItalic(content) + '</li>');
          i++;
        } else {
          break;
        }
      }
      out.push('</' + tag + '>');
      continue;
    }
    const paraLines = [];
    while (i < lines.length && lines[i].trim() !== '') {
      paraLines.push(lines[i].trim());
      i++;
    }
    const para = paraLines.join(' ');
    if (para) {
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
  .question-block {
    margin: 1.25em 0;
    padding: 12px 14px;
    background: #f8f9fa;
    border-left: 4px solid #2563eb;
    border-radius: 0 6px 6px 0;
  }
  .question-block .q-label { font-weight: 600; color: #111; margin-bottom: 4px; }
  .question-block .a-label { font-weight: 600; color: #166534; margin: 8px 0 4px; }
  .question-meta { font-size: 0.85em; color: #555; margin-top: 6px; }
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

function formatQuestionsHtml(data) {
  let html = '<hr class="section-divider"><p class="section-label">Questions &amp; model answers</p>';
  const items = data.items || [];
  let qIndex = 0;
  for (const item of items) {
    const typeTag = item.question_type || '';
    const diffTag = item.difficulty_tag || '';
    const questions = item.questions || [];
    for (const q of questions) {
      qIndex++;
      const meta = [];
      if (q.rubric?.total_marks != null) meta.push('Marks: ' + q.rubric.total_marks);
      if (typeTag || diffTag) meta.push([typeTag, diffTag].filter(Boolean).join(', '));
      html += '<div class="question-block">';
      html += '<div class="q-label">Q' + qIndex + '. Question</div>';
      html += '<div>' + mdToHtml((q.question_text || '').replace(/\n/g, ' ')) + '</div>';
      html += '<div class="a-label">Model answer</div>';
      html += '<div>' + mdToHtml((q.model_answer_text || '').replace(/\n/g, ' ')) + '</div>';
      if (meta.length) html += '<div class="question-meta">' + escapeHtml(meta.join(' · ')) + '</div>';
      html += '</div>';
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
