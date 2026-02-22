# Syllabus Extraction Script

Extracts chapter → topic → micro-topic structure from textbook PDFs using the Gemini API. One syllabus JSON per (board, grade, subject, book_slug).

## Setup

1. From this folder: `npm install`
2. Copy `.env.example` to `.env` and set your `GEMINI_API_KEY` (get one from [Google AI Studio](https://aistudio.google.com/apikey)):
   ```bash
   cp .env.example .env
   # Edit .env and add: GEMINI_API_KEY=your-key-here
   ```
   **Location:** `scripts/syllabus-extract/.env` (same folder as `extract.mjs`). The script loads `.env` automatically.

## Validation and next steps

1. **Install deps** (required for loading `.env`):  
   `npm install`

2. **Validate** (no API calls):  
   `node extract.mjs --dry-run --book=TotalHistoryCivics_MorningStar_DollyESequeira`  
   You should see "Found 1 book folder(s)" and the chapter PDF list. If you see "GEMINI_API_KEY is not set", fix `.env`.

3. **Run extraction for one book**:  
   `node extract.mjs --book=TotalHistoryCivics_MorningStar_DollyESequeira`  
   Output: `out/syllabus_ICSE_9_HistoryCivics_TotalHistoryCivics_MorningStar_DollyESequeira.json`.

4. **Seed Postgres**: Ensure `subjects`, `chapters`, `topics`, `micro_topics` exist (see `docs/DB_SCHEMA.md`). From `backend/`:  
   `DATABASE_URL=postgresql://... npm run seed:syllabus -- ../scripts/syllabus-extract/out/syllabus_ICSE_9_HistoryCivics_TotalHistoryCivics_MorningStar_DollyESequeira.json`

## Usage

- **List books and chapter PDFs (no API calls):**  
  `npm run extract:dry` or `node extract.mjs --dry-run`

- **Run extraction (all books with folders):**  
  `npm run extract` or `node extract.mjs`

- **Run extraction for one book only:**  
  Set `GEMINI_API_KEY`, then either:
  - `node extract.mjs --book=TotalHistoryCivics_MorningStar_DollyESequeira`
  - or `BOOK_SLUG=TotalHistoryCivics_MorningStar_DollyESequeira node extract.mjs`

- **Extract one chapter and merge into existing syllabus JSON:**  
  If a chapter was skipped (e.g. API failure) or you added a PDF later, run extraction for that chapter only and merge into the existing file. Requires the syllabus file to already exist (from a previous full run).
  - `node extract.mjs --book=TotalHistoryCivics_MorningStar_DollyESequeira --chapter=7 --discipline=history --merge`  
  The script will process only the PDF matching chapter 7 and history (e.g. `History_7 - Title.pdf`), then update `out/syllabus_ICSE_10_HistoryCivics_TotalHistoryCivics_MorningStar_DollyESequeira.json` in place.

The script reads `docs/icse_publications.json` and walks `Books/ICSE/{grade}/{subject}/{book_slug}/`. Only publications that have a matching folder are processed. Chapter PDFs follow the naming in `docs/BOOKS_FOLDER_CONVENTION.md` (e.g. `1 - Title.pdf` or `History_1 - Title.pdf`). Cover PDFs are skipped.

Output is written to `scripts/syllabus-extract/out/syllabus_ICSE_{grade}_{subject}_{book_slug}.json`. The script waits 2.5s between chapter API calls. On 429 rate limit it retries up to 3 times with exponential backoff (8s, 16s, 32s) before skipping that chapter. To seed Postgres (subjects, chapters, topics, micro_topics), use the backend seed script: from `backend/` run `DATABASE_URL=... npm run seed:syllabus -- ../scripts/syllabus-extract/out/<filename>.json`. See `backend/README.md`.

## Prompt

The per-chapter prompt is in `docs/syllabus_extraction_prompt.md`. The script embeds the same template; edit `extract.mjs` if you change the prompt structure.
