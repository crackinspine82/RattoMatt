-- RattoMatt MVP1 Schema (PostgreSQL)
-- Source: docs/DB_SCHEMA.md + backend README (student_subjects)
-- Run via: npm run schema:apply (from backend folder)

-- 1) Core Users
CREATE TABLE IF NOT EXISTS parents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE,
  phone VARCHAR(30),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS schools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  state VARCHAR(100) NOT NULL,
  city VARCHAR(100),
  UNIQUE (name, state, city)
);

CREATE TABLE IF NOT EXISTS students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID REFERENCES parents(id) NOT NULL,
  school_id UUID REFERENCES schools(id),
  board VARCHAR(50) NOT NULL,
  grade_level INTEGER NOT NULL,
  target_exam_year INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2) Curriculum Structure
CREATE TABLE IF NOT EXISTS subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board VARCHAR(50) NOT NULL,
  grade_level INTEGER NOT NULL,
  name VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS chapters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id UUID REFERENCES subjects(id) NOT NULL,
  title TEXT NOT NULL,
  sequence_number INTEGER NOT NULL,
  discipline VARCHAR(20) NULL
);

CREATE TABLE IF NOT EXISTS topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id UUID REFERENCES chapters(id) NOT NULL,
  title TEXT NOT NULL,
  sequence_number INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS micro_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID REFERENCES topics(id) NOT NULL,
  title TEXT NOT NULL,
  sequence_number INTEGER NOT NULL
);

-- Add discipline to chapters if table already existed (HistoryCivics: 'civics' | 'history')
ALTER TABLE chapters ADD COLUMN IF NOT EXISTS discipline VARCHAR(20);

-- Page count from chapter PDF (set by study-notes-generate output + curation import; used for question-bank total)
ALTER TABLE chapters ADD COLUMN IF NOT EXISTS page_count INTEGER;

-- 2b) Syllabus tree (unlimited depth; replaces topics/micro_topics for new content)
-- depth 0=Section, 1=Topic, 2=Subtopic, 3=Point, 4+=Sub-point (level_label stored for UI)
CREATE TABLE IF NOT EXISTS syllabus_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id UUID REFERENCES chapters(id) NOT NULL,
  parent_id UUID REFERENCES syllabus_nodes(id),
  title TEXT NOT NULL,
  sequence_number INTEGER NOT NULL,
  depth INTEGER NOT NULL CHECK (depth >= 0),
  level_label VARCHAR(30) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_syllabus_nodes_chapter ON syllabus_nodes(chapter_id);
CREATE INDEX IF NOT EXISTS idx_syllabus_nodes_parent ON syllabus_nodes(parent_id);

-- 3) Assets and Notes
CREATE TABLE IF NOT EXISTS assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_url VARCHAR(512) NOT NULL,
  asset_type VARCHAR(50) NOT NULL,
  alt_text VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id UUID REFERENCES chapters(id) NOT NULL,
  topic_id UUID REFERENCES topics(id),
  micro_topic_id UUID REFERENCES micro_topics(id),
  title VARCHAR(255),
  content_html TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS note_assets (
  note_id UUID REFERENCES notes(id) NOT NULL,
  asset_id UUID REFERENCES assets(id) NOT NULL,
  PRIMARY KEY (note_id, asset_id)
);

-- 3b) Note blocks per syllabus node (multiple ordered blocks per node; study-notes pipeline)
CREATE TABLE IF NOT EXISTS note_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  syllabus_node_id UUID REFERENCES syllabus_nodes(id) NOT NULL,
  sequence_number INTEGER NOT NULL,
  content_html TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_note_blocks_node ON note_blocks(syllabus_node_id);

