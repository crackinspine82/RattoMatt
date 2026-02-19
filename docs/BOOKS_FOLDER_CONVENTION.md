# Books Folder Convention

This document defines how textbook PDFs are organized under the `Books/` folder. The structure is used by the syllabus extraction script (Gemini) and for content intake.

## Path structure

```
Books/
  {board}/                    # e.g. ICSE, CBSE
    {grade}/                   # 8, 9, 10
      {subject}/               # canonical subject slug (see below)
        {book_slug}/           # unique per (board, grade, subject); matches docs/icse_publications.json
          <chapter PDFs>       # e.g. 1 - Chapter Title.pdf, 2 - Chapter Title.pdf
```

## Slug rules

| Level      | Rule | Examples |
|-----------|------|----------|
| **board** | Uppercase, no spaces | `ICSE`, `CBSE` |
| **grade** | Single number | `8`, `9`, `10` |
| **subject** | One canonical slug per subject; PascalCase, no spaces | `HistoryCivics`, `Geography`, `EnglishLiterature`, `Mathematics`, `Physics`, `Chemistry`, `Biology`, `ComputerApplications`, `RoboticsAI` |
| **book_slug** | Unique per (board, grade, subject). Format: `BookName_Publisher_Author` — no spaces, no `&` or `:`, use underscore | `TotalHistoryCivics_MorningStar_DollyESequeira`, `JuliusCaesar_InterUniversityPress_WilliamShakespeare` |

## Subject slugs

- **HistoryCivics** — Total History & Civics
- **Geography** — Total Geography
- **EnglishLiterature** — Julius Caesar, Treasure Chest, Total English, New Trends in English Reader
- **Mathematics** — Concise Mathematics, Understanding ICSE Mathematics, New Mathematics Today
- **Physics** — Concise Physics
- **Chemistry** — Concise Chemistry
- **Biology** — Concise Biology
- **ComputerApplications** — ICSE Computer Applications
- **RoboticsAI** — Candid Robotics & AI

## Cover PDF naming

- **Pattern:** `Cover.pdf` or `Cover_{book_slug}.pdf` (e.g. `Cover_TotalGeography_MorningStar_JasmineRachel.pdf`).
- One cover per book folder. The syllabus extraction script **ignores** any file whose name starts with `Cover` (or equals `Cover.pdf`) for chapter extraction.
- Do not use `CoverPage - ...` or legacy `Cover_BookName_Author` names; migrate to the pattern above.

## Chapter PDF naming

- **Single-discipline books** (e.g. Geography, English Literature):  
  `{sequence_number} - {Chapter Title}.pdf` (e.g. `1 - Earth as a Planet.pdf`, `2 - Geographic grid Latitudes and Longitudes.pdf`).  
  Use exactly one space before and after the dash.
- **Multi-discipline books** (e.g. History & Civics):  
  `{discipline}_{sequence} - {Title}.pdf` so sequence and discipline are unambiguous.  
  Examples: `History_1 - The Harappan Civilization.pdf`, `Civics_1 - Our Constitution.pdf`.  
  The script can parse `discipline` and `sequence` from the leading `Discipline_N` prefix.
- The script infers chapter `sequence_number` (and optional `discipline`) from the filename. For single-discipline books it uses the leading number; for multi-discipline it uses `{discipline}_{sequence}`.
- In titles, prefer "Part 1" / "Part 2" or "I" / "II" over fragile suffixes like "-I" or "-I I" in the filename.

## Publications config

- **docs/icse_publications.json** lists all ICSE publications with `grade`, `subject`, `book_slug`, `book_name`, `publication`, `author`.
- Each `book_slug` in that file must match the folder name under `Books/ICSE/{grade}/{subject}/{book_slug}/`.
- The syllabus script uses this file to get `book_meta` (display names) when processing a folder.

## Example paths

- Grade 9 History & Civics (Morning Star, Dolly E. Sequeira):  
  `Books/ICSE/9/HistoryCivics/TotalHistoryCivics_MorningStar_DollyESequeira/`
- Grade 9 Geography (Morning Star, Jasmine Rachel):  
  `Books/ICSE/9/Geography/TotalGeography_MorningStar_JasmineRachel/`
- Grade 10 English Literature – Julius Caesar:  
  `Books/ICSE/10/EnglishLiterature/JuliusCaesar_InterUniversityPress_WilliamShakespeare/`

## Migration from old structure

The previous structure used `Books/Board/ICSE/...`. The new structure is `Books/ICSE/...` (no `Board`). Existing PDFs have been moved into the new paths; the old `Books/Board/` tree can be removed after verification.
