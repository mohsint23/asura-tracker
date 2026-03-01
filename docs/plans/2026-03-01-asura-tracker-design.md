# AsuraTracker — Design Document

## Overview

A self-hosted release notification service for AsuraScans. Polls AsuraScans' API for new chapters and sends email notifications to subscribed users. Built to eventually be handed off to AsuraScans for integration into their platform.

## Architecture

### Components

- **Astro web app** — single page where users toggle which series to track
- **Background poller** — Cloudflare scheduled worker that checks AsuraScans' API for new chapters
- **Notification service** — sends batched emails via Resend (free tier: 3k emails/month)
- **SQLite database** — stores series, subscriptions, and user preferences

### Flow

1. Poller runs on schedule → hits AsuraScans API → gets latest chapters
2. Compares against stored `latest_chapter` per series
3. If new chapters found for tracked series → sends batched email
4. Updates `latest_chapter` in DB

### Hosting

Cloudflare Pages (free) — Astro support + scheduled workers (cron triggers) at no cost.

## Data Model

### series

| Column          | Type      | Description                        |
|-----------------|-----------|------------------------------------|
| id              | INTEGER   | Auto-increment PK                  |
| asura_id        | TEXT      | Series ID from AsuraScans API      |
| title           | TEXT      | Series name                        |
| slug            | TEXT      | URL slug                           |
| cover_url       | TEXT      | Thumbnail image URL                |
| latest_chapter  | REAL      | Last known chapter number          |
| last_checked    | TIMESTAMP | Last poll timestamp                |

### users

| Column          | Type      | Description                        |
|-----------------|-----------|------------------------------------|
| id              | INTEGER   | Auto-increment PK                  |
| email           | TEXT      | Notification email address         |
| check_schedule  | TEXT      | "hourly" or specific time "18:00"  |
| created_at      | TIMESTAMP | Account creation time              |

### subscriptions

| Column          | Type      | Description                        |
|-----------------|-----------|------------------------------------|
| id              | INTEGER   | Auto-increment PK                  |
| user_id         | INTEGER   | FK → users                         |
| series_id       | INTEGER   | FK → series                        |
| created_at      | TIMESTAMP | Subscription time                  |

## Poller Logic

- Runs every hour via Cloudflare cron trigger
- Fetches latest releases from AsuraScans' REST API (reverse-engineered endpoints)
- Compares API response against stored `latest_chapter` per series
- On new chapter detection:
  - Updates DB with new chapter number + timestamp
  - Queues notification for all subscribed users
- Custom time checks: users with specific `check_schedule` get checked when the hour matches
- Rate limiting: small delay between API calls, exponential backoff on errors

## Notification Logic

- Uses Resend free tier for email delivery
- Batches notifications: if multiple series update in one poll cycle, one email lists all updates
- Email format:
  - Subject: `AsuraTracker: New Chapters Available`
  - Body: list of series + chapter numbers + direct read links

## Frontend

### Series Grid (main view)

- Grid of cards: cover image + title + latest chapter number
- Toggle switch on each card for subscribe/unsubscribe
- Search/filter bar at the top

### Settings (top section)

- Email input field
- Schedule picker: "Every hour" dropdown + time picker for custom
- Save button

### Styling

- Dark theme to match AsuraScans aesthetic
- Minimal, clean layout
- No auth for now (single user) — replaced by AsuraScans' JWT system on handoff

## Project Structure

```
asura-tracker/
├── src/
│   ├── pages/
│   │   └── index.astro
│   ├── components/
│   │   ├── SeriesCard.astro
│   │   ├── SearchBar.astro
│   │   └── Settings.astro
│   ├── lib/
│   │   ├── asura-api.ts
│   │   ├── db.ts
│   │   ├── poller.ts
│   │   └── notify.ts
│   └── api/
│       ├── subscribe.ts
│       ├── settings.ts
│       └── series.ts
├── worker/
│   └── cron.ts
├── schema.sql
├── astro.config.mjs
├── wrangler.toml
└── package.json
```

## Integration Path (Future)

When handing off to AsuraScans:
- `series` table replaced by their existing series data
- `users` + `subscriptions` plug into their user system
- Polling replaced by direct hooks from their publish pipeline
- Auth replaced by their JWT system

## Tech Decisions

| Decision              | Choice                  | Reasoning                                    |
|-----------------------|-------------------------|----------------------------------------------|
| Framework             | Astro                   | Matches AsuraScans' stack                    |
| Hosting               | Cloudflare Pages        | Free, cron support, Astro-native             |
| Database              | SQLite                  | Zero config, portable, easy handoff          |
| Email                 | Resend                  | Free tier (3k/month), simple API             |
| Data source           | AsuraScans REST API     | More stable than HTML scraping               |
| Notifications         | Batched per poll cycle  | Avoids spam, cleaner UX                      |
