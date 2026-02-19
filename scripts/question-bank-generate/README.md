# Question bank generator

Generates a full question bank per chapter from study notes. Total questions = **page count × 25** (configurable in strategy YAML), distributed by type, MCQ sub-type, and difficulty.

See **`docs/QUESTION_BANK_GENERATION.md`** for full spec.

## Setup

```bash
cd scripts/question-bank-generate
npm install
# Set GEMINI_API_KEY in .env
```

## Run

**Run from this directory** (`scripts/question-bank-generate`), not from `backend/`:

```bash
cd scripts/question-bank-generate
node generate-question-bank.mjs --grade=9 --book=TotalHistoryCivics_MorningStar_DollyESequeira --chapter=1 --discipline=history [--notes-dir=../study-notes-extract/out] [--pages=N] [--out-dir=out]
```

Replace `TotalHistoryCivics_MorningStar_DollyESequeira` with your actual book slug (must match the notes filename).

- **Page count:** Use `--pages=N`, or add an entry in `stub_page_counts.yaml` (e.g. Ch1 history 25, Ch1 civics 6), or rely on `chapters.page_count` after notes import.
- **Notes:** Point `--notes-dir` at the folder containing `notes_ICSE_*_Ch*_*.json` (extract) or `study_notes_Ch*_*.json` (generate). Both formats are supported.
- **Output:** `out/sample_questions_Ch{N}_{discipline}.json` — seed into curation from `backend/`:  
  `npm run curation:import -- --questions-only ../scripts/question-bank-generate/out`  
  (Chapters must already exist; run full curation:import once with syllabus + notes if needed.)

- **`--resume`** — Fill missing questions only. Loads the existing output file for this chapter/discipline, compares to the strategy plan, and calls the API only for (type, difficulty) cells that are short. Merges new questions into the existing file and overwrites it. Use after a run that had API or JSON parse failures.

- **`--only-types=type1,type2`** — Regenerate only those question types and merge back. Example: `--only-types=picture_study_linked,mcq_visual_scenario`. Requires an existing output file for that chapter/discipline.

## Config

- **strategy-icse-history-civics.yaml** — questions_per_page, type %, MCQ sub-type %, difficulty_by_type. Do not hardcode counts in the script.
- **stub_page_counts.yaml** — optional stub (chapter + discipline → page_count) when DB does not have it yet.
