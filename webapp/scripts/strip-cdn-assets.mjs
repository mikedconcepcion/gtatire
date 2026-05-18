// Strip GitHub-CDN-served assets from dist/ after `astro build` so Cloudflare
// Pages only deploys the page shells + JS/CSS. Big JSON and images are kept
// in the source tree (webapp/public/) so local dev still works, but they're
// served in production from jsDelivr against the GitHub repo.
//
// Run automatically by `npm run build` (see package.json).

import fs from 'node:fs';
import path from 'node:path';

const DIST = path.join(process.cwd(), 'dist');

const dirsToStrip = [
  'data/images',          // wheel + tire product photos (~8,800 files)
  'images/vehicles',      // vehicle reference renders (~1,900 files)
];

const filesToStrip = [
  'data/products.json',
  'data/fitment.json',
  'data/vehicles.json',
  'data/stats.json',
  'data/cross-ref.json',
  'data/tire-fitment.json',
];

function countFiles(dir) {
  if (!fs.existsSync(dir)) return 0;
  let n = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    n += entry.isDirectory() ? countFiles(p) : 1;
  }
  return n;
}

const before = countFiles(DIST);
let removed = 0;

for (const rel of dirsToStrip) {
  const abs = path.join(DIST, rel);
  if (fs.existsSync(abs)) {
    const n = countFiles(abs);
    fs.rmSync(abs, { recursive: true, force: true });
    removed += n;
    console.log(`  strip ${rel}/ → ${n} files`);
  }
}

for (const rel of filesToStrip) {
  const abs = path.join(DIST, rel);
  if (fs.existsSync(abs)) {
    fs.rmSync(abs);
    removed += 1;
    console.log(`  strip ${rel}`);
  }
}

const after = countFiles(DIST);
console.log(`dist/: ${before} files → ${after} files (-${removed})`);
if (after >= 20000) {
  console.warn(`⚠  dist/ still has ${after} files, over Cloudflare Pages' 20k limit`);
  process.exit(1);
}
