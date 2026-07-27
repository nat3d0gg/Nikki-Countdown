import { Redis } from "@upstash/redis";

// Support both the UPSTASH_REDIS_REST_* and KV_REST_API_* names that the
// Vercel Marketplace integration may inject.
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN,
});

const EVENTS_KEY = "events";
const SETTINGS_KEY = "settings";
const LEGACY_KEY = "hangout"; // single-event key from the first version

const MAX_TITLE = 120;
const MAX_NOTE = 280;
const MAX_LOCATION = 200;
const MAX_NAME = 40;
const MAX_EVENTS = 200; // sanity cap

const DEFAULT_SETTINGS = {
  names: { a: "Nikki", b: "Nate" },
  timezone: "America/Los_Angeles",
  accent: "#f7638c",
};

function sanitizeString(value, max) {
  if (typeof value !== "string") return "";
  // eslint-disable-next-line no-control-regex
  return value.replace(new RegExp("[\\u0000-\\u001F\\u007F]", "g"), "").trim().slice(0, max);
}

function normalizeDatetime(value) {
  if (typeof value !== "string" || value.length > 40) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

function newId() {
  try {
    return crypto.randomUUID();
  } catch {
    return "e" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
}

// Returns { event } or { error }.
function validateEvent(input) {
  if (!input || typeof input !== "object") return { error: "Missing event" };

  const title = sanitizeString(input.title, MAX_TITLE);
  if (!title) return { error: "Title is required" };

  const start = normalizeDatetime(input.start);
  if (!start) return { error: "Invalid start date/time" };

  let end = null;
  if (input.end != null && input.end !== "") {
    end = normalizeDatetime(input.end);
    if (!end) return { error: "Invalid end date/time" };
    if (new Date(end).getTime() < new Date(start).getTime()) {
      return { error: "End must be on or after the start" };
    }
  }

  const event = {
    id: typeof input.id === "string" && input.id ? input.id.slice(0, 64) : newId(),
    title,
    location: sanitizeString(input.location, MAX_LOCATION),
    note: sanitizeString(input.note, MAX_NOTE),
    allDay: !!input.allDay,
    start,
    end,
    updatedAt: Date.now(),
  };
  return { event };
}

function validateSettings(input) {
  const out = { ...DEFAULT_SETTINGS };
  if (input && typeof input === "object") {
    if (input.names && typeof input.names === "object") {
      out.names = {
        a: sanitizeString(input.names.a, MAX_NAME) || DEFAULT_SETTINGS.names.a,
        b: sanitizeString(input.names.b, MAX_NAME) || DEFAULT_SETTINGS.names.b,
      };
    }
    if (typeof input.timezone === "string") {
      try {
        // Throws for an invalid IANA zone.
        new Intl.DateTimeFormat("en-US", { timeZone: input.timezone });
        out.timezone = input.timezone;
      } catch {
        /* keep default */
      }
    }
    if (typeof input.accent === "string" && /^#[0-9a-fA-F]{6}$/.test(input.accent)) {
      out.accent = input.accent.toLowerCase();
    }
  }
  out.updatedAt = Date.now();
  return out;
}

function sortEvents(events) {
  return events.slice().sort((a, b) => new Date(a.start) - new Date(b.start));
}

async function readEvents() {
  const raw = await redis.get(EVENTS_KEY);
  return Array.isArray(raw) ? raw : null;
}

// Load events, migrating the legacy single-event key on first run.
async function loadEventsMigrating() {
  let events = await readEvents();
  if (events) return events;

  const legacy = await redis.get(LEGACY_KEY);
  if (legacy && typeof legacy === "object" && legacy.datetime) {
    const start = normalizeDatetime(legacy.datetime);
    if (start) {
      events = [
        {
          id: newId(),
          title: sanitizeString(legacy.title, MAX_TITLE) || "Our hangout",
          location: "",
          note: sanitizeString(legacy.note, MAX_NOTE),
          allDay: false,
          start,
          end: null,
          updatedAt: legacy.updatedAt || Date.now(),
        },
      ];
      await redis.set(EVENTS_KEY, events);
      return events;
    }
  }
  return [];
}

async function loadSettings() {
  const raw = await redis.get(SETTINGS_KEY);
  return raw && typeof raw === "object" ? { ...DEFAULT_SETTINGS, ...raw } : { ...DEFAULT_SETTINGS };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");

  try {
    if (req.method === "GET") {
      const [events, settings] = await Promise.all([loadEventsMigrating(), loadSettings()]);
      return res.status(200).json({ events: sortEvents(events), settings });
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

      const action = body.action;

      if (action === "save-settings") {
        const settings = validateSettings(body.settings);
        await redis.set(SETTINGS_KEY, settings);
        return res.status(200).json({ settings });
      }

      if (action === "upsert-event") {
        const { event, error } = validateEvent(body.event);
        if (error) return res.status(400).json({ error });

        // Read-modify-write so concurrent edits from two devices don't clobber.
        let events = (await readEvents()) || [];
        const idx = events.findIndex((e) => e && e.id === event.id);
        if (idx >= 0) {
          events[idx] = event;
        } else {
          if (events.length >= MAX_EVENTS) {
            return res.status(400).json({ error: "Too many events" });
          }
          events.push(event);
        }
        await redis.set(EVENTS_KEY, events);
        return res.status(200).json({ events: sortEvents(events), event });
      }

      if (action === "delete-event") {
        const id = typeof body.id === "string" ? body.id : "";
        if (!id) return res.status(400).json({ error: "Missing id" });
        let events = (await readEvents()) || [];
        events = events.filter((e) => e && e.id !== id);
        await redis.set(EVENTS_KEY, events);
        return res.status(200).json({ events: sortEvents(events) });
      }

      return res.status(400).json({ error: "Unknown action" });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("events api error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}
