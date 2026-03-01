import type { APIRoute } from 'astro';
import { getDb } from '../../lib/db';

export const POST: APIRoute = async ({ request, locals }) => {
  const db = getDb(locals);
  const { series_id, subscribed } = await request.json();

  if (subscribed) {
    await db.prepare(
      'INSERT OR IGNORE INTO subscriptions (user_id, series_id) VALUES (1, ?)'
    ).bind(series_id).run();
  } else {
    await db.prepare(
      'DELETE FROM subscriptions WHERE user_id = 1 AND series_id = ?'
    ).bind(series_id).run();
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
