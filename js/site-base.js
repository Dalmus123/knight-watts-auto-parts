/**
 * Site base helpers — works on BOTH:
 *   https://knightwatts.co.ke/                         (custom domain, apex)
 *   https://dalmus123.github.io/knight-watts-auto-parts/ (GitHub Pages project URL)
 *
 * Prefer deriving paths from location; never hardcode the repo subpath in callers.
 */
(function (global) {
  'use strict';

  var PROJECT_SEGMENT = 'knight-watts-auto-parts';
  var CANONICAL_ORIGIN = 'https://knightwatts.co.ke';

  /**
   * Site root path without trailing slash: '' or '/knight-watts-auto-parts'
   */
  function getSiteBasePath() {
    var path = '';
    try {
      path = (global.location && global.location.pathname) || '';
    } catch (_) {
      path = '';
    }
    var segments = path.split('/').filter(Boolean);
    if (segments[0] === PROJECT_SEGMENT) {
      return '/' + PROJECT_SEGMENT;
    }
    return '';
  }

  /** Absolute site root URL without trailing slash */
  function getSiteBaseUrl() {
    var origin = '';
    try {
      origin = (global.location && global.location.origin) || '';
    } catch (_) {
      origin = '';
    }
    return origin + getSiteBasePath();
  }

  /**
   * Build an absolute URL under the site root.
   * @param {string} relPath e.g. 'index.html', 'admin/', '/login.html'
   */
  function siteHref(relPath) {
    var base = getSiteBaseUrl().replace(/\/$/, '') + '/';
    var clean = String(relPath || '').replace(/^\//, '');
    try {
      return new URL(clean, base).href;
    } catch (_) {
      return base + clean;
    }
  }

  /** True when serving from the custom domain (apex or www) */
  function isCustomDomain() {
    try {
      var host = (global.location && global.location.hostname) || '';
      return host === 'knightwatts.co.ke' || host === 'www.knightwatts.co.ke';
    } catch (_) {
      return false;
    }
  }

  /**
   * Canonical public URL for SEO (apex). Paths stay relative to site root.
   * During DNS switchover, github.io still works for the app; canonical points at the new domain.
   */
  function canonicalHref(relPath) {
    var clean = String(relPath || '').replace(/^\//, '');
    return CANONICAL_ORIGIN.replace(/\/$/, '') + '/' + clean;
  }

  /** Suggested WebAuthn RP ID for the current host (passkeys are host-bound). */
  function passkeyRpId() {
    try {
      var host = (global.location && global.location.hostname) || '';
      if (host === 'www.knightwatts.co.ke' || host === 'knightwatts.co.ke') {
        return 'knightwatts.co.ke';
      }
      if (host.endsWith('github.io')) {
        return host; // e.g. dalmus123.github.io
      }
      if (host === 'localhost' || host === '127.0.0.1') {
        return host;
      }
      return host || 'knightwatts.co.ke';
    } catch (_) {
      return 'knightwatts.co.ke';
    }
  }

  var api = {
    PROJECT_SEGMENT: PROJECT_SEGMENT,
    CANONICAL_ORIGIN: CANONICAL_ORIGIN,
    getSiteBasePath: getSiteBasePath,
    getSiteBaseUrl: getSiteBaseUrl,
    siteHref: siteHref,
    isCustomDomain: isCustomDomain,
    canonicalHref: canonicalHref,
    passkeyRpId: passkeyRpId
  };

  global.KWSite = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
