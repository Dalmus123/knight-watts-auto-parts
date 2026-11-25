/**
 * Screenshots of role dashboard preview + admin login autofill form.
 * Run: npx playwright install chromium && node tests/screenshot-role-dashboards.js
 */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'test-screenshots');
const PORT = 8765;

function contentType(filePath) {
  if (filePath.endsWith('.html')) return 'text/html';
  if (filePath.endsWith('.css')) return 'text/css';
  if (filePath.endsWith('.js')) return 'application/javascript';
  if (filePath.endsWith('.png')) return 'image/png';
  if (filePath.endsWith('.svg')) return 'image/svg+xml';
  return 'application/octet-stream';
}

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/test-artifacts/role-dashboards-preview.html';
  const filePath = path.join(ROOT, urlPath.replace(/^\//, ''));
  if (!filePath.startsWith(ROOT) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': contentType(filePath) });
  fs.createReadStream(filePath).pipe(res);
});

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  await new Promise((resolve) => server.listen(PORT, resolve));

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2
  });

  await page.goto(`http://127.0.0.1:${PORT}/test-artifacts/role-dashboards-preview.html`, {
    waitUntil: 'networkidle'
  });

  const roles = ['ceo', 'cfo', 'coo', 'cos', 'chief_of_sales', 'sales_rep', 'login-autofill'];
  for (const id of roles) {
    const el = page.locator(`#${id}`);
    await el.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await el.screenshot({ path: path.join(OUT, `role-dashboard-${id}.png`) });
    console.log('saved', `role-dashboard-${id}.png`);
  }

  // Desktop login form shot
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.locator('#login-autofill').scrollIntoViewIfNeeded();
  await page.locator('#login-autofill').screenshot({
    path: path.join(OUT, 'role-dashboard-login-desktop.png')
  });
  console.log('saved role-dashboard-login-desktop.png');

  await browser.close();
  server.close();
}

main().catch((err) => {
  console.error(err);
  server.close();
  process.exit(1);
});
