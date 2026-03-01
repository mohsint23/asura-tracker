import type { APIRoute } from 'astro';
import { getDb } from '../../lib/db';

export const GET: APIRoute = async ({ locals }) => {
  const db = getDb(locals);
  const user = await db.prepare('SELECT * FROM users WHERE id = 1').first();
  return new Response(JSON.stringify(user), {
    headers: { 'Content-Type': 'application/json' },
  });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const db = getDb(locals);
  const { email, check_schedule } = await request.json();

  await db.prepare(
    `INSERT INTO users (id, email, check_schedule) VALUES (1, ?, ?)
     ON CONFLICT(id) DO UPDATE SET email = excluded.email, check_schedule = excluded.check_schedule`
  ).bind(email, check_schedule).run();

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
