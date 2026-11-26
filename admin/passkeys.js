/**
 * Passkey (WebAuthn) helpers for Knight Watts admin portal.
 * Uses Supabase Auth experimental passkey API (registerPasskey / signInWithPasskey).
 * Password remains the fallback. Never uses the service role key.
 */

let passkeyConditionalAbort = null;

function passkeysSupported() {
  return !!(window.PublicKeyCredential && navigator.credentials);
}

function getPasskeyErrorMessage(error) {
  const code = error?.code || error?.error_code || '';
  // supabase-js wraps many browser failures as "a Non-Webauthn related error…"
  // with the real DOMException on `.cause` / `.originalError` — always prefer that.
  const cause = error?.cause || error?.originalError || null;
  const causeMsg = cause?.message || (typeof cause === 'string' ? cause : '');
  const msg = (causeMsg || error?.message || String(error || '')).toLowerCase();
  const raw = causeMsg || error?.message || 'Passkey operation failed.';

  if (code === 'passkey_disabled' || msg.includes('passkey_disabled')) {
    return 'Passkeys are not enabled on this Supabase project yet. Ask an admin to turn on Authentication → Passkeys.';
  }
  if (
    msg.includes('already pending') ||
    msg.includes('another request') ||
    msg.includes('operation is not allowed at this time')
  ) {
    return 'Another WebAuthn prompt was still open (login passkey autofill). Dismiss it or reload, then try Register passkey again.';
  }
  if (msg.includes('not allowed') || msg.includes('abort') || code === 'ERROR_CEREMONY_ABORTED') {
    return 'Passkey prompt was cancelled or blocked by the browser.';
  }
  if (msg.includes('excludecredentials') || code === 'webauthn_credential_exists') {
    return 'This device already has a passkey for this account.';
  }
  if (msg.includes('security') && msg.includes('rp')) {
    return raw;
  }
  // Surface the underlying browser message when supabase-js used its generic wrapper
  if ((error?.message || '').toLowerCase().includes('non-webauthn') && causeMsg) {
    return causeMsg;
  }
  return raw;
}

/** Cancel Conditional UI / any in-flight login passkey ceremony before create() or leaving login. */
function abortPasskeyConditionalUI(reason) {
  if (passkeyConditionalAbort) {
    try {
      passkeyConditionalAbort.abort(reason || 'abort-passkey-conditional-ui');
    } catch (_) { /* ignore */ }
    passkeyConditionalAbort = null;
  }
}

/**
 * Start Conditional UI (autofill) for discoverable passkeys.
 * Requires email input autocomplete="username webauthn".
 */
async function startPasskeyConditionalUI(supabase, onSuccess, onError) {
  if (!supabase?.auth?.signInWithPasskey || !passkeysSupported()) return;

  // Only start Conditional UI when the login form is actually visible
  const loginScreen = document.getElementById('loginScreen');
  if (loginScreen && loginScreen.style.display === 'none') return;

  try {
    if (typeof PublicKeyCredential !== 'undefined' &&
        typeof PublicKeyCredential.isConditionalMediationAvailable === 'function') {
      const ok = await PublicKeyCredential.isConditionalMediationAvailable();
      if (!ok) return;
    }

    abortPasskeyConditionalUI('restart-conditional-ui');
    passkeyConditionalAbort = new AbortController();

    // IMPORTANT: pass our AbortSignal so we can cancel before registerPasskey().
    // supabase-js registerPasskey uses a separate abort service and will NOT cancel
    // this ceremony unless we abort this signal ourselves — concurrent get()+create()
    // is what produces the opaque "Non-Webauthn related error has occurred".
    const { data, error } = await supabase.auth.signInWithPasskey({
      options: {
        mediation: 'conditional',
        signal: passkeyConditionalAbort.signal
      }
    });

    if (error) {
      // Conditional UI often aborts when user picks password / we cancel for register
      const quiet =
        error.name === 'AbortError' ||
        (error.message || '').toLowerCase().includes('abort') ||
        error.code === 'ERROR_CEREMONY_ABORTED' ||
        (error.cause && String(error.cause.message || error.cause).toLowerCase().includes('abort'));
      if (!quiet && onError) onError(error);
      return;
    }

    if (data?.session && onSuccess) onSuccess(data);
  } catch (error) {
    const quiet =
      error?.name === 'AbortError' ||
      (error?.message || '').toLowerCase().includes('abort');
    if (!quiet && onError) onError(error);
  }
}

async function signInWithPasskeyExplicit(supabase) {
  if (!supabase?.auth?.signInWithPasskey) {
    throw new Error('Passkey API unavailable. Upgrade @supabase/supabase-js to v2.105+ and enable experimental.passkey.');
  }
  const { data, error } = await supabase.auth.signInWithPasskey();
  if (error) throw error;
  return data;
}

async function registerPasskey(supabase) {
  if (!supabase?.auth?.registerPasskey) {
    throw new Error('Passkey registration unavailable. Enable Passkeys in the Supabase dashboard and use supabase-js ≥ 2.105.');
  }
  // Cancel login Conditional UI first — browsers reject concurrent WebAuthn ceremonies
  abortPasskeyConditionalUI('before-register-passkey');
  const { data, error } = await supabase.auth.registerPasskey();
  if (error) {
    // Help debug in DevTools: cause holds the real DOMException from credentials.create()
    console.warn('[passkeys] registerPasskey failed', {
      message: error.message,
      code: error.code || error.error_code,
      cause: error.cause || error.originalError || null,
      error
    });
    throw error;
  }
  return data;
}

async function listPasskeys(supabase) {
  if (!supabase?.auth?.passkey?.list) return [];
  const { data, error } = await supabase.auth.passkey.list();
  if (error) throw error;
  return data || [];
}

