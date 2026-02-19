#!/usr/bin/env node
/**
 * Print the number of pages in a PDF.
 * Usage: node count-pages.mjs --pdf=path/to/file.pdf
 * Output: single line with the integer page count (for use with --pages=N or stub config).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PDFDocument } from 'pdf-lib';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getArg(name) {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!arg) return null;
  return arg.slice(`--${name}=`.length).trim();
}

async function main() {
  const pdfPath = getArg('pdf');
  if (!pdfPath) {
    console.error('Usage: node count-pages.mjs --pdf=path/to/chapter.pdf');
    process.exit(1);
  }
  const resolved = path.isAbsolute(pdfPath) ? pdfPath : path.resolve(__dirname, pdfPath);
  if (!fs.existsSync(resolved)) {
    console.error('File not found:', resolved);
    process.exit(1);
  }
  const buf = fs.readFileSync(resolved);
  const doc = await PDFDocument.load(buf);
  const count = doc.getPageCount();
  console.log(count);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
