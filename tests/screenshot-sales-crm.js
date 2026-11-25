/**
 * Screenshots for Sales Team CRM PR walkthrough
 */
const { chromium, devices } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8080';
const OUT = path.join(__dirname, '..', 'test-screenshots');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true });
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const mobile = await browser.newContext({ ...devices['iPhone 13'] });

  const dpage = await desktop.newPage();
  await dpage.goto(BASE + '/checkout.html', { waitUntil: 'networkidle' });
  await dpage.evaluate(() => {
    localStorage.setItem('cart', JSON.stringify([{
      id: 'demo', name: 'Cabin pollen-filter element', price: 850, quantity: 1, location: 'Embu'
    }]));
  });
  await dpage.reload({ waitUntil: 'networkidle' });
  await dpage.locator('#referralCode').scrollIntoViewIfNeeded();
  await dpage.screenshot({
    path: path.join(OUT, 'sales_checkout_referral_field.png'),
    fullPage: false
  });

  await dpage.goto(BASE + '/admin/', { waitUntil: 'networkidle' });
  await dpage.screenshot({
    path: path.join(OUT, 'sales_admin_login.png'),
    fullPage: false
  });

  await dpage.goto(BASE + '/test-artifacts/sales-crm-preview.html', { waitUntil: 'networkidle' });
  await dpage.screenshot({
    path: path.join(OUT, 'sales_crm_dashboard_preview.png'),
    fullPage: true
  });

  const mpage = await mobile.newPage();
  await mpage.goto(BASE + '/test-artifacts/sales-crm-preview.html', { waitUntil: 'networkidle' });
  await mpage.screenshot({
    path: path.join(OUT, 'sales_crm_dashboard_preview_mobile.png'),
    fullPage: true
  });

  await mpage.goto(BASE + '/checkout.html?ref=EXAMPLE01', { waitUntil: 'networkidle' });
  await mpage.evaluate(() => {
    localStorage.setItem('cart', JSON.stringify([{
      id: 'demo', name: 'Cabin pollen-filter element', price: 850, quantity: 1, location: 'Embu'
    }]));
  });
  await mpage.reload({ waitUntil: 'networkidle' });
  const refVal = await mpage.inputValue('#referralCode');
  console.log('Prefill referral from ?ref=:', refVal);
  await mpage.locator('#referralCode').scrollIntoViewIfNeeded();
  await mpage.screenshot({
    path: path.join(OUT, 'sales_checkout_referral_prefill_mobile.png'),
    fullPage: false
  });

  await browser.close();
  console.log('Screenshots written to', OUT);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
