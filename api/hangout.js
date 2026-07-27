import { Redis } from "@upstash/redis";

// Single Redis key holding the current hangout event.
const KEY = "hangout";

// The Vercel Upstash Marketplace integration injects these automatically:
//   UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
const redis = Redis.fromEnv();

// Field limits so nobody can stuff junk into Redis.
const MAX_TITLE = 120;
const MAX_NOTE = 280;

function sanitizeString(value, max) {
  if (typeof value !== "string") return "";
  // Strip control chars, trim, and cap length.
  // eslint-disable-next-line no-control-regex
  return value.replace(new RegExp("[\\u0000-\\u001F\\u007F]", "g"), "").trim().slice(0, max);
}

// Accept only a valid datetime string that parses to a real instant
// (e.g. "2026-08-01T19:30:00-07:00"). Returns a normalized ISO string or null.
function normalizeDatetime(value) {
  if (typeof value !== "string" || value.length > 40) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

export default async function handler(req, res) {
  // Never cache at the edge/CDN — data must be fresh across devices.
  res.setHeader("Cache-Control", "no-store, max-age=0");

  try {
    if (req.method === "GET") {
      const data = await redis.get(KEY);
      // @upstash/redis auto-parses JSON; return null if unset.
      return res.status(200).json(data || null);
    }

    if (req.method === "POST") {
      let body = req.body;
      if (typeof body === "string") {
        try {
          body = JSON.parse(body);
        } catch {
          return res.status(400).json({ error: "Invalid JSON body" });
        }
      }
      if (!body || typeof body !== "object") {
        return res.status(400).json({ error: "Missing body" });
      }

      const datetime = normalizeDatetime(body.datetime);
      if (!datetime) {
        return res
          .status(400)
          .json({ error: "Invalid datetime — must be a valid date/time" });
      }

      const title = sanitizeString(body.title, MAX_TITLE);
      if (!title) {
        return res.status(400).json({ error: "Title is required" });
      }

      // Build a clean record — strip anything unexpected.
      const record = {
        title,
        note: sanitizeString(body.note, MAX_NOTE),
        datetime,
        updatedAt: Date.now(),
      };

      await redis.set(KEY, record);
      return res.status(200).json(record);
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("hangout api error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}
