# Content Model (ICSE Grade 9 - History & Civics)

This document captures the content model for ICSE Class 9 History & Civics,
aligned with Board papers (2023-2025). Question generation, model answers, and
rubrics should follow the discipline-specific nuances below.

## 1) Hierarchy and Structure
History and Civics are modeled under a single subject.

Hierarchy:
Board -> Grade -> Subject (History & Civics) -> Chapter -> Syllabus nodes (tree, unlimited depth) -> Question

Syllabus nodes use level_label by depth: Section (0), Topic (1), Subtopic (2), Point (3), Sub-point (4+). Notes are stored as note_blocks per node (multiple blocks per node). Questions link to syllabus_node_id. Mastery is stored at leaf nodes only and aggregated upward.

Paper templates can define sections, but sections are not DB entities.

## 2) Discipline Tag (History vs Civics)
Each question must carry a lightweight discipline tag to enable:
- history-only or civics-only chapter tests
- mixed ratios in templates (e.g., 75% history / 25% civics)

Discipline enum (per question):
- history
- civics

## 3) Question Types (Canonical IDs)
Question types are formats, not difficulty levels. Store canonical IDs as
snake_case per subject.

### A) Objective / Part I (Compulsory)
- mcq_standard
- mcq_logic_table
- mcq_visual_scenario
- mcq_assertion_reason
- mcq_source_connection
- mcq_odd_one_out
- mcq_chronology_sequence
- mcq_relationship_analogy
- match_columns

### B) Subjective / Part II (Section A & B)
- short_answer
- structured_essay
- picture_study_linked
- source_passage_analysis
- deductive_application

### C) Civics-specific or Civics-heavy types (hybrid with shared types)
These can be represented as canonical types or as subtypes/variants; use for generation and rubrics where Civics content is expected:
- definition_article: definition of a concept with Article/Schedule reference where relevant.
- institutional_role: correct designation and role (e.g. President, Lok Sabha, Supreme Court).
- procedure_process: steps of a process (e.g. how a bill becomes law, election process).
- differentiate_concepts: compare/contrast two constitutional or institutional concepts.

Diagram/flow and image-based Civics questions (e.g. flowchart “How a bill becomes law”, structure of judiciary, political cartoon) reuse **picture_study_linked**; see Diagram / process / image-based (Civics) below.

Note: Question types are subject-specific and extensible.

### D) Discipline expectations (same format, different expectations)
Board papers use the same format names for History and Civics; expectations differ by discipline. Call these out when generating questions and rubrics:

- **Explain (Civics):** Typically requires definition + Article/Schedule reference (where relevant) + example or current applicability. History “Explain” may stress cause-effect, chronology, or significance.
- **State two / List (Civics):** Precise constitutional or institutional points; correct terminology (e.g. “Directive Principles”, “Writ”). History may ask for events, causes, or features.
- **Differentiate between (Civics):** Institutional or constitutional distinctions; correct designations and legal terms.
- **Picture/Image (Civics):** May be flowchart, diagram (e.g. organs of government), or political cartoon; rubric should reward correct sequence, labels, and institutional roles.

## 4) Civics syllabus themes (from actual syllabus)
Themes must be taken from the syllabus extract output for the relevant grade. Use this list to scope question generation and align rubrics to “constitutional/institutional” content.

**Current reference (from syllabus extract – Grade 9):**
1. Our Constitution
2. Salient Features of the Constitution-I
3. Salient Features of the Constitution - II
4. Elections
5. Local Self-Government - Rural
6. Local Self-Government - Urban

When a Grade 10 (or other grade) syllabus is available, run syllabus extract for that grade and update this list to match the Civics chapters in the syllabus JSON.

## 5) Difficulty Model (Orthogonal to Question Type)
CRITICAL RULE: Difficulty is a property of the question instance, not the
question type. Any type can exist at any difficulty.

Each question must include:
- difficulty_level: 1 | 2 | 3 | 4

Display labels (derived at runtime):
- 1 = easy
- 2 = medium
- 3 = difficult
- 4 = complex

Derived difficulty_tag values for rubrics:
- easy | medium | difficult | complex

Examples:
- mcq_standard can be easy (1) or complex (4)
- short_answer can be medium (2) or difficult (3)

## 6) Rubric Storage Format (AI-Ready)
Rubrics are stored as structured JSON to support complex grading logic.
Scoring is always per-criteria (no block-level scores).

Minimum fields:
- rubric_version
- total_marks
- question_type (canonical ID)
- difficulty_level
- difficulty_tag (derived from difficulty_level)
- answer_input_type (typed | choice)
- blocks[] with selection rules and criteria
- penalties[] for deductions (spelling)
- scoring_rules with partial increments

Spelling penalties:
- Apply only to typed explanations (not MCQ/T-F selections).
- Default: 0.5 deduction per misspelt keyword (global).

Answer input types:
- typed: fill-in-the-blank and any written-response question
- choice: MCQ, true/false, and any selection-only question

