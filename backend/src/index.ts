import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import subjectsRoutes from './routes/subjects.js';
import remindersRoutes from './routes/reminders.js';
import curationAuthRoutes from './routes/curation-auth.js';
import curationRoutes from './routes/curation.js';

const app = Fastify({ logger: true });

const uploadsDir = path.join(process.cwd(), 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

await app.register(cors, { origin: true });
await app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB
await app.register(fastifyStatic, { root: uploadsDir, prefix: '/uploads/' });
await app.register(subjectsRoutes);
await app.register(remindersRoutes);
await app.register(curationAuthRoutes);
await app.register(curationRoutes);

const port = parseInt(process.env.PORT ?? '3000', 10);
await app.listen({ port, host: '0.0.0.0' });
console.log(`API listening on http://localhost:${port}`);
