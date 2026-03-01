import { fetchAllSeries } from '../src/lib/asura-api';

async function seed() {
  const series = await fetchAllSeries();

  const statements: string[] = [];
  for (const s of series) {
    const latestChapter = s.latest_chapters?.[0]?.number ?? 0;
    const title = s.title.replace(/'/g, "''");
    statements.push(
      `INSERT OR REPLACE INTO series (asura_id, slug, title, cover_url, latest_chapter, last_checked) VALUES (${s.id}, '${s.slug}', '${title}', '${s.cover}', ${latestChapter}, datetime('now'));`
    );
  }

  console.log(statements.join('\n'));
}

seed().catch(console.error);
