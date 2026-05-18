// Crop the JSDC wheel icon out of jsdc-banner.png and generate favicons at
// every size browsers / PWAs / iOS expect.

const path = require('path');
const fs = require('fs');
const sharp = require('E:/James/gtatire/webapp/node_modules/sharp');

const ROOT = path.join(__dirname, '..', 'webapp', 'public');
const BANNER = path.join(ROOT, 'brand', 'jsdc-banner.png');
const OUT_DIR = ROOT;

// Wheel/tire icon position in the 1280x720 banner (measured visually).
// Tight crop around the rim+tire silhouette in the right portion.
// Rough crop window — generous, then tightened to alpha bounds below.
// top=365 skips the thin car-body line and rear spoiler that hover above
// the wheel and would otherwise stretch across the icon top.
// left=980 avoids the trailing edge of the gold "C" in "JSDC".
const CROP = { left: 980, top: 365, width: 240, height: 200 };

async function main() {
  if (!fs.existsSync(BANNER)) throw new Error(`Missing ${BANNER}`);
  const meta = await sharp(BANNER).metadata();
  console.log(`Banner: ${meta.width}x${meta.height}`);
  console.log(`Crop  : left=${CROP.left} top=${CROP.top} ${CROP.width}x${CROP.height}`);

  // Extract the rough wheel region, then programmatically tighten to the
  // exact alpha bounds. The banner has lots of transparent space inside our
  // CROP box, which would push the wheel off-center after compositing.
  const roughBuf = await sharp(BANNER).extract(CROP).png().toBuffer();
  const roughMeta = await sharp(roughBuf).metadata();
  const alphaBuf = await sharp(roughBuf).extractChannel(3).raw().toBuffer();
  let minX = roughMeta.width, maxX = 0, minY = roughMeta.height, maxY = 0;
  for (let y = 0; y < roughMeta.height; y++) {
    for (let x = 0; x < roughMeta.width; x++) {
      if (alphaBuf[y * roughMeta.width + x] > 50) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const tight = { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
  console.log(`Tight bounds within crop: ${JSON.stringify(tight)}`);
  const wheelBuf = await sharp(roughBuf).extract(tight).png().toBuffer();
  console.log(`Wheel artwork: ${tight.width}x${tight.height}`);
  fs.writeFileSync(path.join(OUT_DIR, 'brand', 'jsdc-wheel-mark.png'), wheelBuf);

  // Save the master cropped image for reference
  fs.writeFileSync(path.join(OUT_DIR, 'brand', 'jsdc-wheel-mark.png'), wheelBuf);

  // Compose onto brand gold background. Wheel artwork is black-on-transparent
  // so a solid black background would erase it. Gold matches the existing
  // JSDC Wheels header chip and looks like a finished app icon at all sizes.
  const GOLD = { r: 212, g: 147, b: 65 };  // #d49341
  async function onGold(size) {
    const inner = Math.round(size * 0.78);  // padding around wheel
    const wheel = await sharp(wheelBuf)
      .resize(inner, inner, { fit: 'contain', background: { r: GOLD.r, g: GOLD.g, b: GOLD.b, alpha: 1 } })
      .png()
      .toBuffer();
    return sharp({ create: { width: size, height: size, channels: 4, background: { r: GOLD.r, g: GOLD.g, b: GOLD.b, alpha: 1 } } })
      .composite([{ input: wheel, gravity: 'center' }])
      .png()
      .toBuffer();
  }

  // Transparent variant for browser tabs (most modern browsers handle the
  // black-on-tab silhouette fine on white tab backgrounds; users on dark
  // themes will see it less but still distinguishable from the tab edge).
  async function transparent(size) {
    const inner = Math.round(size * 0.92);
    return sharp(wheelBuf)
      .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .extend({
        top: Math.floor((size - inner) / 2),
        bottom: Math.ceil((size - inner) / 2),
        left: Math.floor((size - inner) / 2),
        right: Math.ceil((size - inner) / 2),
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();
  }

  // 1) favicon.ico — 32x32 PNG on gold (browsers accept PNG-encoded .ico).
  fs.writeFileSync(path.join(OUT_DIR, 'favicon.ico'), await onGold(32));
  console.log('Wrote favicon.ico (32x32 on gold)');

  // 2) favicon-16/32 PNG variants on gold (modern browsers prefer PNG).
  fs.writeFileSync(path.join(OUT_DIR, 'favicon-16.png'), await onGold(16));
  fs.writeFileSync(path.join(OUT_DIR, 'favicon-32.png'), await onGold(32));
  console.log('Wrote favicon-16.png, favicon-32.png (on gold)');

  // 3) apple-touch-icon.png (180x180 for iOS home screen).
  fs.writeFileSync(path.join(OUT_DIR, 'apple-touch-icon.png'), await onGold(180));
  console.log('Wrote apple-touch-icon.png (180x180 on gold)');

  // 4) Android / PWA icons
  fs.writeFileSync(path.join(OUT_DIR, 'icon-192.png'), await onGold(192));
  fs.writeFileSync(path.join(OUT_DIR, 'icon-512.png'), await onGold(512));
  console.log('Wrote icon-192.png, icon-512.png');

  // 5) Replace the Astro-default favicon.svg with a comment placeholder
  //    (we're not generating an SVG version since the source is raster).
  //    Delete it instead so browsers fall back to the PNG/ICO links.
  const svgPath = path.join(OUT_DIR, 'favicon.svg');
  if (fs.existsSync(svgPath)) {
    fs.unlinkSync(svgPath);
    console.log('Removed favicon.svg (legacy Astro default)');
  }

  // ─── Header logo: the OFFICIAL JSDC Wheels lockup ───
  // The official artwork is shipped on a solid black background (jsdc-logo-source-dark.jpg).
  // Strip the black background by making near-black pixels transparent, keep
  // the white car silhouette + wheel and gold JSDC + white "WHEELS" tagline,
  // then alpha-tight crop and render at 1x / 2x.
  const OFFICIAL_LOGO = path.join(ROOT, 'brand', 'jsdc-logo-source-dark.jpg');
  const { data: officialRaw, info: officialInfo } = await sharp(OFFICIAL_LOGO)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  // Threshold: pixels darker than ~30 in all channels become transparent.
  // Use a feathered band (30-55) for soft edges to avoid jagged outlines on
  // antialiased artwork.
  for (let i = 0; i < officialRaw.length; i += 4) {
    const r = officialRaw[i], g = officialRaw[i + 1], b = officialRaw[i + 2];
    const luma = Math.max(r, g, b);
    if (luma < 30) {
      officialRaw[i + 3] = 0;
    } else if (luma < 55) {
      officialRaw[i + 3] = Math.round(((luma - 30) / 25) * 255);
    }
  }
  const transparentLogo = await sharp(officialRaw, {
    raw: { width: officialInfo.width, height: officialInfo.height, channels: 4 },
  }).png().toBuffer();
  // Alpha-tight crop.
  const tlMeta = await sharp(transparentLogo).metadata();
  const tlAlpha = await sharp(transparentLogo).extractChannel(3).raw().toBuffer();
  let tx0 = tlMeta.width, tx1 = 0, ty0 = tlMeta.height, ty1 = 0;
  for (let y = 0; y < tlMeta.height; y++) {
    for (let x = 0; x < tlMeta.width; x++) {
      if (tlAlpha[y * tlMeta.width + x] > 50) {
        if (x < tx0) tx0 = x; if (x > tx1) tx1 = x;
        if (y < ty0) ty0 = y; if (y > ty1) ty1 = y;
      }
    }
  }
  const logoBuf = await sharp(transparentLogo)
    .extract({ left: tx0, top: ty0, width: tx1 - tx0 + 1, height: ty1 - ty0 + 1 })
    .png()
    .toBuffer();
  const logoMeta = await sharp(logoBuf).metadata();
  console.log(`Official logo (transparent): ${logoMeta.width}x${logoMeta.height}`);

  // Render at 1x and 2x retina. Header uses h-12 (48px) / h-14 (56px) on desktop.
  for (const [renderH, suffix] of [[56, ''], [112, '@2x']]) {
    const w = Math.round(logoMeta.width * (renderH / logoMeta.height));
    const out = await sharp(logoBuf)
      .resize(w, renderH, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    fs.writeFileSync(path.join(OUT_DIR, 'brand', `jsdc-logo${suffix}.png`), out);
    console.log(`Wrote brand/jsdc-logo${suffix}.png (${w}x${renderH})`);
  }

  console.log('\nAll favicons written to webapp/public/');
}

main().catch(e => { console.error(e); process.exit(1); });
