# 1-Week Go-Live Plan (Same Scope, Compressed)

**Principle:** Backend APIs and mobile integration in parallel; one critical path; minimal viable implementation per feature; reuse existing script/schema/screens.

---

## Critical Path (Order of Delivery)

1. **Backend:** Paper + grading + notes + reminders + RapidFire APIs (and subscription gating) so mobile can call them.
2. **Mobile:** Replace mocks with hosted API calls and wire flows.
3. **Deploy + data:** Hosted backend + DB, seeds (demo student, subscription_items, content), then test E2E.

---

## Day 1 (Mon) – Backend: Papers + Gating

**Goal:** Mobile can request a preview and commit a paper; PDFs on server disk; free-tier gating (5 papers/year, textbook-only).

| Task | Owner | Notes |
|------|--------|--------|
| Env: `PAPER_QUESTION_SOURCE` (draft \| published), `ACADEMIC_YEAR` (e.g. 2025-26) | Backend | Used by all paper + RapidFire flows. |
| Paper question loader: read from `draft_questions` or `questions` by env; filter by `source_type` when free (textbook_exact, textbook_exercise) | Backend | Reuse logic from `generate-test-paper.ts`; add subscription check. |
| Subscription check helper: `isSubscribed(student_id, subject_id)` → `subscription_items` (+ optional academic year) | Backend | Single place for "subscribed"; used by papers + RapidFire. |
| Free-tier: count committed papers per student per academic year; if not subscribed, allow only if count < 5 and questions textbook-only | Backend | Enforce in preview + take-test. |
| POST /papers/preview: body (student_id, subject_id, config_snapshot: chapters, duration, etc.); return preview_url (watermarked PDF) + config_snapshot; persist nothing | Backend | Generate PDF on the fly (reuse script logic); write to temp or a preview path; return URL or base64/link. |
| POST /papers/take-test: same body; validate gating; generate Q paper + answer key PDFs; save to server disk; insert `papers` + `paper_questions`; return question_paper_url, answer_key_url, paper_id | Backend | Reuse `generate-test-paper.ts`; output to e.g. `uploads/papers/{id}_q.pdf`, `{id}_a.pdf`; store paths in `papers`. |
| GET /papers/{id}, GET /papers/{id}/pdf (query ?type=question \| answer_key) | Backend | Return paper metadata; serve PDF from disk or redirect. |
| Grade 10 template: copy Grade 9 History/Civics YAML to icse-grade10-history-civics.yaml; wire template selection by board+grade+subject in code | Backend | Same content; separate file. |

**Exit criteria:** Preview and take-test work for demo student (with subscription_items seeded); PDFs stored and retrievable; free-tier rules enforced.

---

## Day 2 (Tue) – Backend: Grading + Notes + Reminders

**Goal:** Grading, notes, and reminders APIs ready for mobile.

| Task | Owner | Notes |
|------|--------|--------|
| POST /papers/{id}/submit-grades: body array of { question_id, grading_status, score_awarded?, flag_reason? }; validate paper exists and belongs to student; upsert `question_attempts`; compute best-of-N per section from template; update `papers.total_marks_obtained`, status = 'graded' | Backend | Best-of-N from `paper_templates` / section config; partial marks 0.5 steps. |
| GET /notes?student_id=&chapter_id= (or subject + chapter): return published note_blocks / content for chapter (common to all users) | Backend | From `note_blocks` + `syllabus_nodes` (or existing notes table); well-formatted HTML. |
| Reminders: POST /reminders, GET /reminders?student_id=&status=, PATCH /reminders/:id (status=dismissed) – already exist; verify they match API_SPEC_MVP1 and mobile needs | Backend | Quick check + fix if needed. |
| Academic year helper: current academic year string (e.g. June 1 → May 31); use in papers count and subscription checks | Backend | Shared for 5-paper limit and any subscription validity. |

**Exit criteria:** Submit-grades returns success and updates paper total; notes endpoint returns chapter notes; reminders work.

---

