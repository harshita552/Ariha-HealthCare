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
