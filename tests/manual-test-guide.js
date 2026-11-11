/**
 * Manual Test Runner with Screenshots
 * Opens browser and guides you through testing
 */

const { webkit, devices } = require('playwright');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const BASE_URL = 'http://localhost:8080';
const SCREENSHOTS_DIR = './test-screenshots';

if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function prompt(question) {
    return new Promise(resolve => {
        rl.question(question, answer => {
            resolve(answer.trim().toLowerCase());
        });
    });
}

async function runManualTest() {
    console.log('🧪 Manual Mobile Admin Test Guide\n');
    console.log('This will open a WebKit browser (iPhone 13) and guide you through testing.');
    console.log('Follow the prompts to capture screenshots at each step.\n');
    
    const browser = await webkit.launch({ 
        headless: false,
        slowMo: 100 
    });
    
    const iPhone13 = devices['iPhone 13'];
    const context = await browser.newContext({
        ...iPhone13,
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true
    });
    
    const page = await context.newPage();
    
    try {
        console.log('\n1️⃣ Opening admin page...');
        await page.goto(BASE_URL + '/admin/');
        await page.waitForLoadState('networkidle');
        
        await prompt('\n👉 Please log in manually if needed, then press Enter to continue...');
        
        console.log('\n2️⃣ Navigating to Products...');
        await page.evaluate(() => {
            const navItem = document.querySelector('[data-page="products"]');
            if (navItem) navItem.click();
        });
        await page.waitForTimeout(1500);
        
        console.log('Scrolling to bottom...');
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(1000);
        
        await page.screenshot({ 
            path: path.join(SCREENSHOTS_DIR, '01-products-scrolled-bottom.png')
        });
        console.log('✓ Screenshot saved: 01-products-scrolled-bottom.png');
        
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(500);
        
        await prompt('\n👉 Press Enter when ready to test Add Product...');
        
        console.log('\n3️⃣ Testing Add Product button...');
        await page.evaluate(() => {
            const btn = document.getElementById('addProductBtn');
            if (btn) btn.click();
        });
        await page.waitForTimeout(1500);
        
        await page.screenshot({ 
            path: path.join(SCREENSHOTS_DIR, '02-add-product-modal.png')
        });
        console.log('✓ Screenshot saved: 02-add-product-modal.png');
        
        await page.evaluate(() => {
            const cancelBtn = document.querySelector('.btn-secondary');
            if (cancelBtn) cancelBtn.click();
        });
        await page.waitForTimeout(500);
        
        await prompt('\n👉 Press Enter when ready to test Search...');
        
        console.log('\n4️⃣ Testing Search...');
        await page.evaluate(() => {
            const search = document.getElementById('productSearch');
            if (search) {
                search.value = 'filter';
                search.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });
        await page.waitForTimeout(1000);
        
        await page.screenshot({ 
            path: path.join(SCREENSHOTS_DIR, '03-search-filtered.png')
        });
        console.log('✓ Screenshot saved: 03-search-filtered.png');
        
        await page.evaluate(() => {
            const search = document.getElementById('productSearch');
            if (search) {
                search.value = '';
                search.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });
        await page.waitForTimeout(500);
        
        await prompt('\n👉 Press Enter when ready to test Edit Product...');
        
        console.log('\n5️⃣ Testing Edit Product...');
        await page.evaluate(() => {
            const card = document.querySelector('.product-card');
            if (card) card.click();
        });
        await page.waitForTimeout(1500);
        
        await page.screenshot({ 
            path: path.join(SCREENSHOTS_DIR, '04-edit-product-modal.png')
        });
        console.log('✓ Screenshot saved: 04-edit-product-modal.png');
        
        await page.evaluate(() => {
            const cancelBtn = document.querySelector('.btn-secondary');
            if (cancelBtn) cancelBtn.click();
        });
        await page.waitForTimeout(500);
        
        await prompt('\n👉 Press Enter when ready to test Mobile Menu...');
        
        console.log('\n6️⃣ Testing Mobile Menu...');
        await page.evaluate(() => {
            const toggle = document.getElementById('mobileMenuToggle');
            if (toggle) toggle.click();
        });
        await page.waitForTimeout(500);
        
        await page.screenshot({ 
            path: path.join(SCREENSHOTS_DIR, '05-mobile-menu-open.png')
        });
        console.log('✓ Screenshot saved: 05-mobile-menu-open.png');
        
        await page.evaluate(() => {
            const overlay = document.getElementById('mobileOverlay');
            if (overlay) overlay.click();
        });
        await page.waitForTimeout(500);
        
        await prompt('\n👉 Press Enter when ready to test Storefront...');
        
        console.log('\n7️⃣ Opening Storefront...');
        const storePage = await context.newPage();
        await storePage.goto(BASE_URL + '/');
        await storePage.waitForLoadState('networkidle');
        await storePage.waitForTimeout(1500);
        
        await storePage.evaluate(() => {
            const card = document.querySelector('.product-card');
            if (card) card.click();
        });
        await storePage.waitForTimeout(1500);
        
        await storePage.screenshot({ 
            path: path.join(SCREENSHOTS_DIR, '06-storefront-modal.png')
        });
        console.log('✓ Screenshot saved: 06-storefront-modal.png');
        
        console.log('\n✅ All screenshots captured!');
        console.log(`📸 Saved to: ${SCREENSHOTS_DIR}/`);
        console.log('\nYou can now close the browser windows.');
        
        await prompt('\nPress Enter to close browser and exit...');
        
        await storePage.close();
        
    } finally {
        await browser.close();
        rl.close();
    }
}

runManualTest().catch(error => {
    console.error('Test failed:', error);
    rl.close();
    process.exit(1);
});
