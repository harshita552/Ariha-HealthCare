/*
 * Shared availability logic. Not a route - Cloudflare Pages ignores files
 * whose name starts with "_", so this is importable but not reachable over
 * HTTP. Both /api/availability and /api/submit use it, so the browser and
 * the server always agree on which dates are closed.
 *
 * Source of truth is a Google Calendar the clinic keeps ("Ariha -
 * Availability"). All-day events on it mean "Dr. Shah is away". The feed is
 * read through its secret iCal address, which is a credential: it goes in
 * CALENDAR_ICS_URL as a Cloudflare **secret**, never in client code.
 *
 * Environment variables:
 *   CALENDAR_ICS_URL   optional. Secret iCal address of the availability
 *                      calendar. Without it only the committed fallback and
 *                      the weekly closed days apply.
 *   CLOSED_WEEKDAYS    optional. Comma-separated, 0=Sunday. Defaults to "0"
 *                      because the clinic runs Monday-Saturday.
 */

const FALLBACK_PATH = '/assets/unavailable.json';
const CACHE_SECONDS = 600; // 10 min - she edits the calendar, not the site
const MAX_DATES = 2000; // a runaway feed must not blow up the response
const MAX_HORIZON_DAYS = 550; // ignore anything further out than ~18 months

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/* ---------- small date helpers, all in plain YYYY-MM-DD ---------------- */

function toISO(y, m, d) {
  return (
    String(y).padStart(4, '0') + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0')
  );
}

