// Ariha Healthcare — form submission via Netlify Forms.
// Runs in the capture phase so it intercepts the submit before the bundled
// site JS can hijack it; only touches forms marked data-netlify.
(function () {
  function encode(form) {
    var data = new FormData(form);
    var pairs = [];
    data.forEach(function (value, key) {
      pairs.push(encodeURIComponent(key) + '=' + encodeURIComponent(value));
    });
    return pairs.join('&');
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
