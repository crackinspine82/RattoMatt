#!/usr/bin/env node
/**
 * Publish: copy draft → published for curation items with status ready_to_publish.
 * Structure: draft_syllabus_nodes → syllabus_nodes; Notes: draft_note_blocks → note_blocks;
 * Revision notes: draft_revision_note_blocks → revision_note_blocks (by syllabus_node_id);
 * Questions: draft_questions → questions, draft_rubrics → rubrics (syllabus_node_id used as-is).
 * Run from backend/: npm run curation:publish
 */

import 'dotenv/config';
import { getPool } from '../src/db.js';

async function main(): Promise<void> {
  const pool = getPool();
  const items = await pool.query<{ id: string; chapter_id: string; content_type: string }>(
    "SELECT id, chapter_id, content_type FROM curation_items WHERE status = 'ready_to_publish'"
  );
  if (items.rows.length === 0) {
    console.log('No items in ready_to_publish. Nothing to do.');
    return;
  }

  for (const item of items.rows) {
    const { id, chapter_id: chapterId, content_type: contentType } = item;
    if (contentType === 'structure') {
      const draftNodes = await pool.query<{ id: string; parent_id: string | null; title: string; sequence_number: number; depth: number; level_label: string }>(
        `WITH RECURSIVE tree AS (
          SELECT id, chapter_id, parent_id, title, sequence_number, depth, level_label,
                 ARRAY[sequence_number] AS sort_path
          FROM draft_syllabus_nodes
          WHERE chapter_id = $1 AND parent_id IS NULL
          UNION ALL
          SELECT n.id, n.chapter_id, n.parent_id, n.title, n.sequence_number, n.depth, n.level_label,
                 t.sort_path || n.sequence_number
          FROM draft_syllabus_nodes n
          JOIN tree t ON n.parent_id = t.id
        )
        SELECT id, parent_id, title, sequence_number, depth, level_label FROM tree ORDER BY sort_path`,
        [chapterId]
      );
      const draftToPublished = new Map<string, string>();
      await pool.query('UPDATE draft_syllabus_nodes SET published_syllabus_node_id = NULL WHERE chapter_id = $1', [chapterId]);
      await pool.query(
        'DELETE FROM note_blocks WHERE syllabus_node_id IN (SELECT id FROM syllabus_nodes WHERE chapter_id = $1)',
        [chapterId]
      );
      await pool.query(
        'DELETE FROM revision_note_blocks WHERE syllabus_node_id IN (SELECT id FROM syllabus_nodes WHERE chapter_id = $1)',
        [chapterId]
      );
      await pool.query('DELETE FROM syllabus_nodes WHERE chapter_id = $1', [chapterId]);
      for (const n of draftNodes.rows) {
        const publishedParentId = n.parent_id && draftToPublished.has(n.parent_id) ? draftToPublished.get(n.parent_id)! : null;
        const ins = await pool.query<{ id: string }>(
          `INSERT INTO syllabus_nodes (chapter_id, parent_id, title, sequence_number, depth, level_label)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
          [chapterId, publishedParentId, n.title, n.sequence_number, n.depth, n.level_label]
        );
        const publishedId = ins.rows[0].id;
        draftToPublished.set(n.id, publishedId);
        await pool.query('UPDATE draft_syllabus_nodes SET published_syllabus_node_id = $1 WHERE id = $2', [publishedId, n.id]);
      }
      console.log('Published structure for chapter', chapterId, '→', draftNodes.rows.length, 'nodes');
    } else if (contentType === 'revision_notes') {
      const draftBlocks = await pool.query<{ id: string; syllabus_node_id: string | null; sequence_number: number; content_html: string }>(
        'SELECT id, syllabus_node_id, sequence_number, content_html FROM draft_revision_note_blocks WHERE chapter_id = $1 AND syllabus_node_id IS NOT NULL ORDER BY syllabus_node_id, sequence_number',
        [chapterId]
      );
      await pool.query(
        'DELETE FROM revision_note_blocks WHERE syllabus_node_id IN (SELECT id FROM syllabus_nodes WHERE chapter_id = $1)',
        [chapterId]
      );
      let inserted = 0;
      for (const b of draftBlocks.rows) {
        if (!b.syllabus_node_id) continue;
        await pool.query(
          'INSERT INTO revision_note_blocks (syllabus_node_id, sequence_number, content_html) VALUES ($1, $2, $3)',
          [b.syllabus_node_id, b.sequence_number, b.content_html]
        );
        inserted++;
      }
      console.log('Published revision notes for chapter', chapterId, '→', inserted, 'blocks');
    } else if (contentType === 'notes') {
      const draftBlocks = await pool.query<{ id: string; draft_syllabus_node_id: string; sequence_number: number; content_html: string }>(
        `SELECT b.id, b.draft_syllabus_node_id, b.sequence_number, b.content_html
         FROM draft_note_blocks b
         JOIN draft_syllabus_nodes n ON n.id = b.draft_syllabus_node_id
         WHERE n.chapter_id = $1 ORDER BY b.draft_syllabus_node_id, b.sequence_number`,
        [chapterId]
      );
      const draftNodeToPublished = new Map<string, string>();
      const pubNodes = await pool.query<{ id: string; published_syllabus_node_id: string }>(
        'SELECT id, published_syllabus_node_id FROM draft_syllabus_nodes WHERE chapter_id = $1 AND published_syllabus_node_id IS NOT NULL',
        [chapterId]
      );
      for (const r of pubNodes.rows) {
        draftNodeToPublished.set(r.id, r.published_syllabus_node_id);
      }
      await pool.query(
        'DELETE FROM note_blocks WHERE syllabus_node_id IN (SELECT id FROM syllabus_nodes WHERE chapter_id = $1)',
        [chapterId]
      );
      let inserted = 0;
      for (const b of draftBlocks.rows) {
        const publishedNodeId = draftNodeToPublished.get(b.draft_syllabus_node_id);
        if (!publishedNodeId) continue;
        await pool.query(
          'INSERT INTO note_blocks (syllabus_node_id, sequence_number, content_html) VALUES ($1, $2, $3)',
          [publishedNodeId, b.sequence_number, b.content_html]
        );
        inserted++;
      }
      console.log('Published notes for chapter', chapterId, '→', inserted, 'blocks');
    } else if (contentType === 'questions') {
      // Draft questions use syllabus_node_id (published); no mapping needed
      const draftQ = await pool.query<{
        id: string;
        published_question_id: string | null;
        syllabus_node_id: string | null;
        question_text: string;
        question_type: string;
        discipline: string;
        difficulty_level: number;
        answer_input_type: string;
        marks: number;
        source_type: string;
        textbook_ref: string | null;
        source_material_url: string | null;
        source_passage_text: string | null;
        scenario_data: unknown;
        correct_option: string | null;
        correct_value: boolean | null;
        model_answer_text: string | null;
        section_label: string | null;
      }>('SELECT id, published_question_id, syllabus_node_id, question_text, question_type, discipline, difficulty_level, answer_input_type, marks, source_type, textbook_ref, source_material_url, source_passage_text, scenario_data, correct_option, correct_value, model_answer_text, section_label FROM draft_questions WHERE chapter_id = $1 AND ready_to_publish = true AND syllabus_node_id IS NOT NULL ORDER BY id', [chapterId]);
      const draftR = await pool.query<{ draft_question_id: string; rubric_version: number; rubric_json: unknown }>(
        'SELECT r.draft_question_id, r.rubric_version, r.rubric_json FROM draft_rubrics r JOIN draft_questions q ON q.id = r.draft_question_id WHERE q.chapter_id = $1 AND q.ready_to_publish = true ORDER BY r.draft_question_id',
        [chapterId]
      );
      const rubricByDraftQ = new Map<string, { rubric_version: number; rubric_json: unknown }>();
      for (const r of draftR.rows) {
        rubricByDraftQ.set(r.draft_question_id, { rubric_version: r.rubric_version, rubric_json: r.rubric_json });
      }
      let qCount = 0;
      for (const q of draftQ.rows) {
        const syllabusNodeId = q.syllabus_node_id;
        const scenarioJson = q.scenario_data != null ? JSON.stringify(q.scenario_data) : null;
        const rub = rubricByDraftQ.get(q.id);
        const rubricJson = rub && typeof rub.rubric_json === 'object' && rub.rubric_json !== null ? JSON.stringify(rub.rubric_json) : '{}';

        if (q.published_question_id) {
          await pool.query(
            `UPDATE questions SET syllabus_node_id = $1, question_text = $2, question_type = $3, discipline = $4, difficulty_level = $5, answer_input_type = $6, marks = $7, source_type = $8, textbook_ref = $9, source_material_url = $10, source_passage_text = $11, scenario_data = $12, correct_option = $13, correct_value = $14, model_answer_text = $15, section_label = $16
             WHERE id = $17`,
            [syllabusNodeId, q.question_text, q.question_type, q.discipline, q.difficulty_level, q.answer_input_type, q.marks, q.source_type, q.textbook_ref, q.source_material_url, q.source_passage_text, scenarioJson, q.correct_option, q.correct_value, q.model_answer_text, q.section_label, q.published_question_id]
          );
          await pool.query('UPDATE rubrics SET rubric_version = $1, rubric_json = $2 WHERE question_id = $3', [rub ? rub.rubric_version : 2, rubricJson, q.published_question_id]);
          const rCheck = await pool.query('SELECT 1 FROM rubrics WHERE question_id = $1', [q.published_question_id]);
          if (rCheck.rows.length === 0 && rub) {
            await pool.query('INSERT INTO rubrics (question_id, rubric_version, rubric_json) VALUES ($1, $2, $3)', [q.published_question_id, rub.rubric_version, rubricJson]);
          }
        } else {
          const ins = await pool.query<{ id: string }>(
            `INSERT INTO questions (chapter_id, syllabus_node_id, question_text, question_type, discipline, difficulty_level, answer_input_type, marks, source_type, textbook_ref, source_material_url, source_passage_text, scenario_data, correct_option, correct_value, model_answer_text, section_label)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING id`,
            [
              chapterId,
              syllabusNodeId,
              q.question_text,
              q.question_type,
              q.discipline,
              q.difficulty_level,
              q.answer_input_type,
              q.marks,
              q.source_type,
              q.textbook_ref,
              q.source_material_url,
              q.source_passage_text,
              scenarioJson,
              q.correct_option,
              q.correct_value,
              q.model_answer_text,
              q.section_label,
            ]
          );
          const publishedQuestionId = ins.rows[0].id;
          await pool.query('UPDATE draft_questions SET published_question_id = $1 WHERE id = $2', [publishedQuestionId, q.id]);
          await pool.query('INSERT INTO rubrics (question_id, rubric_version, rubric_json) VALUES ($1, $2, $3)', [
            publishedQuestionId,
            rub ? rub.rubric_version : 2,
            rubricJson,
          ]);
        }
        qCount++;
      }
      console.log('Published questions for chapter', chapterId, '→', qCount, 'questions (incremental)');
    }

    await pool.query(
      "UPDATE curation_items SET status = 'published', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
      [id]
    );
  }

  console.log('Publish done. Items published:', items.rows.length);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
