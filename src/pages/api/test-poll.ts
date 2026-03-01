import type { APIRoute } from 'astro';
import { getDb } from '../../lib/db';
import { sendUpdateEmail } from '../../lib/notify';

export const POST: APIRoute = async ({ locals }) => {
  const db = getDb(locals);
  const env = locals.runtime.env;

  // Get user email
  const user = await db.prepare('SELECT email FROM users WHERE id = 1').first<{ email: string }>();
  if (!user?.email || user.email === 'placeholder@example.com') {
    return new Response(JSON.stringify({ error: 'Set your email in Settings first' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Get a random subscribed series to fake an update
  const sub = await db.prepare(`
    SELECT s.title, s.latest_chapter, s.cover_url, s.slug FROM series s
    INNER JOIN subscriptions sub ON sub.series_id = s.id
    WHERE sub.user_id = 1
    ORDER BY RANDOM() LIMIT 1
  `).first<{ title: string; latest_chapter: number; cover_url: string | null; slug: string }>();

  if (!sub) {
    return new Response(JSON.stringify({ error: 'Subscribe to at least one series first' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Send a test email with a fake chapter update
  const fakeChapter = sub.latest_chapter + 1;
  try {
    await sendUpdateEmail(
      env.RESEND_API_KEY,
      `AsuraTracker <${env.NOTIFICATION_EMAIL}>`,
      user.email,
      [{
        seriesTitle: sub.title,
        chapterNumber: fakeChapter,
        readUrl: `https://asurascans.com/comics/${sub.slug}`,
        coverUrl: sub.cover_url ?? undefined,
      }]
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: `Email failed: ${err.message}` }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({
    ok: true,
    message: `Test email sent to ${user.email}`,
    series: sub.title,
    fakeChapter,
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
