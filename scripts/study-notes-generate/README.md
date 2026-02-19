# Study notes generation

Generates **one concise study-note JSON file per chapter** from chapter PDFs, optionally aligned to syllabus outline. Output can be **upserted into the curation engine** for SME curation. See **`docs/STUDY_NOTE_GENERATION.md`** for the full spec and content rules.

## Setup

```bash
cd scripts/study-notes-generate
npm install
```

Create a `.env` file (see `.env.example`):

- **`GEMINI_API_KEY`** (required) – Gemini API key.
- **`GEMINI_MODEL`** (optional) – e.g. `gemini-2.0-flash` (default) or `gemini-2.5-pro` for higher quality.

## Usage

```bash
npm run generate -- [--book=slug] [--chapter=N] [--discipline=history|civics] [--syllabus-dir=path]
```

- **`--book=slug`** – Only run for this book (from `docs/icse_publications.json`).
- **`--chapter=N`** – Only run for chapter number N.
- **`--discipline=history|civics`** – For History & Civics, only run chapters with this discipline; also passed into the prompt so the model applies History vs Civics study-note rules.
- **`--syllabus-dir=path`** – Directory containing syllabus JSONs (default: `../syllabus-extract/out`). You can also set **`SYLLABUS_DIR`** in `.env`.

Output files are written to **`out/`** as:

`study_notes_Ch{N}_{subject}_{book_slug}[_{discipline}].json`

Each JSON has `board`, `grade`, `subject`, `book_slug`, `book_meta`, `chapter_sequence_number`, `chapter_title`, `discipline`, `generated_at`, and **`sections`**: `[{ "title", "level_label", "content_md" }]`. Exercise / practice / revision sections are **skipped** (not included in output).

## Examples

**One chapter, Geography (no discipline):**

```bash
npm run generate -- --book=TotalGeography_MorningStar_JasmineRachel --chapter=1
```

**One chapter, History & Civics (History discipline):**

```bash
npm run generate -- --book=TotalHistoryCivics_MorningStar_DollyESequeira --chapter=1 --discipline=history
```

**All chapters for one book:**

```bash
npm run generate -- --book=TotalGeography_MorningStar_JasmineRachel
```

## Inputs

- **PDFs:** `Books/ICSE/{grade}/{subject}/{book_slug}/` (same discovery as `study-notes-extract`).
- **Syllabus:** `{syllabus-dir}/syllabus_ICSE_{grade}_{subject}_{book_slug}.json`. When present, the script passes the chapter’s outline (Section → Topic → Subtopic) so the model structures headings to match.

## Behaviour

- For **History & Civics**, the prompt includes **discipline** and the study-note rules from **`docs/content_model_icse_grade_9_history_civics.md`** (Section 10 – History vs Civics).
- For other subjects, generic rules from **`docs/STUDY_NOTE_GENERATION.md`** are used.
- **Exercise / Practice / Revision** sections in the PDF are explicitly skipped (not included in any section).
- One Gemini call per chapter: PDF (base64) + prompt; response is parsed as JSON (`sections` array), wrapped with metadata, and written as `.json`.

## Upsert to Curation

To import generated study notes into the curation engine (draft tables + curation items):

1. Run syllabus import first so chapters exist.
2. From **`backend/`**:  
   `npm run curation:import [syllabus-dir] [notes-dir]`  
   Use **notes-dir** = `../scripts/study-notes-generate/out` (or a directory that contains your `study_notes_*.json` files). The import script reads both `notes_*.json` (extract format) and `study_notes_*.json` (this generator); for the same chapter, generated notes overwrite. See `docs/CURATION_SYSTEM.md`.
