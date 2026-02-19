#!/usr/bin/env node
/**
 * Seed one demo parent, one demo student, and link the student to the given
 * subjects (ICSE 9) so the app shows them in the take-test flow.
 *
 * Add more subject names to SUBJECT_NAMES below and run seed:syllabus for those
 * books first; then run this script again to link the demo student to them.
 *
 * Run from backend/: npm run seed:demo-student
 * Then set EXPO_PUBLIC_MOCK_STUDENT_ID=<printed-student-id> in mobile/.env
 */

import 'dotenv/config';
import { getPool } from '../src/db.js';

const BOARD = 'ICSE';
const GRADE = 9;

/** Subject names (must match subjects.name in DB). Run seed:syllabus for each book first. */
const SUBJECT_NAMES = [
  'Total History & Civics',
  'Total Geography',
];

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set. Set it in backend/.env');
    process.exit(1);
  }

  const pool = getPool();

  // 1) Insert or get demo parent
  const parentRes = await pool.query<{ id: string }>(
    `INSERT INTO parents (email) VALUES ('demo@rattomatt.local')
     ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
     RETURNING id`
  );
  const parentId = parentRes.rows[0].id;
  console.log('Parent id:', parentId);

  // 2) Get or insert demo student (ICSE 9)
  let existingStudent = await pool.query<{ id: string }>(
    'SELECT id FROM students WHERE parent_id = $1 AND board = $2 AND grade_level = $3 LIMIT 1',
    [parentId, BOARD, GRADE]
  );
  let studentId: string;
  if (existingStudent.rows.length > 0) {
    studentId = existingStudent.rows[0].id;
  } else {
    const studentRes = await pool.query<{ id: string }>(
      `INSERT INTO students (parent_id, board, grade_level, target_exam_year)
       VALUES ($1, $2, $3, 2030)
       RETURNING id`,
      [parentId, BOARD, GRADE]
    );
    studentId = studentRes.rows[0].id;
  }
  console.log('Student id:', studentId);

  // 3) Link student to each subject (is_selected). Skip if subject not in DB yet.
  for (const subjectName of SUBJECT_NAMES) {
    const subjRes = await pool.query<{ id: string }>(
      'SELECT id FROM subjects WHERE board = $1 AND grade_level = $2 AND name = $3',
      [BOARD, GRADE, subjectName]
    );
    if (subjRes.rows.length === 0) {
      console.warn('Subject not found (run seed:syllabus first):', subjectName);
      continue;
    }
    const subjectId = subjRes.rows[0].id;
    await pool.query(
      `INSERT INTO student_subjects (student_id, subject_id) VALUES ($1, $2)
       ON CONFLICT (student_id, subject_id) DO NOTHING`,
      [studentId, subjectId]
    );
    console.log('Linked student to subject:', subjectName);
  }

  console.log('');
  console.log('Set in mobile/.env:');
  console.log('EXPO_PUBLIC_MOCK_STUDENT_ID=' + studentId);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