-- 4) Questions and Rubrics
CREATE TABLE IF NOT EXISTS questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id UUID REFERENCES chapters(id) NOT NULL,
  topic_id UUID REFERENCES topics(id),
  syllabus_node_id UUID REFERENCES syllabus_nodes(id),
  question_text TEXT NOT NULL,
  question_type VARCHAR(80) NOT NULL,
  discipline VARCHAR(20) NOT NULL CHECK (discipline IN ('history', 'civics')),
  difficulty_level INTEGER NOT NULL CHECK (difficulty_level BETWEEN 1 AND 4),
  answer_input_type VARCHAR(10) NOT NULL CHECK (answer_input_type IN ('typed','choice')),
  marks INTEGER NOT NULL,
  source_type VARCHAR(30) NOT NULL,
  textbook_ref VARCHAR(100),
  source_material_url VARCHAR(512),
  source_passage_text TEXT,
  scenario_data JSONB,
  correct_option VARCHAR(10),
  correct_value BOOLEAN,
  model_answer_text TEXT,
  section_label VARCHAR(50) NULL
);

CREATE TABLE IF NOT EXISTS question_micro_topics (
  question_id UUID REFERENCES questions(id) NOT NULL,
  micro_topic_id UUID REFERENCES micro_topics(id) NOT NULL,
  PRIMARY KEY (question_id, micro_topic_id)
);

-- Link question to syllabus node (the node this question assesses); optional for backward compat
ALTER TABLE questions ADD COLUMN IF NOT EXISTS syllabus_node_id UUID REFERENCES syllabus_nodes(id);
ALTER TABLE questions ADD COLUMN IF NOT EXISTS model_answer_text TEXT;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS section_label VARCHAR(50);

CREATE TABLE IF NOT EXISTS rubrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID REFERENCES questions(id) NOT NULL,
  rubric_version INTEGER NOT NULL,
  rubric_json JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS question_assets (
  question_id UUID REFERENCES questions(id) NOT NULL,
  asset_id UUID REFERENCES assets(id) NOT NULL,
  PRIMARY KEY (question_id, asset_id)
);

-- 5) Paper Templates
CREATE TABLE IF NOT EXISTS paper_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id UUID REFERENCES subjects(id) NOT NULL,
  duration_minutes INTEGER NOT NULL,
  total_marks INTEGER NOT NULL,
  name VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS paper_template_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES paper_templates(id) NOT NULL,
  section_name VARCHAR(100) NOT NULL,
  is_optional BOOLEAN NOT NULL DEFAULT FALSE,
  marks_total INTEGER NOT NULL,
  best_of_n_required INTEGER,
  best_of_n_max INTEGER,
  display_order INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS paper_template_section_types (
  section_id UUID REFERENCES paper_template_sections(id) NOT NULL,
  question_type VARCHAR(80) NOT NULL,
  percentage INTEGER,
  count INTEGER,
  PRIMARY KEY (section_id, question_type)
);

-- 6) Papers (Partitioned) + default partitions for inserts
CREATE TABLE IF NOT EXISTS papers (
  id UUID DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES students(id) NOT NULL,
  subject_id UUID REFERENCES subjects(id) NOT NULL,
  academic_year VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('pending','graded')),
  config_snapshot JSONB NOT NULL,
  question_paper_url VARCHAR(512) NOT NULL,
  answer_key_url VARCHAR(512) NOT NULL,
  total_marks_possible INTEGER NOT NULL,
  total_marks_obtained DECIMAL(5,2),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE TABLE IF NOT EXISTS papers_default PARTITION OF papers DEFAULT;

-- paper_id not FK to papers(id): partitioned table PK is (id, created_at); app enforces ref integrity
CREATE TABLE IF NOT EXISTS paper_questions (
  paper_id UUID NOT NULL,
  question_id UUID REFERENCES questions(id) NOT NULL,
  display_order INTEGER NOT NULL,
  section_name VARCHAR(50),
  parent_question_id UUID,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (paper_id, question_id, created_at)
) PARTITION BY RANGE (created_at);

CREATE TABLE IF NOT EXISTS paper_questions_default PARTITION OF paper_questions DEFAULT;

