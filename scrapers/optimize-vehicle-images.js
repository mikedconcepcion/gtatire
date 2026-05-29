// One-shot: shrink + recompress every file in webapp/public/images/vehicles/
// so the directory can ship to production via jsDelivr without dragging 470MB
// of PNGs along. Target: ~800px wide, JPEG q85, alpha flattened to white.
// Rewrites vehicle-images.json so paths track the renamed files.

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const VEHICLES = path.join(__dirname, '..', 'webapp', 'public', 'images', 'vehicles');
const MANIFEST = path.join(__dirname, '..', 'webapp', 'public', 'data', 'vehicle-images.json');
const MAX_W = 800;
const Q = 85;

(async () => {
  const files = fs.readdirSync(VEHICLES).filter(f => /\.(jpe?g|png|webp)$/i.test(f));
  console.log(`Optimizing ${files.length} files...`);

  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf-8'));
  const renames = {}; // old basename → new basename

  let beforeBytes = 0, afterBytes = 0, ok = 0, fail = 0;
  const t0 = Date.now();

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const src = path.join(VEHICLES, file);
    const ext = path.extname(file).toLowerCase();
    const stem = path.basename(file, ext);
    const dstName = `${stem}.jpg`;
    const dst = path.join(VEHICLES, dstName);

    try {
      const inputStat = fs.statSync(src);
      beforeBytes += inputStat.size;

      // Sharp can't read+write the same file in one pipeline, so write to a
      // temp then replace.
      const tmp = dst + '.tmp';
      await sharp(src)
        .resize({ width: MAX_W, withoutEnlargement: true })
        .flatten({ background: { r: 255, g: 255, b: 255 } })
        .jpeg({ quality: Q, progressive: true, mozjpeg: true })
        .toFile(tmp);

      // Remove original (may differ from dst if extension changed)
      if (path.resolve(src) !== path.resolve(dst)) fs.unlinkSync(src);
      fs.renameSync(tmp, dst);

      const outputStat = fs.statSync(dst);
      afterBytes += outputStat.size;
      if (file !== dstName) renames[file] = dstName;
      ok++;
    } catch (e) {
      console.error(`  FAIL ${file}: ${e.message}`);
      fail++;
    }

    if ((i + 1) % 200 === 0 || i === files.length - 1) {
      const pct = (((i + 1) / files.length) * 100).toFixed(0);
      const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
      process.stdout.write(`\r  ${i + 1}/${files.length} (${pct}%) — ${elapsed}s`);
    }
  }
  process.stdout.write('\n');

  // Patch the manifest: any "/images/vehicles/foo.png" → "/images/vehicles/foo.jpg"
  let patched = 0;
  for (const [key, p] of Object.entries(manifest)) {
    const base = path.basename(p);
    if (renames[base]) {
      manifest[key] = p.replace(base, renames[base]);
      patched++;
    }
  }
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));

  console.log(`\nDone. ${ok} ok, ${fail} fail`);
  console.log(`  Before: ${(beforeBytes / 1024 / 1024).toFixed(1)} MB`);
  console.log(`  After:  ${(afterBytes / 1024 / 1024).toFixed(1)} MB`);
  console.log(`  Saved:  ${((1 - afterBytes / beforeBytes) * 100).toFixed(1)}%`);
  console.log(`  Manifest entries renamed: ${patched}`);
})().catch(e => { console.error(e); process.exit(1); });