## Day 3 (Wed) – Backend: RapidFire + Polish

**Goal:** RapidFire APIs and any remaining backend polish.

| Task | Owner | Notes |
|------|--------|--------|
| RapidFire: POST /rapidfire/start – body student_id, subject_id, session_type (quick \| brief \| rally); check subscribed; create `rapidfire_sessions`; select N questions (10/30/60) from published questions, objective only, 25% per difficulty; store in session or return question_ids | Backend | Use same question loader (published + env for draft); filter objective types; 60-day repeat-avoidance if time, else simple random. |
| RapidFire: POST /rapidfire/submit – body session_id, answers (question_id → choice/value); write `rapidfire_attempts`; return score/summary | Backend | Minimal: store attempts, compute correct count. |
| RapidFire: GET /rapidfire/sessions?student_id= or GET /rapidfire/sessions/:id – for "past sessions" or resume (if needed by mobile) | Backend | Add only if mobile needs it in week 1. |
| Papers list: GET /papers?student_id= – list committed papers for Papers/Tests menu (id, subject, created_at, question_paper_url, answer_key_url, status) | Backend | Mobile needs this for bottom nav. |
| Ensure all responses and errors are consistent (e.g. 400/403/404) and CORS allows mobile origin | Backend | Quick pass. |

**Exit criteria:** RapidFire start + submit work; papers list returns committed papers with PDF URLs.

---

## Day 4 (Thu) – Mobile: API Wiring + Papers Flow

**Goal:** Mobile uses hosted backend for subjects/chapters; paper flow (scope → config → preview → take test) works.

| Task | Owner | Notes |
|------|--------|--------|
| Mobile env: EXPO_PUBLIC_API_URL = hosted backend URL; EXPO_PUBLIC_MOCK_STUDENT_ID = demo student UUID | Mobile | Same as Phase 1. |
| Replace mock subjects/chapters with API: GET /subjects, GET /subjects/:id/chapters (already have api.ts); ensure board/grade from demo student | Mobile | Use existing demo screens; point to hosted API. |
| Scope selection → config: send selected chapter_ids (and duration etc.) in config_snapshot; call POST /papers/preview with student_id + config; show preview (WebView or link to preview_url) | Mobile | Minimal: show "Preview" and "Take Test" after preview. |
| Take Test: call POST /papers/take-test; show success; store paper_id; show links/buttons to download/print question paper and answer key (use question_paper_url, answer_key_url) | Mobile | Open in browser or in-app WebView for PDF. |
| Papers/Tests bottom nav: GET /papers?student_id=; list committed papers; tap → detail with download/print for Q paper + answer key | Mobile | Reuse existing "Tests"/Papers menu; data from API. |

**Exit criteria:** From mobile, generate one paper and see it under Papers/Tests with both PDFs downloadable.

---

## Day 5 (Fri) – Mobile: Grading + Notes + Reminders + RapidFire

**Goal:** Grading UI, notes (with print), reminders, and RapidFire flow working against hosted API.

| Task | Owner | Notes |
|------|--------|--------|
| Grading: from paper detail, enter "Grading"; GET paper + questions (from GET /papers/:id or a dedicated structure); for each question show Correct / Incorrect / Partially Correct / Not Attempted; Partially Correct → score input (0.5 steps); POST /papers/{id}/submit-grades on submit | Mobile | Use existing demo grading layout; wire to real API. |
| Notes: from chapter/syllabus, GET /notes?chapter_id=; render HTML; add "Print" / "Share" (device Save as PDF) – Option B; ensure HTML is well-formatted | Mobile | No backend PDF; good formatting for print. |
| Reminders: GET /reminders?student_id=&status=scheduled; show list; PATCH dismiss; POST create reminder (test_schedule / grading) from relevant screens | Mobile | Wire existing reminder UI to API. |
| RapidFire: entry (only if subscribed); choose session type → POST /rapidfire/start; show questions with timer; on submit or timeout → POST /rapidfire/submit; show result | Mobile | Minimal UI: question + options + timer + submit; result screen. |

