# RattoMatt Project Context (Single Source of Truth)

This document is the definitive context for RattoMatt. Always read this first.

## 1) Product Overview
RattoMatt is a pragmatic ed-tech platform for Indian Board Exams that embraces
rote-heavy subjects and makes practice + grading efficient for parents.
Primary output is printable PDFs (question paper + answer key).

## 2) User Roles (MVP1)
- Parents: register, configure, subscribe, generate papers, grading, lock/unlock
  student mode.
- Students: use RapidFire and Flashcards in locked student mode (no login).
- Admins: manage content, configure paper formats, manage subscriptions.
- Tutors: MVP2 (proctoring white-labeled tests, grading and reporting).
- SMEs: MVP2 (curation engine, content authoring). v1 = basic ability to curate; MVP2 = proper user-access–based online editing engine for the curator (SME).

## 3) MVP1 Scope
- Boards: ICSE, CBSE
- Grades: 8, 9, 10
- Subjects: History, Geography, Biology, English Language, English Literature
- Start with History only; schema must be extensible to add more subjects.

## 4) Non-Negotiable Infrastructure Rules
1) PDF/DB separation: PDF files must be stored in object storage. DB stores URLs.
2) Partitioning: high-growth transactional tables are date-partitioned from day 1.
3) Async analytics: aggregate updates must be asynchronous (background workers).
4) MVP1 providers: Firebase Auth (OTP + Google), Cloudflare R2 for storage,
   Razorpay payments enabled post-release.

## 5) Core Workflows
### Paper Generation
- Admin defines templates by board/grade/subject + duration (45/90/150 mins).
- Parent generates question paper by paper type coverage (single chapter, multi-chapter, term)+ duration (45/90/150 mins)
- Paper selection is randomized per template rules and avoids recent correct repeats.
- Preview is watermarked and NOT persisted.
- Persist only on Take Test (confirmed), which generates final PDFs and DB records.
- After Take Test, user can view on mobile, download PDF, or print.
 - Repeat-avoidance uses a recent window and cache (no full history table).
 - PDFs must be available immediately after Take Test.
 - Committed papers store a fixed structure (sections, question order, config snapshot).

### Grading
- Parents grade all attempted questions.
- Best-of-N applies per section: drop lowest scores in that section.
- Partial marks allowed (0.5 increments).
- Regrade overwrites scores; analytics recompute asynchronously.

### Student Mode
- In-app lock only (best-effort). PIN/biometric unlock.
- Timed sessions (15 or 30 mins); lock navigation and disable notifications.
- Student mode is a locked view on parent device (no student login).

## 6) Content Model (ICSE Grade 9/10: History & Civics)
- Current implementation uses Grade 9 (templates, test paper). The same content model applies to Grade 9 and 10.
- Question banks are generated per chapter from study notes using a strategy (e.g. 25 questions per page, type/difficulty split defined in `scripts/question-bank-generate/strategy-icse-history-civics.yaml`). Output is imported via curation as draft questions; see `docs/QUESTION_BANK_GENERATION.md`.
- Subject-specific question types.
- Multi-part questions (e.g., Q2a/Q2b).
- Shared stimulus (image/passage used by multiple sub-questions).
- Rubrics are bullet points with weights for partial marking.
- Objective and subjective question types can appear in papers and RapidFire.
- Difficulty is per question instance (orthogonal to question type).
- Difficulty labels are derived from difficulty_level (1-4).
- Crowdsourced omission uses a weighted threshold (80%) and is editable.
- Recency weighting for omission votes:
  - 0-30 days: weight 1.0
  - 31-60 days: weight 0.7
  - 61-90 days: weight 0.4
  - >90 days: weight 0.2

History & Civics question types (canonical IDs):
- mcq_standard
- mcq_logic_table
- mcq_visual_scenario
- mcq_assertion_reason
- mcq_source_connection
- mcq_odd_one_out
- mcq_chronology_sequence
- mcq_relationship_analogy
- match_columns
- short_answer
- structured_essay
- picture_study_linked
- source_passage_analysis
- deductive_application

## 7) Mastery & Analytics
- Mastery tracked at micro-topic level with rollups to chapter/subject.
- RapidFire and paper grading contribute equally.
- Aggregates updated asynchronously only.
- Mastery decay affects selection weight; default is 5% per 30 days of inactivity.

## 8) Subscriptions
- Tiers: per subject, all subjects, per child (max 4 children).
- Free trial: notes + 1 saved paper per subject.
 - Free tier can Take Test using textbook_exact questions only.
 - Pricing windows are admin-defined by subject + board + grade.
 - Latest created pricing window wins on overlap.
 - Free tier is unaffected by pricing windows.

## 9) Audit Logs (MVP1)
- Must log: subscription purchase/cancel/renew; paper generation commits.
- Keep logs minimal to avoid DB bloat.

## 10) Storage & Retention
- Academic year data is deprecated on June 1 of the next year.
- Admins can delete deprecated academic years to reduce storage.
- Watermark: subtle visible watermark with encoded user ID + logo.
- Academic year runs June 1 through May 31.

## 11) Security & Privacy
- School + city used for aggregation; do not expose school stats to parents.
- No personal data beyond parent email and student first name.
