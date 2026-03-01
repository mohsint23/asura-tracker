# AsuraTracker Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a release notification service that polls AsuraScans' API and emails users when new chapters drop for their subscribed series.

**Architecture:** Astro SSR app on Cloudflare Pages with D1 (SQLite) database. Scheduled Cloudflare Worker polls `api.asurascans.com/api/series` hourly, compares against stored chapter data, and sends batched email notifications via Resend.

**Tech Stack:** Astro 5, Cloudflare Pages + D1 + Scheduled Workers, Resend (email), TypeScript

**API Base:** `https://api.asurascans.com`

**Key Endpoints:**
- `GET /api/series?page={n}` — paginated series list (20/page), sorted by `last_chapter_at` desc, includes `latest_chapters` array
- `GET /api/series/{slug}` — single series detail
- `GET /api/series/{slug}/chapters` — all chapters for a series

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `astro.config.mjs`
- Create: `wrangler.toml`
- Create: `tsconfig.json`
- Create: `src/env.d.ts`

**Step 1: Initialize Astro project**

```bash
cd /Users/mohsinthabit/projects/asura-tracker
npm create astro@latest . -- --template minimal --no-install --no-git --typescript strict
```

**Step 2: Install dependencies**

```bash
npm install @astrojs/cloudflare resend
npm install -D wrangler @cloudflare/workers-types
```

**Step 3: Configure Astro for Cloudflare**

Replace `astro.config.mjs` with:

```javascript
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  output: 'server',
  adapter: cloudflare({
    platformProxy: {
      enabled: true,
    },
  }),
});
```

**Step 4: Configure wrangler.toml**

```toml
name = "asura-tracker"
compatibility_date = "2024-12-01"
pages_build_output_dir = "./dist"

[[d1_databases]]
binding = "DB"
database_name = "asura-tracker-db"
database_id = "local"

[vars]
RESEND_API_KEY = ""
NOTIFICATION_EMAIL = ""
ASURA_API_BASE = "https://api.asurascans.com"

[triggers]
crons = ["0 * * * *"]
```

**Step 5: Add env type definitions**

Update `src/env.d.ts`:

```typescript
/// <reference types="astro/client" />

type D1Database = import('@cloudflare/workers-types').D1Database;

interface Env {
  DB: D1Database;
  RESEND_API_KEY: string;
  NOTIFICATION_EMAIL: string;
  ASURA_API_BASE: string;
}

type Runtime = import('@astrojs/cloudflare').Runtime<Env>;

declare namespace App {
  interface Locals extends Runtime {}
}
```

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: scaffold Astro project with Cloudflare adapter and D1 config"
```

---

## Task 2: Database Schema & Setup

**Files:**
- Create: `schema.sql`
- Create: `src/lib/db.ts`

**Step 1: Write the schema**

Create `schema.sql`:

```sql
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  check_schedule TEXT NOT NULL DEFAULT 'hourly',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS series (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asura_id INTEGER NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  cover_url TEXT,
  latest_chapter REAL NOT NULL DEFAULT 0,
  last_checked TEXT
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  series_id INTEGER NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, series_id)
);
```

**Step 2: Write the DB helper**

Create `src/lib/db.ts`:

```typescript
export function getDb(locals: App.Locals): D1Database {
  return locals.runtime.env.DB;
}

export interface DbUser {
  id: number;
  email: string;
  check_schedule: string;
  created_at: string;
}

export interface DbSeries {
  id: number;
  asura_id: number;
  slug: string;
  title: string;
  cover_url: string | null;
  latest_chapter: number;
  last_checked: string | null;
}

export interface DbSubscription {
  id: number;
  user_id: number;
  series_id: number;
  created_at: string;
}
```

**Step 3: Initialize local D1 database**

```bash
npx wrangler d1 execute asura-tracker-db --local --file=schema.sql
```

**Step 4: Commit**

```bash
git add schema.sql src/lib/db.ts
git commit -m "feat: add database schema and DB helper types"
```

---

## Task 3: AsuraScans API Client

**Files:**
- Create: `src/lib/asura-api.ts`

**Step 1: Define API response types**

Create `src/lib/asura-api.ts`:

```typescript
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
```

**Step 2: Commit**

```bash
git add src/lib/asura-api.ts
git commit -m "feat: add AsuraScans API client with types"
```

---

## Task 4: Email Notification Service

**Files:**
- Create: `src/lib/notify.ts`

**Step 1: Write the notification module**

Create `src/lib/notify.ts`:

```typescript
import { Resend } from 'resend';

interface ChapterUpdate {
  seriesTitle: string;
  chapterNumber: number;
  readUrl: string;
}