### Rubric and model-answer nuances for Civics
- **Rubrics** should reward: correct constitutional/institutional terminology, Article/Schedule references where relevant, procedural accuracy (e.g. steps of law-making), and clear definitions.
- **Model answers and answer keys** should include: Article numbers, correct designations (e.g. President, Lok Sabha), and optional “current applicability” (e.g. real examples of rights).
- **Spelling/terminology:** Legal and constitutional terms (e.g. “Directive Principles”, “Writ”, “Federalism”) are especially important; treat them as keywords in penalties and semantic guardrails.

### Type A: Standard Structured Question (Any X of Y) – History example
```json
{
  "rubric_version": 2,
  "total_marks": 3,
  "question_type": "structured_essay",
  "difficulty_level": 2,
  "difficulty_tag": "medium",
  "answer_input_type": "typed",
  "blocks": [
    {
      "id": "objectives_muslim_league",
      "label": "Objectives of Muslim League (Any 3)",
      "selection": { "min": 3, "max": 3 },
      "match_mode": "semantic",
      "criteria": [
        { "id": "loyalty", "keywords": ["loyalty to British"], "score": 1 },
        { "id": "rights", "keywords": ["protect political rights", "Muslim interests"], "score": 1 },
        { "id": "hostility", "keywords": ["prevent hostility", "inter-communal harmony"], "score": 1 },
        { "id": "misconceptions", "keywords": ["remove misconceptions"], "score": 1 }
      ],
      "semantic_guardrails": { "must_map_to_criteria": true }
    }
  ],
  "penalties": [
    {
      "id": "spelling_all_subjects",
      "type": "deduction",
      "max_deduction": 0.5,
      "apply_if": { "spelling_errors": { "gte": 2 } }
    }
  ],
  "scoring_rules": {
    "allow_partial": true,
    "partial_increment": 0.5,
    "max_score_cap": 3
  }
}
```

### Type B: Picture Study / Linked Rubric (Chain Logic) – History example
```json
{
  "rubric_version": 2,
  "total_marks": 3,
  "question_type": "picture_study_linked",
  "difficulty_level": 3,
  "difficulty_tag": "difficult",
  "answer_input_type": "typed",
  "blocks": [
    {
      "id": "identification",
      "label": "Identify Incident",
      "selection": { "min": 1, "max": 1 },
      "match_mode": "semantic",
      "criteria": [{ "id": "chauri_chaura", "keywords": ["Chauri Chaura"], "score": 1 }],
      "semantic_guardrails": { "must_map_to_criteria": true }
    },
    {
      "id": "movement_lead",
      "label": "Movement led to (Prior)",
      "selection": { "min": 1, "max": 1 },
      "match_mode": "semantic",
      "criteria": [{ "id": "non_cooperation", "keywords": ["Non-Cooperation Movement"], "score": 1 }],
      "semantic_guardrails": { "must_map_to_criteria": true }
    },
    {
      "id": "consequence",
      "label": "Consequence (Suspension)",
      "selection": { "min": 1, "max": 1 },
      "match_mode": "semantic",
      "criteria": [{ "id": "suspended", "keywords": ["called off", "suspended", "stopped"], "score": 1 }],
      "semantic_guardrails": { "must_map_to_criteria": true }
    }
  ]
}
```

### Type C: Assertion-Reasoning (Logic Check)
```json
{
  "rubric_version": 2,
  "total_marks": 1,
  "question_type": "mcq_assertion_reason",
  "difficulty_level": 4,
  "difficulty_tag": "complex",
  "answer_input_type": "choice",
  "answer_key": {
    "correct_option": "b",
    "logic_explanation": "Both statements are true, but R does not explain A."
  },
  "blocks": [
    {
      "id": "option_match",
      "label": "Correct option",
      "selection": { "min": 1, "max": 1 },
      "match_mode": "exact",
      "criteria": [{ "id": "opt_b", "keywords": ["b"], "score": 1 }]
    }
  ]
}
```

### Type D: Civics – Definition with Article reference (short answer)
```json
{
  "rubric_version": 2,
  "total_marks": 2,
  "question_type": "short_answer",
  "difficulty_level": 2,
  "difficulty_tag": "medium",
  "answer_input_type": "typed",
  "blocks": [
    {
      "id": "definition_directive_principles",
      "label": "Definition / meaning",
      "selection": { "min": 1, "max": 1 },
      "match_mode": "semantic",
      "criteria": [
        { "id": "dps_meaning", "keywords": ["Directive Principles", "guidance", "State", "policy"], "score": 1 }
      ],
      "semantic_guardrails": { "must_map_to_criteria": true }
    },
    {
      "id": "article_ref",
      "label": "Article reference",
      "selection": { "min": 1, "max": 1 },
      "match_mode": "semantic",
      "criteria": [
        { "id": "article_36_51", "keywords": ["Article 36", "Part IV", "36-51"], "score": 1 }
      ]
    }
  ],
  "penalties": [
    {
      "id": "spelling_constitutional_terms",
      "type": "deduction",
      "max_deduction": 0.5,
      "apply_if": { "spelling_errors": { "gte": 1 }, "affects_keywords": ["Directive Principles"] }
    }
  ]
}
```

