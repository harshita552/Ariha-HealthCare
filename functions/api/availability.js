/*
 * Cloudflare Pages Function - GET /api/availability
 *
 * Tells the appointment form which dates cannot be booked: days Dr. Shah has
 * marked away on the clinic's Google Calendar, plus the weekly closed day.
 * See _availability.js for where the data comes from.
 *
 * The calendar's secret iCal address stays server-side. Only the resulting
 * list of dates is ever sent to the browser, so the feed URL - and anything
 * else on that calendar - is never exposed.
 */

import { getAvailability } from './_availability.js';

const BROWSER_CACHE_SECONDS = 300;

export async function onRequestGet(context) {
  const { request, env } = context;
  const data = await getAvailability(env, request);

  const payload = {
    ok: true,
    blockedDates: data.blockedDates,
    closedWeekdays: data.closedWeekdays,
    source: data.source
  };

  // ?debug=1 adds counts and the DTSTART parameter shapes seen in the feed,
  // for working out why a date did not come through. Deliberately carries no
  // event content - no titles, no dates beyond what is already returned.
  const debug = new URL(request.url).searchParams.get('debug') === '1';
  if (debug) payload.diagnostics = data.diagnostics;

  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      // short cache: a date blocked this morning should take effect today.
      // debug requests skip it so a diagnosis is never a stale one.
      'Cache-Control': debug ? 'no-store' : 'public, max-age=' + BROWSER_CACHE_SECONDS
    }
  });
}

export async function onRequest(context) {
  if (context.request.method === 'GET') return onRequestGet(context);
  return new Response(JSON.stringify({ ok: false, error: 'method_not_allowed' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json' }
  });
}
