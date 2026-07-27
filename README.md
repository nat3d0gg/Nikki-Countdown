# nikki-countdown 💕

A cute website that counts down to the next time Nikki & Nate see each other —
now with a shared calendar of all our plans. Either of us can add or edit events
from any device (no login); the other device picks up changes within ~60 seconds.

## Features

- **Live countdown** to the next upcoming event (days / hours / minutes /
  seconds), recomputed from the target each tick so it never drifts.
- **Multiple events** with title, **location**, note, and time.
- **All-day & multi-day** events.
- **Calendar view** — a month grid (scroll by month) with event dots, plus a
  day view and a month event list.
- **Downloadable `.ics`** calendar invites — per event or all at once — that
  import into Google / Apple / Outlook calendars.
- **Settings** — your names, time zone, and accent color (synced across devices).
- **Celebration state** when an event starts (floating hearts) and a **waiting**
  state when nothing's planned.

## Tech

- One `index.html` — vanilla HTML/CSS/JS, **no build step**.
- **`api/events.js`** — a single Vercel serverless function:
  - `GET /api/events` → `{ events: [...], settings: {...} }`
  - `POST /api/events` with `{ action }`:
    - `upsert-event` `{ event }` — create/update (server-side read-modify-write
      so two devices don't clobber each other)
    - `delete-event` `{ id }`
    - `save-settings` `{ settings }`
- **Storage** — Upstash Redis (`@upstash/redis`), keys `events` and `settings`.
  Credentials come from the Vercel Upstash Marketplace integration
  (`UPSTASH_REDIS_REST_*` or `KV_REST_API_*`, both supported). The old
  single-event `hangout` key is migrated automatically on first load.

## Data model

```json
{
  "id": "uuid",
  "title": "Dinner at Bestia",
  "location": "2121 E 7th Pl, Los Angeles",
  "note": "can't wait",
  "allDay": false,
  "start": "2026-08-01T02:30:00.000Z",
  "end": null,
  "updatedAt": 1753500000000
}
```

Datetimes are stored as UTC ISO strings; the form interprets and displays them
in the configured time zone (default America/Los_Angeles).

## Cost

Vercel Hobby + Upstash free tier. The countdown ticks locally; the app fetches
once on load and every 60s (paused when the tab is hidden), so it's ~1 read per
minute per open tab — effectively $0.
