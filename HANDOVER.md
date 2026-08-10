# Ariha Healthcare — setup and handover

How the site is hosted, how the forms work, and what to do when something
breaks.

## The stack

| Piece | What it does |
|---|---|
| **GitHub** | Holds the code. Pushing to the production branch deploys the site. |
| **Cloudflare Pages** | Hosts the site, and runs the form handler at `/api/submit`. Free, no build minutes to run out of. |
| **Brevo** | Sends the notification emails and stores newsletter subscribers. Free tier is 300 emails/day. |

There is no Webflow and no Netlify. Both were removed.

---

## 1. Brevo setup

Create the account with **drjuishah@arihahealthcare.com** so the clinic can
recover it.

### 1.1 Authenticate the domain (do not skip)

**Senders, domains, IPs → Domains → Add a domain** → `arihahealthcare.com`

Brevo gives you DKIM and DMARC records to add to DNS (see section 3). Until
the domain shows as authenticated, notification emails are likely to land in
patients' and the clinic's spam folders.

Sending from a Gmail address instead of an authenticated domain is the single
most common reason these emails get filtered.

### 1.2 Create the sender

**Senders → Add a sender** → `noreply@arihahealthcare.com`

Keep the sender different from the recipients. Sending from
`appointments@` *to* `appointments@` is self-addressed mail and some filters
treat it as suspicious.

### 1.3 Create the newsletter list

**Contacts → Lists → Create a list** — e.g. "Website newsletter". Note the
numeric id from the URL; it becomes `BREVO_LIST_ID`.

### 1.4 Generate the API key

**SMTP & API → API keys & MCP → Generate a new API key**

- Name it `website forms`
- Copy it **immediately** — Brevo shows it once
- Paste it straight into Cloudflare. It should never be in the code, in a
  chat, or in a screenshot.
- **Do not** enable "Activate for API keys" IP blocking. Cloudflare functions
  run from many rotating IPs and every send would be rejected.

> **Expiry:** API keys expire after one year, and also after **90 days of
> inactivity**. If forms silently stop arriving, check this first.

---

## 2. Cloudflare setup

### 2.1 Create the Pages project

**Workers & Pages → Create application → Pages tab → Connect to Git**

Cloudflare pushes you toward Workers by default. The Pages option is the
small *"Looking to deploy Pages? Get started"* link at the bottom. **It must
be a Pages project** — a Worker ignores the `functions/` folder and every
form returns 404.

### 2.2 Build settings

| Setting | Value |
|---|---|
| Production branch | `main` |
| Framework preset | None |
| Build command | *leave empty* |
| Build output directory | `/` |

The site is plain HTML with no build step. Leaving the build command empty
keeps deploys as fast file uploads.

### 2.3 Environment variables

**Settings → Variables and secrets**

| Variable | Value |
|---|---|
| `BREVO_API_KEY` | the key from 1.4 — store as **Secret**, not Plaintext |
| `BREVO_SENDER_EMAIL` | `noreply@arihahealthcare.com` |
| `NOTIFY_EMAIL` | `appointments@arihahealthcare.com, drjuishah@arihahealthcare.com` |
| `BREVO_LIST_ID` | the numeric list id (optional) |
| `SITE_URL` | `https://arihahealthcare.com` (optional) |

`NOTIFY_EMAIL` accepts several addresses separated by commas.

> Environment variables only apply to **new** deploys. After changing one,
> go to Deployments → ⋯ → **Retry deployment** or nothing changes.

### 2.4 Test before touching DNS

On the `*.pages.dev` URL, submit all three forms and confirm the emails
arrive. Do this **before** pointing the domain at it.

---

## 3. Connecting arihahealthcare.com

> **⚠️ Read this section fully before changing anything.**
> The domain has live mailboxes (`drjuishah@`, `appointments@`). Moving
> nameservers moves **all** DNS, not just the website. If the MX records are
> not recreated first, **the clinic's email stops working**. That is worse
> than the website being down.

1. **In GoDaddy, screenshot or export the entire DNS zone.** That screenshot
   is the rollback if anything goes wrong. Pay particular attention to:
   - **MX** records — these carry the email
   - **TXT** records — SPF, domain verification
   - any subdomains
2. Add `arihahealthcare.com` to Cloudflare and **recreate every record**.
3. Only then change the nameservers at GoDaddy to Cloudflare's.
4. Add Brevo's **DKIM and DMARC** records (from 1.1) in Cloudflare DNS.
5. Pages project → **Custom domains** → add `arihahealthcare.com`.
6. Wait for the SSL certificate to issue, then load the site over HTTPS.
7. Submit one test per form on the live domain and confirm the emails arrive.
8. **Send a test email to `drjuishah@` from an outside address** to confirm
   the clinic's mail still works after the move.

---

## 4. If forms stop arriving

Check in this order:

1. **Brevo → Transactional → Logs.** If sends appear here, Brevo sent them
   and the problem is on the receiving side — check spam.
2. **Has the Brevo API key expired?** One year, or 90 days of inactivity.
   Generate a new one and update `BREVO_API_KEY` in Cloudflare, then redeploy.
3. **Is the sender still verified?** An unverified sender fails every send
   with a 401.
4. **Cloudflare → your project → Functions → Logs.** The handler logs the
   exact response Brevo returned.
5. **Daily quota.** Brevo free is 300 emails/day, resetting daily.

The form shows a red error panel when a send fails, so a failure is visible
rather than silent. But note there is **no stored copy** of submissions — the
inbox and Brevo's log are the only record.

## 5. Editing the site

### The footer is shared

Do not edit the footer inside a page — it is generated. Edit
`partials/footer.html`, then run:

```bash
node tools/sync-footer.js
```

and commit the result. See `partials/README.md`.

### Everything else

Plain HTML, CSS and images. Push to the production branch and Cloudflare
deploys within about a minute.

## 6. Known gaps

- **No stored record of submissions.** If Brevo fails to send, the enquiry is
  lost. A Google Sheet backup would fix this.
- **Newsletter form is desktop only.** It is hidden below desktop width.
- **Only one service page exists.** The other six navbar services link to
  `adolescent-health-care.html#`, and every blog card opens the same article.
- **The services hero image is 961 KB**, which is slow on mobile data.
