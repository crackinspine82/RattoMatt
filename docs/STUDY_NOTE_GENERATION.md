# Study note generation – spec and guidelines

This document defines how **concise study notes** are generated from chapter PDFs for RattoMatt. The output is one **JSON file** per chapter (upsertable into the curation engine), aimed at grade 9 and 10 students.

---

## Purpose

- Produce **one structured, concise study-note document per chapter** from the textbook PDF.
- Notes must be **complete** (no important detail omitted) but **concise** and **easy to revise** for board exams.
- Language and terminology from the PDF should be **preserved with minimal change**; simplify only where needed for clarity.

---

## Audience

- **Grade 9 and 10** students (ICSE/CBSE).
- Use clear, formal, third-person language. Avoid conversational filler (“Let us see”, “You should”, “As we know”).
- Prefer short sentences and bullet points where the textbook has lists or distinct points.

---

## Content rules (generic)

1. **Do not miss any detail**  
   Include all exam-relevant content: definitions, dates, names, cause–effect, steps, lists, “Important” / “Note” boxes, and sidebars. Omit only page numbers, footers, and non-content clutter.

2. **Structured and concise**  
   - Use a clear hierarchy: `#` for chapter title, `##` for main sections, `###` for subsections.
   - Use **bullets** or **numbered lists** where the PDF has lists or distinct points.
   - Use **bold** for key terms and concepts.
   - Prefer short paragraphs; break long explanations into bullets where it helps revision.

3. **Preserve language**  
   Keep the textbook’s wording and terminology. Paraphrase only when necessary for clarity or concision. Do not add interpretation or extra examples unless they are in the PDF.

4. **Exclusions**  
   Do **not** include:  
   - **Exercise / practice questions / revision questions / “Try this” answer sections** – skip them entirely; do not create any section or content for them. Stop extracting at the start of such a section.  
   - Pure decorative or repeated text.

5. **Images and diagrams**  
   Where the PDF has figures, write: `[Image: <exact caption from PDF>]`. Do not invent captions.

---

## Subject-specific logic

- **History & Civics (ICSE Grade 9):** The prompt must pass the chapter **discipline** (`history` or `civics`) and apply the study-note rules defined in **`docs/content_model_icse_grade_9_history_civics.md`** (Section 10 – Study notes).  
  - **History:** Stress chronology, cause–effect, names, events; structure for “State two causes/consequences”, “Name the…”, “Explain the importance of…”.  
  - **Civics:** Stress definitions, Article/Schedule references, procedures, institutional roles, and exact terminology; structure for “Define…”, “State two features of…”, “Differentiate between…”.

- **Geography and other subjects:** Use the generic rules above only. When a `content_model_*.md` exists for the subject in the future, the generator should incorporate its study-notes section (or equivalent) into the prompt.

---

## Syllabus alignment

When **syllabus JSON** is provided (e.g. from `scripts/syllabus-extract/out/`):

- The script loads the chapter’s syllabus **nodes** (Section → Topic → Subtopic → Point).
- The script passes an **outline** (ordered list of section/topic titles by depth) to the model.
- The model must **structure the generated Markdown** so that headings align to this outline: use the same order and hierarchy (e.g. `##` for Topic, `###` for Subtopic). This keeps study notes aligned with the syllabus used elsewhere (curation, questions).

---

## Output format

- **Format:** JSON (`.json`), one file per chapter. Suitable for **upsert into the curation engine** via `backend` script `curation:import` (see `docs/CURATION_SYSTEM.md`).
- **Structure:** Metadata (`board`, `grade`, `subject`, `book_slug`, `book_meta`, `chapter_sequence_number`, `chapter_title`, `discipline`, `generated_at`) plus `sections`: array of `{ "title", "level_label", "content_md" }` in syllabus order. The generator may also include **`page_count`** (integer) when it counts pages in the chapter PDF; curation-import then persists it to `chapters.page_count` for use by the question-bank generator.
- **File naming:** `study_notes_Ch{N}_{subject}_{book_slug}[_{discipline}].json`  
  e.g. `study_notes_Ch01_Geography_TotalGeography_MorningStar_JasmineRachel.json` or `study_notes_Ch01_HistoryCivics_TotalHistoryCivics_MorningStar_DollyESequeira_history.json`.

---

## Script usage

The script lives in **`scripts/study-notes-generate/`**.

- **Inputs:** Chapter PDF from `Books/ICSE/{grade}/{subject}/{book_slug}/`; syllabus JSON from `../syllabus-extract/out/` (or `--syllabus-dir`).
- **Options:** `--book=slug`, `--chapter=N`, `--discipline=history|civics` (for HistoryCivics).
- **Requires:** `GEMINI_API_KEY` in `.env`. Optional: `GEMINI_MODEL`.
- **Output:** `scripts/study-notes-generate/out/study_notes_Ch{N}_....json`. To **upsert into curation**, run from `backend/`: `npm run curation:import [syllabus-dir] [notes-dir]` with `notes-dir` pointing at `scripts/study-notes-generate/out` (or a dir that contains both extract and generated notes).

**Test with one chapter:**

```bash
cd scripts/study-notes-generate
npm install
# Set GEMINI_API_KEY in .env
npm run generate -- --book=TotalGeography_MorningStar_JasmineRachel --chapter=1
```

**History & Civics (with discipline):**

```bash
npm run generate -- --book=TotalHistoryCivics_MorningStar_DollyESequeira --chapter=1 --discipline=history
```

See `scripts/study-notes-generate/README.md` for full options.
