// Netlify calls this automatically whenever a form submission is created.
// The name "submission-created" is what wires it up - do not rename it.
//
// Requires two environment variables, set in Netlify:
//   RESEND_API_KEY   - API key from resend.com
//   NOTIFY_EMAIL     - where the notification goes
//
// Until RESEND_API_KEY is set the function exits quietly, so submissions are
// still stored by Netlify and nothing breaks.

const SITE_URL = 'https://arihahealthcare.com';

// order the fields the way they appear on the form
const FIELD_ORDER = ['Page', 'Name', 'Email', 'Phone', 'Service', 'Appointment Date', 'Message'];

function orderFields(data) {
  const seen = new Set(FIELD_ORDER);
  const ordered = FIELD_ORDER.filter(function (k) {
    return data[k] !== undefined && data[k] !== '';
  }).map(function (k) {
    return [k, data[k]];
  });
  // anything not in the known list still gets included
  Object.keys(data).forEach(function (k) {
    if (!seen.has(k) && data[k]) ordered.push([k, data[k]]);
  });
  return ordered;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

exports.handler = async function (event) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.NOTIFY_EMAIL;
  if (!apiKey || !to) {
    console.log('RESEND_API_KEY or NOTIFY_EMAIL not set - skipping notification');
    return { statusCode: 200, body: 'skipped' };
  }

  let payload;
  try {
    payload = JSON.parse(event.body).payload;
  } catch (err) {
    console.error('could not parse submission payload', err);
    return { statusCode: 400, body: 'bad payload' };
  }

  const formName = payload.form_name || 'form';
  const fields = orderFields(payload.data || {});

  const isAppointment = formName === 'appointments';
  const greeting = isAppointment
    ? 'Hii Dr. Jui, you got an appointment response from ' + SITE_URL
    : 'Hii Dr. Jui, you got a new ' + formName + ' response from ' + SITE_URL;

  const textBody =
    greeting +
    '\n\n' +
    fields
      .map(function (pair) {
        return pair[0] + ': ' + pair[1];
      })
      .join('\n') +
    '\n';

  const htmlBody =
    '<p>' + escapeHtml(greeting.replace(SITE_URL, '')) +
    '<a href="' + SITE_URL + '">' + SITE_URL + '</a></p>' +
    '<table cellpadding="6" cellspacing="0" border="0">' +
    fields
      .map(function (pair) {
        return (
          '<tr><td style="font-weight:600;vertical-align:top">' +
          escapeHtml(pair[0]) +
          '</td><td>' +
          escapeHtml(pair[1]).replace(/\n/g, '<br>') +
          '</td></tr>'
        );
      })
      .join('') +
    '</table>';

  const subject = isAppointment
    ? 'New appointment request' + (payload.data && payload.data.Name ? ' - ' + payload.data.Name : '')
    : 'New ' + formName + ' submission';

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: process.env.NOTIFY_FROM || 'Ariha Healthcare <onboarding@resend.dev>',
        to: to.split(',').map(function (s) { return s.trim(); }),
        reply_to: (payload.data && payload.data.Email) || undefined,
        subject: subject,
        text: textBody,
        html: htmlBody
      })
    });

    if (!res.ok) {
      console.error('email send failed', res.status, await res.text());
      return { statusCode: 200, body: 'send failed' };
    }
    return { statusCode: 200, body: 'sent' };
  } catch (err) {
    console.error('email send threw', err);
    return { statusCode: 200, body: 'error' };
  }
};