-- paper_id not FK to papers(id): partitioned table PK is (id, created_at); app enforces ref integrity
CREATE TABLE IF NOT EXISTS question_attempts (
  id UUID DEFAULT gen_random_uuid(),
  paper_id UUID NOT NULL,
  question_id UUID REFERENCES questions(id) NOT NULL,
  grading_status VARCHAR(30) NOT NULL,
  score_awarded DECIMAL(4,2),
  flag_reason VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE TABLE IF NOT EXISTS question_attempts_default PARTITION OF question_attempts DEFAULT;

-- 7) RapidFire
CREATE TABLE IF NOT EXISTS rapidfire_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES students(id) NOT NULL,
  subject_id UUID REFERENCES subjects(id) NOT NULL,
  academic_year VARCHAR(20) NOT NULL,
  duration_minutes INTEGER NOT NULL,
  question_count INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rapidfire_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES rapidfire_sessions(id) NOT NULL,
  question_id UUID REFERENCES questions(id) NOT NULL,
  grading_status VARCHAR(30) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 8) Mastery and Omission Stats
CREATE TABLE IF NOT EXISTS student_microtopic_mastery (
  student_id UUID REFERENCES students(id) NOT NULL,
  micro_topic_id UUID REFERENCES micro_topics(id) NOT NULL,
  mastery_percentage DECIMAL(5,2),
  questions_attempted INTEGER DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  last_updated TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (student_id, micro_topic_id)
);

CREATE TABLE IF NOT EXISTS student_chapter_mastery (
  student_id UUID REFERENCES students(id) NOT NULL,
  chapter_id UUID REFERENCES chapters(id) NOT NULL,
  mastery_percentage DECIMAL(5,2),
  questions_attempted INTEGER DEFAULT 0,
  last_updated TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (student_id, chapter_id)
);

CREATE TABLE IF NOT EXISTS school_microtopic_omission (
  school_id UUID REFERENCES schools(id) NOT NULL,
  micro_topic_id UUID REFERENCES micro_topics(id) NOT NULL,
  total_votes INTEGER DEFAULT 0,
  omission_votes INTEGER DEFAULT 0,
  last_updated TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (school_id, micro_topic_id)
);

CREATE TABLE IF NOT EXISTS school_microtopic_votes (
  school_id UUID REFERENCES schools(id) NOT NULL,
  micro_topic_id UUID REFERENCES micro_topics(id) NOT NULL,
  vote VARCHAR(10) NOT NULL CHECK (vote IN ('omit','include')),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS student_syllabus_overrides (
  student_id UUID REFERENCES students(id) NOT NULL,
  micro_topic_id UUID REFERENCES micro_topics(id) NOT NULL,
  is_included BOOLEAN NOT NULL,
  source VARCHAR(20) NOT NULL CHECK (source IN ('crowd','manual')),
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (student_id, micro_topic_id)
);

-- 8b) Mastery and overrides by syllabus node (new model; leaf-only mastery, roll-up computed)
CREATE TABLE IF NOT EXISTS student_node_mastery (
  student_id UUID REFERENCES students(id) NOT NULL,
  syllabus_node_id UUID REFERENCES syllabus_nodes(id) NOT NULL,
  mastery_percentage DECIMAL(5,2),
  questions_attempted INTEGER DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  last_updated TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (student_id, syllabus_node_id)
);

CREATE TABLE IF NOT EXISTS school_node_omission (
  school_id UUID REFERENCES schools(id) NOT NULL,
  syllabus_node_id UUID REFERENCES syllabus_nodes(id) NOT NULL,
  total_votes INTEGER DEFAULT 0,
  omission_votes INTEGER DEFAULT 0,
  last_updated TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (school_id, syllabus_node_id)
);

