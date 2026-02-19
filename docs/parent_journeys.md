# RattoMatt - Parent User Journeys

## Journey 1: Smart Onboarding (Frictionless Setup)
**Goal:** Get the parent to their first action with minimal data entry.
1.  **Login/Signup:** Standard phone/email auth.
2.  **Child Profile (The Hook):**
    * User selects Board & Grade (e.g., "ICSE Class 10").
    * *System Action:* If Grade 10 is selected, the system auto-applies the standardized syllabus. Book/Author selection dropdowns are disabled/hidden to reduce friction.
    * If more than one child is added, a child switcher becomes available.
    * If only one child is registered, hide the child switcher.
3.  **School Context (The Crowdsource Setup):**
    * User selects State and School Name via searchable dropdowns.
    * *Note:* This data is crucial for the "Crowdsourced Omission Engine" later.
4.  **Syllabus Defaults (One-Time Setup):**
    * System applies default omissions using crowdsourced data.
    * Parent can edit the defaults now or later in the academic year.
5.  **Completion:** User is landed immediately on the Dashboard with a clear CTA to "Create First Test."

## Journey 2: The Paper Generation Wizard
**Goal:** Intuitive scope selection assisted by community data.
**Step 1: Scope Selection (The Smart List)**
* User selects Subject (e.g., History).
* UI presents list of Chapters.
* **Smart Feature:** Chapters are pre-selected based on crowdsourced data from the user's school. Tags like "Popular in your school" are displayed next to relevant chapters.
* User retains full control to manually override selections (check/uncheck).
**Step 2: Configuration**
* User sets Duration (e.g., 45/90/150 mins) and Difficulty mix
  (easy/medium/difficult/complex).
* User can edit the selection before committing the test.
**Step 3: Preview & Commit (The Gate)**
* UI shows a watermarked preview of the generated PDF.
* **The Commitment:** User must choose an action to finalize the paper.
    * **Action: "Take Test":** Shows a confirmation, then commits the paper,
      generates Answer Key, and saves it to the dashboard.
    * After Take Test, user can view the test on mobile, download PDF, or print.

## Journey 3: The Hybrid Grading Workflow
**Goal:** Ergonomic data entry that satisfies both AI training needs and Board scoring rules.
**Pre-condition:** Paper exists in "Pending" state.
1.  **Entry:** Parent selects paper from dashboard and enters "Grading Mode."
2.  **The Split-Screen Interface:**
    * **Top Half (Reference):** Displays Question text, Model Answer (bullet points with keywords highlighted), and Grading Rubric. Has a non-interruptive "Flag" icon.
    * **Bottom Half (Input):**
        * Four primary categorical buttons: [Correct], [Incorrect], [Partially Correct], [Not Attempted].
3.  **The Input Logic:**
    * Tap **[Correct]**: Auto-fills max marks for that question. Auto-advances.
    * Tap **[Incorrect]** or **[Not Attempted]**: Auto-fills 0 marks. Auto-advances.
    * Tap **[Partially Correct]**: Opens a secondary numeric keypad (allowing 0.5 increments) for precise score entry. Parent enters score, then taps "Next."
4.  **Completion:** Upon grading the final question, user taps "Submit Scores."
    * Sub-questions (e.g., Q3 i/ii) are graded as separate items and summed.

## Journey 4: Post-Grading Analysis
1.  **Backend Processing (Instant):** The system calculates the raw total based on ICSE "Best-of-N" rules for optional sections.
2.  **Result Screen:** Parent is shown the final Board-compliant score (e.g., "58/80").
3.  **Backend Processing (Async):** Background workers update the student's Chapter Mastery percentages based on the categorical data from the grading attempt.