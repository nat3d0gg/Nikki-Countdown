# nikki-countdown 💕

A tiny, cute website that counts down (days / hours / minutes / seconds) to the
next time Nikki and I see each other. Either of us can update the date, time,
activity, and a short note from any device — no login — and the other device
picks up the change within ~60 seconds.

## How it works

- **`index.html`** — one file, vanilla HTML/CSS/JS, no build step. The countdown
  ticks locally every second (computed from the target timestamp, so it never
  drifts). It fetches the event on load, then every 60s, and pauses while the
  tab is hidden.
- **`api/hangout.js`** — a Vercel serverless function with two methods:
  - `GET /api/hangout` → returns the current event JSON.
  - `POST /api/hangout` → validates and saves it (no auth).
- **Storage** — a single Upstash Redis key, `hangout`, holding:
  ```json
  {
    "title": "Dinner at Bestia",
    "note": "can't wait",
    "datetime": "2026-08-01T19:30:00-07:00",
    "updatedAt": 1753500000000
  }
  ```
  `datetime` is stored as an ISO string with timezone offset so it renders
  correctly on any device. The edit form interprets entered date/time as
  Los Angeles time (America/Los_Angeles).

## States

- **Counting down** — big live countdown + date/time + activity + note.
- **It's time!** — at zero, a celebration with confetti/hearts.
- **Waiting** — if the event is in the past and none is set, a sweet placeholder
  prompting a new date.

## Deploy

1. Push to GitHub.
2. Import the repo in Vercel (zero-config: static `index.html` + `/api`).
3. Add the **Upstash Redis** integration from the Vercel Marketplace (free tier).
   It auto-injects `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
4. Open the deployed URL and set your first hangout via the ✎ edit button.

## Cost

Vercel Hobby + Upstash free tier. Roughly one Redis read per minute per open
tab, no cron, no websockets — effectively $0.
