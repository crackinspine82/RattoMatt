/**
 * Admin panel API: books, chapters, published-chapters, jobs.
 * All routes require admin auth (Bearer token).
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { requireAdminAuth } from './admin-auth.js';
import { getPool } from '../db.js';
import { getJobQueue } from '../services/job-queue.js';
import { getStructureImagesForItem } from '../services/curation-structure-images.js';
import { publishCurationItems } from '../services/curation-publish.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const DOCS = path.join(ROOT, '..', 'docs');
const BOOKS = path.join(ROOT, '..', 'Books', 'ICSE');

function loadPublications(): Array<{ grade: number; subject: string; book_slug: string; book_name: string }> {
  const p = path.join(DOCS, 'icse_publications.json');
  if (!fs.existsSync(p)) return [];
  const raw = fs.readFileSync(p, 'utf8');
  const data = JSON.parse(raw) as { publications?: Array<{ grade: number; subject: string; book_slug: string; book_name: string }> };
  return data.publications ?? [];
}

function getBookFolders(): Array<{ pub: { grade: number; subject: string; book_slug: string; book_name: string }; dir: string }> {
  const publications = loadPublications();
  const folders: Array<{ pub: (typeof publications)[0]; dir: string }> = [];
  for (const pub of publications) {
    const dir = path.join(BOOKS, String(pub.grade), pub.subject, pub.book_slug);
    if (fs.existsSync(dir)) folders.push({ pub, dir });
  }
  return folders;
}

function parseChapterFilename(name: string): { sequenceNumber: number; discipline: string | null; title: string } | null {
  if (!name.endsWith('.pdf')) return null;
  if (name.startsWith('Cover')) return null;
  const base = name.slice(0, -4).trim();
  const dashIdx = base.indexOf(' - ');
  if (dashIdx === -1) return null;
  const left = base.slice(0, dashIdx).trim();
  const title = base.slice(dashIdx + 3).trim();
  const multiMatch = left.match(/^([A-Za-z]+)_(\d+)$/);
  if (multiMatch) {
    return { sequenceNumber: parseInt(multiMatch[2], 10), discipline: multiMatch[1].toLowerCase(), title };
  }
  const numMatch = left.match(/^(\d+)$/);
  if (numMatch) {
    return { sequenceNumber: parseInt(numMatch[1], 10), discipline: null, title };
  }
  return null;
}

function listChapterPdfs(dir: string): Array<{ sequenceNumber: number; discipline: string | null; title: string; name: string }> {
  if (!fs.existsSync(dir)) return [];
  const names = fs.readdirSync(dir);
  const entries: Array<{ sequenceNumber: number; discipline: string | null; title: string; name: string }> = [];
  for (const name of names) {
    const parsed = parseChapterFilename(name);
    if (parsed) entries.push({ ...parsed, name });
  }
  entries.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  return entries;
}

export default async function adminRoutes(app: FastifyInstance) {
  const adminOnly = { preHandler: [requireAdminAuth] };

  app.get('/admin/books', adminOnly, async (_req: FastifyRequest, reply: FastifyReply) => {
    const folders = getBookFolders();
    const books = folders.map(({ pub }) => ({
      book_slug: pub.book_slug,
      book_name: pub.book_name,
      grade: pub.grade,
      subject: pub.subject,
    }));
    return reply.send({ books });
  });

  app.get<{ Params: { bookId: string } }>(
    '/admin/books/:bookId/chapters',
    adminOnly,
    async (req: FastifyRequest<{ Params: { bookId: string } }>, reply: FastifyReply) => {
      const bookSlug = req.params.bookId;
      const folders = getBookFolders().filter((f) => f.pub.book_slug === bookSlug);
      if (folders.length === 0) {
        return reply.status(404).send({ error: 'Book not found' });
      }
      const chapters = listChapterPdfs(folders[0].dir);
      return reply.send({
        book_slug: bookSlug,
        chapters: chapters.map((c) => ({
          sequence_number: c.sequenceNumber,
          discipline: c.discipline,
          title: c.title,
          filename: c.name,
        })),
      });
    }
  );

  app.get('/admin/published-chapters', adminOnly, async (_req: FastifyRequest, reply: FastifyReply) => {
    const pool = getPool();
    const res = await pool.query<{
      chapter_id: string;
      chapter_title: string;
      chapter_sequence_number: number;
      subject_name: string;
      grade_level: number;
      discipline: string | null;
    }>(
      `SELECT c.id AS chapter_id, c.title AS chapter_title, c.sequence_number AS chapter_sequence_number,
              s.name AS subject_name, s.grade_level AS grade_level, c.discipline
       FROM chapters c
       JOIN subjects s ON s.id = c.subject_id
       WHERE EXISTS (
         SELECT 1 FROM curation_items ci
         WHERE ci.chapter_id = c.id AND ci.content_type = 'structure' AND ci.status = 'published'
       )
       ORDER BY s.name, c.sequence_number, c.discipline NULLS FIRST`
    );
    return reply.send({ chapters: res.rows });
  });

  app.get('/admin/jobs', adminOnly, async (req: FastifyRequest<{ Querystring: { status?: string; limit?: string } }>, reply: FastifyReply) => {
    const status = req.query.status as 'queued' | 'running' | 'completed' | 'failed' | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 50;
    const queue = getJobQueue();
    const jobs = await queue.listJobs({
      status: status && ['queued', 'running', 'completed', 'failed'].includes(status) ? status : undefined,
      limit: Number.isFinite(limit) ? Math.min(100, Math.max(1, limit)) : 50,
    });
    return reply.send({ jobs });
  });

  app.get<{ Params: { id: string } }>('/admin/jobs/:id', adminOnly, async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const queue = getJobQueue();
    const job = await queue.getJob(req.params.id);
    if (!job) return reply.status(404).send({ error: 'Job not found' });
    return reply.send(job);
  });

  app.post<{
    Body: { job_type: string; payload?: Record<string, unknown> };
  }>(
    '/admin/jobs',
    adminOnly,
    async (req: FastifyRequest<{ Body: { job_type: string; payload?: Record<string, unknown> } }>, reply: FastifyReply) => {
      const { job_type, payload = {} } = req.body ?? {};
      const allowed: Array<string> = ['generate_structure', 'generate_revision_notes', 'generate_question_bank', 'upload_chapter'];
      if (!job_type || !allowed.includes(job_type)) {
        return reply.status(400).send({ error: 'Invalid job_type. Must be one of: ' + allowed.join(', ') });
      }
      const queue = getJobQueue();
      const id = await queue.enqueue(job_type as 'generate_structure' | 'generate_revision_notes' | 'generate_question_bank' | 'upload_chapter', payload);
      const job = await queue.getJob(id);
      return reply.status(201).send(job);
    }
  );

  /** Same data as GET /curation/items/:id/structure-images; for scripts using ADMIN_API_TOKEN. */
  app.get<{ Params: { id: string } }>(
    '/admin/curation/items/:id/structure-images',
    adminOnly,
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const pool = getPool();
      const { id: itemId } = req.params;
      const result = await getStructureImagesForItem(pool, itemId);
      if (result === null) return reply.status(404).send({ error: 'Curation item not found' });
      return reply.send(result);
    }
  );

  app.get('/admin/curation/ready-to-publish', adminOnly, async (_req: FastifyRequest, reply: FastifyReply) => {
    const pool = getPool();
    const res = await pool.query<{
      id: string;
      chapter_id: string;
      content_type: string;
      subject_name: string;
      chapter_title: string;
      chapter_sequence_number: number;
      grade_level: number;
    }>(
      `SELECT ci.id, ci.chapter_id, ci.content_type,
              s.name AS subject_name, c.title AS chapter_title, c.sequence_number AS chapter_sequence_number, s.grade_level AS grade_level
       FROM curation_items ci
       JOIN chapters c ON c.id = ci.chapter_id
       JOIN subjects s ON s.id = c.subject_id
       WHERE ci.status = 'ready_to_publish'
       ORDER BY s.name, c.sequence_number, c.discipline NULLS FIRST, ci.content_type`
    );
    return reply.send({ items: res.rows });
  });

  app.post<{
    Body: { item_ids?: string[]; chapter_ids?: string[] };
  }>(
    '/admin/curation/publish',
    adminOnly,
    async (req: FastifyRequest<{ Body: { item_ids?: string[]; chapter_ids?: string[] } }>, reply: FastifyReply) => {
      const body = req.body ?? {};
      const itemIds = Array.isArray(body.item_ids) ? body.item_ids.filter((id): id is string => typeof id === 'string' && id.length > 0) : [];
      const chapterIds = Array.isArray(body.chapter_ids) ? body.chapter_ids.filter((id): id is string => typeof id === 'string' && id.length > 0) : [];

      if (itemIds.length === 0 && chapterIds.length === 0) {
        return reply.status(400).send({ error: 'Provide item_ids and/or chapter_ids' });
      }

      const pool = getPool();
      let idsToPublish = new Set<string>(itemIds);

      if (chapterIds.length > 0) {
        const fromChapters = await pool.query<{ id: string }>(
          "SELECT id FROM curation_items WHERE chapter_id = ANY($1::uuid[]) AND status = 'ready_to_publish'",
          [chapterIds]
        );
        fromChapters.rows.forEach((r) => idsToPublish.add(r.id));
      }

      const result = await publishCurationItems(pool, [...idsToPublish]);
      return reply.send({ published: result.published, item_ids: result.item_ids });
    }
  );
}
