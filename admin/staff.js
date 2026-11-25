/**
 * Staff User Management — Add Staff, list, role/disable/reset via Edge Function.
 * Depends on: supabaseClient, currentUser, currentUserProfile, formatDate, escapeHtml,
 *             salesAttachDeliberateActivate (sales.js) or local tap helper
 */

const STAFF_CEO_ROLES = ['cfo', 'coo', 'cos', 'chief_of_sales', 'sales_rep', 'print_operator', 'hq_readonly'];
const STAFF_COS_ROLES = ['chief_of_sales', 'sales_rep'];

function canManageStaffPortal() {
  const r = currentUserProfile?.role;
  return ['owner', 'admin', 'ceo', 'cos'].includes(r);
}

function isStaffCeoLike() {
  return ['owner', 'admin', 'ceo'].includes(currentUserProfile?.role);
}

function assignableRolesForCaller() {
  return isStaffCeoLike() ? STAFF_CEO_ROLES : STAFF_COS_ROLES;
}

function generateTempPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$';
  let out = '';
  const arr = new Uint32Array(14);
  crypto.getRandomValues(arr);
  for (let i = 0; i < arr.length; i++) out += chars[arr[i] % chars.length];
  return out;
}

async function invokeStaffAdmin(body) {
  const { data, error } = await supabaseClient.functions.invoke('admin-create-staff', {
    body
  });
  if (error) {
    let msg = error.message || 'Request failed';
    try {
      if (error.context && typeof error.context.json === 'function') {
        const j = await error.context.json();
        if (j?.error) msg = j.error;
      }
    } catch (_) { /* ignore */ }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

function staffAttachTap(el, fn) {
  if (!el) return;
  if (typeof salesAttachDeliberateActivate === 'function') {
    salesAttachDeliberateActivate(el, fn);
    return;
  }
  let touchHandled = false;
  el.addEventListener('touchend', (e) => {
    e.preventDefault();
    touchHandled = true;
    fn(e);
    setTimeout(() => { touchHandled = false; }, 400);
  }, { passive: false });
  el.addEventListener('click', (e) => {
    if (touchHandled) return;
    fn(e);
  });
}

async function loadUsers() {
  const content = document.getElementById('contentArea');
  if (!canManageStaffPortal()) {
    content.innerHTML = '<div class="empty-state"><h3>Access Denied</h3></div>';
    return;
  }

  const showAdd = canManageStaffPortal();
  content.innerHTML = `
    <div class="table-container">
      <div class="table-header" style="flex-wrap:wrap;gap:10px;">
        <h3>User Management</h3>
        <div style="display:flex;flex-wrap:wrap;gap:8px;">
          ${showAdd ? '<button type="button" class="btn btn-primary" id="addStaffBtn">Add Staff</button>' : ''}
          <button type="button" class="btn btn-outline" id="switchAccountBtn">Switch account</button>
        </div>
      </div>
      <p class="role-dash-hint" style="padding:0 16px 12px;">
        ${isStaffCeoLike()
          ? 'Create staff with a temporary password (they must set their own on first login) or send an invite email.'
          : 'As Chief of Staff you can add and manage Head of Sales and sales reps only.'}
      </p>
      <div id="usersTable">
        <div style="padding:40px;text-align:center;">
          <div class="loading-spinner"></div>
          <p style="margin-top:16px;color:var(--text-muted);">Loading users…</p>
        </div>
      </div>
    </div>
  `;

  staffAttachTap(document.getElementById('addStaffBtn'), () => openAddStaffModal());
  staffAttachTap(document.getElementById('switchAccountBtn'), () => openSignInUserModal());

  await refreshUsersTable();
}

async function refreshUsersTable() {
  const container = document.getElementById('usersTable');
  if (!container) return;
  try {
    const data = await invokeStaffAdmin({ action: 'list' });
    renderUsersTable(data.users || []);
  } catch (error) {
    console.error('Load users error:', error);
    // Fallback: direct profiles read (may lack last_sign_in)
    try {
      let q = supabaseClient
        .from('user_profiles')
        .select('id, email, full_name, role, location, created_at, must_change_password')
        .order('created_at', { ascending: false });
      if (!isStaffCeoLike()) {
        q = q.in('role', ['sales_rep', 'chief_of_sales', 'cos']);
      }
      const { data: users, error } = await q;
      if (error) throw error;
      renderUsersTable(users || []);
    } catch (e2) {
      container.innerHTML = `
        <div class="empty-state">
          <h3>Could not load users</h3>
          <p style="color:var(--text-muted);">${escapeHtml(error.message || e2.message || 'Unknown error')}</p>
        </div>`;
    }
  }
}

function renderUsersTable(users) {
  const container = document.getElementById('usersTable');
  if (!container) return;

  if (!users || users.length === 0) {
    container.innerHTML = '<div class="empty-state"><h3>No Users</h3></div>';
    return;
  }

  const html = `
    <div class="table-scroll-x">
    <table class="data-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Email</th>
          <th>Role</th>
          <th>Last sign-in</th>
          <th>Status</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${users.map((user) => {
          const isSelf = user.id === currentUser?.id;
          const disabled = !!user.disabled;
          const mustChange = !!user.must_change_password;
          return `
          <tr>
            <td><strong>${escapeHtml(user.full_name || 'N/A')}</strong></td>
            <td>${escapeHtml(user.email || '')}</td>
            <td><span class="status-badge">${escapeHtml(user.role)}</span></td>
            <td>${user.last_sign_in_at ? formatDate(user.last_sign_in_at) : '—'}</td>
            <td>
              ${disabled ? '<span class="status-badge failed">Disabled</span>' : '<span class="status-badge confirmed">Active</span>'}
              ${mustChange ? '<span class="status-badge pending" style="margin-left:4px;">Must change password</span>' : ''}
            </td>
            <td>
              ${isSelf ? '<em>Signed in</em>' : `
                <div class="staff-actions">
                  <button type="button" class="action-btn action-btn-secondary" data-staff-action="role" data-id="${escapeHtml(user.id)}" data-role="${escapeHtml(user.role)}">Role</button>
                  <button type="button" class="action-btn action-btn-secondary" data-staff-action="reset" data-id="${escapeHtml(user.id)}">Reset pwd</button>
                  <button type="button" class="action-btn action-btn-secondary" data-staff-action="${disabled ? 'enable' : 'disable'}" data-id="${escapeHtml(user.id)}">${disabled ? 'Enable' : 'Disable'}</button>
                </div>`}
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
    </div>`;

  container.innerHTML = html;
  container.querySelectorAll('[data-staff-action]').forEach((btn) => {
    staffAttachTap(btn, () => handleStaffRowAction(btn.dataset.staffAction, btn.dataset.id, btn.dataset.role));
  });
}

async function handleStaffRowAction(action, userId, currentRole) {
  try {
    if (action === 'role') {
      const roles = assignableRolesForCaller();
      const next = prompt(`New role (${roles.join(', ')})`, currentRole || roles[0]);
      if (!next) return;
      if (!roles.includes(next)) {
        showError('That role is not assignable by you.');
        return;
      }
      await invokeStaffAdmin({ action: 'update_role', user_id: userId, role: next });
      showSuccess('Role updated');
      await refreshUsersTable();
      return;
    }
    if (action === 'reset') {
      const temp = generateTempPassword();
      const ok = confirm(
        `Reset password to a temporary password?\n\n${temp}\n\nCopy it now — it will not be shown again. The user must set their own password on next login.`
      );
      if (!ok) return;
      await invokeStaffAdmin({ action: 'reset_password', user_id: userId, password: temp });
      showSuccess('Temporary password set. User must change it on next sign-in.');
      await refreshUsersTable();
      return;
    }
    if (action === 'disable' || action === 'enable') {
      if (!confirm(action === 'disable' ? 'Disable this user?' : 'Re-enable this user?')) return;
      await invokeStaffAdmin({ action, user_id: userId });
      showSuccess(action === 'disable' ? 'User disabled' : 'User enabled');
      await refreshUsersTable();
    }
  } catch (err) {
    showError(err.message || 'Action failed');
  }
}

function openAddStaffModal() {
  closeAddStaffModal();
  const roles = assignableRolesForCaller();
  const temp = generateTempPassword();

  const modalHTML = `
    <div id="addStaffModal" class="modal-overlay" onclick="closeAddStaffModalOnOutside(event)">
      <div class="modal-content" style="max-width:480px;" role="dialog" aria-modal="true" aria-labelledby="addStaffTitle">
        <div class="modal-header">
          <h2 id="addStaffTitle">Add Staff</h2>
          <button type="button" class="modal-close" aria-label="Close" onclick="closeAddStaffModal()">&times;</button>
        </div>
        <form id="addStaffForm" method="post" action="#" autocomplete="off">
          <div class="modal-body">
            <p style="color:var(--text-muted);font-size:14px;margin:0 0 16px;">
              Creates a Supabase Auth user and profile. Temporary passwords force a password change on first login — you will never see their final password.
            </p>
            <div class="form-group">
              <label for="staffEmail">Company email *</label>
              <input type="email" id="staffEmail" name="staff_email" required autocomplete="off" placeholder="name@knightwatts.co.ke">
            </div>
            <div class="form-group">
              <label for="staffFullName">Full name *</label>
              <input type="text" id="staffFullName" name="staff_full_name" required autocomplete="off" minlength="2">
            </div>
            <div class="form-group">
              <label for="staffRole">Role *</label>
              <select id="staffRole" required>
                ${roles.map((r) => `<option value="${r}">${r}</option>`).join('')}
              </select>
            </div>
            <div class="form-group" id="staffPasswordGroup">
              <label for="staffTempPassword">Temporary password *</label>
              <div style="display:flex;gap:8px;">
                <input type="text" id="staffTempPassword" name="staff_temp_password" required minlength="8" value="${escapeHtml(temp)}" autocomplete="new-password" style="flex:1;">
                <button type="button" class="btn btn-outline" id="genStaffPasswordBtn">Generate</button>
              </div>
            </div>
            <label class="remember-me" style="display:flex;align-items:center;gap:8px;margin:12px 0;">
              <input type="checkbox" id="staffInviteInstead">
              <span>Send invite email instead (no temporary password)</span>
            </label>
            <div id="addStaffError" class="error-message" style="display:none;"></div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" onclick="closeAddStaffModal()">Cancel</button>
            <button type="submit" class="btn btn-primary" id="addStaffSubmitBtn">Create staff</button>
          </div>
        </form>
      </div>
    </div>`;

  document.body.insertAdjacentHTML('beforeend', modalHTML);

  const inviteCb = document.getElementById('staffInviteInstead');
  const pwdGroup = document.getElementById('staffPasswordGroup');
  const pwdInput = document.getElementById('staffTempPassword');
  inviteCb?.addEventListener('change', () => {
    const invite = inviteCb.checked;
    if (pwdGroup) pwdGroup.style.display = invite ? 'none' : 'block';
    if (pwdInput) pwdInput.required = !invite;
  });

  document.getElementById('genStaffPasswordBtn')?.addEventListener('click', () => {
    if (pwdInput) pwdInput.value = generateTempPassword();
  });

  document.getElementById('addStaffForm')?.addEventListener('submit', submitAddStaff);
}

function closeAddStaffModal() {
  document.getElementById('addStaffModal')?.remove();
}

function closeAddStaffModalOnOutside(event) {
  if (event.target?.id === 'addStaffModal') closeAddStaffModal();
}

async function submitAddStaff(event) {
  event.preventDefault();
  const errorDiv = document.getElementById('addStaffError');
  const submitBtn = document.getElementById('addStaffSubmitBtn');
  const email = document.getElementById('staffEmail')?.value?.trim();
  const fullName = document.getElementById('staffFullName')?.value?.trim();
  const role = document.getElementById('staffRole')?.value;
  const invite = !!document.getElementById('staffInviteInstead')?.checked;
  const password = document.getElementById('staffTempPassword')?.value || '';

  if (errorDiv) {
    errorDiv.style.display = 'none';
    errorDiv.textContent = '';
  }

  const original = submitBtn?.textContent;
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = invite ? 'Sending invite…' : 'Creating…';
  }

  try {
    const payload = {
      action: invite ? 'invite' : 'create',
      email,
      full_name: fullName,
      role,
      invite
    };
    if (!invite) payload.password = password;

    const result = await invokeStaffAdmin(payload);
    closeAddStaffModal();

    if (invite) {
      showSuccess(`Invite sent to ${email}.`);
    } else {
      showSuccess(
        `Staff created for ${email}. Share the temporary password privately — they must set their own password on first login.`
      );
    }
    await refreshUsersTable();
    return result;
  } catch (err) {
    if (errorDiv) {
      errorDiv.textContent = err.message || 'Failed to create staff';
      errorDiv.style.display = 'block';
    }
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = original || 'Create staff';
    }
  }
}

/** Mandatory password change gate — blocks admin panel until cleared */
function showMustChangePasswordScreen(profile) {
  const loginScreen = document.getElementById('loginScreen');
  const adminPanel = document.getElementById('adminPanel');
  if (loginScreen) loginScreen.style.display = 'none';
  if (adminPanel) adminPanel.style.display = 'none';

  let gate = document.getElementById('mustChangePasswordGate');
  if (gate) gate.remove();

  gate = document.createElement('div');
  gate.id = 'mustChangePasswordGate';
  gate.className = 'login-screen';
  gate.innerHTML = `
    <div class="login-container" style="max-width:440px;">
      <div class="login-logo">
        <h1>Set your password</h1>
      </div>
      <p style="color:var(--text-muted);text-align:center;margin-bottom:20px;">
        Hello ${escapeHtml(profile.full_name || profile.email || '')}.
        Your temporary password must be replaced before you can use the admin portal.
      </p>
      <form id="mustChangePasswordForm" class="login-form" autocomplete="on">
        <div class="form-group">
          <label for="newStaffPassword">New password</label>
          <input type="password" id="newStaffPassword" name="new_password" required minlength="8"
            autocomplete="new-password" placeholder="At least 8 characters">
          <div class="password-strength" id="passwordStrength" aria-live="polite">
            <div class="password-strength-bar"><span id="passwordStrengthFill"></span></div>
            <ul class="password-strength-rules" id="passwordStrengthRules">
              <li data-rule="length">At least 8 characters</li>
              <li data-rule="letter">Contains a letter</li>
              <li data-rule="digit">Contains a number or symbol</li>
            </ul>
          </div>
        </div>
        <div class="form-group">
          <label for="confirmStaffPassword">Confirm password</label>
          <input type="password" id="confirmStaffPassword" name="confirm_password" required minlength="8"
            autocomplete="new-password">
        </div>
        <div id="mustChangePasswordError" class="error-message" style="display:none;"></div>
        <button type="submit" class="btn btn-primary btn-large" style="width:100%;">Save password</button>
      </form>
    </div>`;
  document.body.appendChild(gate);

  const pwdInput = document.getElementById('newStaffPassword');
  pwdInput?.addEventListener('input', () => updatePasswordStrengthUI(pwdInput.value));

  document.getElementById('mustChangePasswordForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('mustChangePasswordError');
    const p1 = document.getElementById('newStaffPassword')?.value || '';
    const p2 = document.getElementById('confirmStaffPassword')?.value || '';
    if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }

    const strength = validateNewPassword(p1);
    if (!strength.ok) {
      if (errEl) { errEl.textContent = strength.message; errEl.style.display = 'block'; }
      return;
    }
    if (p1 !== p2) {
      if (errEl) { errEl.textContent = 'Passwords do not match.'; errEl.style.display = 'block'; }
      return;
    }

    try {
      const { error } = await supabaseClient.auth.updateUser({ password: p1 });
      if (error) throw error;

      const { error: clearErr } = await supabaseClient.rpc('clear_own_must_change_password');
      if (clearErr) throw clearErr;

      // Refresh profile
      const { data: profileRow } = await supabaseClient
        .from('user_profiles')
        .select('*')
        .eq('id', currentUser.id)
        .single();
      if (profileRow) currentUserProfile = profileRow;

      gate.remove();
      offerPasskeyAfterPasswordChange();
    } catch (err) {
      if (errEl) {
        errEl.textContent = err.message || 'Could not update password';
        errEl.style.display = 'block';
      }
    }
  });
}

function validateNewPassword(p) {
  if (!p || p.length < 8) {
    return { ok: false, message: 'Password must be at least 8 characters.' };
  }
  if (!/[A-Za-z]/.test(p) || !/[0-9#?!@$%^&*-]/.test(p)) {
    return { ok: false, message: 'Include letters and at least one number or symbol.' };
  }
  return { ok: true };
}

function updatePasswordStrengthUI(p) {
  const rules = {
    length: (p || '').length >= 8,
    letter: /[A-Za-z]/.test(p || ''),
    digit: /[0-9#?!@$%^&*-]/.test(p || '')
  };
  const list = document.getElementById('passwordStrengthRules');
  list?.querySelectorAll('[data-rule]').forEach((li) => {
    li.classList.toggle('met', !!rules[li.dataset.rule]);
  });
  const met = Object.values(rules).filter(Boolean).length;
  const fill = document.getElementById('passwordStrengthFill');
  if (fill) {
    fill.style.width = `${(met / 3) * 100}%`;
    fill.dataset.level = String(met);
  }
}

function offerPasskeyAfterPasswordChange() {
  const offer = document.createElement('div');
  offer.id = 'passkeyOfferGate';
  offer.className = 'login-screen';
  offer.innerHTML = `
    <div class="login-container" style="max-width:440px;">
      <div class="login-logo"><h1>Password saved</h1></div>
      <p style="color:var(--text-muted);text-align:center;margin-bottom:20px;">
        Optionally register a passkey (Face ID / Touch ID) for faster sign-in. You can also do this later under Security.
      </p>
      <button type="button" class="btn btn-primary btn-large" id="offerRegisterPasskey" style="width:100%;margin-bottom:12px;">Register passkey</button>
      <button type="button" class="btn btn-outline btn-large" id="offerSkipPasskey" style="width:100%;">Continue to admin</button>
      <div id="passkeyOfferError" class="error-message" style="display:none;margin-top:12px;"></div>
    </div>`;
  document.body.appendChild(offer);

  document.getElementById('offerSkipPasskey')?.addEventListener('click', () => {
    offer.remove();
    showAdminPanel();
  });

  document.getElementById('offerRegisterPasskey')?.addEventListener('click', async () => {
    const errEl = document.getElementById('passkeyOfferError');
    try {
      if (typeof registerPasskey !== 'function') throw new Error('Passkey API unavailable');
      await registerPasskey(supabaseClient);
      offer.remove();
      showAdminPanel();
      if (typeof showSuccess === 'function') showSuccess('Passkey registered');
    } catch (err) {
      if (errEl) {
        errEl.textContent = (typeof getPasskeyErrorMessage === 'function')
          ? getPasskeyErrorMessage(err)
          : (err.message || 'Passkey failed');
        errEl.style.display = 'block';
      }
    }
  });
}

function removePasswordGates() {
  document.getElementById('mustChangePasswordGate')?.remove();
  document.getElementById('passkeyOfferGate')?.remove();
}

window.loadUsers = loadUsers;
window.refreshUsersTable = refreshUsersTable;
window.openAddStaffModal = openAddStaffModal;
window.closeAddStaffModal = closeAddStaffModal;
window.closeAddStaffModalOnOutside = closeAddStaffModalOnOutside;
window.showMustChangePasswordScreen = showMustChangePasswordScreen;
window.removePasswordGates = removePasswordGates;
window.canManageStaffPortal = canManageStaffPortal;
