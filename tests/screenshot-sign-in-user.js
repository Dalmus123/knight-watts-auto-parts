/**
 * Screenshots for Sign In User modal (User Management).
 * Uses Playwright Chromium against local http-server.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8080';
const OUT_DIR = path.join(__dirname, '..', 'test-artifacts');
// Set DEMO_EMAIL / DEMO_PASSWORD to a real Auth user with a user_profiles row.
const DEMO_EMAIL = process.env.DEMO_EMAIL || '';
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || '';
const BAD_PASSWORD = 'wrong-password-xyz';

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  await page.goto(`${BASE_URL}/admin/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#loginEmail', { timeout: 15000 });

  if (DEMO_EMAIL && DEMO_PASSWORD) {
    // 1) Login as demo staff user (proves Auth credentials + role access)
    await page.fill('#loginEmail', DEMO_EMAIL);
    await page.fill('#loginPassword', DEMO_PASSWORD);
    await page.click('#loginForm button[type="submit"]');
    await page.waitForSelector('#adminPanel', { state: 'visible', timeout: 20000 });
    await page.screenshot({
      path: path.join(OUT_DIR, 'sign-in-user-sales-session.png'),
      fullPage: false
    });
    console.log('Saved sign-in-user-sales-session.png');

    await page.click('#logoutBtn');
    await page.waitForSelector('#loginScreen', { state: 'visible', timeout: 10000 });
  } else {
    console.log('Skipping live Auth login screenshots (set DEMO_EMAIL / DEMO_PASSWORD).');
  }

  // 2) Inject owner session UI + users page + open Sign In User modal
  await page.evaluate(() => {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('adminPanel').style.display = 'flex';
    window.currentUser = { id: 'owner-preview' };
    window.currentUserProfile = {
      id: 'owner-preview',
      email: 'owner@knightwatts.com',
      full_name: 'Owner Preview',
      role: 'owner'
    };
    document.getElementById('userName').textContent = 'Owner Preview';
    document.getElementById('userEmail').textContent = 'owner@knightwatts.com';
    document.getElementById('userRole').textContent = 'OWNER';
    document.querySelectorAll('.owner-only').forEach((el) => {
      el.style.display = 'flex';
    });
  });

  // Render users page with button (bypass RLS fetch by injecting table)
  await page.evaluate(() => {
    const content = document.getElementById('contentArea');
    content.innerHTML = `
      <div class="table-container">
        <div class="table-header">
          <h3>User Management</h3>
          <button class="btn btn-primary" id="signInUserBtn" type="button">Sign In User</button>
        </div>
        <div id="usersTable">
          <table class="data-table">
            <thead>
              <tr>
                <th>Name</th><th>Email</th><th>Role</th><th>Location</th><th>Created</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Owner Preview</strong></td>
                <td>owner@knightwatts.com</td>
                <td><span class="status-badge">owner</span></td>
                <td>Embu</td>
                <td>Nov 5, 2026</td>
                <td><em>Signed in</em></td>
              </tr>
              <tr>
                <td><strong>Demo Sales Rep</strong></td>
                <td>demo.sales@knightwatts.test</td>
                <td><span class="status-badge">sales_rep</span></td>
                <td>Embu</td>
                <td>Nov 25, 2026</td>
                <td><button class="action-btn action-btn-secondary">Edit Role</button></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
  });

  await page.screenshot({
    path: path.join(OUT_DIR, 'sign-in-user-management-page.png'),
    fullPage: false
  });
  console.log('Saved sign-in-user-management-page.png');

  // Open modal via real function from admin.js
  await page.evaluate(() => openSignInUserModal());
  await page.waitForSelector('#signInUserModal', { timeout: 5000 });
  await page.screenshot({
    path: path.join(OUT_DIR, 'sign-in-user-modal.png'),
    fullPage: false
  });
  console.log('Saved sign-in-user-modal.png');

  // Wrong credentials error in modal
  await page.fill('#signInUserEmail', DEMO_EMAIL || 'nobody@knightwatts.test');
  await page.fill('#signInUserPassword', BAD_PASSWORD);
  await page.click('#signInUserSubmitBtn');
  await page.waitForSelector('#signInUserError', { state: 'visible', timeout: 10000 });
  await page.screenshot({
    path: path.join(OUT_DIR, 'sign-in-user-wrong-credentials.png'),
    fullPage: false
  });
  console.log('Saved sign-in-user-wrong-credentials.png');

  if (DEMO_EMAIL && DEMO_PASSWORD) {
    await page.fill('#signInUserPassword', DEMO_PASSWORD);
    page.once('dialog', async (dialog) => {
      console.log('Alert:', dialog.message());
      await dialog.accept();
    });
    await page.click('#signInUserSubmitBtn');
    await page.waitForTimeout(2500);
    await page.screenshot({
      path: path.join(OUT_DIR, 'sign-in-user-after-switch.png'),
      fullPage: false
    });
    console.log('Saved sign-in-user-after-switch.png');
  }

  await browser.close();
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
