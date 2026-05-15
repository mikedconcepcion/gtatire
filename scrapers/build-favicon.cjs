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

  // ─── Header logo: JSDC wordmark + wheel horizontal lockup ───
  // The banner has wordmark/tagline/wheel stacked vertically, so a single
  // rectangular crop always grabs the tagline. Extract wordmark and wheel
  // separately (alpha-tight) and composite side-by-side.
  async function tightExtract(crop) {
    const rough = await sharp(BANNER).extract(crop).png().toBuffer();
    const meta = await sharp(rough).metadata();
    const alpha = await sharp(rough).extractChannel(3).raw().toBuffer();
    let lx = meta.width, lX = 0, ly = meta.height, lY = 0;
    for (let y = 0; y < meta.height; y++) {
      for (let x = 0; x < meta.width; x++) {
        if (alpha[y * meta.width + x] > 50) {
          if (x < lx) lx = x; if (x > lX) lX = x;
          if (y < ly) ly = y; if (y > lY) lY = y;
        }
      }
    }
    return sharp(rough).extract({ left: lx, top: ly, width: lX - lx + 1, height: lY - ly + 1 }).png().toBuffer();
  }

  // Wordmark only (no tagline below) — vertical range stops above tagline
  const wordmarkBuf = await tightExtract({ left: 150, top: 330, width: 820, height: 120 });
  const wordmarkMeta = await sharp(wordmarkBuf).metadata();
  console.log(`Wordmark: ${wordmarkMeta.width}x${wordmarkMeta.height}`);

  // Wheel — reuse the favicon's tight bounds, but replace the black artwork
  // pixels with brand gold so the wheel reads on the dark header. Build a
  // solid gold rectangle the same size as the wheel, then use the wheel's
  // alpha as a "dest-in" mask: gold pixels survive only where the original
  // wheel artwork was opaque.
  const wheelMetaPre = await sharp(wheelBuf).metadata();
  const goldLayer = await sharp({
    create: {
      width: wheelMetaPre.width,
      height: wheelMetaPre.height,
      channels: 4,
      background: { r: 212, g: 147, b: 65, alpha: 1 },
    },
  }).png().toBuffer();
  const wheelLogoBuf = await sharp(goldLayer)
    .composite([{ input: wheelBuf, blend: 'dest-in' }])
    .png()
    .toBuffer();
  const wheelLogoMeta = await sharp(wheelLogoBuf).metadata();
  console.log(`Wheel  : ${wheelLogoMeta.width}x${wheelLogoMeta.height} (gold-filled for dark bg)`);

  // Composite at unified height. Pick a render height (e.g. 80px for retina).
  for (const [renderH, suffix] of [[40, ''], [80, '@2x']]) {
    const wordW = Math.round(wordmarkMeta.width * (renderH / wordmarkMeta.height));
    const wheelW = Math.round(wheelLogoMeta.width * (renderH / wheelLogoMeta.height));
    const gap = Math.round(renderH * 0.15);
    const totalW = wordW + gap + wheelW;

    const wordResized = await sharp(wordmarkBuf).resize(wordW, renderH, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    const wheelResized = await sharp(wheelLogoBuf).resize(wheelW, renderH, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();

    const composed = await sharp({
      create: { width: totalW, height: renderH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([
        { input: wordResized, left: 0, top: 0 },
        { input: wheelResized, left: wordW + gap, top: 0 },
      ])
      .png()
      .toBuffer();

    fs.writeFileSync(path.join(OUT_DIR, 'brand', `jsdc-logo${suffix}.png`), composed);
    console.log(`Wrote brand/jsdc-logo${suffix}.png (${totalW}x${renderH})`);
  }

  console.log('\nAll favicons written to webapp/public/');
}

main().catch(e => { console.error(e); process.exit(1); });
