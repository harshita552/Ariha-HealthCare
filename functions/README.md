# Form handling (Cloudflare Pages + Brevo)

The three site forms post to `/api/submit`, handled by
`functions/api/submit.js`. That function emails the clinic via Brevo and adds
newsletter signups to a Brevo contact list.

The Brevo API key is a **secret**. It lives only in Cloudflare's environment
variables, never in the HTML or JavaScript. This is why a serverless function
is needed at all — Brevo cannot be called safely from the browser.

## Forms

| Form name | Where | What happens |
|---|---|---|
| `appointments` | all pages (modal) | Email to the clinic |
| `contact-messages` | contact-us | Email to the clinic |
| `newsletter-signups` | blogs, blog-template | Email + added to Brevo list |

## Environment variables

Set in Cloudflare Pages → Settings → Environment variables. Add them to
**both** Production and Preview if you want previews to send mail.

| Variable | Required | Notes |
|---|---|---|
| `BREVO_API_KEY` | yes | Brevo → SMTP & API → API keys |
| `NOTIFY_EMAIL` | yes | Where notifications go. Comma-separate for several. |
| `BREVO_SENDER_EMAIL` | yes | **Must be a verified sender in Brevo**, or sends fail |
| `BREVO_SENDER_NAME` | no | Defaults to "Ariha Healthcare Website" |
| `BREVO_LIST_ID` | no | Numeric list id. Without it, newsletter emails still send but no contact is stored. |
| `SITE_URL` | no | Defaults to `https://arihahealthcare.com` |
| `CALENDAR_ICS_URL` | no | **Secret.** Availability calendar's private iCal address — see below. Without it only `assets/unavailable.json` and the weekly closed day apply. |
| `CLOSED_WEEKDAYS` | no | Comma-separated, `0`=Sunday. Defaults to `0` because the clinic runs Monday–Saturday. |

## Blocking dates when the doctor is away

`/api/availability` (`functions/api/availability.js`) tells the appointment
form which dates cannot be booked. `functions/api/_availability.js` holds the
shared logic; `/api/submit` re-checks against it so a page cached before a
date was blocked still cannot book it.

Dates come from three places, in order:

1. **The clinic's Google Calendar** — the day-to-day method. Any **all-day**
   event blocks that date.
2. **`assets/unavailable.json`** — committed to the repo. Used when the feed
   is unreachable, and for blocking a date without touching the calendar.
3. **`CLOSED_WEEKDAYS`** — the weekly closure, applied always.

### Connecting the calendar

1. In Google Calendar, create a **new** calendar called something like
   *Ariha — Availability*. Do **not** use Dr. Shah's personal calendar: the
   site would then block days for private reasons, and her event titles do
   not belong anywhere near this.
2. On days she is away, add an **all-day** event. The title is never read or
   shown — only the date matters. Multi-day trips work; drag across the days.
3. Open that calendar's **Settings and sharing → Integrate calendar → Secret
   address in iCal format**, and copy it.
4. In Cloudflare Pages → Settings → Environment variables, add it as
   `CALENDAR_ICS_URL`, type **Secret** (not Plaintext), then redeploy.
5. Block a test date, wait a few minutes, and confirm the form refuses it.

That secret address lets anyone holding it read the whole calendar, so treat
it like the Brevo key: it goes from Google straight into Cloudflare, and into
no email, chat or commit.

Changes show up within about 10 minutes — the feed is cached that long so a
busy day does not hammer Google.

### What it deliberately does not do

- **Timed events do not block a day.** A 2pm consultation is not a day away,
  and treating it as one would empty the calendar the first time she books
  anything. Only all-day events count.
- **Recurring events are skipped.** Expanding an RRULE correctly needs a full
  recurrence engine; the weekly closure is handled by `CLOSED_WEEKDAYS`.
- **It does not reserve slots.** Two people can still request the same time —
  this form emails a request, it is not a booking system.
- **Transparency is ignored.** `TRANSP:TRANSPARENT` looks like "she is free",
  and it is filtered out by most iCal consumers. Do not reinstate that filter:
  Zoho sets it on every event not added to the free/busy schedule, which is the
  normal case here, and filtering on it silently dropped every away-day.

If the feed fails, the endpoint returns the fallback list rather than
blocking everything or silently blocking nothing, and `/api/submit` never
refuses a booking because the availability check itself broke.

### The date field

The appointment date uses **flatpickr** (`vendor/flatpickr.min.js`, v4.6.13,
vendored — no CDN), because a native `<input type="date">` understands only
`min`/`max` and cannot grey out individual days.

The input keeps its ISO `YYYY-MM-DD` value, so `/api/submit`, the notification
email and the calendar check are all unchanged; flatpickr's `altInput` shows
the patient `dd-mm-yyyy`. `required` is moved onto that alt input during init —
the original goes `type="hidden"`, and hidden inputs are barred from
constraint validation, so leaving `required` there would make the field
silently optional.

Date of Birth stays a **native** date input: there is nothing to block, and
native year navigation beats flatpickr's for a birth year.

The flatpickr theme lives at the end of the shared stylesheet with every
selector prefixed `body`. That stylesheet is linked *before* `flatpickr.min.css`,
so a bare `.flatpickr-*` selector ties on specificity and loses on order.

### Diagnosing

`/api/availability?debug=1` adds counts of what the feed contained — events
seen, all-day, timed, cancelled, transparent, recurring — plus the `DTSTART`
parameter shapes. No event titles or content, so it is safe on a public URL.
Use it when a date does not come through: `allDay:0` with `events:1` means the
event was read but rejected, and the other counters say why.

## Setup order

1. Create the Brevo account (**the client's**, so ownership is theirs).
2. Verify the sender address in Brevo — a sender that isn't verified will make
   every send fail with a 401.
3. Create a contact list for the newsletter and note its numeric id.
4. Create an API key.
5. Add the variables in Cloudflare and redeploy — env changes need a new
   deploy to take effect.
6. Submit one test per form and confirm the emails arrive.

## Behaviour on failure

If Brevo rejects or is unreachable the function returns 502, and the form
shows its error panel with the user's input still filled in — so a failed
send is visible rather than silent.

Note there is **no stored copy** of submissions the way Netlify Forms kept
one. Brevo's sent-email log is the record. If a permanent archive is wanted,
the function can also append each submission to a Google Sheet.

## Local testing

The function is plain JavaScript with no imports, so its logic can be
exercised directly with Node by stubbing `fetch`. `wrangler pages dev` will
run it properly end to end if you want the real request path.
