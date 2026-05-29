// Headless audit of jsdcwheels.ca from a customer's perspective.
// Outputs JSON summary + screenshots to .wolf/audits/jsdcwheels/
const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', '.wolf', 'audits', 'jsdcwheels');
fs.mkdirSync(OUT, { recursive: true });

const SITE = process.env.AUDIT_URL || 'https://jsdcwheels.ca/';

function uniq(a) { return Array.from(new Set(a.filter(Boolean))); }

async function audit(label, contextOpts, viewport) {
  const browser = await chromium.launch();
  const context = await browser.newContext(contextOpts);
  const page = await context.newPage();
  const t0 = Date.now();
  const consoleErrs = [];
  const failedReqs = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrs.push(m.text()); });
  page.on('requestfailed', (r) => failedReqs.push({ url: r.url(), err: r.failure()?.errorText }));

  await page.goto(SITE, { waitUntil: 'networkidle', timeout: 45000 });
  const loadMs = Date.now() - t0;

  // Above-the-fold screenshot
  await page.screenshot({ path: path.join(OUT, `${label}-fold.png`), fullPage: false });
  // Full page
  await page.screenshot({ path: path.join(OUT, `${label}-full.png`), fullPage: true });

  const data = await page.evaluate(() => {
    const text = (el) => (el?.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 240);
    const all = (sel) => Array.from(document.querySelectorAll(sel));
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
    };
    const headings = all('h1, h2, h3').filter(visible).map(h => ({ tag: h.tagName, text: text(h) })).filter(h => h.text);
    const links = all('a').filter(visible).map(a => ({ text: text(a), href: a.href })).filter(l => l.text && l.href);
    const buttons = all('button, [role="button"], a[class*="button" i], a[data-testid*="button" i]')
      .filter(visible).map(b => text(b)).filter(Boolean);
    const images = all('img').filter(visible).map(i => ({ alt: i.alt || '', src: i.currentSrc || i.src, w: i.naturalWidth, h: i.naturalHeight }));
    const tel = all('a[href^="tel:"]').map(a => a.href);
    const mail = all('a[href^="mailto:"]').map(a => a.href);
    const meta = {
      title: document.title,
      description: document.querySelector('meta[name="description"]')?.content || '',
      ogTitle: document.querySelector('meta[property="og:title"]')?.content || '',
      ogDescription: document.querySelector('meta[property="og:description"]')?.content || '',
      canonical: document.querySelector('link[rel="canonical"]')?.href || '',
      lang: document.documentElement.lang || '',
    };
    const jsonLd = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
      .map(s => { try { return JSON.parse(s.textContent); } catch { return null; } }).filter(Boolean);
    const bodyText = (document.body.innerText || '').replace(/\s+/g, ' ').trim();

    return { meta, headings, links, buttons, images, tel, mail, jsonLd, bodyTextSample: bodyText.slice(0, 4000), bodyLen: bodyText.length };
  });

  // Try to find a "Shop" / catalog entry and click it
  let shopFollow = null;
  try {
    const shopLink = data.links.find(l => /shop|products|catalog|wheels|tires|browse|store/i.test(l.text));
    if (shopLink) {
      const p2 = await context.newPage();
      await p2.goto(shopLink.href, { waitUntil: 'networkidle', timeout: 30000 });
      await p2.screenshot({ path: path.join(OUT, `${label}-shop.png`), fullPage: false });
      const shopData = await p2.evaluate(() => {
        const text = (el) => (el?.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 200);
        const cards = Array.from(document.querySelectorAll('[data-hook*="product"], .product-item, [class*="ProductItem"], [class*="product-card"]'))
          .slice(0, 10).map(c => text(c));
        const prices = Array.from(document.querySelectorAll('[data-hook*="price"], [class*="price" i]'))
          .slice(0, 10).map(p => (p.innerText || '').trim()).filter(Boolean);
        return { title: document.title, productSamples: cards, prices, url: location.href };
      });
      shopFollow = { clickedLabel: shopLink.text, href: shopLink.href, ...shopData };
      await p2.close();
    }
  } catch (e) { shopFollow = { error: String(e) }; }

  await browser.close();
  return { label, viewport, loadMs, consoleErrs, failedReqs, shopFollow, ...data };
}

(async () => {
  const desktop = await audit('desktop', { viewport: { width: 1440, height: 900 } }, '1440x900');
  const mobile = await audit('mobile', { ...devices['iPhone 13'] }, 'iPhone 13');

  const summary = { siteUrl: SITE, capturedAt: new Date().toISOString(), desktop, mobile };
  fs.writeFileSync(path.join(OUT, 'audit.json'), JSON.stringify(summary, null, 2));

  // Short human-readable digest
  const lines = [];
  lines.push(`# jsdcwheels.ca audit — ${new Date().toISOString()}`);
  for (const view of [desktop, mobile]) {
    lines.push(`\n## ${view.label} (${view.viewport}) — load ${view.loadMs}ms`);
    lines.push(`- title: ${view.meta.title}`);
    lines.push(`- description: ${view.meta.description || '(none)'}`);
    lines.push(`- canonical: ${view.meta.canonical || '(none)'}`);
    lines.push(`- lang: ${view.meta.lang || '(none)'}`);
    lines.push(`- JSON-LD blocks: ${view.jsonLd.length}`);
    lines.push(`- console errors: ${view.consoleErrs.length}`);
    lines.push(`- failed requests: ${view.failedReqs.length}`);
    lines.push(`- tel links: ${uniq(view.tel).join(', ') || '(none)'}`);
    lines.push(`- mail links: ${uniq(view.mail).join(', ') || '(none)'}`);
    lines.push(`- visible headings (first 10):`);
    view.headings.slice(0, 10).forEach(h => lines.push(`  - ${h.tag}: ${h.text}`));
    lines.push(`- nav-like links (first 15):`);
    view.links.slice(0, 15).forEach(l => lines.push(`  - ${l.text} → ${l.href}`));
    lines.push(`- buttons (first 10): ${view.buttons.slice(0, 10).join(' | ')}`);
    if (view.shopFollow) {
      lines.push(`- shop follow: clicked "${view.shopFollow.clickedLabel}" → ${view.shopFollow.href || ''}`);
      if (view.shopFollow.prices) lines.push(`  - sample prices: ${view.shopFollow.prices.slice(0, 5).join(' | ')}`);
    }
  }
  fs.writeFileSync(path.join(OUT, 'audit.md'), lines.join('\n'));
  console.log(`\nWrote: ${path.join(OUT, 'audit.json')}\n       ${path.join(OUT, 'audit.md')}`);
})();