CREATE TABLE IF NOT EXISTS school_node_votes (
  school_id UUID REFERENCES schools(id) NOT NULL,
  syllabus_node_id UUID REFERENCES syllabus_nodes(id) NOT NULL,
  vote VARCHAR(10) NOT NULL CHECK (vote IN ('omit','include')),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS student_syllabus_node_overrides (
  student_id UUID REFERENCES students(id) NOT NULL,
  syllabus_node_id UUID REFERENCES syllabus_nodes(id) NOT NULL,
  is_included BOOLEAN NOT NULL,
  source VARCHAR(20) NOT NULL CHECK (source IN ('crowd','manual')),
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (student_id, syllabus_node_id)
);

-- 9) Reminders (Notifications)
CREATE TABLE IF NOT EXISTS scheduled_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES students(id) NOT NULL,
  type VARCHAR(30) NOT NULL CHECK (type IN ('test_schedule', 'grading')),
  subject_id UUID REFERENCES subjects(id),
  paper_id UUID,
  config_snapshot JSONB NOT NULL DEFAULT '{}',
  reminder_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'dismissed', 'triggered')),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT reminders_target CHECK (
    (type = 'test_schedule' AND subject_id IS NOT NULL AND paper_id IS NULL) OR
    (type = 'grading' AND paper_id IS NOT NULL AND subject_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_scheduled_reminders_student_status ON scheduled_reminders(student_id, status);
CREATE INDEX IF NOT EXISTS idx_scheduled_reminders_date ON scheduled_reminders(reminder_date) WHERE status = 'scheduled';

-- 10) Subscriptions and Audit Logs
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID REFERENCES parents(id) NOT NULL,
  plan_code VARCHAR(50) NOT NULL,
  academic_year VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL,
  price_paid DECIMAL(10,2) NOT NULL,
  pricing_label VARCHAR(50),
  pricing_start_date DATE,
  pricing_end_date DATE,
  purchased_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  valid_until DATE NOT NULL
);

CREATE TABLE IF NOT EXISTS pricing_windows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id UUID REFERENCES subjects(id) NOT NULL,
  board VARCHAR(50) NOT NULL,
  grade_level INTEGER NOT NULL,
  label VARCHAR(50) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS subscription_items (
  subscription_id UUID REFERENCES subscriptions(id) NOT NULL,
  student_id UUID REFERENCES students(id) NOT NULL,
  subject_id UUID REFERENCES subjects(id) NOT NULL,
  PRIMARY KEY (subscription_id, student_id, subject_id)
);

CREATE TABLE IF NOT EXISTS audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(50) NOT NULL,
  parent_id UUID REFERENCES parents(id),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Student subjects (backend README: is_selected per student)
CREATE TABLE IF NOT EXISTS student_subjects (
  student_id UUID REFERENCES students(id) NOT NULL,
  subject_id UUID REFERENCES subjects(id) NOT NULL,
  PRIMARY KEY (student_id, subject_id)
);

-- Curation (Admin + SME): draft vs published; see docs/CURATION_SYSTEM.md
CREATE TABLE IF NOT EXISTS sme_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sme_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sme_user_id UUID REFERENCES sme_users(id) NOT NULL,
  token VARCHAR(64) UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sme_sessions_token ON sme_sessions(token);
CREATE INDEX IF NOT EXISTS idx_sme_sessions_expires ON sme_sessions(expires_at);

CREATE TABLE IF NOT EXISTS curation_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id UUID REFERENCES subjects(id) NOT NULL,
  chapter_id UUID REFERENCES chapters(id) NOT NULL,
  content_type VARCHAR(30) NOT NULL CHECK (content_type IN ('structure', 'notes', 'questions', 'rubrics', 'revision_notes')),
  status VARCHAR(30) NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'ready_to_publish', 'published')),
  assigned_to UUID REFERENCES sme_users(id),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (chapter_id, content_type)
);

CREATE INDEX IF NOT EXISTS idx_curation_items_status ON curation_items(status);
CREATE INDEX IF NOT EXISTS idx_curation_items_chapter ON curation_items(chapter_id);

