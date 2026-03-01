export interface AsuraChapter {
  id: number;
  series_id: number;
  number: number;
  slug: string;
  is_premium: boolean;
  published_at: string;
  early_access_until?: string;
}

export interface AsuraSeries {
  id: number;
  slug: string;
  title: string;
  cover: string;
  status: string;
  type: string;
  chapter_count: number;
  last_chapter_at: string;
  public_url: string;
  latest_chapters: AsuraChapter[];
}

interface SeriesListResponse {
  data: AsuraSeries[];
  meta: {
    total: number;
    per_page: number;
    has_more: boolean;
  };
}

const API_BASE = 'https://api.asurascans.com';

export async function fetchSeriesPage(page: number = 1): Promise<SeriesListResponse> {
  const res = await fetch(`${API_BASE}/api/series?page=${page}`);
  if (!res.ok) throw new Error(`AsuraScans API error: ${res.status}`);
  return res.json();
}

export async function fetchAllSeries(): Promise<AsuraSeries[]> {
  const all: AsuraSeries[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const response = await fetchSeriesPage(page);
    all.push(...response.data);
    hasMore = response.meta.has_more;
    page++;
    // Small delay to avoid hammering
    await new Promise(r => setTimeout(r, 200));
  }

  return all;
}

export async function fetchSeriesChapters(slug: string): Promise<AsuraChapter[]> {
  const res = await fetch(`${API_BASE}/api/series/${slug}/chapters`);
  if (!res.ok) throw new Error(`AsuraScans API error: ${res.status}`);
  const data = await res.json();
  return data.data;
}
