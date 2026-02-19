# Question Type Format Definitions — ICSE Grade 10 History & Civics

**Board:** ICSE  
**Grade:** 10  
**Subject:** History & Civics  

This document is the single source of truth for question generation and rubrics. Definitions are History & Civics specific; other subjects (e.g. Geography) will have separate definition files. Grade 10 papers are centrally defined by the board; structure is aligned with ICSE board papers (2023–2025).

---

## Global rules

- **Max marks per sub-question:** No question or sub-question may exceed 4 marks.
- **MCQs:** All MCQ types use exactly **4 options** (a)–(d) or (A)–(D); one correct.
- **Assertion/Reason:** Use **only** for question type `mcq_assertion_reason`. No other type may use "Assertion (A)" and "Reason (R)" with the four A/R options.
- **Source material:** When an image is required (`picture_study_linked`, image-based `mcq_visual_scenario`), `source_material` is required. It may be provided as URL, embedded image, or base64 at input; storage uses URL once the asset is in object storage.
- **Difficulty:** Per question instance (1 = easy, 2 = medium, 3 = difficult, 4 = complex). Difficulty affects cognitive demand and content only, not the structural format of the type.
- **Validation:** Enforce picture_study_linked total 4 or 10 with allowed splits; no sub-question > 4 marks; MCQs have 4 options; rubric matches question type and difficulty; `answer_key.logic_explanation` only for `mcq_assertion_reason`.
- **Question generation:** When generating questions, target the [Difficulty distribution](#difficulty-distribution-target-for-generation) below.

---

## Difficulty levels (all types)

| Level | Tag      | Description |
|-------|----------|-------------|
| 1     | easy     | Direct recall; one concept; textbook wording. |
| 2     | medium   | One-step application or comparison; two concepts. |
| 3     | difficult| Multi-step reasoning; 2–3 concepts combined. |
| 4     | complex  | Application to new situation; subtle distinction. |

### Difficulty distribution (target for generation)

When generating questions, aim for this mix across the paper (aligns with template `difficulty_targets` and board patterns 2023–2025):

| Level | Tag      | Target share |
|-------|----------|--------------|
| 1     | easy     | 25%          |
| 2     | medium   | 50%          |
| 3     | difficult| 20%          |
| 4     | complex  | 5%           |

**Section-level skews (for finer control):**
- **Part I Q1 (MCQs):** ~60% medium, ~25% easy, ~15% difficult.
- **Part I Q2 (short):** ~40% easy, ~50% medium, ~10% difficult.
- **Part II (essays / picture study):** ~70% medium, ~25% difficult, ~5% complex.

---

## Marks and sub-question rules by type

| Type | Total marks | Sub-structure | Notes |
|------|-------------|---------------|--------|
| picture_study_linked | 4 **or** 10 | 1+1+1+1 (4) **or** 3+3+4 / 2+4+4 / 2+2+3+3 / 3+3+3 (10) | 4-mark: exactly 4 sub-parts. 10-mark: 3–4 sub-parts; each ≤ 4. |
| source_passage_analysis | 10 | 3+3+4, 2+2+3+3, 2+2+2+2+2 | Max 5 sub-questions; each ≤ 4. Rare in board papers. |
| structured_essay | 10 | **Default 3+3+4**; fallback 2+2+3+3, 2+2+2+4 | Max 4 sub-parts; each ≤ 4. Section A uses 3+3+4 exclusively. |
| short_source_interpretation | 2 | Single question | Typed; no sub-parts. |
| short_answer | ≤ 4 | Single question | Part I Q2 often 2 marks. |
| deductive_application | ≤ 4 | Single question | Scenario + apply concept. |
| All MCQ types | 1 or 2 | Single question | Exactly 4 options. |

---

## Implementation notes for generator and paper assembly

### Part I, Question 2 (7 × 2 marks)
- Part I, Q2 is **strictly 7 questions × 2 marks**.
- For this slot, use **only** types that yield **2 marks per question**: `short_answer` (2 marks) or `short_source_interpretation` (2 marks).
- Do **not** assign 1-mark MCQs, 3-mark short_answer, or any other mark value to Q2. Filter by marks = 2 and allowed types when filling this section.

### Part II: Civics (Section A) vs History (Section B)
- Section A (Civics) and Section B (History) have rigid mark weights per template.
- **picture_study_linked (10 marks)** should **almost always** be assigned to **History (Section B)**; board papers rarely use the 10-mark picture format in Civics.
- When generating or assembling a full paper, prefer assigning the 10-mark picture study slot to History. For Civics Section A, prefer other 10-mark types (e.g. structured_essay, source_passage_analysis) unless the template explicitly requires a Civics picture study.

---

## Objective / Part I types

### 1. mcq_standard

**Format:** One question stem + exactly four options (a)–(d). One correct answer. No table, passage, or image in the stem.

**Must:**
- Single stem; exactly four options; one correct.
- Difficulty reflected in content (L1–L4).

**Must not:**
- Do not use Assertion (A) / Reason (R) or "Both A and R…" options.
- No table, passage, or image as main stimulus (use mcq_logic_table, mcq_source_connection, or mcq_visual_scenario).
- No odd-one-out or sequence structure (use mcq_odd_one_out or mcq_chronology_sequence).
- No analogy A : B :: C : ? (use mcq_relationship_analogy).

**Civics:** Prefer precise constitutional/institutional terminology; Article/Schedule references where relevant.  
**History:** Prefer cause–effect, chronology, names (events, leaders, movements).

**Rubric examples:**

1. **1 mark, choice:** `answer_input_type: "choice"`, one block, `selection: { min: 1, max: 1 }`, `match_mode: "exact"`, criteria for (a)(b)(c)(d)—correct option score 1; optional `answer_key.correct_option`; no `logic_explanation`.
2. **1 mark, different key:** Same structure; `correct_option: "d"`; one criterion for option d, score 1.
3. **2 marks:** Same choice structure; `total_marks: 2`; one criterion for correct option, score 2.
4. **L3:** Same pattern; `difficulty_level: 3`, `difficulty_tag: "difficult"` in rubric.

---

### 2. mcq_assertion_reason

**Format:** Exactly two statements—**Assertion (A)** and **Reason (R)**—and exactly four options: (a) Both A and R true and R is the correct explanation of A; (b) Both true but R is not the correct explanation of A; (c) A true but R false; (d) A false but R true.

**Must:**
- Label Assertion (A) and Reason (R).
- Provide exactly these four options (wording may vary slightly; meaning must match).
- Rubric must include `answer_key.correct_option` and **`answer_key.logic_explanation`**.

**Must not:**
- No third statement; no single stem with four unrelated options; no long scenario that obscures A/R.

**Civics:** A/R on Articles, limitations, institutional powers; correct terminology in explanation.  
**History:** A/R on cause–effect, chronology, significance.

**Rubric examples:**

1. **correct_option "a":** `answer_key: { correct_option: "a", logic_explanation: "Both A and R are true and R correctly explains A because…" }`; one block, criteria for (a)(b)(c)(d), (a) score 1.
2. **correct_option "c":** `logic_explanation: "A is true as per…; R is false because…"`.
3. **correct_option "b":** `logic_explanation: "Both true; R does not explain A because…"`.
4. **correct_option "d":** `logic_explanation: "A is false…; R is true…"`.

---

### 3. mcq_logic_table

**Format:** A table (e.g. Column A vs Column B). Answer is one of four combination options (e.g. A. 1-c, 2-a, 3-d, 4-b). **Always single choice**—one correct combination; no typed pairs; no partial marks per row. Stored with scenario_data (table structure).

**Must:**
- Present a clear table in question text or scenario_data.
- Exactly four options, each a full combination; exactly one correct; exactly 4 options.

**Must not:**
- No "match and write pairs" or typed answer; no paragraph/list instead of table; no Assertion/Reason.

**Civics:** Article–provision, writ–meaning, concept–Article.  
**History:** Event–date, cause–effect, person–role.

**Rubric examples:**

1. **Standard:** `answer_input_type: "choice"`, `total_marks: 1`, one block, criteria for A/B/C/D (e.g. `keywords: ["A"]`, score 1 for correct).
2. **With answer_key:** Same; `answer_key: { correct_option: "B", logic_explanation: "Correct mapping: 1-c, 2-a, 3-b because…" }` (optional).
3. **3-row table:** Options A/B/C/D as three-item combinations; one block, one correct, score 1.
4. **4×4 table:** One block, four criteria (A–D), one correct score 1.

---

### 4. mcq_visual_scenario

**Format:** An **image** OR **diagram** OR **flowchart** OR **map** OR **written scenario** + one MCQ with exactly four options. Usually 1 mark; 2 marks allowed. May be **text-only** (e.g. "Who am I?" description) with no image URL.

**Must:**
- Include visual or scenario context before the question (image reference or short description).
- One question; exactly 4 options (a)–(d); one correct.
- **Primary stimulus** is one of: **image**, **diagram**, **flowchart**, **map** (source_material required when used), OR **brief written scenario** (e.g. "Who am I?" riddles) with no image.
- When an image is used, source_material required (URL or equivalent after upload).

**Must not:**
- No Assertion (A)/Reason (R); no multiple unrelated questions from one scenario; no standalone MCQ without scenario (that is mcq_standard).

**Examples:** Image of Lok Adalat → "Which advantage is shown?" (a)(b)(c)(d) [1 mark]. Text: "I am the Presiding Officer of the Lok Sabha…" → "Who am I?" (a)(b)(c)(d). Image (newspaper headline) + "Which cause of WWI is connected?" + 4 options → mcq_visual_scenario when stimulus is image.

**Civics:** Scenario on rights, procedures, institutions; Article/terminology in options.  
**History:** Scenario on event, source, context; chronology and cause–effect.

**Rubric examples:**

1. **1 mark:** `answer_input_type: "choice"`, one block, selection 1/1, criteria for (a)(b)(c)(d), correct score 1.
2. **With answer_key:** Same; `answer_key.correct_option` only (no logic_explanation).
3. **2 marks:** Same structure; `total_marks: 2`, correct option score 2.
4. **L4:** Same pattern; `difficulty_level: 4`; four options, one correct.

---

### 5. mcq_source_connection

**Format:** A **short text source** (quote, excerpt, constitutional article) + one question asking to connect the source to a concept/event/option. Exactly four options; one correct.

**Must:**
- **Source is TEXT** (quote, excerpt, document snippet). One question + 4 options.
- Include source text in the question; ask to connect/identify; four options; one correct.

**Must not:**
- **Primary stimulus must not be an image/diagram.** If the main stimulus is visual, use mcq_visual_scenario.
- No long passage with multiple sub-questions (use source_passage_analysis); no Assertion/Reason.

**Civics:** Source from Constitution/Act; connect to Article or institution.  
**History:** Source from speech/document; connect to event, movement, person.

**Rubric examples:**

1. **1 mark:** `answer_input_type: "choice"`, one block, four criteria, correct score 1.
2. **2 marks:** Same; `total_marks: 2`, correct option score 2.
3. **With answer_key:** `answer_key: { correct_option: "c" }`; criterion for (c) score 1.
4. **L3:** Same structure; `difficulty_level: 3` in rubric.

---

### 6. mcq_odd_one_out

**Format:** Several items (typically 4); one is the odd one out. Answer is one of four options (the four items or A/B/C/D). Exactly 4 options.

**Must:** List all items; ask "odd one out" or "which does not belong"; one correct.  
**Must not:** No Assertion/Reason; no "arrange in order"; no single factual stem with four unrelated options.

**Civics:** e.g. four Articles/rights; one not from same group.  
**History:** e.g. four events; one not from same period/theme.

**Rubric examples:**

1. **1 mark:** `answer_input_type: "choice"`, one block, four criteria, correct option score 1.
2. **Options (a)(b)(c)(d):** Criteria by option id; correct score 1.
3. **answer_key:** `answer_key.correct_option: "c"`; criterion for (c) score 1.
4. **L2:** Same pattern; `difficulty_level: 2`.

---

### 7. mcq_chronology_sequence

**Format:** Items to be ordered; options are full sequences (e.g. (a) ii-i-iv-iii). Exactly four options; one correct sequence.

**Must:** Give items; ask for correct order/sequence; four sequence options; one correct.  
**Must not:** No Assertion/Reason; no "which happened first?" with four single events; no "match Column A to B".

**Civics:** e.g. acts/amendments in order.  
**History:** e.g. events/dates in order.

**Rubric examples:**

1. **1 mark:** `answer_input_type: "choice"`, one block, criteria for (a)(b)(c)(d) sequences, correct score 1.
2. **answer_key:** `answer_key: { correct_option: "b" }`; criterion for b score 1.
3. **3 events, 4 order options:** One block, one correct sequence, score 1.
4. **L4:** Same; `difficulty_level: 4` in rubric.

---

### 8. mcq_relationship_analogy

**Format:** Analogy (e.g. A : B :: C : ?). Exactly four options for the missing term; one correct.

**Must:** Present analogy clearly; four options; one correct.  
**Must not:** No Assertion/Reason; no odd-one-out; no single factual stem with four unrelated options.

**Civics:** e.g. Article : right :: another Article : ?  
**History:** e.g. event : leader :: event : ?

**Rubric examples:**

1. **1 mark:** `answer_input_type: "choice"`, one block, four criteria, correct score 1.
2. **answer_key:** `answer_key.correct_option`; one criterion score 1.
3. **L3:** Same structure; `difficulty_level: 3`.
4. **Different analogy:** Same rubric pattern; `rubric_version: 2`, `total_marks: 1`.

---

## Subjective / Part II types

### 9. short_answer

**Format:** Brief written answer (1–3 sentences or a few points). Each question ≤ 4 marks. "State two…", "Define…", "Name…", "List…". **Part I Q2** commonly uses 7 sub-questions × 2 marks each; generator should favor 2-mark instances for that slot.

**Must:**
- Direct recall or listing. Answer is recall from syllabus.
- Bounded answer (e.g. "State two"); rubric typed; blocks/criteria; partial marks if appropriate; total_marks ≤ 4.

**Must not:**
- Do not require application to a hypothetical scenario (use deductive_application for that).
- No long paragraphs (use structured_essay); no source passage/image as main stimulus; no Assertion/Reason or MCQ.

**Boundary:** If the question only sets a role/context but the expected answer is still "list two facts" or "state two methods", treat as short_answer (e.g. "Imagine you are an Early Nationalist. Mention any two methods…" = short_answer).

**Civics:** Definitions with Article/Schedule; "State two features of…"; correct terminology.  
**History:** "State two causes/consequences"; "Name the…"; chronology and names.

**Rubric examples:**

1. **1 mark:** One block, `selection: { min: 1, max: 1 }`, one criterion with keywords, score 1; `answer_input_type: "typed"`.
2. **2 marks, "State two…":** One block, `selection: { min: 2, max: 2 }`, two criteria (e.g. cause1, cause2), each score 1; allow_partial.
3. **2 marks, definition:** Two blocks: "definition" (1), "Article reference" (1); penalties for spelling if needed.
4. **3 marks:** Two or three blocks/criteria; total_marks 3; partial_increment 0.5 or 1; max_score_cap if needed.

---

### 10. structured_essay

**Format:** Structured written response with multiple sub-parts. **Total 10 marks;** max 4 sub-parts; each sub-part ≤ 4 marks. **Default/primary split for History & Civics: 3+3+4.** Fallback: 2+2+3+3, 2+2+2+4. Section A (Civics) uses 3+3+4 exclusively in board papers.

**Must:**
- Specify structure ("Any 3 of…", or (a)(b)(c)(d)); rubric with one block per sub-part (or "any X" with multiple criteria); total_marks 10; each block's marks ≤ 4.

**Must not:**
- No single short phrase (use short_answer); no MCQ; no Assertion/Reason; no open-ended without structure.

**Civics:** "Explain any three features of…"; "Differentiate between…"; Article/terminology in criteria.  
**History:** "Explain any three causes of…"; "Importance of…"; cause–effect and chronology in criteria.

**Rubric examples:**

1. **3+3+4:** Three blocks; first two blocks each "any 3" or 3 criteria, 1 mark each; third block 4 marks; total_marks 10.
2. **2+2+3+3:** Four blocks; 2, 2, 3, 3 marks; each block with selection and criteria; allow_partial where appropriate.
3. **2+2+2+4:** Four blocks; 2, 2, 2, 4; each ≤ 4; total 10.
4. **"Any 3 of":** One block, `selection: { min: 3, max: 3 }`, multiple criteria, each score 1 so total 3 for that block; other blocks sum to 7; total_marks 10.

---

### 11. picture_study_linked

**Format:** Image-based question. **Two board patterns:** (A) 4 sub-questions × 1 mark = **4 marks total** (e.g. Q7/Q8); (B) **3–4 sub-parts** = **10 marks total** (e.g. Part II Q10). Allowed 10-mark splits: **3+3+4** (primary), **2+4+4** (observed in board papers, e.g. 2023 Q7), **2+2+3+3** (fallback), **3+3+3** (variant, e.g. 2025). Template/slot specifies which pattern. **source_material** required (URL after upload, or embedded/base64 at input).

**Must:**
- Reference the image explicitly ("With reference to the picture…").
- For **4-mark:** exactly 4 sub-questions, 1 mark each (1+1+1+1).
- For **10-mark:** 3–4 sub-parts with marks in **{3+3+4, 2+4+4, 2+2+3+3, 3+3+3}**; each sub-part ≤ 4 marks.
- Progression where applicable: Identify → Explain → Consequence/significance.
- Rubric: one block per sub-part; total_marks 4 or 10; each block ≤ 4 marks.

**Must not:**
- No long passage as main stimulus (use source_passage_analysis); no Assertion/Reason or pure MCQ without image focus.

**Civics:** Flowchart/diagram (e.g. bill to law); institutional roles; Article/terminology in criteria.  
**History:** Picture of event/person/place (e.g. Jallianwala Bagh, Charkha); Identify → Explain → Consequence.

**Rubric examples:**

1. **4 marks (1+1+1+1):** Four blocks; "Identify…", "What does X show?", "Name…", "State one…"; each block 1 mark; total_marks 4.
2. **10 marks (3+3+4):** Three blocks: first 3 marks (identify/label), second 3 marks (explain), third 4 marks (consequence/significance); total_marks 10.
3. **10 marks (2+4+4):** Three blocks; 2, 4, 4 marks (each ≤ 4); total_marks 10. (Board pattern, e.g. 2023 Q7.)
4. **10 marks (2+2+3+3):** Four blocks; 2, 2, 3, 3; each ≤ 4; total_marks 10.
5. **10 marks (3+3+3):** Three blocks; 3, 3, 3 marks; each ≤ 4; total_marks 10. (Board variant, e.g. 2025.)

---

### 12. source_passage_analysis

**Format:** A passage + sub-questions. **Total 10 marks.** Max 5 sub-questions; each ≤ 4 marks. Use only: 3+3+4, 2+2+3+3, 2+2+2+2+2. source_passage_text required in DB.

**Note:** Rarely used in ICSE History & Civics board exams (2023–2025: zero instances). The board strongly prefers **picture_study_linked** for 10-mark analysis questions. Retain this type for completeness; generator should **deprioritize** it for this subject.

**Must:**
- Include passage; questions that require using the passage; rubric: one block per sub-question; total_marks 10; each block ≤ 4 marks.

**Must not:**
- No image-only (use picture_study_linked); no single short quote + one MCQ (use mcq_source_connection); no Assertion/Reason for response.

**Civics:** Passage from Constitution/Act; questions on Article, institution, terminology.  
**History:** Passage from speech/document; questions on context, author, cause, consequence.

**Rubric examples:**

1. **2+2+2+2+2:** Five blocks; each 2 marks; total_marks 10.
2. **3+3+4:** Three blocks; 3, 3, 4 marks; allow_partial where appropriate.
3. **2+2+3+3:** Four blocks; 2, 2, 3, 3; typed criteria; each ≤ 4.
4. **Mixed:** One block "Identify the source" (2), one "Explain…" (3), one "State two…" (2+3 or 4); total 10; all ≤ 4 per block.

---

### 13. deductive_application

**Format:** Apply a principle/concept to a **new situation**. Typed answer. Each question ≤ 4 marks.

**Must:**
- Explicit scenario or case + ask to apply concept/principle ("If you were X, how would you apply Y?" or "In this situation, which right applies?"). Answer requires applying syllabus content to the situation.

**Must not:**
- No pure recall where the scenario is only decorative (e.g. "Imagine you are X. State two methods…" with no application step → short_answer).

**Boundary:** "A citizen's data was shared without consent. Which right is violated and how would Article X apply?" = deductive_application. "Imagine you are an Early Nationalist. Mention any two methods…" = short_answer.

**Civics:** e.g. scenario + "Which right?" / "How does Article X apply?"; Article and terminology in criteria.  
**History:** e.g. scenario + "Which movement?" / "What was the significance?"; cause–effect in criteria.

**Rubric examples:**

1. **2 marks:** One block; "Apply principle X to situation"; one or two criteria (e.g. correct right + reasoning), score 2 or 1+1.
2. **3 marks:** Two blocks: "Identify the concept" (1), "Explain application" (2); typed; allow_partial.
3. **4 marks:** Two or three blocks; criteria for correct application and terminology; total_marks 4; partial_increment 0.5 if needed.
4. **L4:** Same pattern; `difficulty_level: 4`; each block ≤ 4 marks.

---

### 14. short_source_interpretation

**Format:** Short passage / news excerpt / quote (approx. 50–150 words) + **one** typed question asking to deduce, infer, or mention points from it. **Part I context.** 2 marks only; single question.

**Must:**
- Provide the passage/excerpt in the question.
- Ask to extract, deduce, or "mention any two…" from the passage.
- Single question; one rubric block; total_marks 2; answer_input_type "typed".

**Must not:**
- No more than 2 marks; no multiple sub-questions (for longer use source_passage_analysis).
- No MCQ options (that would be mcq_source_connection).
- No image/diagram as main stimulus (use mcq_visual_scenario or picture_study_linked for image).

**Civics:** Constitutional excerpts, news about ordinances/policies, government notices.  
**History:** Historical quotes, news clippings, speeches.

**Rubric examples:**

1. **Standard 2 marks:** One block, `selection: { min: 2, max: 2 }`, two criteria (e.g. point1, point2), each score 1; allow_partial.
2. **"Mention any two points":** Same; criteria keywords for each acceptable point; score 1 each.
3. **"Deduce any two ways":** Same; semantic/semantic_guardrails if needed for "deduce".
4. **L2:** difficulty_level 2; same structure; total_marks 2.

**Board examples:** 2024 Q2(vii) — news about ordinances → "Mention any two points…". 2025 Q2(vii) — UNODC passage → "Deduce any two ways judiciary independence ensured…".

---

## Cross-type summary

| Type | Stimulus | Response | Marks |
|------|----------|----------|--------|
| mcq_standard | Stem only | Choice (4 options) | 1–2 |
| mcq_assertion_reason | A + R | Choice (4 A/R options) | 1 |
| mcq_logic_table | Table | Choice (4 combination options) | 1 |
| mcq_visual_scenario | Image OR diagram OR scenario / "Who am I?" text | Choice (4 options) | 1–2 |
| mcq_source_connection | **Text** source | Choice (4 options) | 1–2 |
| mcq_odd_one_out | List of items | Choice (4 options) | 1 |
| mcq_chronology_sequence | Items to order | Choice (4 sequence options) | 1 |
| mcq_relationship_analogy | Analogy | Choice (4 options) | 1 |
| short_answer | — | Typed | ≤ 4 |
| structured_essay | — | Typed (structured) | 10 (3+3+4 default) |
| picture_study_linked | Image | Typed (sub-parts) | 4 (1+1+1+1) or 10 (3+3+4 / 2+4+4 / 2+2+3+3 / 3+3+3) |
| source_passage_analysis | Passage | Typed (sub-parts) | 10 |
| deductive_application | Scenario | Typed | ≤ 4 |
| short_source_interpretation | Short passage | Typed | 2 |

---

## Validation rules (generator and backend)

- **Sub-question marks:** No sub-question or sub-part > 4 marks.
- **MCQ types:** Exactly 4 options; one correct; for mcq_assertion_reason, four A/R options and rubric includes logic_explanation.
- **picture_study_linked:** total_marks ∈ {4, 10}. If 4: exactly 4 sub-parts, each 1 mark (1+1+1+1). If 10: **3–4 sub-parts**, marks in **{3+3+4, 2+4+4, 2+2+3+3, 3+3+3}**, each sub-part ≤ 4.
- **structured_essay / source_passage_analysis:** Total 10 marks; each sub-part ≤ 4; split in allowed list.
- **short_source_interpretation:** Single question; 2 marks; typed; no MCQ.
- **Rubric:** question_type and difficulty_level match question; answer_key.logic_explanation only when question_type is mcq_assertion_reason.