export async function sendUpdateEmail(
  apiKey: string,
  fromEmail: string,
  toEmail: string,
  updates: ChapterUpdate[]
): Promise<void> {
  if (updates.length === 0) return;

  const resend = new Resend(apiKey);

  const listItems = updates
    .map(u => `- ${u.seriesTitle} — Chapter ${u.chapterNumber}\n  Read: ${u.readUrl}`)
    .join('\n');

  const subject = updates.length === 1
    ? `New Chapter: ${updates[0].seriesTitle} Ch. ${updates[0].chapterNumber}`
    : `${updates.length} New Chapters Available`;

  await resend.emails.send({
    from: fromEmail,
    to: toEmail,
    subject,
    text: `New chapters are out!\n\n${listItems}\n\nSent by AsuraTracker`,
  });
}
```

**Step 2: Commit**

```bash
git add src/lib/notify.ts
git commit -m "feat: add email notification service via Resend"
```

---

## Task 5: Poller Logic

**Files:**
- Create: `src/lib/poller.ts`

**Step 1: Write the poller**

Create `src/lib/poller.ts`:

```typescript
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
```

**Step 2: Commit**

```bash
git add src/lib/poller.ts
git commit -m "feat: add poller logic to detect new chapters and notify subscribers"
```

---

## Task 6: Scheduled Worker (Cron)

**Files:**
- Create: `src/worker.ts`
- Modify: `wrangler.toml`

**Step 1: Write the scheduled worker**

Create `src/worker.ts`:

```typescript
import { pollForUpdates } from './lib/poller';

export default {
  async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
    const currentHour = new Date(event.scheduledTime).getUTCHours();
    console.log(`[AsuraTracker] Cron fired at UTC hour ${currentHour}`);

    try {
      const result = await pollForUpdates(env.DB, {
        RESEND_API_KEY: env.RESEND_API_KEY,
        NOTIFICATION_EMAIL: env.NOTIFICATION_EMAIL,
      });
      console.log(`[AsuraTracker] Poll complete: ${result.updatedSeries} series updated, ${result.notificationsSent} notifications sent`);
    } catch (error) {
      console.error('[AsuraTracker] Poll failed:', error);
    }
  },
};
```

**Step 2: Commit**

```bash
git add src/worker.ts
git commit -m "feat: add Cloudflare scheduled worker for hourly polling"
```

---

## Task 7: API Routes

**Files:**
- Create: `src/pages/api/series.ts`
- Create: `src/pages/api/subscribe.ts`
- Create: `src/pages/api/settings.ts`

**Step 1: Series list endpoint**

Create `src/pages/api/series.ts`:

```typescript
import type { APIRoute } from 'astro';
import { getDb } from '../../lib/db';

export const GET: APIRoute = async ({ locals }) => {
  const db = getDb(locals);

  // Get all series with subscription status for user ID 1 (single user for now)
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
```

**Step 2: Subscribe toggle endpoint**

Create `src/pages/api/subscribe.ts`:

```typescript
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
```

**Step 3: Settings endpoint**

Create `src/pages/api/settings.ts`:

```typescript
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
```

**Step 4: Commit**

```bash
git add src/pages/api/
git commit -m "feat: add API routes for series, subscriptions, and settings"
```

---

## Task 8: Seed Series Data Script

**Files:**
- Create: `scripts/seed-series.ts`

**Step 1: Write the seed script**

Create `scripts/seed-series.ts`:

```typescript
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

  // Write SQL to stdout for piping to wrangler d1 execute
  console.log(statements.join('\n'));
}

seed().catch(console.error);
```

**Step 2: Add seed npm script to package.json**

Add to `scripts` in `package.json`:

```json
"seed:generate": "npx tsx scripts/seed-series.ts > seed.sql",
"seed:apply": "npx wrangler d1 execute asura-tracker-db --local --file=seed.sql"
```

**Step 3: Commit**

```bash
git add scripts/seed-series.ts
git commit -m "feat: add series seeding script from AsuraScans API"
```

---

## Task 9: Frontend — Main Page Layout

**Files:**
- Create: `src/layouts/Layout.astro`
- Modify: `src/pages/index.astro`

**Step 1: Create base layout**

Create `src/layouts/Layout.astro`:

```astro
---
interface Props {
  title: string;
}
const { title } = Astro.props;
---
<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{title}</title>
</head>
<body>
  <div class="container">
    <header>
      <h1>AsuraTracker</h1>
      <p class="subtitle">Release notifications for AsuraScans</p>
    </header>
    <slot />
  </div>
</body>
</html>

