import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { query } from '../db.js';

type CreateBody = {
  student_id: string;
  type: 'test_schedule' | 'grading';
  subject_id?: string;
  paper_id?: string;
  config_snapshot?: Record<string, unknown>;
  reminder_date: string;
};

type ListQuery = { student_id?: string; status?: string };
type IdParams = { id: string };
type PatchBody = { status: 'dismissed' | 'triggered' };

export default async function remindersRoutes(app: FastifyInstance) {
  app.post<{ Body: CreateBody }>('/reminders', async (req: FastifyRequest<{ Body: CreateBody }>, reply: FastifyReply) => {
    const { student_id, type, subject_id, paper_id, config_snapshot, reminder_date } = req.body;
    if (!student_id || !type || !reminder_date) {
      return reply.status(400).send({ error: 'student_id, type, and reminder_date are required' });
    }
    if (type === 'test_schedule' && !subject_id) {
      return reply.status(400).send({ error: 'subject_id required for test_schedule' });
    }
    if (type === 'grading' && !paper_id) {
      return reply.status(400).send({ error: 'paper_id required for grading' });
    }
    const res = await query<{ id: string }>(
      `INSERT INTO scheduled_reminders (student_id, type, subject_id, paper_id, config_snapshot, reminder_date)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::date)
       RETURNING id`,
      [student_id, type, type === 'test_schedule' ? subject_id : null, type === 'grading' ? paper_id : null, JSON.stringify(config_snapshot ?? {}), reminder_date]
    );
    const id = res.rows[0]?.id;
    return reply.status(201).send({ id });
  });

  app.get<{ Querystring: ListQuery }>('/reminders', async (req: FastifyRequest<{ Querystring: ListQuery }>, reply: FastifyReply) => {
    const { student_id, status = 'scheduled' } = req.query;
    if (!student_id) {
      return reply.status(400).send({ error: 'student_id is required' });
    }
    const res = await query(
      `SELECT id, student_id, type, subject_id, paper_id, config_snapshot, reminder_date, status, created_at
       FROM scheduled_reminders WHERE student_id = $1 AND status = $2 ORDER BY reminder_date`,
      [student_id, status]
    );
    return reply.send({ reminders: res.rows });
  });

  app.get<{ Params: IdParams }>('/reminders/:id', async (req: FastifyRequest<{ Params: IdParams }>, reply: FastifyReply) => {
    const { id } = req.params;
    const res = await query(
      'SELECT id, student_id, type, subject_id, paper_id, config_snapshot, reminder_date, status, created_at FROM scheduled_reminders WHERE id = $1',
      [id]
    );
    if (res.rows.length === 0) return reply.status(404).send({ error: 'Reminder not found' });
    return reply.send(res.rows[0]);
  });

  app.patch<{ Params: IdParams; Body: PatchBody }>('/reminders/:id', async (req: FastifyRequest<{ Params: IdParams; Body: PatchBody }>, reply: FastifyReply) => {
    const { id } = req.params;
    const { status } = req.body;
    if (!status || !['dismissed', 'triggered'].includes(status)) {
      return reply.status(400).send({ error: 'status must be dismissed or triggered' });
    }
    const res = await query(
      'UPDATE scheduled_reminders SET status = $1 WHERE id = $2 RETURNING id',
      [status, id]
    );
    if (res.rows.length === 0) return reply.status(404).send({ error: 'Reminder not found' });
    return reply.send({ id, status });
  });
}