async function deletePasskey(supabase, passkeyId) {
  const { error } = await supabase.auth.passkey.delete({ passkeyId });
  if (error) throw error;
}

async function renamePasskey(supabase, passkeyId, friendlyName) {
  const { error } = await supabase.auth.passkey.update({ passkeyId, friendlyName });
  if (error) throw error;
}

/** Security page: list + register + remove passkeys */
async function loadSecurityPasskeysPage() {
  const content = document.getElementById('contentArea');
  if (!content) return;

  content.innerHTML = `
    <div class="role-dash-intro">
      <p class="role-dash-eyebrow">Account security</p>
      <h2 class="role-dash-title">Passkeys</h2>
      <p class="role-dash-sub">Register Face ID / Touch ID after a password sign-in. Password remains available as fallback.</p>
    </div>
    <div class="table-container">
      <div class="table-header">
        <h3>Your passkeys</h3>
        <button type="button" class="btn btn-primary" id="registerPasskeyBtn">Register passkey</button>
      </div>
      <div id="passkeysList"><div class="empty-state"><p>Loading…</p></div></div>
      <p class="role-dash-hint" style="padding: 12px 16px;">
        On Mac: Safari uses iCloud Keychain. Chrome needs the iCloud Passwords extension or its own passkey store.
        Dashboard: Authentication → Passkeys must be enabled
        (RP ID <code id="passkeyRpIdHint">${typeof KWSite !== 'undefined' ? KWSite.passkeyRpId() : (location.hostname || 'knightwatts.co.ke')}</code>).
        Existing passkeys are bound to one RP ID — re-register after moving to <code>knightwatts.co.ke</code>.
      </p>
    </div>
  `;

  const btn = document.getElementById('registerPasskeyBtn');
  if (btn) {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Waiting for Face ID / Touch ID…';
      try {
        await registerPasskey(supabaseClient);
        if (typeof showSuccess === 'function') showSuccess('Passkey registered. You can sign in with it next time.');
        await refreshPasskeysList();
      } catch (error) {
        if (typeof showError === 'function') showError(getPasskeyErrorMessage(error));
        else alert(getPasskeyErrorMessage(error));
      } finally {
        btn.disabled = false;
        btn.textContent = 'Register passkey';
      }
    });
  }

  await refreshPasskeysList();
}

async function refreshPasskeysList() {
  const box = document.getElementById('passkeysList');
  if (!box) return;
  try {
    const keys = await listPasskeys(supabaseClient);
    if (!keys.length) {
      box.innerHTML = '<div class="empty-state"><p>No passkeys yet. Register one on this device after signing in with your password.</p></div>';
      return;
    }
    box.innerHTML = `
      <table class="data-table">
        <thead><tr><th>Name</th><th>Created</th><th>Last used</th><th></th></tr></thead>
        <tbody>
          ${keys.map((k) => `
            <tr>
              <td>${escapePasskeyHtml(k.friendly_name || 'Passkey')}</td>
              <td>${k.created_at ? formatDate(k.created_at) : '—'}</td>
              <td>${k.last_used_at ? formatDate(k.last_used_at) : '—'}</td>
              <td>
                <button type="button" class="action-btn action-btn-secondary" data-del-passkey="${escapePasskeyHtml(k.id)}">Remove</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>`;
    box.querySelectorAll('[data-del-passkey]').forEach((el) => {
      el.addEventListener('click', async () => {
        if (!confirm('Remove this passkey?')) return;
        try {
          await deletePasskey(supabaseClient, el.dataset.delPasskey);
          await refreshPasskeysList();
        } catch (error) {
          alert(getPasskeyErrorMessage(error));
        }
      });
    });
  } catch (error) {
    box.innerHTML = `<div class="empty-state"><p>${escapePasskeyHtml(getPasskeyErrorMessage(error))}</p></div>`;
  }
}

function escapePasskeyHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Wire login form: conditional UI + explicit passkey button.
 * @param {object} opts
 * @param {object} opts.supabase
 * @param {string} opts.passkeyButtonId
 * @param {string} opts.errorDivId
 * @param {function} [opts.onSignedIn]
 */
function wirePasskeyLoginUI(opts) {
  const {
    supabase,
    passkeyButtonId,
    errorDivId,
    onSignedIn
  } = opts;

  const showErr = (err) => {
    const el = document.getElementById(errorDivId);
    if (!el) return;
    el.textContent = getPasskeyErrorMessage(err);
    el.style.display = 'block';
  };

  // Conditional UI once the login screen is visible
  startPasskeyConditionalUI(
    supabase,
    (data) => { if (onSignedIn) onSignedIn(data); },
    showErr
  );

  const btn = document.getElementById(passkeyButtonId);
  if (btn) {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      btn.disabled = true;
      const original = btn.textContent;
      btn.textContent = 'Waiting for passkey…';
      try {
        const data = await signInWithPasskeyExplicit(supabase);
        if (onSignedIn) onSignedIn(data);
      } catch (error) {
        showErr(error);
      } finally {
        btn.disabled = false;
        btn.textContent = original;
      }
    });
  }
}

window.passkeysSupported = passkeysSupported;
window.getPasskeyErrorMessage = getPasskeyErrorMessage;
window.abortPasskeyConditionalUI = abortPasskeyConditionalUI;
window.startPasskeyConditionalUI = startPasskeyConditionalUI;
window.signInWithPasskeyExplicit = signInWithPasskeyExplicit;
window.registerPasskey = registerPasskey;
window.listPasskeys = listPasskeys;
window.deletePasskey = deletePasskey;
window.loadSecurityPasskeysPage = loadSecurityPasskeysPage;
window.wirePasskeyLoginUI = wirePasskeyLoginUI;
