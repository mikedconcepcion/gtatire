// Probe: log in to Alltire, navigate to a known alloy-wheel search result,
// click into one product's detail view, and dump every visible field to disk.
// Goal: find out whether Alltire exposes a "brand" column anywhere on a wheel
// detail page (search table, popup, dedicated detail URL, image alt, etc.).
//
// Run with VPN connected to Canada. Saves output to data/probe-alltire-detail.log
// and screenshots to scrapers/probe-alltire-*.png so the result can be reviewed
// without re-running.

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const config = require('./config');

const OUT_LOG = path.join(__dirname, '..', 'data', 'probe-alltire-detail.log');
const SHOT_DIR = path.join(__dirname);

const log = (msg) => {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(OUT_LOG, line + '\n');
};

(async () => {
  fs.writeFileSync(OUT_LOG, ''); // reset
  const browser = await chromium.launch({ headless: false }); // visible so VPN/auth issues surface
  const page = await browser.newPage();

  try {
    log('Navigating to Alltire login...');
    await page.goto(config.alltire.url, { waitUntil: 'networkidle', timeout: 60000 });

    log('Logging in...');
    await page.fill('input[type="text"]', config.alltire.username);
    await page.fill('input[type="password"]', config.alltire.password);
    await page.locator('button:has-text("Sign In"), input[type="submit"]').first().click();
    await page.waitForLoadState('networkidle');
    log(`Logged in. URL: ${page.url()}`);

    // Hit the API endpoint directly for a known alloy-wheel-producing combo.
    // CONTOUR_Silver shows up on 2020 Acura ILX 17" per data/alltire-wheels.json.
    const apiUrl = 'https://alltire.ca/searchWheel.asp?year=2020&make=ACURA&model=ILX&diameter=17&wtype=&by=weborder&cid=6340&checkhub=false';
    log(`Fetching wheel results: ${apiUrl}`);
    await page.goto(apiUrl, { waitUntil: 'networkidle', timeout: 60000 });
    await page.screenshot({ path: path.join(SHOT_DIR, 'probe-alltire-search.png'), fullPage: true });

    // Dump first 3 product rows' full HTML
    const rows = await page.$$('tr[onclick*="clickWheelTr"]');
    log(`Found ${rows.length} product rows`);
    for (let i = 0; i < Math.min(3, rows.length); i++) {
      const html = await rows[i].evaluate(el => el.outerHTML);
      log(`--- ROW ${i} HTML ---`);
      log(html);
    }

    // Look at the onclick handler to find the detail-page URL pattern
    if (rows.length > 0) {
      const handler = await rows[0].evaluate(el => el.getAttribute('onclick'));
      log(`First row onclick: ${handler}`);
    }

    // Try clicking the first row and see what opens
    if (rows.length > 0) {
      log('Clicking first row...');
      const [popup] = await Promise.all([
        page.waitForEvent('popup', { timeout: 5000 }).catch(() => null),
        rows[0].click(),
      ]);
      await page.waitForTimeout(2500);

      if (popup) {
        await popup.waitForLoadState('domcontentloaded');
        log(`Popup opened: ${popup.url()}`);
        await popup.screenshot({ path: path.join(SHOT_DIR, 'probe-alltire-popup.png'), fullPage: true });
        const popupHtml = await popup.content();
        log(`--- POPUP HTML (first 3000 chars) ---`);
        log(popupHtml.slice(0, 3000));
      } else {
        log(`No popup — URL after click: ${page.url()}`);
        await page.screenshot({ path: path.join(SHOT_DIR, 'probe-alltire-after-click.png'), fullPage: true });
        const html = await page.content();
        log(`--- PAGE HTML AFTER CLICK (first 3000 chars) ---`);
        log(html.slice(0, 3000));
      }
    }

    log('Probe done.');
  } catch (err) {
    log(`ERROR: ${err.message}`);
    log(err.stack);
  } finally {
    await page.waitForTimeout(3000); // give human a beat to see screen
    await browser.close();
  }
})();
