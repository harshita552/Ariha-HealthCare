/*
 * Cloudflare Pages Function - form handler.
 * Served at /api/submit
 *
 * Receives the three site forms, emails the clinic via Brevo, and adds
 * newsletter signups to a Brevo contact list. The Brevo key is a secret and
 * stays here, server-side - it must never appear in browser code.
 *
 * Environment variables (Cloudflare Pages > Settings > Environment variables):
 *   BREVO_API_KEY        required. From Brevo > SMTP & API > API keys
 *   NOTIFY_EMAIL         required. Where notifications go. Comma-separate for several.
 *   BREVO_SENDER_EMAIL   required. Must be a verified sender in Brevo.
 *   BREVO_SENDER_NAME    optional. Defaults to "Ariha Healthcare Website".
 *   BREVO_LIST_ID        optional. Numeric list id for newsletter signups.
 *   SITE_URL             optional. Defaults to https://arihahealthcare.com
 */

const BREVO_EMAIL_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';
const BREVO_CONTACT_ENDPOINT = 'https://api.brevo.com/v3/contacts';

// Only these keys are ever read from a submission. Anything else is ignored,
// so a crafted request can't inject arbitrary content into the email.
const ALLOWED_FIELDS = ['Page', 'Name', 'Email', 'Phone', 'Service', 'Appointment Date', 'Message', 'Consent'];

const FORMS = {
  appointments: { label: 'appointment', subject: 'New appointment request' },
  'contact-messages': { label: 'contact', subject: 'New contact message' },
  'newsletter-signups': { label: 'newsletter', subject: 'New newsletter signup' }
};

const MAX_FIELD_LENGTH = 5000;

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.BREVO_API_KEY || !env.NOTIFY_EMAIL || !env.BREVO_SENDER_EMAIL) {
    console.error('submit: missing BREVO_API_KEY, NOTIFY_EMAIL or BREVO_SENDER_EMAIL');
    return json({ ok: false, error: 'not_configured' }, 500);
  }

  let form;
  try {
    form = await request.formData();
  } catch (err) {
    return json({ ok: false, error: 'bad_request' }, 400);
  }

  const formName = String(form.get('form-name') || '');
  const config = FORMS[formName];
  if (!config) {
    return json({ ok: false, error: 'unknown_form' }, 400);
  }

  // Collect only known fields, trimmed and length-capped.
  const fields = [];
  const data = {};
  for (const key of ALLOWED_FIELDS) {
    const raw = form.get(key);
    if (raw === null) continue;
    const value = String(raw).trim().slice(0, MAX_FIELD_LENGTH);
    if (!value) continue;
    data[key] = value;
    fields.push([key, value]);
  }

  if (!fields.length) {
    return json({ ok: false, error: 'empty_submission' }, 400);
  }

  const siteUrl = env.SITE_URL || 'https://arihahealthcare.com';
  const senderName = env.BREVO_SENDER_NAME || 'Ariha Healthcare Website';
  const recipients = env.NOTIFY_EMAIL.split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(email => ({ email }));

  const greeting =
    config.label === 'appointment'
      ? `Hii Dr. Jui, you got an appointment response from ${siteUrl}`
      : `Hii Dr. Jui, you got a new ${config.label} response from ${siteUrl}`;

  const textBody = greeting + '\n\n' + fields.map(([k, v]) => `${k}: ${v}`).join('\n') + '\n';

  const htmlBody =
    `<p>${escapeHtml(greeting.replace(siteUrl, ''))}<a href="${siteUrl}">${siteUrl}</a></p>` +
    '<table cellpadding="6" cellspacing="0" border="0">' +
    fields
      .map(
        ([k, v]) =>
          `<tr><td style="font-weight:600;vertical-align:top">${escapeHtml(k)}</td>` +
          `<td>${escapeHtml(v).replace(/\n/g, '<br>')}</td></tr>`
      )
      .join('') +
    '</table>';

  const subject = data.Name ? `${config.subject} - ${data.Name}` : config.subject;

  const payload = {
    sender: { name: senderName, email: env.BREVO_SENDER_EMAIL },
    to: recipients,
    subject,
    textContent: textBody,
    htmlContent: htmlBody
  };
  // Lets the clinic reply straight to the patient from their inbox.
  if (data.Email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.Email)) {
    payload.replyTo = { email: data.Email, name: data.Name || data.Email };
  }

  try {
    const res = await fetch(BREVO_EMAIL_ENDPOINT, {
      method: 'POST',
      headers: {
        'api-key': env.BREVO_API_KEY,
        'content-type': 'application/json',
        accept: 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error('brevo email failed', res.status, detail);
      return json({ ok: false, error: 'send_failed' }, 502);
    }
  } catch (err) {
    console.error('brevo email threw', err);
    return json({ ok: false, error: 'send_failed' }, 502);
  }

  // Newsletter signups also join the Brevo contact list, so campaigns can be
  // sent to them later. A failure here must not fail the submission.
  if (formName === 'newsletter-signups' && env.BREVO_LIST_ID && data.Email) {
    try {
      await fetch(BREVO_CONTACT_ENDPOINT, {
        method: 'POST',
        headers: {
          'api-key': env.BREVO_API_KEY,
          'content-type': 'application/json',
          accept: 'application/json'
        },
        body: JSON.stringify({
          email: data.Email,
          listIds: [Number(env.BREVO_LIST_ID)],
          updateEnabled: true
        })
      });
    } catch (err) {
      console.error('brevo contact add threw', err);
    }
  }

  return json({ ok: true });
}

// Anything other than POST gets a clear answer rather than a confusing 404.
export async function onRequest(context) {
  if (context.request.method === 'POST') return onRequestPost(context);
  return json({ ok: false, error: 'method_not_allowed' }, 405);
}
