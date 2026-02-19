# Admin Upload Schema (Chapter-wise XLSX)

Uploads are done per chapter using a multi-sheet XLSX plus a ZIP of assets.
Each XLSX uses these sheets:

## 1) chapter
Required columns:
- board
- grade_level
- subject
- chapter_title
- chapter_sequence

## 2) topics
Required columns:
- chapter_title
- topic_title
- topic_sequence

## 3) micro_topics
Required columns:
- topic_title
- micro_topic_title
- micro_topic_sequence

## 4) notes
Required columns:
- note_title
- chapter_title
- topic_title (optional)
- micro_topic_title (optional)
- content_html

## 5) assets
Required columns:
- asset_filename
- asset_type
- alt_text (optional)

## 6) note_assets
Required columns:
- note_title
- asset_filename

## 7) questions
Required columns:
- chapter_title
- topic_title (optional)
- question_text
- question_type
- discipline (history/civics)
- difficulty_level (1-4)
- answer_input_type (typed/choice)
- marks
- source_type (textbook_exact/sme_curated/ai_generated/external_source)
- textbook_ref (optional)
- source_material_filename (optional)
- source_passage_text (optional)
- scenario_json (optional)
 - correct_option (optional)
 - correct_value (optional)

## 8) question_micro_topics
Required columns:
- question_text
- micro_topic_title

## 9) rubrics
Required columns:
- question_text
- rubric_version
- rubric_json

## 10) validation rules
- Missing required fields = hard error (row rejected)
- Unknown references (topic/micro_topic) = hard error
- scenario_json required for mcq_logic_table
- source_material_filename required for picture_study_linked
- source_passage_text required for source_passage_analysis

## 11) asset ZIP rules
- ZIP file contains all asset files referenced in assets sheet
- asset_filename must match exactly
- Each asset is uploaded to object storage and mapped to asset_url
