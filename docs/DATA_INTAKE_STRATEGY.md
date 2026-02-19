# Data Intake Strategy (MVP1)

## 1) Chapter-wise Upload
Upload one chapter at a time using:
- XLSX with multiple sheets (see ADMIN_UPLOAD_SCHEMA.md)
- ZIP of images and assets

## 2) Source of Truth
- Notes are stored as HTML for consistent formatting.
- Questions and rubrics are stored as structured records.
- Assets are referenced by filename in XLSX and resolved to URLs.

## 3) Validation Pipeline
1) Validate required fields
2) Validate references (topic/micro_topic/question)
3) Enforce question-type requirements (scenario_json, images, passages)
4) Report row-level errors with exact sheet + row

## 4) Import Workflow
1) Admin uploads XLSX + ZIP
2) System validates and reports errors
3) Admin fixes and re-uploads
4) System ingests content and publishes

## 5) Versioning
- MVP1 overwrites existing content for the same chapter
- Admin can re-upload a chapter to update content
