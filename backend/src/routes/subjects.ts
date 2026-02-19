import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { query } from '../db.js';

type SubjectsQuery = { board?: string; grade?: string; student_id?: string };
type SubjectIdParams = { id: string };

export default async function subjectsRoutes(app: FastifyInstance) {
  app.get<{ Querystring: SubjectsQuery }>('/subjects', async (req: FastifyRequest<{ Querystring: SubjectsQuery }>, reply: FastifyReply) => {
    const { board, grade, student_id } = req.query;
    if (!board || !grade) {
      return reply.status(400).send({ error: 'board and grade are required' });
    }
    const gradeNum = parseInt(grade, 10);
    if (Number.isNaN(gradeNum)) {
      return reply.status(400).send({ error: 'grade must be a number' });
    }
    const res = await query<{ id: string; name: string; board: string; grade_level: number }>(
      'SELECT id, name, board, grade_level FROM subjects WHERE board = $1 AND grade_level = $2 ORDER BY name',
      [board, gradeNum]
    );
    const subjects = res.rows.map((row) => ({
      id: row.id,
      name: row.name,
      board: row.board,
      grade_level: row.grade_level,
      is_selected: false,
      is_subscribed: false,
    }));
    if (student_id) {
      let selectedIds = new Set<string>();
      let subscribedIds = new Set<string>();
      try {
        const selectedRes = await query<{ subject_id: string }>(
          'SELECT subject_id FROM student_subjects WHERE student_id = $1',
          [student_id]
        );
        selectedIds = new Set(selectedRes.rows.map((r) => r.subject_id));
      } catch {
        // student_subjects table may not exist yet
      }
      try {
        const subRes = await query<{ subject_id: string }>(
          'SELECT subject_id FROM subscription_items WHERE student_id = $1',
          [student_id]
        );
        subscribedIds = new Set(subRes.rows.map((r) => r.subject_id));
      } catch {
        // subscription_items may not exist
      }
      subjects.forEach((s) => {
        (s as Record<string, unknown>).is_selected = selectedIds.has(s.id);
        (s as Record<string, unknown>).is_subscribed = subscribedIds.has(s.id);
      });
    }
    return reply.send({ subjects });
  });

  app.get<{ Params: SubjectIdParams }>('/subjects/:id/chapters', async (req: FastifyRequest<{ Params: SubjectIdParams }>, reply: FastifyReply) => {
    const { id: subjectId } = req.params;
    const chaptersRes = await query<{ id: string; title: string; sequence_number: number; discipline: string | null }>(
      `SELECT id, title, sequence_number, discipline FROM chapters WHERE subject_id = $1
       ORDER BY (CASE WHEN discipline = 'history' THEN 0 WHEN discipline = 'civics' THEN 1 ELSE 2 END), sequence_number`,
      [subjectId]
    );
    const chapters = chaptersRes.rows;
    const topicsRes = await query<{ id: string; chapter_id: string; title: string; sequence_number: number }>(
      'SELECT id, chapter_id, title, sequence_number FROM topics WHERE chapter_id = ANY($1::uuid[]) ORDER BY chapter_id, sequence_number',
      [chapters.map((c) => c.id)]
    );
    const topicIds = topicsRes.rows.map((t) => t.id);
    const microRes = topicIds.length > 0
      ? await query<{ id: string; topic_id: string; title: string; sequence_number: number }>(
          'SELECT id, topic_id, title, sequence_number FROM micro_topics WHERE topic_id = ANY($1::uuid[]) ORDER BY topic_id, sequence_number',
          [topicIds]
        )
      : { rows: [] as { id: string; topic_id: string; title: string; sequence_number: number }[] };
    const microByTopic = new Map<string, { id: string; title: string; sequence_number: number }[]>();
    for (const m of microRes.rows) {
      const list = microByTopic.get(m.topic_id) ?? [];
      list.push({ id: m.id, title: m.title, sequence_number: m.sequence_number });
      microByTopic.set(m.topic_id, list);
    }
    const topicsByChapter = new Map<string, { id: string; title: string; sequence_number: number; micro_topics: { id: string; title: string; sequence_number: number }[] }[]>();
    for (const t of topicsRes.rows) {
      const list = topicsByChapter.get(t.chapter_id) ?? [];
      list.push({
        id: t.id,
        title: t.title,
        sequence_number: t.sequence_number,
        micro_topics: microByTopic.get(t.id) ?? [],
      });
      topicsByChapter.set(t.chapter_id, list);
    }
    const result = chapters.map((ch) => ({
      id: ch.id,
      title: ch.title,
      sequence_number: ch.sequence_number,
      discipline: ch.discipline ?? null,
      topics: topicsByChapter.get(ch.id) ?? [],
    }));
    return reply.send({ chapters: result });
  });
}
