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

  return new Response(
    JSON.stringify({
      ok: true,
      blockedDates: data.blockedDates,
      closedWeekdays: data.closedWeekdays,
      source: data.source
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        // short cache: a date blocked this morning should take effect today
        'Cache-Control': 'public, max-age=' + BROWSER_CACHE_SECONDS
      }
    }
  );
}

export async function onRequest(context) {
  if (context.request.method === 'GET') return onRequestGet(context);
  return new Response(JSON.stringify({ ok: false, error: 'method_not_allowed' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json' }
  });
}