<style is:global>
  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: #0a0a0f;
    color: #e0e0e0;
    min-height: 100vh;
  }

  .container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem;
  }

  header {
    text-align: center;
    margin-bottom: 2rem;
  }

  header h1 {
    font-size: 2rem;
    color: #a855f7;
  }

  .subtitle {
    color: #888;
    margin-top: 0.5rem;
  }
</style>
```

**Step 2: Create the main page**

Replace `src/pages/index.astro`:

```astro
---
import Layout from '../layouts/Layout.astro';
import Settings from '../components/Settings.astro';
import SearchBar from '../components/SearchBar.astro';
import SeriesCard from '../components/SeriesCard.astro';
import { getDb } from '../lib/db';

const db = getDb(Astro.locals);
const series = await db.prepare(`
  SELECT s.*,
    CASE WHEN sub.id IS NOT NULL THEN 1 ELSE 0 END as subscribed
  FROM series s
  LEFT JOIN subscriptions sub ON sub.series_id = s.id AND sub.user_id = 1
  ORDER BY s.title ASC
`).all();
---

<Layout title="AsuraTracker">
  <Settings />
  <SearchBar />
  <div class="series-grid" id="series-grid">
    {series.results?.map((s: any) => (
      <SeriesCard
        id={s.id}
        title={s.title}
        cover={s.cover_url}
        latestChapter={s.latest_chapter}
        subscribed={!!s.subscribed}
      />
    ))}
  </div>
</Layout>

<style>
  .series-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 1.5rem;
    margin-top: 1.5rem;
  }
</style>
```

**Step 3: Commit**

```bash
git add src/layouts/Layout.astro src/pages/index.astro
git commit -m "feat: add base layout and main page with series grid"
```

---

## Task 10: Frontend — Components

**Files:**
- Create: `src/components/SeriesCard.astro`
- Create: `src/components/SearchBar.astro`
- Create: `src/components/Settings.astro`

**Step 1: SeriesCard component**

Create `src/components/SeriesCard.astro`:

```astro
---
interface Props {
  id: number;
  title: string;
  cover: string | null;
  latestChapter: number;
  subscribed: boolean;
}
const { id, title, cover, latestChapter, subscribed } = Astro.props;
---

<div class="card" data-title={title.toLowerCase()} data-series-id={id}>
  <div class="cover">
    {cover ? <img src={cover} alt={title} loading="lazy" /> : <div class="no-cover" />}
    <span class="chapter-badge">Ch. {latestChapter}</span>
  </div>
  <div class="info">
    <span class="title">{title}</span>
    <label class="toggle">
      <input type="checkbox" checked={subscribed} data-series-id={id} />
      <span class="slider"></span>
    </label>
  </div>
</div>

<style>
  .card {
    background: #16161e;
    border-radius: 8px;
    overflow: hidden;
    transition: transform 0.15s;
  }
  .card:hover { transform: translateY(-2px); }

  .cover {
    position: relative;
    aspect-ratio: 3/4;
    overflow: hidden;
  }
  .cover img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .no-cover {
    width: 100%;
    height: 100%;
    background: #2a2a3e;
  }
  .chapter-badge {
    position: absolute;
    bottom: 6px;
    right: 6px;
    background: rgba(0,0,0,0.8);
    color: #a855f7;
    font-size: 0.75rem;
    padding: 2px 8px;
    border-radius: 4px;
  }

  .info {
    padding: 0.75rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
  }
  .title {
    font-size: 0.85rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }

  .toggle {
    position: relative;
    width: 40px;
    height: 22px;
    flex-shrink: 0;
  }
  .toggle input { opacity: 0; width: 0; height: 0; }
  .slider {
    position: absolute;
    inset: 0;
    background: #333;
    border-radius: 11px;
    cursor: pointer;
    transition: background 0.2s;
  }
  .slider::before {
    content: '';
    position: absolute;
    width: 16px;
    height: 16px;
    left: 3px;
    bottom: 3px;
    background: #e0e0e0;
    border-radius: 50%;
    transition: transform 0.2s;
  }
  .toggle input:checked + .slider { background: #a855f7; }
  .toggle input:checked + .slider::before { transform: translateX(18px); }
</style>

<script>
  document.querySelectorAll('.toggle input').forEach(input => {
    input.addEventListener('change', async (e) => {
      const el = e.target as HTMLInputElement;
      const seriesId = parseInt(el.dataset.seriesId!);
      await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ series_id: seriesId, subscribed: el.checked }),
      });
    });
  });
</script>
```

**Step 2: SearchBar component**

Create `src/components/SearchBar.astro`:

```astro
<div class="search-bar">
  <input type="text" id="search-input" placeholder="Search series..." />
