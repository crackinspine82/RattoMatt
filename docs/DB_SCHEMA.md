# Database Schema (PostgreSQL DDL)

This is the MVP1 schema for the assessment engine. It is extensible by board,
grade, and subject. High-growth tables must be partitioned by date.

## 1) Core Users
```sql
CREATE TABLE parents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE,
  phone VARCHAR(30),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE schools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  state VARCHAR(100) NOT NULL,
  city VARCHAR(100),
  UNIQUE (name, state, city)
);

CREATE TABLE students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID REFERENCES parents(id) NOT NULL,
  school_id UUID REFERENCES schools(id),
  board VARCHAR(50) NOT NULL,
  grade_level INTEGER NOT NULL,
  target_exam_year INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
```

## 2) Curriculum Structure
```sql
CREATE TABLE subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board VARCHAR(50) NOT NULL,
  grade_level INTEGER NOT NULL,
  name VARCHAR(100) NOT NULL
);

CREATE TABLE chapters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id UUID REFERENCES subjects(id) NOT NULL,
  title VARCHAR(255) NOT NULL,
  sequence_number INTEGER NOT NULL
);

CREATE TABLE topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id UUID REFERENCES chapters(id) NOT NULL,
  title VARCHAR(255) NOT NULL,
  sequence_number INTEGER NOT NULL
);

CREATE TABLE micro_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID REFERENCES topics(id) NOT NULL,
  title VARCHAR(255) NOT NULL,
  sequence_number INTEGER NOT NULL
);

-- 2b) Syllabus tree (unlimited depth; level_label: Section, Topic, Subtopic, Point, Sub-point)
CREATE TABLE syllabus_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id UUID REFERENCES chapters(id) NOT NULL,
  parent_id UUID REFERENCES syllabus_nodes(id),
  title TEXT NOT NULL,
  sequence_number INTEGER NOT NULL,
  depth INTEGER NOT NULL CHECK (depth >= 0),
  level_label VARCHAR(30) NOT NULL
);
```

## 3) Assets and Notes
```sql
CREATE TABLE assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_url VARCHAR(512) NOT NULL,
  asset_type VARCHAR(50) NOT NULL,
  alt_text VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id UUID REFERENCES chapters(id) NOT NULL,
  topic_id UUID REFERENCES topics(id),
  micro_topic_id UUID REFERENCES micro_topics(id),
  title VARCHAR(255),
  content_html TEXT NOT NULL
);

CREATE TABLE note_assets (
  note_id UUID REFERENCES notes(id) NOT NULL,
  asset_id UUID REFERENCES assets(id) NOT NULL,
  PRIMARY KEY (note_id, asset_id)
);

-- 3b) Note blocks per syllabus node (multiple ordered blocks per node)
CREATE TABLE note_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  syllabus_node_id UUID REFERENCES syllabus_nodes(id) NOT NULL,
  sequence_number INTEGER NOT NULL,
  content_html TEXT NOT NULL
);
```

## 4) Questions and Rubrics
```sql
CREATE TABLE questions (
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
  section_label VARCHAR(50)
);

CREATE TABLE question_micro_topics (
  question_id UUID REFERENCES questions(id) NOT NULL,
  micro_topic_id UUID REFERENCES micro_topics(id) NOT NULL,
  PRIMARY KEY (question_id, micro_topic_id)
);

CREATE TABLE rubrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID REFERENCES questions(id) NOT NULL,
  rubric_version INTEGER NOT NULL,
  rubric_json JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE question_assets (
  question_id UUID REFERENCES questions(id) NOT NULL,
  asset_id UUID REFERENCES assets(id) NOT NULL,
  PRIMARY KEY (question_id, asset_id)
);
```

## 5) Paper Templates
```sql
CREATE TABLE paper_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id UUID REFERENCES subjects(id) NOT NULL,
  duration_minutes INTEGER NOT NULL,
  total_marks INTEGER NOT NULL,
  name VARCHAR(100) NOT NULL
);

CREATE TABLE paper_template_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES paper_templates(id) NOT NULL,
  section_name VARCHAR(100) NOT NULL,
  is_optional BOOLEAN NOT NULL DEFAULT FALSE,
  marks_total INTEGER NOT NULL,
  best_of_n_required INTEGER,
  best_of_n_max INTEGER,
  display_order INTEGER NOT NULL
);

CREATE TABLE paper_template_section_types (
  section_id UUID REFERENCES paper_template_sections(id) NOT NULL,
  question_type VARCHAR(80) NOT NULL,
  percentage INTEGER,
  count INTEGER,
  PRIMARY KEY (section_id, question_type)
);
```

