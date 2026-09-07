// Ariha Healthcare — form submission via Netlify Forms.
// Runs in the capture phase so it intercepts the submit before the bundled
// site JS can hijack it; only touches forms marked data-netlify.
(function () {
  function encode(form) {
    // URLSearchParams encodes spaces as "+", which is what
    // application/x-www-form-urlencoded expects. encodeURIComponent emits
    // %20, which is not reliably accepted for field names containing spaces.
    var params = new URLSearchParams();
    new FormData(form).forEach(function (value, key) {
      params.append(key, value);
    });
    return params.toString();
  }

  // Phone: digits only, 9-10 of them. The pattern attribute blocks submit;
  // this stops anything non-numeric being typed or pasted in the first place.
  document.addEventListener('input', function (e) {
    var el = e.target;
    if (!el || el.name !== 'Phone') return;
    var digits = el.value.replace(/\D/g, '').slice(0, 10);
    if (el.value !== digits) el.value = digits;
    el.setCustomValidity(
      digits.length === 0 || digits.length === 9 || digits.length === 10
        ? ''
        : 'Please enter a 9 or 10 digit phone number.'
    );
  });

  // Date inputs: CSS greys the dd-mm-yyyy placeholder until a date is picked,
  // but it can't tell empty from filled on an optional field (:valid matches
  // both). Flag the filled state explicitly instead.
  function markDate(el) {
    if (el.value) el.setAttribute('data-filled', '');
    else el.removeAttribute('data-filled');
  }

  function markDates(root) {
    var fields = (root || document).querySelectorAll('.appointment-date');
    for (var i = 0; i < fields.length; i++) markDate(fields[i]);
  }

  document.addEventListener('input', function (e) {
    var el = e.target;
    if (el && el.classList && el.classList.contains('appointment-date')) markDate(el);
  });
  document.addEventListener('change', function (e) {
    var el = e.target;
    if (el && el.classList && el.classList.contains('appointment-date')) markDate(el);
  });
  // form.reset() empties the fields without firing input/change
  document.addEventListener('reset', function (e) {
    setTimeout(function () { markDates(e.target); }, 0);
  });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { markDates(); });
  } else {
    markDates();
  }

  // Appointment date: refuse days the clinic is closed ------------------
  // /api/availability returns the days Dr. Shah has marked away on the
  // clinic's Google Calendar plus the weekly closed day. A native date input
  // can only do min/max - it cannot grey out individual days - so the block
  // happens on selection instead, with the reason shown next to the field.
  var availability = null;

  function appointmentDateField() {
    return document.querySelector('input[name="Appointment Date"]');
  }

  function dateIsBlocked(value) {
    if (!availability || !value) return false;
    if (availability.blockedDates.indexOf(value) !== -1) return true;
    var parts = value.split('-');
    if (parts.length !== 3) return false;
    var day = new Date(Date.UTC(+parts[0], +parts[1] - 1, +parts[2])).getUTCDay();
    return availability.closedWeekdays.indexOf(day) !== -1;
  }

  function fieldNotice(el) {
    // the input sits inside a .code-embed-3 wrapper - hang the message off
    // the field block itself so it lands under the input, not inside it
    var host = el.closest ? el.closest('.date-field') || el.parentElement : el.parentElement;
    var note = host.querySelector('.field-notice');
    if (!note) {
      note = document.createElement('div');
      note.className = 'field-notice';
      note.setAttribute('role', 'status');
      host.appendChild(note);
    }
    return note;
  }

  function showDateNotice(el, message) {
    var note = fieldNotice(el);
    note.textContent = message || '';
    note.style.display = message ? 'block' : 'none';
  }

  function checkAppointmentDate(el) {
    if (!el) return;
    if (!dateIsBlocked(el.value)) {
      el.setCustomValidity('');
      showDateNotice(el, '');
      return;
    }
    var chosen = readableDate(el.value);
    el.value = '';
    markDate(el);
    el.setCustomValidity('');
    showDateNotice(
      el,
      'The clinic is closed on ' + chosen + '. Please choose another date.'
    );
  }

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  // "2026-10-13" reads as a machine string in a message meant for a patient
  function readableDate(value) {
    var parts = String(value || '').split('-');
    if (parts.length !== 3) return value;
    var month = MONTHS[Number(parts[1]) - 1];
    if (!month) return value;
    return Number(parts[2]) + ' ' + month + ' ' + parts[0];
  }

  document.addEventListener('change', function (e) {
    var el = e.target;
    if (el && el.name === 'Appointment Date') checkAppointmentDate(el);
  });

  function loadAvailability() {
    if (!appointmentDateField()) return;
    fetch('/api/availability', { headers: { accept: 'application/json' } })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        if (!data || !Array.isArray(data.blockedDates)) return;
        availability = {
          blockedDates: data.blockedDates,
          closedWeekdays: Array.isArray(data.closedWeekdays) ? data.closedWeekdays : []
        };
        // a date may already be filled in from a restored form
        checkAppointmentDate(appointmentDateField());
      })
      .catch(function () {
        // No endpoint (local preview, or the function is down). Booking must
        // still work, so leave every date selectable.
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadAvailability);
  } else {
    loadAvailability();
  }

  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (!form || !form.hasAttribute) return;

    // Search box: never submit anywhere. Inline onsubmit is not enough here,
    // the bundled site JS binds its own handler and posts regardless.
    if (form.hasAttribute('data-no-submit')) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      return;
    }

    // Every handled form carries a hidden form-name identifying it to the
    // /api/submit function.
    var nameField = form.querySelector('input[name="form-name"]');
    if (!nameField) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    if (form.dataset.sending === '1') return;
    form.dataset.sending = '1';

    // fallback: if the page label is missing, record the path so a submission
    // is never left without a source
    var pageField = form.querySelector('input[name="Page"]');
    if (pageField && !pageField.value) pageField.value = location.pathname;

    var wrapper = form.closest('.w-form') || form.parentElement;
    var done = wrapper ? wrapper.querySelector('.w-form-done') : null;
    var fail = wrapper ? wrapper.querySelector('.w-form-fail') : null;
    var button = form.querySelector('input[type="submit"], button[type="submit"]');
    var label = button ? (button.value || button.textContent) : '';
    var waiting = button ? (button.getAttribute('data-wait') || 'Please wait...') : '';

    if (button) {
      if (button.tagName === 'INPUT') button.value = waiting;
      else button.textContent = waiting;
      button.disabled = true;
    }

    fetch('/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: encode(form)
    })
      .then(function (res) {
        // The server re-checks the date against the calendar. A 409 means the
        // day was blocked after this page loaded - say so at the field rather
        // than showing the generic "something went wrong".
        if (res.status === 409) {
          return res.json().then(function (body) {
            if (body && body.error === 'date_unavailable') {
              var el = appointmentDateField();
              if (el) {
                el.value = '';
                markDate(el);
                showDateNotice(
                  el,
                  'That date has just been marked unavailable. Please choose another.'
                );
                el.focus();
              }
              availability = null;
              loadAvailability();
              return null; // handled - don't fall through to the success path
            }
            throw new Error('HTTP 409');
          });
        }
        if (!res.ok) throw new Error('HTTP ' + res.status);
        if (fail) fail.style.display = 'none';

        // Forms with data-inline-success confirm in place - the field row is
        // swapped for the message so the layout doesn't jump. Used by the
        // newsletter, where the default grey panel replaced the whole pill.
        var inline = form.getAttribute('data-inline-success');
        var target = form.querySelector('[data-success-target]');
        if (inline && target) {
          var msg = document.createElement('div');
          msg.className = 'form-inline-success';
          msg.setAttribute('role', 'status');
          msg.textContent = inline;
          target.innerHTML = '';
          target.appendChild(msg);
          return;
        }

        form.style.display = 'none';
        if (done) done.style.display = 'block';
        form.reset();
      })
      .catch(function () {
        if (fail) fail.style.display = 'block';
      })
      .finally(function () {
        form.dataset.sending = '';
        if (button) {
          button.disabled = false;
          if (button.tagName === 'INPUT') button.value = label;
          else button.textContent = label;
        }
      });
  }, true);
})();