### Diagram / process / image-based (Civics)
For flowcharts (e.g. “How a bill becomes law”), diagrams (e.g. structure of judiciary), and image-based Civics questions:
- Reuse **picture_study_linked** (and **source_material_url** for the image).
- Rubric pattern: reward correct **sequence** of steps, correct **labels** (e.g. Lok Sabha, Rajya Sabha, President), and correct **institutional roles**. Use blocks for identification, process step 1, step 2, etc., with criteria that include constitutional terminology.

## 7) Board-style question patterns
AI-generated questions and rubrics should follow these patterns so that items align with board style.

### History
- “State two causes of…”, “State two consequences of…”
- “Name the movement/event/leader…”
- “Explain the importance of…”, “Explain the causes of…”
- “With reference to the picture, identify… / What led to… / What was the result…”
- Chronology/sequence (e.g. mcq_chronology_sequence), cause-effect, source-based (source_passage_analysis).

### Civics
- “State two features of…”, “State two provisions of…”
- “Differentiate between… and…”
- “Explain the importance of… (with reference to Article … where applicable)”
- “Define …” (expect definition + Article/Schedule where relevant)
- “With reference to the diagram/image, identify… / Describe the process…”
- Institutional roles (“Who has the power to…?”, “Which body…”), procedure (“Steps in passing a bill”).

## 8) Chapter-Only and Mixed Tests
- If parents select only history chapters, civics questions are excluded.
- If parents select only civics chapters, history questions are excluded.
- If parents select both history and civics chapters, the template ratio is used.

**Fixed split (history vs civics):** The fixed split (e.g. Civics share in Part I vs Part II, section allocation, mark distribution) is defined at **template and question-paper creation** time. Handle ratios and section allocation there; this doc does not fix a numeric split.

## 9) Implementation Rules for Database
Mandatory Matrix: question instances must define both type and difficulty.

Invalid: A question defined only as "mcq_standard".
Valid: "mcq_standard" with difficulty_level 3 (difficult).

Source tagging (for free-tier gating):
- Each question must include source_type (canonical enum).
- Use source_type to allow only textbook_exact / textbook_exercise content in free tier.

source_type enum (initial):
- textbook_exact
- textbook_exercise
- sme_curated
- ai_generated
- external_source

Textbook reference:
- textbook_ref is optional metadata (book/page/question) for textbook_exact items.

Source material:
- source_material_url is required for picture_study_linked (images).
- source_passage_text is required for source_passage_analysis (inline text).
- model_answer_text (optional): displayable model answer for grading UI; rubrics remain for scoring.

Scenario data:
- scenario_data column is optional at DB level.
- validation must require scenario_data for mcq_logic_table.

Sub-question linking:
- Structured questions (e.g., Q3 i/ii/iii) must be linked under a
  parent_question_id.
- Each sub-question has its own rubric.
- In grading UI, each sub-question is graded as a separate item and summed.

Paper template split:
- History vs civics ratios are configurable by admin per board/grade/template.

---

## 10) Study notes (concise generation)

When generating **concise study notes** from chapter PDFs (see `docs/STUDY_NOTE_GENERATION.md`), the prompt must explicitly pass the **discipline** for this chapter (`history` or `civics`) and stress the following so notes align with board-style questions and rubrics.

### History chapters
- Preserve **chronology** and **sequence** of events; dates and order matter.
- Preserve **cause–effect** and **consequences**; these are frequently asked (“State two causes of…”, “State two consequences of…”).
- Preserve **names** (movements, leaders, events, places) and **definitions** verbatim or with minimal paraphrase.
- Structure so that “State two…”, “Name the…”, “Explain the importance of…” style revision is easy (clear bullets or short paragraphs per point).
- For source- or image-based content, preserve context (e.g. “With reference to the picture…”) and what led to / resulted from.

### Civics chapters
- Preserve **definitions** and **constitutional/institutional terminology** exactly (e.g. “Directive Principles”, “Writ”, “Federalism”).
- Preserve **Article and Schedule references** (e.g. Article 36, Part IV) where the PDF mentions them.
- Preserve **procedures and processes** (e.g. steps in passing a bill, election process) in clear order; use numbered lists where appropriate.
- Preserve **institutional roles** and designations (e.g. President, Lok Sabha, Supreme Court) as in the textbook.
- Structure so that “Define…”, “State two features of…”, “Differentiate between…”, “Explain with reference to Article…” style revision is easy.

### General (both disciplines)
- Use **third-person**, textbook-style language. No conversational filler (“Let us see”, “You should”).
- **Bold** key terms and concepts. Keep all exam-relevant detail; do not summarize away content.
- When syllabus JSON is provided, **align headings** to the syllabus outline (Section → Topic → Subtopic) so the generated Markdown mirrors the syllabus structure.
