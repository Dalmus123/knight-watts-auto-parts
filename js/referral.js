/**
 * Sales referral attribution helper (storefront)
 * Captures ?ref=CODE from the URL and persists for checkout.
 */
(function () {
    const STORAGE_KEY = 'kw_referral_code';
    const ATTR_KEY = 'kw_referral_source';

    function normalizeCode(raw) {
        return String(raw || '')
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, '')
            .slice(0, 16);
    }

    function captureFromUrl() {
        try {
            const params = new URLSearchParams(window.location.search);
            const ref = normalizeCode(params.get('ref') || params.get('referral'));
            if (ref.length >= 4) {
                localStorage.setItem(STORAGE_KEY, ref);
                localStorage.setItem(ATTR_KEY, 'referral_link');
                return ref;
            }
        } catch (_) { /* ignore */ }
        return null;
    }

    function getReferralCode() {
        captureFromUrl();
        try {
            return normalizeCode(localStorage.getItem(STORAGE_KEY) || '');
        } catch (_) {
            return '';
        }
    }

    function getReferralSource() {
        try {
            return localStorage.getItem(ATTR_KEY) || 'referral_code';
        } catch (_) {
            return 'referral_code';
        }
    }

    function setReferralCode(code, source) {
        const norm = normalizeCode(code);
        if (norm.length < 4) return false;
        try {
            localStorage.setItem(STORAGE_KEY, norm);
            localStorage.setItem(ATTR_KEY, source || 'referral_code');
        } catch (_) { /* ignore */ }
        return true;
    }

    function clearReferral() {
        try {
            localStorage.removeItem(STORAGE_KEY);
            localStorage.removeItem(ATTR_KEY);
        } catch (_) { /* ignore */ }
    }

    captureFromUrl();

    window.kwReferral = {
        getCode: getReferralCode,
        getSource: getReferralSource,
        setCode: setReferralCode,
        clear: clearReferral,
        captureFromUrl
    };
})();
