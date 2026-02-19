# API Spec (MVP1)

Minimal endpoints for the assessment engine. Expandable for future modules.

## Auth
- POST /auth/register (Firebase phone OTP or Google)
- POST /auth/verify-otp
- POST /auth/login

## Profile / Setup
- GET /me
- POST /students
- PATCH /students/{id}
- POST /schools/resolve

## Subjects
- GET /subjects?board=...&grade=...&student_id=...
  - Returns subjects for the given board and grade with per-subject flags for the student.
  - Response: `{ "subjects": [ { "id": "uuid", "name": "...", "board": "...", "grade_level": N, "is_selected": true|false, "is_subscribed": true|false } ] }`.
  - Subject ids are UUIDs only (no slug/code). Mobile uses these UUIDs for all subject references.
- GET /subjects/:id/chapters
  - Returns chapters for the subject with nested topics. Used for chapter/topic selection in Generate Test.
  - Response: `{ "chapters": [ { "id": "uuid", "title": "...", "sequence_number": N, "topics": [ { "id": "uuid", "title": "...", "sequence_number": N } ] } ] }`.

## Syllabus Defaults
- GET /syllabus/defaults?student_id=...
- PATCH /syllabus/defaults

## Paper Generation
- POST /papers/preview
  - returns preview_url (watermarked) + config_snapshot
- POST /papers/take-test
  - returns question_paper_url + answer_key_url (sync)
  - if timeout, returns job_id for polling
- GET /papers/{id}
- GET /papers/{id}/pdf

## Grading
- POST /papers/{id}/submit-grades
  - payload: question_id, grading_status, score_awarded, flag_reason

## RapidFire
- POST /rapidfire/start
- POST /rapidfire/submit

## Notes
- GET /notes?student_id=...&chapter_id=...

## Reminders (Notifications)
Reminders are date-only notifications. The parent sees an active notification until they dismiss it or tap through to complete the activity (Take Test or Submit Test Score). No snooze; date is user-chosen, time is not collected.
- POST /reminders
  - Body: `{ "student_id": "uuid", "type": "test_schedule"|"grading", "subject_id": "uuid" (optional), "paper_id": "uuid" (optional), "config_snapshot": {} (for test_schedule: selected_chapter_ids, selected_topic_ids, test_type), "reminder_date": "YYYY-MM-DD" }`.
  - type `test_schedule`: subject_id + config_snapshot; CTA opens Take Test flow.
  - type `grading`: paper_id; CTA opens Submit Test Score / grading for that paper.
- GET /reminders/:id
  - Load one reminder (e.g. when opening from notification). Response includes type, target (subject_id or paper_id), config_snapshot, reminder_date, status.
- GET /reminders?student_id=...&status=scheduled
  - List active reminders for the student. status filter: scheduled (default), or include dismissed/triggered for history.
- PATCH /reminders/:id
  - Body: `{ "status": "dismissed" }` to dismiss the notification. Optionally `{ "status": "triggered" }` when user taps through to the activity.

## Subscriptions
- GET /subscriptions
- POST /subscriptions/checkout (Razorpay)
- POST /subscriptions/webhook (Razorpay)
 - POST /admin/pricing-window (stub)

## Admin (MVP1)
- POST /admin/upload/chapter
- GET /admin/upload/{id}/status
- POST /admin/templates
