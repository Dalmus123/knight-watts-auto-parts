/**
 * PWA / iOS navigation helpers
 * - Visible in-app Back control on every inner page (standalone has no swipe-back)
 * - Uses real history.back() when possible; falls back to index via assign (not replace)
 * - Marks display-mode on <html> for CSS (standalone vs browser)
 */
(function () {
    'use strict';

    var EDGE_GUARD_PX = 20;

    function homeHref() {
        var path = window.location.pathname || '';
        if (path.indexOf('/admin/') !== -1) {
            return '../index.html';
        }
        return 'index.html';
    }

    function isStorefrontHome() {
        var path = (window.location.pathname || '').replace(/\/+$/, '');
        var file = path.split('/').pop() || '';
        return file === '' || file === 'index.html' || file === 'knight-watts-auto-parts';
    }

    function detectDisplayMode() {
        var mode = 'browser';
        try {
            if (window.matchMedia('(display-mode: standalone)').matches) {
                mode = 'standalone';
            } else if (window.matchMedia('(display-mode: fullscreen)').matches) {
                mode = 'fullscreen';
            } else if (window.matchMedia('(display-mode: minimal-ui)').matches) {
                mode = 'minimal-ui';
            } else if (window.navigator.standalone === true) {
                // Legacy iOS home-screen launch
                mode = 'standalone';
            }
        } catch (_) { /* ignore */ }
        document.documentElement.setAttribute('data-display-mode', mode);
        document.documentElement.classList.toggle('is-standalone', mode === 'standalone' || mode === 'fullscreen');
        return mode;
    }

    function navigateBack(event) {
        if (event) {
            event.preventDefault();
        }

        var home = homeHref();
        var referrer = document.referrer || '';
        var canUseHistory = window.history.length > 1;

        if (canUseHistory && referrer) {
            try {
                var refUrl = new URL(referrer);
                if (refUrl.origin === window.location.origin) {
                    window.history.back();
                    return;
                }
            } catch (_) { /* ignore */ }
        }

        if (canUseHistory && (document.documentElement.classList.contains('is-standalone') || !referrer)) {
            window.history.back();
            return;
        }

        // Real navigation that pushes history (never location.replace)
        window.location.assign(home);
    }

    function ensureLogoLink(headerContent) {
        var logo = headerContent.querySelector('.logo');
        if (!logo || logo.closest('a.logo-link')) {
            return;
        }
        var link = document.createElement('a');
        link.className = 'logo-link';
        link.href = homeHref();
        link.setAttribute('aria-label', 'Knight Watts home');
        logo.parentNode.insertBefore(link, logo);
        link.appendChild(logo);
    }

    function injectBackButton() {
        if (isStorefrontHome()) {
            return;
        }
        if (document.getElementById('appBackBtn')) {
            return;
        }

        var headerContent = document.querySelector('.header .header-content');
        var mountParent = headerContent || document.body;
        var btn = document.createElement('a');
        btn.id = 'appBackBtn';
        btn.className = 'app-back-btn';
        btn.href = homeHref();
        btn.setAttribute('aria-label', 'Go back');
        btn.innerHTML =
            '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">' +
            '<polyline points="15 18 9 12 15 6"></polyline>' +
            '</svg>' +
            '<span class="app-back-label">Back</span>';
        btn.addEventListener('click', navigateBack);

        if (headerContent) {
            headerContent.insertBefore(btn, headerContent.firstChild);
            ensureLogoLink(headerContent);
        } else {
            // Auth pages without site header (login/signup)
            btn.classList.add('app-back-btn--floating');
            document.body.appendChild(btn);
        }
    }

    /**
     * Expose a helper so canvas / overlay touch code can ignore the left edge
     * where iOS swipe-back originates.
     */
    window.kwIsLeftEdgeGesture = function (clientX) {
        return typeof clientX === 'number' && clientX < EDGE_GUARD_PX;
    };

    window.kwNavigateBack = navigateBack;

    function init() {
        detectDisplayMode();
        injectBackButton();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
