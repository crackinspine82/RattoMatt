# Business Rules (MVP1)

This file contains business logic and product constraints. If a rule here
conflicts with implementation, pause and confirm before proceeding.

## 1) Paper Formats and Templates
- Admins define templates by board/grade/subject and duration.
- Default durations: 45, 90, 150 minutes (extensible).
- Each template defines:
  - Number of sections and their names
  - Required vs optional sections
  - Marks per section and per question
  - Question types allowed per section
  - Best-of-N rules per section
- Papers are randomized per template (no deterministic reuse).
- Avoid repeating correctly answered questions from committed tests within
  the last 60 days. If the pool is exhausted, allow repeats.
- RapidFire counts as a committed attempt for repeat-avoidance.
 - Auto-substitute missing question types with valid types from the same
   category (objective vs subjective).
 - Crowdsourced omission: minimum sample size 1 and 80% weighted threshold.
 - Omission defaults are set during onboarding and can be edited later.
- Recency weighting for omission votes:
  - 0-30 days: weight 1.0
  - 31-60 days: weight 0.7
  - 61-90 days: weight 0.4
  - >90 days: weight 0.2

## 2) Grading Rules
- Parents grade all attempted questions.
- Best-of-N logic: in each section, drop the lowest scores if attempts exceed
  the required count.
- Partial marks are always allowed (0.5 increments).
- Regrade overwrites previous scores and recomputes mastery asynchronously.
- Spelling penalties apply across all subjects and only to typed explanations.
- Deduct 0.5 for each misspelt keyword (global default).
 - Sub-questions are graded separately and summed.

## 2a) Mastery Decay (Default Rule)
- If a micro-topic has no attempts for 30 days, reduce its mastery by 5%.
- Apply decay in 30-day steps, floor at 0%.
- Decay is used only to weight selection; it does not rewrite past scores.

## 3) Student Mode
- In-app lock only (no student login).
- Parent PIN/biometric unlock required.
- Timed sessions: 15 minutes (quick) or 30 minutes (rally).
- Only RapidFire and Flashcards are accessible in student mode.

## 4) RapidFire and Flashcards
- RapidFire uses objective questions from the main question bank.
- RapidFire scoring contributes equally to mastery as paper grading.
- Flashcards are AI-generated but SME-curated before publish.
 - RapidFire uses a best-effort 25% mix across difficulty levels.
 - Free tier: 30 RapidFire sessions per month.
 - Premium tier: 200 RapidFire sessions per month.

## 5) Subscriptions
- Tiers: per subject, all subjects, per child (max 4 children).
- Free trial: notes + one saved paper per subject.
- Free tier only includes source_type = textbook_exact.
 - Free tier can Take Test using textbook_exact questions only.
 - Free tier cap: 10 papers per subject per academic year.
 - Premium tier cap: 200 papers per subject per academic year.
- After each free-tier test, show a soft nudge:
  "Upgrade now to access advanced testing capabilities."
- Subscriptions are valid through the end of the academic year (May 31).
- Academic year runs June 1 through May 31.
 - Razorpay payments are enabled post-release (integrations tested pre-release).
 - Pricing windows are admin-defined (subject + board + grade).
 - Latest created pricing window wins on overlap.
 - Free tier is unaffected by pricing windows.

## 5a) Student's Subjects (Dashboard)
- Dashboard section title: "(StudentName)'s Subjects".
- Shows only subjects available for that student's board and grade (no other boards/grades).
- Each subject tile shows: textbook image, board, grade, author, short description.
- If the parent has not subscribed to that subject, show tag: "Upgrade to Premium".
- **Ordering (crowd-funded):** Subject order is driven by popularity for that (board, grade) configuration.
  - **Popularity** = number (or weight) of parents/students who have a subject subscription for that **board + grade + author**.
  - Authors are school-specific, especially for grades 9 and 10; popularity is therefore computed per (board, grade, author), not only per (board, grade, subject).
  - The system displays the most popular (board, grade, author) subject offerings first for that student's configuration.

## 6) Content Lifecycle
- Content can be deprecated (hidden) or deleted by admins.
- Old content is not required once deleted.
- Papers remain available via PDFs even if content is later removed.
- Academic year data is deprecated on June 1 of the next year.
- Admins can delete deprecated academic years to reduce storage.

## 7) Watermarking
- Final PDFs include subtle visible watermark with encoded user ID and logo.

## 8) Take Test Commitment Flow
- Preview is watermarked and not persisted.
- The "Take Test" action commits the paper, generates the answer key, and
  saves the test to the dashboard.
- After Take Test, the user can view the test on mobile, download a PDF, or
  print to a local printer.

## 9) Audit Logs (MVP1)
- Must log:
  - Subscription purchase/cancel/renew
  - Paper generation commit events