// ICS all-day dates are "20261012" - no timezone involved, so UTC maths here
// can't drift the way a local-time Date would.
function icsDateToUTC(value) {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(String(value).trim());
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function isoToUTC(value) {
  if (!DATE_RE.test(value)) return null;
  const p = value.split('-');
  return Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}

function utcToISO(ms) {
  const d = new Date(ms);
  return toISO(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

const DAY = 86400000;

// start inclusive, end EXCLUSIVE - which is how iCal DTEND works for all-day
// events, and the single easiest thing to get wrong here.
function addRange(set, startMs, endMs, horizonMs) {
  if (startMs === null || endMs === null || endMs <= startMs) return;
  for (let t = startMs; t < endMs && set.size < MAX_DATES; t += DAY) {
    if (t > horizonMs) break;
    set.add(utcToISO(t));
  }
}

/* ---------- ICS parsing ------------------------------------------------ */

// RFC 5545 folds long lines onto a continuation beginning with a space or
// tab. Unfold before anything else or DTSTART can arrive split in half.
function unfold(text) {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n[ \t]/g, '');
}

/*
 * Returns the set of blocked YYYY-MM-DD dates found in an iCal feed.
 *
 * Deliberately narrow: only all-day events block a date. A timed event is
 * a consultation or a personal appointment, not a day away, and treating it
 * as a closure would empty the calendar the first time she books a lunch.
 * Recurring events (RRULE) are skipped too - expanding them correctly means
 * a full RRULE engine, and the weekly closed day is handled by
 * CLOSED_WEEKDAYS instead.
 */
/*
 * Reads one DTSTART/DTEND line, whatever parameters the provider hangs off
 * it. Google writes "DTSTART;VALUE=DATE:20260914"; others add a TZID, or
 * drop VALUE=DATE and rely on the value being eight digits. All three mean
 * the same thing. Returns the YYYYMMDD string only for a date-only value -
 * anything carrying a time (…T090000) is a timed event and returns null.
 */
function readDateProp(block, name) {
  const line = new RegExp('^' + name + '([^:\\r\\n]*):([^\\r\\n]+)$', 'im').exec(block);
  if (!line) return { found: false, params: null, dateOnly: null };

  const params = line[1] || '';
  const value = line[2].trim();
  const dateOnly = /^(\d{8})$/.test(value) ? value : null;
  return { found: true, params: params, dateOnly: dateOnly };
}

function parseIcs(text, horizonMs) {
  const dates = new Set();
  const body = unfold(String(text));
  const blocks = body.split('BEGIN:VEVENT').slice(1);
  const stats = { events: 0, allDay: 0, timed: 0, cancelled: 0, free: 0, recurring: 0, shapes: [] };

  for (const raw of blocks) {
    const block = raw.split('END:VEVENT')[0];
    stats.events++;

    if (/^STATUS:CANCELLED\s*$/im.test(block)) { stats.cancelled++; continue; }
    // TRANSP:TRANSPARENT is Google's "free" - she is not actually away
    if (/^TRANSP:TRANSPARENT\s*$/im.test(block)) { stats.free++; continue; }
    if (/^RRULE[:;]/im.test(block)) { stats.recurring++; continue; }

    const start = readDateProp(block, 'DTSTART');
    if (!start.found) continue;

    // record the parameter shape so a mismatch is diagnosable without
    // exposing any event content
    const shape = 'DTSTART' + start.params + ':' + (start.dateOnly ? '<date>' : '<datetime>');
    if (stats.shapes.indexOf(shape) === -1 && stats.shapes.length < 6) stats.shapes.push(shape);

    if (!start.dateOnly) { stats.timed++; continue; } // a timed event is not a day away
    stats.allDay++;

    const end = readDateProp(block, 'DTEND');
    const startMs = icsDateToUTC(start.dateOnly);
    const endMs = end.dateOnly ? icsDateToUTC(end.dateOnly) : startMs + DAY;

    addRange(dates, startMs, endMs, horizonMs);
  }

  return { dates, skippedRecurring: stats.recurring, stats };
}

/* ---------- fallback file ---------------------------------------------- */

/*
 * assets/unavailable.json is committed to the repo and edited by hand. It is
 * the safety net for the feed being unreachable, and the way to block a date
 * without touching the calendar at all.
 */
function parseFallback(json, horizonMs) {
  const dates = new Set();
  if (!json || typeof json !== 'object') return dates;

  const single = Array.isArray(json.blockedDates) ? json.blockedDates : [];
  for (const d of single) {
    if (DATE_RE.test(d)) dates.add(d);
  }

  const ranges = Array.isArray(json.blockedRanges) ? json.blockedRanges : [];
  for (const r of ranges) {
    if (!Array.isArray(r) || r.length !== 2) continue;
    const startMs = isoToUTC(r[0]);
    const endMs = isoToUTC(r[1]);
    // ranges in the file are written inclusive, which is what a human means
    // by "3rd to the 9th" - so add a day to make the end exclusive
    if (startMs !== null && endMs !== null) addRange(dates, startMs, endMs + DAY, horizonMs);
  }

  return dates;
}

/* ---------- closed weekdays -------------------------------------------- */

function closedWeekdays(env) {
  const raw = env && env.CLOSED_WEEKDAYS != null ? String(env.CLOSED_WEEKDAYS) : '0';
  const out = [];
  for (const part of raw.split(',')) {
    const n = Number(part.trim());
    if (Number.isInteger(n) && n >= 0 && n <= 6 && out.indexOf(n) === -1) out.push(n);
  }
  return out;
}

/* ---------- the one entry point ---------------------------------------- */

/*
 * Resolves the blocked dates, preferring the calendar and falling back to the
 * committed file. Never throws: a failure here must not stop someone booking,
 * so the worst case is that the weekly closed day is all that applies.
 */
export async function getAvailability(env, request) {
  const horizonMs = Date.now() + MAX_HORIZON_DAYS * DAY;
  const result = {
    ok: true,
    blockedDates: [],
    closedWeekdays: closedWeekdays(env),
    source: 'none',
    skippedRecurring: 0,
    diagnostics: null
  };

  const icsUrl = env && env.CALENDAR_ICS_URL;
  if (icsUrl) {
    try {
      const res = await fetch(icsUrl, {
        cf: { cacheTtl: CACHE_SECONDS, cacheEverything: true },
        headers: { accept: 'text/calendar' }
      });
      if (res.ok) {
        const body = await res.text();
        const parsed = parseIcs(body, horizonMs);
        result.blockedDates = Array.from(parsed.dates).sort();
        result.skippedRecurring = parsed.skippedRecurring;
        result.source = 'calendar';
        // shape only - counts and property parameters, never event content
        result.diagnostics = Object.assign({ bytes: body.length }, parsed.stats);
        return result;
      }
      console.error('availability: calendar feed returned', res.status);
    } catch (err) {
      console.error('availability: calendar fetch threw', err);
    }
  }

  // Feed missing or unreachable - fall back to the committed list rather than
  // blocking everything (which would kill bookings) or nothing silently.
  try {
    const url = new URL(FALLBACK_PATH, request ? request.url : 'https://arihahealthcare.com');
    const res = await fetch(url.toString());
    if (res.ok) {
      result.blockedDates = Array.from(parseFallback(await res.json(), horizonMs)).sort();
      result.source = icsUrl ? 'fallback-after-error' : 'fallback';
    }
  } catch (err) {
    console.error('availability: fallback read threw', err);
  }

  return result;
}

/*
 * Whether a YYYY-MM-DD is bookable. Shared so /api/submit rejects exactly
 * what the date field refuses - a page cached before the doctor blocked a
 * week must not be able to slip a booking through.
 */
export function isBlocked(dateStr, availability) {
  if (!DATE_RE.test(String(dateStr || ''))) return false; // not our job to validate format
  if (availability.blockedDates.indexOf(dateStr) !== -1) return true;

  const ms = isoToUTC(dateStr);
  if (ms === null) return false;
  return availability.closedWeekdays.indexOf(new Date(ms).getUTCDay()) !== -1;
}

export const _internals = { parseIcs, parseFallback, unfold, closedWeekdays };
