#!/usr/bin/env node
/**
 * Create an SME user for the curation app (admin-created account).
 * Run from backend/: npm run seed:sme-user -- [email] [password]
 * Example: npm run seed:sme-user -- sme@example.com mypassword
 */

import 'dotenv/config';
import { createSmeUser } from '../src/routes/curation-auth.js';

async function main(): Promise<void> {
  const email = process.argv[2] ?? process.env.SME_EMAIL ?? 'sme@example.com';
  const password = process.argv[3] ?? process.env.SME_PASSWORD ?? 'changeme';
  const id = await createSmeUser(email, password);
  if (id) {
    console.log('SME user created or already exists:', email, '→', id);
  } else {
    console.log('SME user already exists:', email);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