</div>

<style>
  .search-bar { margin-top: 1rem; }
  input {
    width: 100%;
    padding: 0.75rem 1rem;
    background: #16161e;
    border: 1px solid #2a2a3e;
    border-radius: 8px;
    color: #e0e0e0;
    font-size: 1rem;
    outline: none;
  }
  input:focus { border-color: #a855f7; }
  input::placeholder { color: #666; }
</style>

<script>
  const input = document.getElementById('search-input') as HTMLInputElement;
  const grid = document.getElementById('series-grid')!;

  input.addEventListener('input', () => {
    const query = input.value.toLowerCase();
    grid.querySelectorAll('.card').forEach(card => {
      const title = (card as HTMLElement).dataset.title ?? '';
      (card as HTMLElement).style.display = title.includes(query) ? '' : 'none';
    });
  });
</script>
```

**Step 3: Settings component**

Create `src/components/Settings.astro`:

```astro
<details class="settings">
  <summary>Settings</summary>
  <form id="settings-form">
    <div class="field">
      <label for="email">Email</label>
      <input type="email" id="email" name="email" placeholder="your@email.com" required />
    </div>
    <div class="field">
      <label for="schedule">Check Schedule</label>
      <select id="schedule" name="check_schedule">
        <option value="hourly">Every hour</option>
        <option value="00:00">12:00 AM</option>
        <option value="06:00">6:00 AM</option>
        <option value="09:00">9:00 AM</option>
        <option value="12:00">12:00 PM</option>
        <option value="15:00">3:00 PM</option>
        <option value="18:00">6:00 PM</option>
        <option value="21:00">9:00 PM</option>
      </select>
    </div>
    <button type="submit">Save</button>
  </form>
</details>

<style>
  .settings {
    background: #16161e;
    border-radius: 8px;
    padding: 1rem;
  }
  summary {
    cursor: pointer;
    color: #a855f7;
    font-weight: 600;
  }
  form {
    margin-top: 1rem;
    display: flex;
    gap: 1rem;
    align-items: end;
    flex-wrap: wrap;
  }
  .field { display: flex; flex-direction: column; gap: 0.25rem; }
  label { font-size: 0.8rem; color: #888; }
  input, select {
    padding: 0.5rem 0.75rem;
    background: #0a0a0f;
    border: 1px solid #2a2a3e;
    border-radius: 6px;
    color: #e0e0e0;
    font-size: 0.9rem;
  }
  input:focus, select:focus { border-color: #a855f7; outline: none; }
  button {
    padding: 0.5rem 1.5rem;
    background: #a855f7;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.9rem;
  }
  button:hover { background: #9333ea; }
</style>

<script>
  const form = document.getElementById('settings-form') as HTMLFormElement;

  // Load current settings
  fetch('/api/settings')
    .then(r => r.json())
    .then(data => {
      if (data) {
        (document.getElementById('email') as HTMLInputElement).value = data.email ?? '';
        (document.getElementById('schedule') as HTMLSelectElement).value = data.check_schedule ?? 'hourly';
      }
    });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(form);
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: formData.get('email'),
        check_schedule: formData.get('check_schedule'),
      }),
    });
    alert('Settings saved!');
  });
</script>
```

**Step 4: Commit**

```bash
git add src/components/
git commit -m "feat: add SeriesCard, SearchBar, and Settings components"
```

---

## Task 11: Seed & Smoke Test

**Step 1: Install tsx for running seed script**

```bash
npm install -D tsx
```

**Step 2: Generate and apply seed data**

```bash
npm run seed:generate && npm run seed:apply
```

**Step 3: Start dev server and verify**

```bash
npx astro dev
```

- Visit `http://localhost:4321`
- Verify series grid loads with covers and titles
- Test search filtering
- Test toggle subscribe/unsubscribe
- Test settings save

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "chore: verify app runs and fix any issues"
```

---

## Task 12: Deploy to Cloudflare

**Step 1: Create D1 database on Cloudflare**

```bash
npx wrangler d1 create asura-tracker-db
```

Update `wrangler.toml` with the returned `database_id`.

**Step 2: Apply schema to production DB**

```bash
npx wrangler d1 execute asura-tracker-db --file=schema.sql
```

**Step 3: Seed production DB**

```bash
npm run seed:generate
npx wrangler d1 execute asura-tracker-db --file=seed.sql
```

**Step 4: Set secrets**

```bash
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put NOTIFICATION_EMAIL
```

**Step 5: Deploy**

```bash
npx wrangler pages deploy dist
```

**Step 6: Commit final config**

```bash
git add -A
git commit -m "chore: configure production deployment"
```
