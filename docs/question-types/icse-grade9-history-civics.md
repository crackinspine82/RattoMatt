# Question Type Format Definitions — ICSE Grade 9 History & Civics

**Board:** ICSE  
**Grade:** 9  
**Subject:** History & Civics  

This document is the single source of truth for question generation and rubrics. Definitions are History & Civics specific; other subjects (e.g. Geography) will have separate definition files.

**Grade 9 papers are defined by individual schools** (not centrally by the board). The format and structure are **very similar to Grade 10**. Use grade-specific config (e.g. `question-types-grade9.json`) to list **allowed question types** and default options (e.g. picture_study split) per school or deployment.

---

## Relation to Grade 10

- **Type definitions, marks rules, validation, and rubric examples** are the same as Grade 10.
- For the full type-by-type format, Must/Must not, Civics vs History, and rubric examples, use **icse-grade10-history-civics.md**.
- This file adds Grade 9–specific context and the canonical type list; the generator should load the appropriate doc by grade and filter by `question-types-grade9.json` for allowed types.

---

## Global rules (same as Grade 10)

- **Max marks per sub-question:** No question or sub-question may exceed 4 marks.
- **MCQs:** All MCQ types use exactly **4 options** (a)–(d) or (A)–(D); one correct.
- **Assertion/Reason:** Use **only** for `mcq_assertion_reason`.
- **Source material:** When an image is required, `source_material` is required (URL, embedded, or base64 at input; store URL in DB).
- **Difficulty:** Per question (1–4); affects content only, not format.
- **Validation:** Same as Grade 10 (picture_study 4 or 10 with allowed splits; no sub-part > 4 marks; etc.).

---

## Implementation notes (same as Grade 10)

### Part I, Q2: 7 × 2 marks only
- Use only `short_answer` (2 marks) or `short_source_interpretation` (2 marks) for Q2.

### Part II: picture_study_linked (10 marks) → History
- Prefer assigning 10-mark picture study to History (Section B); Civics rarely uses it.

### Grade 9 config
- Load allowed question types from **question-types-grade9.json**. Filter generator output by this config (some schools may exclude certain types for Grade 9).

---

## Canonical question type list (Grade 9)

Same 14 types as Grade 10; config determines which are **allowed** for Grade 9:

1. mcq_standard  
2. mcq_assertion_reason  
3. mcq_logic_table  
4. mcq_visual_scenario  
5. mcq_source_connection  
6. mcq_odd_one_out  
7. mcq_chronology_sequence  
8. mcq_relationship_analogy  
9. short_answer  
10. structured_essay  
11. picture_study_linked  
12. source_passage_analysis  
13. deductive_application  
14. short_source_interpretation  

---

## Validation rules (same as Grade 10)

- No sub-question or sub-part > 4 marks.
- MCQs: exactly 4 options; mcq_assertion_reason includes logic_explanation.
- picture_study_linked: total_marks ∈ {4, 10}; if 10, 3–4 sub-parts, marks in {3+3+4, 2+4+4, 2+2+3+3}.
- structured_essay / source_passage_analysis: total 10 marks; each sub-part ≤ 4.
- short_source_interpretation: single question; 2 marks; typed.
- Rubric: question_type and difficulty_level match; logic_explanation only for mcq_assertion_reason.