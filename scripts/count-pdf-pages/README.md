# Count PDF pages

Prints the number of pages in a PDF. Use the output for `--pages=N` or to fill `stub_page_counts.yaml` in the question-bank generator.

## Usage

```bash
cd scripts/count-pdf-pages
npm install
node count-pages.mjs --pdf=path/to/chapter.pdf
```

Output: a single integer (page count).
