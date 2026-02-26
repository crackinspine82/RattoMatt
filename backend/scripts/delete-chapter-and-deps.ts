#!/usr/bin/env node
/**
 * Delete a chapter and all its dependent data (Option A: duplicate cleanup).
 * Run from backend/: npm run delete-chapter -- <chapter_id>
 * Uses a transaction; rolls back on error.
 */

import 'dotenv/config';
import { getPool } from '../src/db.js';

async function main(): Promise<void> {
  const chapterId = process.argv[2]?.trim();
  if (!chapterId) {
    console.error('Usage: npm run delete-chapter -- <chapter_id>');
    process.exit(1);
  }

  const pool = getPool();

  const check = await pool.query<{ id: string; title: string; subject_name: string }>(
    `SELECT c.id, c.title, s.name AS subject_name
     FROM chapters c
     JOIN subjects s ON s.id = c.subject_id
     WHERE c.id = $1`,
    [chapterId]
  );
  if (check.rows.length === 0) {
    console.error('Chapter not found:', chapterId);
    process.exit(1);
  }
  const { title, subject_name } = check.rows[0];
  console.log('Will delete chapter:', chapterId, `(${subject_name}: ${title})`);
  console.log('Deleting dependent data...');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      'DELETE FROM draft_rubrics WHERE draft_question_id IN (SELECT id FROM draft_questions WHERE chapter_id = $1)',
      [chapterId]
    );
    await client.query('DELETE FROM draft_questions WHERE chapter_id = $1', [chapterId]);
    await client.query('DELETE FROM draft_revision_note_blocks WHERE chapter_id = $1', [chapterId]);
    await client.query(
      'DELETE FROM draft_note_blocks WHERE draft_syllabus_node_id IN (SELECT id FROM draft_syllabus_nodes WHERE chapter_id = $1)',
      [chapterId]
    );
    await client.query('DELETE FROM draft_syllabus_nodes WHERE chapter_id = $1', [chapterId]);
    await client.query('DELETE FROM curation_items WHERE chapter_id = $1', [chapterId]);

    await client.query(
      'DELETE FROM revision_note_blocks WHERE syllabus_node_id IN (SELECT id FROM syllabus_nodes WHERE chapter_id = $1)',
      [chapterId]
    );
    await client.query(
      'DELETE FROM note_blocks WHERE syllabus_node_id IN (SELECT id FROM syllabus_nodes WHERE chapter_id = $1)',
      [chapterId]
    );
    await client.query(
      'DELETE FROM question_micro_topics WHERE question_id IN (SELECT id FROM questions WHERE chapter_id = $1)',
      [chapterId]
    );
    await client.query(
      'DELETE FROM rubrics WHERE question_id IN (SELECT id FROM questions WHERE chapter_id = $1)',
      [chapterId]
    );
    await client.query(
      'DELETE FROM question_assets WHERE question_id IN (SELECT id FROM questions WHERE chapter_id = $1)',
      [chapterId]
    );
    await client.query(
      'DELETE FROM paper_questions WHERE question_id IN (SELECT id FROM questions WHERE chapter_id = $1)',
      [chapterId]
    );
    await client.query(
      'DELETE FROM question_attempts WHERE question_id IN (SELECT id FROM questions WHERE chapter_id = $1)',
      [chapterId]
    );
    await client.query('DELETE FROM questions WHERE chapter_id = $1', [chapterId]);

    await client.query(
      'DELETE FROM student_node_mastery WHERE syllabus_node_id IN (SELECT id FROM syllabus_nodes WHERE chapter_id = $1)',
      [chapterId]
    );
    await client.query(
      'DELETE FROM school_node_omission WHERE syllabus_node_id IN (SELECT id FROM syllabus_nodes WHERE chapter_id = $1)',
      [chapterId]
    );
    await client.query(
      'DELETE FROM school_node_votes WHERE syllabus_node_id IN (SELECT id FROM syllabus_nodes WHERE chapter_id = $1)',
      [chapterId]
    );
    await client.query(
      'DELETE FROM student_syllabus_node_overrides WHERE syllabus_node_id IN (SELECT id FROM syllabus_nodes WHERE chapter_id = $1)',
      [chapterId]
    );

    await client.query('DELETE FROM syllabus_nodes WHERE chapter_id = $1', [chapterId]);

    // Legacy topics / micro_topics (referenced by chapter_id)
    await client.query(
      'DELETE FROM school_microtopic_omission WHERE micro_topic_id IN (SELECT m.id FROM micro_topics m JOIN topics t ON t.id = m.topic_id WHERE t.chapter_id = $1)',
      [chapterId]
    );
    await client.query(
      'DELETE FROM school_microtopic_votes WHERE micro_topic_id IN (SELECT m.id FROM micro_topics m JOIN topics t ON t.id = m.topic_id WHERE t.chapter_id = $1)',
      [chapterId]
    );
    await client.query(
      'DELETE FROM student_syllabus_overrides WHERE micro_topic_id IN (SELECT m.id FROM micro_topics m JOIN topics t ON t.id = m.topic_id WHERE t.chapter_id = $1)',
      [chapterId]
    );
    await client.query(
      'DELETE FROM question_micro_topics WHERE micro_topic_id IN (SELECT m.id FROM micro_topics m JOIN topics t ON t.id = m.topic_id WHERE t.chapter_id = $1)',
      [chapterId]
    );
    await client.query(
      'DELETE FROM micro_topics WHERE topic_id IN (SELECT id FROM topics WHERE chapter_id = $1)',
      [chapterId]
    );
    await client.query('DELETE FROM topics WHERE chapter_id = $1', [chapterId]);

    await client.query('DELETE FROM student_chapter_mastery WHERE chapter_id = $1', [chapterId]);
    await client.query('DELETE FROM chapters WHERE id = $1', [chapterId]);

    await client.query('COMMIT');
    console.log('Done. Chapter and all dependent data deleted.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error:', (err as Error).message);
    process.exit(1);
  } finally {
    client.release();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