**Exit criteria:** Grade a paper; view notes and use device print/PDF; create/dismiss reminder; complete one RapidFire session.

---

## Day 6 (Sat) – Deploy + Seeds + E2E

**Goal:** Hosted backend and DB; demo data; full E2E pass.

| Task | Owner | Notes |
|------|--------|--------|
| Provision DB (if not done); run schema; run seed:upsert-syllabus, seed:study-notes (or curation-import) for at least one chapter; run curation:publish so published content exists; run seed:demo-student; run seed:sme-user for curators | Backend/DevOps | Reuse Phase 1 steps. |
| Seed subscription_items for demo student for 1–2 subjects (so they have "paid" access: full bank + RapidFire) | Backend | One-off script or SQL. |
| Deploy backend to host (Railway/Render/Fly); set DATABASE_URL, PORT, PAPER_QUESTION_SOURCE, ACADEMIC_YEAR; ensure uploads/papers (or chosen path) is persistent | Backend/DevOps | Server disk for PDFs. |
| Deploy curation app (optional for week 1 if curators already have a way to publish) | Backend/DevOps | If time. |
| E2E: mobile → generate paper (preview + take test) → see in Papers/Tests → download Q + answer key → grade → reminders → notes (print) → RapidFire (subscribed subject) | All | Full flow; fix blockers. |

**Exit criteria:** All flows work E2E on hosted backend with demo account.

---

## Day 7 (Sun) – Buffer + Hardening

**Goal:** Fix bugs, edge cases, and one or two "nice-to-haves" without adding scope.

| Task | Owner | Notes |
|------|--------|--------|
| Free-tier: test with student with no subscription_items; only textbook questions; 5th paper rejected | All | Verify gating. |
| RapidFire: only start when subscribed; 10/15/30 min and 20/30/60 questions | All | Sanity check. |
| Error handling and simple user-facing messages (e.g. "Not subscribed", "Max 5 papers this year") | Mobile/Backend | Minimal. |
| Any critical bug from E2E | All | Triage and fix. |

---

## Parallel Work (Through the Week)

- **Backend** (Days 1–3): One person focuses on APIs; another (or same) can start **mobile** wiring as soon as /subjects, /papers/preview, /papers/take-test exist (e.g. Day 2 PM).
- **Mobile** (Days 4–5): Assumes backend endpoints exist; can mock responses on Day 2–3 if backend isn't ready yet.
- **DevOps/Seeds** (Day 6): Can prep deploy config and seed scripts on Day 3–4 so Day 6 is only "run and verify".

---

## Scope (Nothing Removed)

- Paper: preview + take-test, server-disk PDFs, Grade 9 + Grade 10 templates, draft/published env switch.
- Grading: submit-grades, best-of-N, partial marks.
- Gating: subscription_items, 5 papers/year free, textbook-only for free.
- Notes: GET /notes, well-formatted, device print/PDF (Option B).
- Reminders: create, list, dismiss.
- Papers/Tests: list, detail, download/print Q paper + answer key.
- RapidFire: start, submit, published questions, subscribed-only.
- Mobile-only parents, demo account, no Firebase.

---

## Risks and Mitigations

- **Time:** Tight; prioritise "working path" over polish; defer repeat-avoidance refinement for RapidFire if needed.
- **Blocking:** Mobile depends on backend URLs; keep backend base URL stable and document it from Day 1.
- **Best-of-N:** If template/section data isn't in DB yet, use a small hardcoded map for History/Civics sections for week 1, then generalize.

---

## Reference

- Project context: `CURSOR_PROJECT_CONTEXT.md`
- API spec: `docs/API_SPEC_MVP1.md`
- DB schema: `docs/DB_SCHEMA.md`, `backend/scripts/schema-mvp1.sql`
- Paper template: `docs/paper-templates/icse-grade9-history-civics.yaml`
- RapidFire rules: `docs/RAPIDFIRE_RULES.md`
- Content model (source_type): `docs/content_model_icse_grade_9_history_civics.md`
