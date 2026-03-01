# AsuraTracker

Release notification service for Asura Scans. Polls for new chapters and sends email notifications to subscribed users.

Built with the same stack as asurascans.com — designed to plug directly into the existing platform.

## Stack

- **Astro 5** (SSR) — matches asurascans.com frontend
- **Cloudflare Pages + D1** — hosting + SQLite database
- **Cloudflare Scheduled Workers** — hourly cron for polling
- **Resend** — email delivery (free tier: 3k emails/month)

## Quick Start

```bash
# Install dependencies
npm install

# Copy env template and add your Resend API key
cp .dev.vars.example .dev.vars

# Create local database
npx wrangler d1 execute asura-tracker-db --local --file=schema.sql

# Seed series from asurascans.com browse pages
npm run seed:generate && npm run seed:apply

# Start dev server
npx astro dev
```

Open http://localhost:4321 — enter your email in Settings, toggle series on, and click "Send Test Email" to verify.

## How It Works

1. **Scheduled worker** runs every hour via Cloudflare cron
2. **Poller** fetches latest series data from `api.asurascans.com/api/series`
3. Compares API chapter numbers against stored `latest_chapter` in D1
4. If new chapters are found, sends **batched email** to all subscribed users
5. Updates stored chapter numbers in DB

## Suggested UX for Asura Scans

### Series Page — Notification Bell

Add a notification bell icon on each series page, in the header area next to the series title (top-right). When a logged-in user clicks it, they subscribe to email notifications for that series. The bell toggles between outlined (unsubscribed) and filled/purple (subscribed).

```
┌─────────────────────────────────────────────────┐
│  [Cover]    Nano Machine                   🔔   │
│             RANK #2 · 나노마신 · ...              │
│                                                  │
│             Nanotechnology meets martial arts...  │
└─────────────────────────────────────────────────┘
```

This is the primary way users subscribe — one tap from the series they're already reading.

The bell icon calls `POST /api/subscribe` with `{ series_id, subscribed: true/false }` and requires the user's JWT token for auth.

### Settings Page — Notification Preferences

Add an "Email Notifications" section to the existing user settings page with:

1. **Toggle** — Master on/off switch for all email notifications
2. **Email field** — Pre-filled from their account email, editable
3. **Schedule picker** — "Every hour" (default), or a specific time like "6:00 PM"
4. **Series picker** — A searchable dropdown that shows all series the user is subscribed to, with checkboxes to enable/disable notifications per series. This lets users bulk-manage their subscriptions without visiting each series page individually.

```
┌─ Email Notifications ──────────────────────────┐
│  ● Enabled                                      │
│                                                  │
│  Email:     mohsin@example.com                   │
│  Schedule:  [Every hour ▾]                       │
│                                                  │
│  Notify me for:                                  │
│  ┌─ Search series... ────────────────────┐      │
│  │  ☑ Nano Machine                        │      │
│  │  ☑ Solo Max-Level Newbie               │      │
│  │  ☑ Overgeared                          │      │
│  │  ☐ The Last Adventurer                 │      │
│  │  ☐ Breakers                            │      │
│  └────────────────────────────────────────┘      │
│                                                  │
│  [Save]                                          │
└──────────────────────────────────────────────────┘
```

## Integration with Asura Scans

This is built as a standalone microservice that can be absorbed into the asurascans.com platform. Here's how:

### Option A: Direct Integration (Recommended)

Replace the external API polling with internal hooks from your publish pipeline:

1. **Replace the poller** — Instead of polling `api.asurascans.com`, trigger notifications directly when a chapter is published. Add a call to the notification service in your chapter publish flow:

```typescript
// In your chapter publish handler:
import { sendUpdateEmail } from './lib/notify';

// After publishing a chapter:
const subscribers = await getSubscribersForSeries(seriesId);
for (const user of subscribers) {
  await sendUpdateEmail(apiKey, fromEmail, user.email, [{
    seriesTitle: series.title,
    chapterNumber: chapter.number,
    readUrl: `https://asurascans.com${series.public_url}`,
    coverUrl: series.cover,
  }]);
}
```

2. **Replace the users table** — Map `subscriptions.user_id` to your existing user system (JWT-based auth with access/refresh tokens). The subscriptions table just needs a foreign key to your users.

3. **Replace the series table** — The `series` table mirrors your existing series data. Replace DB queries in `src/pages/api/series.ts` with queries against your actual series table.

4. **Add auth middleware** — Replace the hardcoded `user_id = 1` with your JWT auth. Every API route that references `user_id = 1` needs to extract the user from the JWT token instead:

```typescript
// Files to update:
// src/pages/api/series.ts    — line with "sub.user_id = 1"
// src/pages/api/subscribe.ts — lines with "user_id = 1"
// src/pages/api/settings.ts  — lines with "id = 1"
```

5. **Move email config** — Replace Resend with your existing email provider, or keep Resend and add your custom domain for branded sender addresses.

### Option B: Standalone Deployment

Deploy as a separate service that polls your API:

```bash
# Create production D1 database
npx wrangler d1 create asura-tracker-db
# Update wrangler.toml with the returned database_id

# Apply schema to production
npx wrangler d1 execute asura-tracker-db --remote --file=schema.sql

# Set secrets
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put NOTIFICATION_EMAIL

# Deploy
npx wrangler pages deploy dist
```

The hourly cron will poll `api.asurascans.com/api/series` automatically.

### Known API Issue

The `/api/series` endpoint currently returns the same 20 series regardless of page number (pagination is broken on the beta API). The seed script works around this by scraping the browse HTML pages instead. With direct integration (Option A), this is irrelevant since you'd query your DB directly.

## Project Structure

```
src/
├── pages/
│   ├── index.astro              # Main series grid + settings
│   └── api/
│       ├── series.ts            # GET series list with subscription status
│       ├── subscribe.ts         # POST toggle subscription
│       ├── settings.ts          # GET/POST user email + schedule
│       └── test-poll.ts         # POST send test notification email
├── components/
│   ├── SeriesCard.astro         # Card with cover, title, toggle
│   ├── SearchBar.astro          # Client-side search filter
│   └── Settings.astro           # Email + schedule config panel
├── layouts/
│   └── Layout.astro             # Base dark theme layout
├── lib/
│   ├── asura-api.ts             # AsuraScans API client
│   ├── db.ts                    # D1 database helper + types
│   ├── poller.ts                # Release checking logic
│   └── notify.ts                # Email notification with HTML template
└── worker.ts                    # Cloudflare scheduled worker entry
```

## Database Schema

Three tables — `users`, `series`, `subscriptions`. See `schema.sql` for full definitions.

When integrating, only `subscriptions` needs to be kept. `users` and `series` get replaced by your existing tables.

## Email Template

Notifications use a branded HTML template with:
- Dark theme matching asurascans.com
- Series cover thumbnails
- Chapter numbers with "Read" buttons
- Batched updates (multiple series in one email)
- Plain text fallback

See `src/lib/notify.ts` to customize.
