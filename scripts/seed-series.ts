const BROWSE_BASE = 'https://beta.asurascans.com/browse';
const HEADERS = { 'User-Agent': 'AsuraTracker/1.0' };

interface ScrapedSeries {
  asuraId: number;
  slug: string;
  title: string;
  cover: string;
}

async function scrapeBrowsePage(page: number): Promise<ScrapedSeries[]> {
  const res = await fetch(`${BROWSE_BASE}?page=${page}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`Browse page ${page} returned ${res.status}`);
  const html = await res.text();

  const series: ScrapedSeries[] = [];
  const cardRegex = /data-series-id="(\d+)"[^>]*>.*?href="\/comics\/([^"]+)".*?src="(https:\/\/cdn[^"]*)".*?alt="([^"]*)"/gs;

  let match;
  while ((match = cardRegex.exec(html)) !== null) {
    const [, asuraId, fullSlug, cover, title] = match;
    const slug = fullSlug.replace(/-[a-f0-9]{8}$/, '');
    series.push({ asuraId: parseInt(asuraId), slug, title, cover });
  }

  return series;
}

async function seed() {
  const allSeries = new Map<number, ScrapedSeries>();

  for (let page = 1; page <= 20; page++) {
    const series = await scrapeBrowsePage(page);
    if (series.length === 0) break;

    for (const s of series) {
      if (!allSeries.has(s.asuraId)) {
        allSeries.set(s.asuraId, s);
      }
    }

    process.stderr.write(`Page ${page}: ${series.length} series (total: ${allSeries.size})\n`);
    await new Promise(r => setTimeout(r, 300));
  }

  // Generate batched INSERT statements
  const entries = Array.from(allSeries.values());
  const batchSize = 20;

  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = entries.slice(i, i + batchSize);
    const values = batch.map(s => {
      const title = s.title.replace(/'/g, "''");
      const slug = s.slug.replace(/'/g, "''");
      const cover = s.cover.replace(/'/g, "''");
      return `(${s.asuraId}, '${slug}', '${title}', '${cover}', 0, datetime('now'))`;
    });
    console.log(`INSERT OR REPLACE INTO series (asura_id, slug, title, cover_url, latest_chapter, last_checked) VALUES ${values.join(', ')};`);
  }

  process.stderr.write(`\nGenerated SQL for ${entries.length} series\n`);
}

seed().catch(console.error);
