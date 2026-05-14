// Probe RWC's portal directly for 2025 Hyundai Santa Fe.
// Hits the actual API endpoints used by their year/make/model dropdowns
// and the search-by-vehicle endpoint, with a logged-in session.

const { chromium } = require('playwright');
const config = require('./config');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  console.log('=== RWC LIVE PROBE: 2025 Hyundai Santa Fe ===\n');

  // Login
  await page.goto(config.rwc.url, { waitUntil: 'networkidle', timeout: 90000 });
  await page.fill('input[type="email"], input[name="email"], input#email, input[name="customer[email]"]', config.rwc.username);
  await page.fill('input[type="password"], input[name="password"]', config.rwc.password);
  await page.locator('button:has-text("Sign"), button:has-text("Log"), input[type="submit"]').first().click();
  await page.waitForLoadState('networkidle');
  console.log('Logged in.\n');

  // 1. Years available
  await page.goto('https://gpibtob.com/product/searchwheel', { waitUntil: 'networkidle', timeout: 30000 });
  const yrs = await page.locator('#year option').evaluateAll(opts => opts.map(o => o.value).filter(Boolean));
  console.log('Years on portal:', yrs.join(', '));
  console.log('2025 listed?', yrs.includes('2025') ? 'YES' : 'NO');

  // 2. Makes for 2025
  const makes2025 = await page.evaluate(async () => {
    const res = await fetch('https://gpibtob.com/index.php?route=module/searchtyrecar/getcar&year=2025', { credentials: 'include' });
    const html = await res.text();
    return [...html.matchAll(/<option value="(\d+)">([^<]+)<\/option>/g)].map(m => ({ id: m[1], name: m[2].trim() }));
  });
  console.log(`\n2025 makes (${makes2025.length}):`);
  for (const m of makes2025) console.log(`  ${m.id} = ${m.name}`);

  // 3. Find Hyundai specifically
  const hyundai = makes2025.find(m => /hyundai/i.test(m.name));
  if (!hyundai) {
    console.log('\nNO HYUNDAI in 2025 — confirmed data gap on RWC side.');
  } else {
    console.log(`\nHyundai found: id=${hyundai.id}`);

    // Models for 2025 Hyundai
    const modelsHtml = await page.evaluate(async (id) => {
      const res = await fetch(`https://gpibtob.com/index.php?route=module/searchtyrecar/getmodel&year=2025&id=${id}`, { credentials: 'include' });
      return await res.text();
    }, hyundai.id);
    const models = [...modelsHtml.matchAll(/<option value="([^"]+)">([^<]+)<\/option>/g)].map(m => m[2].trim());
    console.log(`2025 Hyundai models (${models.length}):`, models.join(', '));

    const santaFe = models.find(m => /santa\s*fe/i.test(m));
    if (santaFe) {
      console.log(`\nSanta Fe found: "${santaFe}"`);
      const url = `https://gpibtob.com/product/searchwheel?car=${hyundai.id}&model=${encodeURIComponent(santaFe)}&year=2025&filter_type=&limit=99999`;
      console.log('Search URL:', url);
      const slugs = await page.evaluate(async (u) => {
        const res = await fetch(u, { credentials: 'include' });
        const html = await res.text();
        const set = new Set();
        const re = /https?:\/\/gpibtob\.com\/(rwc-[a-z0-9-]+)(?=["?])/gi;
        let m;
        while ((m = re.exec(html))) set.add(m[1].toLowerCase());
        return [...set];
      }, url);
      console.log(`Wheels available: ${slugs.length}`);
      if (slugs.length > 0) console.log('First 5:', slugs.slice(0, 5));
    } else {
      console.log('Santa Fe NOT in 2025 Hyundai model list.');
    }
  }

  // 4. Also try the UI form — sometimes the API and UI differ
  console.log('\n--- UI check ---');
  await page.locator('#year').selectOption('2025').catch(() => {});
  await page.waitForTimeout(800);
  const uiMakes = await page.locator('#car option').evaluateAll(opts => opts.map(o => o.textContent?.trim()).filter(Boolean));
  console.log(`UI makes for 2025 (${uiMakes.length}):`, uiMakes.slice(0, 30).join(', '));

  await browser.close();
})();
