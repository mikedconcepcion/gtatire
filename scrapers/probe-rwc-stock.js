// Probe: log in to gpibtob.com, look at both (a) one product on the listing
// page and (b) the same product's detail page. Goal: find the stock signal
// that the existing scraper (querying `.stock`) missed. Saves DOM excerpts
// to data/probe-rwc-stock.log so we can see the actual markup.

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const config = require('./config');

const OUT_LOG = path.join(__dirname, '..', 'data', 'probe-rwc-stock.log');
const log = (msg) => {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(OUT_LOG, line + '\n');
};

(async () => {
  fs.writeFileSync(OUT_LOG, '');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    log('Logging in to gpibtob.com...');
    await page.goto(config.rwc.url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.fill('input[type="email"], input[name="email"], input#email, input[name="customer[email]"]', config.rwc.username);
    await page.fill('input[type="password"], input[name="password"]', config.rwc.password);
    await page.locator('button:has-text("Sign"), button:has-text("Log"), input[type="submit"]').first().click();
    await page.waitForLoadState('networkidle');
    log('Logged in.');

    // First: listing page, inspect ALL fields on one .product-thumb
    log('\n=== LISTING PAGE PROBE ===');
    await page.goto('https://gpibtob.com/index.php?route=product/search&search=RWC&limit=10', {
      waitUntil: 'networkidle', timeout: 60000
    });
    await page.waitForTimeout(2000);

    const listingDump = await page.evaluate(() => {
      const thumb = document.querySelector('.product-thumb');
      if (!thumb) return { error: 'no thumb' };
      // List every child class found
      const allClasses = new Set();
      thumb.querySelectorAll('*').forEach(el => {
        el.classList.forEach(c => allClasses.add(c));
      });
      // Capture the full outer HTML
      return {
        outerHTML: thumb.outerHTML,
        classes: [...allClasses].sort(),
      };
    });

    if (listingDump.error) {
      log('LISTING ERROR: ' + listingDump.error);
    } else {
      log('Classes present on .product-thumb:');
      log(listingDump.classes.join(', '));
      log('\nFull thumb HTML (first 4000 chars):');
      log(listingDump.outerHTML.slice(0, 4000));
    }

    // Then: visit ONE detail page and dump its body
    const firstUrl = await page.evaluate(() => {
      const a = document.querySelector('.product-thumb .name-product a');
      return a ? a.href : null;
    });

    if (firstUrl) {
      log('\n=== DETAIL PAGE PROBE ===');
      log('URL: ' + firstUrl);
      await page.goto(firstUrl, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(2000);

      const detailDump = await page.evaluate(() => {
        // Common stock-signal selectors in OpenCart themes
        const candidates = [
          '.stock', '.stock-status', '.availability',
          '.product-stock', '#product-stock',
          'p:contains("Stock")', 'span.label-stock',
          '[data-stock]', '.product .description',
          '.product-info', '.product-content',
          '.product-extra', '.product-price-stock'
        ];
        const hits = {};
        for (const sel of candidates) {
          try {
            const el = document.querySelector(sel);
            if (el) hits[sel] = el.textContent.trim().slice(0, 200);
          } catch (e) {}
        }
        // Grep any element whose text contains "stock" (case-insensitive)
        const stockTexts = [];
        document.querySelectorAll('*').forEach(el => {
          if (el.children.length > 0) return; // leaves only
          const t = (el.textContent || '').trim();
          if (/stock|availab|in store|out\s+of/i.test(t) && t.length < 100) {
            stockTexts.push({
              tag: el.tagName.toLowerCase(),
              cls: el.className || '',
              text: t
            });
          }
        });
        return {
          knownSelectors: hits,
          stockTextsOnPage: stockTexts.slice(0, 20),
        };
      });

      log('Known stock selectors that hit:');
      log(JSON.stringify(detailDump.knownSelectors, null, 2));
      log('\nAll leaf elements mentioning stock/availability:');
      log(JSON.stringify(detailDump.stockTextsOnPage, null, 2));
    }

    log('\nProbe done.');
  } catch (err) {
    log(`ERROR: ${err.message}`);
    log(err.stack);
  } finally {
    await browser.close();
  }
})();
