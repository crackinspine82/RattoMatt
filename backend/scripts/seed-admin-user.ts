/**
 * Create an admin user for the admin panel.
 * Run from backend/: npm run seed:admin-user -- [email] [password]
 * Example: npm run seed:admin-user -- admin@example.com mySecurePassword
 */

import 'dotenv/config';
import { createAdminUser } from '../src/routes/admin-auth.js';

async function main(): Promise<void> {
  const email = process.argv[2] ?? process.env.ADMIN_EMAIL ?? 'admin@example.com';
  const password = process.argv[3] ?? process.env.ADMIN_PASSWORD ?? 'changeme';
  const id = await createAdminUser(email, password);
  if (id) {
    console.log('Admin user created or already exists:', email, '→', id);
  } else {
    console.log('Admin user already exists:', email);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
