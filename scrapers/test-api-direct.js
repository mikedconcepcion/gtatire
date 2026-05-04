const { chromium } = require('playwright');
const config = require('./config');
async function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  // Login first to get session
  await page.goto(config.alltire.url, { waitUntil: 'networkidle' });
  await page.fill('input[type="text"]', config.alltire.username);
  await page.fill('input[type="password"]', config.alltire.password);
  await page.locator('button:has-text("Sign In"), input[type="submit"]').first().click();
  await page.waitForLoadState('networkidle');
  await delay(2000);
  console.log('Logged in');

  // Now call the API directly
  const url = 'https://alltire.ca/searchWheel.asp?year=2025&make=HONDA&model=CIVIC&diameter=17&wtype=&by=weborder&cid=6340&checkhub=false';
  console.log('\nFetching:', url);

  const response = await page.evaluate(async (apiUrl) => {
    const res = await fetch(apiUrl);
    return await res.text();
  }, url);

  console.log('\nResponse length:', response.length);
  console.log('\nFirst 3000 chars:');
  console.log(response.substring(0, 3000));

  // Try a broader search — all diameters for Honda Civic?
  const url2 = 'https://alltire.ca/searchWheel.asp?year=2025&make=HONDA&model=CIVIC&diameter=&wtype=&by=weborder&cid=6340&checkhub=false';
  console.log('\n\n=== No diameter specified ===');
  const response2 = await page.evaluate(async (apiUrl) => {
    const res = await fetch(apiUrl);
    return await res.text();
  }, url2);
  console.log('Response length:', response2.length);
  console.log(response2.substring(0, 1000));

  // Try no vehicle at all — just get everything
  const url3 = 'https://alltire.ca/searchWheel.asp?year=&make=&model=&diameter=&wtype=&by=weborder&cid=6340&checkhub=false';
  console.log('\n\n=== No filters at all ===');
  const response3 = await page.evaluate(async (apiUrl) => {
    const res = await fetch(apiUrl);
    return await res.text();
  }, url3);
  console.log('Response length:', response3.length);
  console.log(response3.substring(0, 1000));

  // Try just diameter
  const url4 = 'https://alltire.ca/searchWheel.asp?year=&make=&model=&diameter=17&wtype=&by=weborder&cid=6340&checkhub=false';
  console.log('\n\n=== Diameter 17 only ===');
  const response4 = await page.evaluate(async (apiUrl) => {
    const res = await fetch(apiUrl);
    return await res.text();
  }, url4);
  console.log('Response length:', response4.length);
  console.log(response4.substring(0, 1000));

  await delay(3000);
  await browser.close();
})();
