import { fetchSeriesPage, type AsuraSeries } from './asura-api';
import { sendUpdateEmail } from './notify';

interface PollResult {
  updatedSeries: number;
  notificationsSent: number;
}

export async function pollForUpdates(db: D1Database, env: { RESEND_API_KEY: string; NOTIFICATION_EMAIL: string }): Promise<PollResult> {
  const result: PollResult = { updatedSeries: 0, notificationsSent: 0 };

  // Fetch first few pages of latest updates (sorted by last_chapter_at desc)
  const recentSeries: AsuraSeries[] = [];
  for (let page = 1; page <= 3; page++) {
    const response = await fetchSeriesPage(page);
    recentSeries.push(...response.data);
    if (!response.meta.has_more) break;
    await new Promise(r => setTimeout(r, 200));
  }

  // Get all tracked series from DB
  const tracked = await db.prepare(
    'SELECT id, asura_id, slug, title, latest_chapter FROM series'
  ).all<{ id: number; asura_id: number; slug: string; title: string; latest_chapter: number }>();

  if (!tracked.results || tracked.results.length === 0) return result;

  const trackedMap = new Map(tracked.results.map(s => [s.asura_id, s]));

  // Find updates
  const updates: { seriesTitle: string; chapterNumber: number; readUrl: string; dbSeriesId: number; }[] = [];

  for (const apiSeries of recentSeries) {
    const dbSeries = trackedMap.get(apiSeries.id);
    if (!dbSeries) continue;

    const latestChapter = apiSeries.latest_chapters?.[0];
    if (!latestChapter) continue;

    if (latestChapter.number > dbSeries.latest_chapter) {
      updates.push({
        seriesTitle: dbSeries.title,
        chapterNumber: latestChapter.number,
        readUrl: `https://asurascans.com${apiSeries.public_url}`,
        dbSeriesId: dbSeries.id,
      });

      // Update DB
      await db.prepare(
        'UPDATE series SET latest_chapter = ?, last_checked = datetime(\'now\') WHERE id = ?'
      ).bind(latestChapter.number, dbSeries.id).run();

      result.updatedSeries++;
    }
  }

  if (updates.length === 0) return result;

  // Get all users subscribed to updated series
  const seriesIds = updates.map(u => u.dbSeriesId);
  const placeholders = seriesIds.map(() => '?').join(',');

  const subscribers = await db.prepare(
    `SELECT DISTINCT u.email, u.id as user_id FROM users u
     INNER JOIN subscriptions s ON s.user_id = u.id
     WHERE s.series_id IN (${placeholders})`
  ).bind(...seriesIds).all<{ email: string; user_id: number }>();

  if (!subscribers.results || subscribers.results.length === 0) return result;

  // For each user, send only the updates they're subscribed to
  for (const user of subscribers.results) {
    const userSubs = await db.prepare(
      `SELECT series_id FROM subscriptions WHERE user_id = ? AND series_id IN (${placeholders})`
    ).bind(user.user_id, ...seriesIds).all<{ series_id: number }>();

    const userSubIds = new Set(userSubs.results?.map(s => s.series_id) ?? []);
    const userUpdates = updates.filter(u => userSubIds.has(u.dbSeriesId));

    if (userUpdates.length > 0) {
      await sendUpdateEmail(
        env.RESEND_API_KEY,
        `AsuraTracker <${env.NOTIFICATION_EMAIL}>`,
        user.email,
        userUpdates
      );
      result.notificationsSent++;
    }
  }

  return result;
}
