import type { APIRoute } from 'astro';
import { getDb } from '../../lib/db';

export const GET: APIRoute = async ({ locals }) => {
  const db = getDb(locals);

  const series = await db.prepare(`
    SELECT s.*,
      CASE WHEN sub.id IS NOT NULL THEN 1 ELSE 0 END as subscribed
    FROM series s
    LEFT JOIN subscriptions sub ON sub.series_id = s.id AND sub.user_id = 1
    ORDER BY s.title ASC
  `).all();

  return new Response(JSON.stringify(series.results), {
    headers: { 'Content-Type': 'application/json' },
  });
};
