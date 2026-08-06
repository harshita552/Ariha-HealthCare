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

    // Netlify strips data-netlify from the served HTML once it registers the
    // form at build time, so that attribute is absent in production. Key off
    // the hidden form-name input instead, which survives.
    var nameField = form.querySelector('input[name="form-name"]');
    if (!nameField && !form.hasAttribute('data-netlify')) return;

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

    fetch('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: encode(form)
    })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        form.style.display = 'none';
        if (fail) fail.style.display = 'none';
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
