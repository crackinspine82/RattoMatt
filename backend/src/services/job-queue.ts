/**
 * Admin job queue: pluggable interface with DB-backed implementation.
 * One worker processes one job at a time. Swap to Redis later via same interface.
 */

import { getPool } from '../db.js';

export type JobType = 'generate_structure' | 'generate_revision_notes' | 'generate_question_bank' | 'upload_chapter';

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface AdminJob {
  id: string;
  job_type: JobType;
  status: JobStatus;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error_message: string | null;
  log_output: string | null;
  created_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
  progress_pct: number | null;
  progress_message: string | null;
  estimated_finished_at: Date | null;
}

export interface JobQueueService {
  enqueue(jobType: JobType, payload: Record<string, unknown>): Promise<string>;
  getJob(id: string): Promise<AdminJob | null>;
  listJobs(filters?: { status?: JobStatus; limit?: number }): Promise<AdminJob[]>;
  setRunning(id: string): Promise<void>;
  setProgress(id: string, progressPct: number, progressMessage?: string): Promise<void>;
  setEstimatedFinishedAt(id: string, at: Date): Promise<void>;
  setCompleted(id: string, result: Record<string, unknown>, logOutput?: string): Promise<void>;
  setFailed(id: string, errorMessage: string, logOutput?: string): Promise<void>;
  getNextQueued(): Promise<AdminJob | null>;
  /** Reset any jobs stuck in 'running' (e.g. after worker restart) back to 'queued' so they are picked up again. */
  resetStaleRunningJobs(): Promise<number>;
}

const rowToJob = (r: {
  id: string;
  job_type: string;
  status: string;
  payload: unknown;
  result: unknown;
  error_message: string | null;
  log_output: string | null;
  created_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
  progress_pct?: number | null;
  progress_message?: string | null;
  estimated_finished_at?: Date | null;
}): AdminJob => ({
  id: r.id,
  job_type: r.job_type as JobType,
  status: r.status as JobStatus,
  payload: (r.payload as Record<string, unknown>) ?? {},
  result: (r.result as Record<string, unknown>) ?? null,
  error_message: r.error_message,
  log_output: r.log_output,
  created_at: r.created_at,
  started_at: r.started_at,
  finished_at: r.finished_at,
  progress_pct: r.progress_pct ?? null,
  progress_message: r.progress_message ?? null,
  estimated_finished_at: r.estimated_finished_at ?? null,
});

export function createDbJobQueue(): JobQueueService {
  const pool = getPool();

  return {
    async enqueue(jobType: JobType, payload: Record<string, unknown>): Promise<string> {
      const res = await pool.query<{ id: string }>(
        `INSERT INTO admin_jobs (job_type, status, payload) VALUES ($1, 'queued', $2) RETURNING id`,
        [jobType, JSON.stringify(payload)]
      );
      return res.rows[0].id;
    },

    async getJob(id: string): Promise<AdminJob | null> {
      const res = await pool.query(
        `SELECT id, job_type, status, payload, result, error_message, log_output, created_at, started_at, finished_at,
                progress_pct, progress_message, estimated_finished_at
         FROM admin_jobs WHERE id = $1`,
        [id]
      );
      if (res.rows.length === 0) return null;
      return rowToJob(res.rows[0] as Parameters<typeof rowToJob>[0]);
    },

    async listJobs(filters?: { status?: JobStatus; limit?: number }): Promise<AdminJob[]> {
      let sql = `SELECT id, job_type, status, payload, result, error_message, log_output, created_at, started_at, finished_at,
                        progress_pct, progress_message, estimated_finished_at
                 FROM admin_jobs`;
      const params: unknown[] = [];
      if (filters?.status) {
        params.push(filters.status);
        sql += ` WHERE status = $${params.length}`;
      }
      sql += ` ORDER BY created_at DESC`;
      const limit = filters?.limit ?? 50;
      params.push(limit);
      sql += ` LIMIT $${params.length}`;

      const res = await pool.query(sql, params);
      return res.rows.map((r) => rowToJob(r as Parameters<typeof rowToJob>[0]));
    },

    async setRunning(id: string): Promise<void> {
      await pool.query(
        `UPDATE admin_jobs SET status = 'running', started_at = COALESCE(started_at, CURRENT_TIMESTAMP) WHERE id = $1`,
        [id]
      );
    },

    async setProgress(id: string, progressPct: number, progressMessage?: string): Promise<void> {
      await pool.query(
        `UPDATE admin_jobs SET progress_pct = $2, progress_message = COALESCE($3, progress_message) WHERE id = $1`,
        [id, Math.min(100, Math.max(0, progressPct)), progressMessage ?? null]
      );
    },

    async setEstimatedFinishedAt(id: string, at: Date): Promise<void> {
      await pool.query(`UPDATE admin_jobs SET estimated_finished_at = $2 WHERE id = $1`, [id, at]);
    },

    async setCompleted(id: string, result: Record<string, unknown>, logOutput?: string): Promise<void> {
      await pool.query(
        `UPDATE admin_jobs SET status = 'completed', result = $2, finished_at = CURRENT_TIMESTAMP, log_output = COALESCE($3, log_output),
         progress_pct = 100, progress_message = NULL, estimated_finished_at = NULL WHERE id = $1`,
        [id, JSON.stringify(result), logOutput ?? null]
      );
    },

    async setFailed(id: string, errorMessage: string, logOutput?: string): Promise<void> {
      await pool.query(
        `UPDATE admin_jobs SET status = 'failed', error_message = $2, finished_at = CURRENT_TIMESTAMP, log_output = COALESCE($3, log_output),
         progress_pct = NULL, progress_message = NULL, estimated_finished_at = NULL WHERE id = $1`,
        [id, errorMessage, logOutput ?? null]
      );
    },

    async getNextQueued(): Promise<AdminJob | null> {
      const res = await pool.query(
        `SELECT id, job_type, status, payload, result, error_message, log_output, created_at, started_at, finished_at,
                progress_pct, progress_message, estimated_finished_at
         FROM admin_jobs WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1`
      );
      if (res.rows.length === 0) return null;
      return rowToJob(res.rows[0] as Parameters<typeof rowToJob>[0]);
    },

    async resetStaleRunningJobs(): Promise<number> {
      const res = await pool.query(
        `UPDATE admin_jobs SET status = 'queued', started_at = NULL, progress_pct = NULL, progress_message = NULL, estimated_finished_at = NULL
         WHERE status = 'running' RETURNING id`
      );
      return res.rowCount ?? 0;
    },
  };
}

let defaultQueue: JobQueueService | null = null;

export function getJobQueue(): JobQueueService {
  if (!defaultQueue) defaultQueue = createDbJobQueue();
  return defaultQueue;
}