## 6) Papers (Partitioned)
```sql
CREATE TABLE papers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES students(id) NOT NULL,
  subject_id UUID REFERENCES subjects(id) NOT NULL,
  academic_year VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('pending','graded')),
  config_snapshot JSONB NOT NULL,
  question_paper_url VARCHAR(512) NOT NULL,
  answer_key_url VARCHAR(512) NOT NULL,
  total_marks_possible INTEGER NOT NULL,
  total_marks_obtained DECIMAL(5,2),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
) PARTITION BY RANGE (created_at);

CREATE TABLE paper_questions (
  paper_id UUID REFERENCES papers(id) NOT NULL,
  question_id UUID REFERENCES questions(id) NOT NULL,
  display_order INTEGER NOT NULL,
  section_name VARCHAR(50),
  parent_question_id UUID,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (paper_id, question_id)
) PARTITION BY RANGE (created_at);

CREATE TABLE question_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paper_id UUID REFERENCES papers(id) NOT NULL,
  question_id UUID REFERENCES questions(id) NOT NULL,
  grading_status VARCHAR(30) NOT NULL,
  score_awarded DECIMAL(4,2),
  flag_reason VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
) PARTITION BY RANGE (created_at);
```

## 7) RapidFire
```sql
CREATE TABLE rapidfire_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES students(id) NOT NULL,
  subject_id UUID REFERENCES subjects(id) NOT NULL,
  academic_year VARCHAR(20) NOT NULL,
  duration_minutes INTEGER NOT NULL,
  question_count INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE rapidfire_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES rapidfire_sessions(id) NOT NULL,
  question_id UUID REFERENCES questions(id) NOT NULL,
  grading_status VARCHAR(30) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
```

## 8) Mastery and Omission Stats
```sql
CREATE TABLE student_microtopic_mastery (
  student_id UUID REFERENCES students(id) NOT NULL,
  micro_topic_id UUID REFERENCES micro_topics(id) NOT NULL,
  mastery_percentage DECIMAL(5,2),
  questions_attempted INTEGER DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  last_updated TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (student_id, micro_topic_id)
);

CREATE TABLE student_chapter_mastery (
  student_id UUID REFERENCES students(id) NOT NULL,
  chapter_id UUID REFERENCES chapters(id) NOT NULL,
  mastery_percentage DECIMAL(5,2),
  questions_attempted INTEGER DEFAULT 0,
  last_updated TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (student_id, chapter_id)
);

CREATE TABLE school_microtopic_omission (
  school_id UUID REFERENCES schools(id) NOT NULL,
  micro_topic_id UUID REFERENCES micro_topics(id) NOT NULL,
  total_votes INTEGER DEFAULT 0,
  omission_votes INTEGER DEFAULT 0,
  last_updated TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (school_id, micro_topic_id)
);

CREATE TABLE school_microtopic_votes (
  school_id UUID REFERENCES schools(id) NOT NULL,
  micro_topic_id UUID REFERENCES micro_topics(id) NOT NULL,
  vote VARCHAR(10) NOT NULL CHECK (vote IN ('omit','include')),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE student_syllabus_overrides (
  student_id UUID REFERENCES students(id) NOT NULL,
  micro_topic_id UUID REFERENCES micro_topics(id) NOT NULL,
  is_included BOOLEAN NOT NULL,
  source VARCHAR(20) NOT NULL CHECK (source IN ('crowd','manual')),
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (student_id, micro_topic_id)
);
```

## 9) Reminders (Notifications)
Reminders are date-only. Parent has an active notification until they dismiss or complete the activity (Take Test or Submit Test Score). No snooze.
```sql
CREATE TABLE scheduled_reminders (
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

CREATE INDEX idx_scheduled_reminders_student_status ON scheduled_reminders(student_id, status);
CREATE INDEX idx_scheduled_reminders_date ON scheduled_reminders(reminder_date) WHERE status = 'scheduled';
```
Note: paper_id is not a FK to papers(id) here to avoid cross-partition references; application ensures it references a valid paper.

## 10) Subscriptions and Audit Logs
```sql
CREATE TABLE subscriptions (
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

CREATE TABLE pricing_windows (
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

CREATE TABLE subscription_items (
  subscription_id UUID REFERENCES subscriptions(id) NOT NULL,
  student_id UUID REFERENCES students(id) NOT NULL,
  subject_id UUID REFERENCES subjects(id) NOT NULL,
  PRIMARY KEY (subscription_id, student_id, subject_id)
);

CREATE TABLE audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(50) NOT NULL,
  parent_id UUID REFERENCES parents(id),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
```