CREATE TABLE IF NOT EXISTS draft_syllabus_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id UUID REFERENCES chapters(id) NOT NULL,
  parent_id UUID REFERENCES draft_syllabus_nodes(id),
  title TEXT NOT NULL,
  sequence_number INTEGER NOT NULL,
  depth INTEGER NOT NULL CHECK (depth >= 0),
  level_label VARCHAR(30) NOT NULL,
  published_syllabus_node_id UUID REFERENCES syllabus_nodes(id),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_draft_syllabus_nodes_chapter ON draft_syllabus_nodes(chapter_id);
CREATE INDEX IF NOT EXISTS idx_draft_syllabus_nodes_parent ON draft_syllabus_nodes(parent_id);

CREATE TABLE IF NOT EXISTS draft_note_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_syllabus_node_id UUID REFERENCES draft_syllabus_nodes(id) NOT NULL,
  sequence_number INTEGER NOT NULL,
  content_html TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_draft_note_blocks_node ON draft_note_blocks(draft_syllabus_node_id);

-- Revision notes (concise revision content from study-notes-generate; full extract stays in draft_note_blocks)
-- Keyed by published syllabus_node_id; chapter_id for listing/orphaned. See docs/TARGET_ARCHITECTURE_REVISION_QUESTIONS.md
CREATE TABLE IF NOT EXISTS draft_revision_note_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id UUID REFERENCES chapters(id) NOT NULL,
  syllabus_node_id UUID REFERENCES syllabus_nodes(id) ON DELETE SET NULL,
  sequence_number INTEGER NOT NULL,
  content_html TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_draft_revision_note_blocks_syllabus_node ON draft_revision_note_blocks(syllabus_node_id);
CREATE INDEX IF NOT EXISTS idx_draft_revision_note_blocks_chapter ON draft_revision_note_blocks(chapter_id);

-- Published revision notes (publish script copies from draft_revision_note_blocks)
CREATE TABLE IF NOT EXISTS revision_note_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  syllabus_node_id UUID REFERENCES syllabus_nodes(id) NOT NULL,
  sequence_number INTEGER NOT NULL,
  content_html TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_revision_note_blocks_node ON revision_note_blocks(syllabus_node_id);

-- Draft questions and rubrics (curation → publish to questions/rubrics)
-- Keyed by published syllabus_node_id (nullable for orphaned after structure re-publish). See docs/TARGET_ARCHITECTURE_REVISION_QUESTIONS.md
CREATE TABLE IF NOT EXISTS draft_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id UUID REFERENCES chapters(id) NOT NULL,
  syllabus_node_id UUID REFERENCES syllabus_nodes(id) ON DELETE SET NULL,
  question_text TEXT NOT NULL,
  question_type VARCHAR(80) NOT NULL,
  discipline VARCHAR(20) NOT NULL CHECK (discipline IN ('history', 'civics')),
  difficulty_level INTEGER NOT NULL CHECK (difficulty_level BETWEEN 1 AND 4),
  answer_input_type VARCHAR(10) NOT NULL CHECK (answer_input_type IN ('typed','choice')),
  marks INTEGER NOT NULL,
  source_type VARCHAR(30) NOT NULL,
  textbook_ref VARCHAR(100),
  source_material_url VARCHAR(512),
  source_passage_text TEXT,
  scenario_data JSONB,
  correct_option VARCHAR(10),
  correct_value BOOLEAN,
  model_answer_text TEXT,
  section_label VARCHAR(50),
  published_question_id UUID REFERENCES questions(id),
  ready_to_publish BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_draft_questions_chapter ON draft_questions(chapter_id);
CREATE INDEX IF NOT EXISTS idx_draft_questions_ready ON draft_questions(chapter_id, ready_to_publish);
CREATE INDEX IF NOT EXISTS idx_draft_questions_syllabus_node ON draft_questions(syllabus_node_id);

CREATE TABLE IF NOT EXISTS draft_rubrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_question_id UUID REFERENCES draft_questions(id) ON DELETE CASCADE NOT NULL,
  rubric_version INTEGER NOT NULL,
  rubric_json JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_draft_rubrics_question ON draft_rubrics(draft_question_id);
