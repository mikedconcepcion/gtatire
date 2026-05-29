// Probe: visit ONE RWC detail page and dump all elements that contain a $
// amount, with their class/tag/parent context. Tells us the exact selector
// to use for MSRP scraping.

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const config = require('./config');

const LOG = path.join(__dirname, '..', 'data', 'probe-rwc-detail-price.log');
const log = (m) => { const l = `[${new Date().toISOString()}] ${m}`; console.log(l); fs.appendFileSync(LOG, l + '\n'); };

(async () => {
  fs.writeFileSync(LOG, '');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(config.rwc.url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.fill('input[type="email"], input[name="email"], input#email, input[name="customer[email]"]', config.rwc.username);
    await page.fill('input[type="password"], input[name="password"]', config.rwc.password);
    await page.locator('button:has-text("Sign"), button:has-text("Log"), input[type="submit"]').first().click();
    await page.waitForLoadState('networkidle');
    log('Logged in');

    const url = 'https://gpibtob.com/rwc-ac01-ho01-anthracite-17x70-5x1143-et45-cb641';
    log(`Visiting ${url}`);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(2000);

    const dollar = await page.evaluate(() => {
      const hits = [];
      // Walk every element with $ in its direct text (excluding child text)
      function getDirectText(el) {
        let t = '';
        for (const node of el.childNodes) {
          if (node.nodeType === 3) t += node.textContent || '';
        }
        return t.trim();
      }
      document.querySelectorAll('*').forEach(el => {
        const t = getDirectText(el);
        if (/\$\d/.test(t)) {
          // Build a CSS path
          const cls = el.className && typeof el.className === 'string' ? '.' + el.className.split(/\s+/).filter(Boolean).join('.') : '';
          let parent = el.parentElement;
          let parentDesc = '';
          if (parent) {
            const pcls = parent.className && typeof parent.className === 'string' ? '.' + parent.className.split(/\s+/).filter(Boolean).join('.') : '';
            parentDesc = `${parent.tagName.toLowerCase()}${pcls}`;
          }
          // Detect visibility
          const style = window.getComputedStyle(el);
          const visible = style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity) > 0;
          hits.push({
            tag: el.tagName.toLowerCase(),
            classes: cls,
            text: t.slice(0, 120),
            visible,
            parent: parentDesc,
          });
        }
      });
      return hits;
    });

    log(`Found ${dollar.length} elements with $ text:`);
    dollar.forEach((h, i) => log(`  [${i}] ${h.tag}${h.classes} visible=${h.visible}  parent=${h.parent}\n      text=${JSON.stringify(h.text)}`));

  } catch (err) {
    log('ERROR: ' + err.message);
  } finally {
    await browser.close();
  }
})();
