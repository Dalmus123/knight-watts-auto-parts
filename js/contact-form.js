/**
 * Contact form → Supabase (public.contact_messages)
 *
 * - Insert-only from the browser (RLS); staff read it in Admin → Messages.
 * - Honeypot field ("website") + client-side rate limit to cut spam.
 *   (The database enforces its own length checks and a per-sender throttle.)
 * - An email notification to info@ is sent server-side by the contact-notify
 *   Edge Function via a database webhook. This form never calls it, so the
 *   message is saved and the form succeeds even if that function isn't deployed.
 */
(function (global) {
  'use strict';

  var LOG_KEY = 'kw_contact_submissions';
  var MIN_GAP_MS = 30 * 1000;          // at least 30 s between sends
  var MAX_PER_HOUR = 3;                // and at most 3 per hour per browser
  var HOUR_MS = 60 * 60 * 1000;
  var FALLBACK = 'Please email info@knightwatts.co.ke or use the phone / WhatsApp details on this page.';

  function readLog() {
    try {
      var raw = JSON.parse(global.localStorage.getItem(LOG_KEY) || '[]');
      var cutoff = Date.now() - HOUR_MS;
      return Array.isArray(raw) ? raw.filter(function (t) { return typeof t === 'number' && t > cutoff; }) : [];
    } catch (_) { return []; }
  }

  function writeLog(log) {
    try { global.localStorage.setItem(LOG_KEY, JSON.stringify(log)); } catch (_) { /* private mode */ }
  }

  /** Returns a user-facing message if the browser should be throttled, else ''. */
  function rateLimitMessage() {
    var log = readLog();
    var now = Date.now();
    if (log.length && now - log[log.length - 1] < MIN_GAP_MS) {
      return 'Please wait a few seconds before sending another message.';
    }
    if (log.length >= MAX_PER_HOUR) {
      return 'You have sent several messages recently. Please try again later, or contact us by phone / WhatsApp.';
    }
    return '';
  }

  function setStatus(el, kind, text) {
    if (!el) return;
    el.textContent = text || '';
    el.className = 'contact-form-status' + (kind ? ' is-' + kind : '');
  }

  function clean(v, max) {
    return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
  }

  async function getClient() {
    var bi = global.backendIntegration;
    if (bi && typeof bi.waitForInit === 'function') {
      try { await bi.waitForInit(); } catch (_) { /* fall through */ }
      if (typeof bi.getClient === 'function' && bi.getClient()) return bi.getClient();
    }
    if (typeof global.isConfigured === 'function' && global.isConfigured() &&
        typeof global.initSupabase === 'function') {
      return global.initSupabase();
    }
    return null;
  }

  async function submitContactForm(form) {
    var statusEl = document.getElementById('contactFormStatus');
    var btn = document.getElementById('contactSubmitBtn');
    var data = new FormData(form);

    // Honeypot: real visitors never see/fill this. Pretend success, send nothing.
    if (clean(data.get('website'), 200)) {
      setStatus(statusEl, 'success', 'Thank you! We have received your message and will contact you shortly.');
      form.reset();
      return;
    }

    var limited = rateLimitMessage();
    if (limited) { setStatus(statusEl, 'error', limited); return; }

    var row = {
      name: clean(data.get('name'), 100),
      phone: clean(data.get('phone'), 30) || null,
      email: clean(data.get('email'), 254) || null,
      topic: clean(data.get('topic'), 40) || 'general',
      vehicle: clean(data.get('vehicle'), 120) || null,
      // keep line breaks in the message, just trim and cap the length
      message: String(data.get('message') || '').trim().slice(0, 2000),
      source: clean(form.getAttribute('data-source') || global.location.pathname, 100)
    };

    if (!row.name || row.message.length < 5) {
      setStatus(statusEl, 'error', 'Please enter your name and a message of at least a few words.');
      return;
    }
    if (!row.phone && !row.email) {
      setStatus(statusEl, 'error', 'Please give us a phone number or an email so we can reply.');
      return;
    }

    if (btn) { btn.disabled = true; btn.dataset.label = btn.textContent; btn.textContent = 'Sending…'; }
    setStatus(statusEl, 'info', 'Sending your message…');

    try {
      var client = await getClient();
      if (!client) throw new Error('backend-unavailable');

      var result = await client.from('contact_messages').insert(row);
      if (result.error) {
        var err = result.error;
        if (err.code === 'KW001') {
          setStatus(statusEl, 'error', 'We already received several messages from you in the last hour. We will reply soon, or contact us by phone / WhatsApp.');
        } else if (err.code === '23514') {
          setStatus(statusEl, 'error', 'Some details look invalid (check the email address, phone number and message length) and try again.');
        } else {
          console.error('[contact] insert failed', err);
          setStatus(statusEl, 'error', 'Sorry, we could not send your message. ' + FALLBACK);
        }
        return;
      }

      var log = readLog(); log.push(Date.now()); writeLog(log);
      setStatus(statusEl, 'success', 'Thank you! We have received your message and will contact you shortly.');
      form.reset();
    } catch (e) {
      console.error('[contact] submit error', e);
      setStatus(statusEl, 'error', 'Sorry, we could not send your message. ' + FALLBACK);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = btn.dataset.label || 'Send Inquiry'; }
    }
  }

  global.submitContactForm = submitContactForm;
})(window);
