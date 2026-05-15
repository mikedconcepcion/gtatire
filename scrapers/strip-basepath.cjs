// One-shot script: strip /gtatire/ basepath and BASE_URL templates from
// all webapp source files. Used during the Cloudflare migration.

const fs = require('fs');
const path = require('path');

const files = [
  'webapp/src/components/Footer.astro',
  'webapp/src/components/Header.astro',
  'webapp/src/layouts/Layout.astro',
  'webapp/src/components/search/HeroSearch.tsx',
  'webapp/src/components/search/VehicleSearch.tsx',
  'webapp/src/components/search/VehiclePackageBuilder.tsx',
  'webapp/src/pages/wheels/[id].astro',
  'webapp/src/pages/vehicle/[year]/[make]/[model].astro',
  'webapp/src/pages/tires/[id].astro',
  'webapp/src/pages/terms.astro',
  'webapp/src/pages/index.astro',
  'webapp/src/pages/accessibility.astro',
  'webapp/src/pages/404.astro',
  'webapp/src/components/VehicleResults.tsx',
  'webapp/src/components/search/VehicleDropdowns.tsx',
  'webapp/src/components/search/SmartSearchResults.tsx',
  'webapp/src/components/ProductDetail.tsx',
  'webapp/src/components/ProductCard.astro',
  'webapp/src/components/CompatibleProducts.tsx',
  'webapp/src/components/auth/LoginForm.tsx',
  'webapp/public/llms.txt',
  'webapp/public/robots.txt',
];

let total = 0;
for (const rel of files) {
  const p = path.join(__dirname, '..', rel);
  if (!fs.existsSync(p)) { console.log(`SKIP (missing): ${rel}`); continue; }
  let s = fs.readFileSync(p, 'utf8');
  const before = s;

  // 1. Hardcoded /gtatire/... paths → /...
  s = s.replace(/\/gtatire\//g, '/');
  // 2. /gtatire at end of string or path component (rare) → /
  s = s.replace(/\/gtatire(?=["'`/\\?#\s)])/g, '');

  // 3. Template literals that compose BASE_URL with paths:
  //    `${import.meta.env.BASE_URL}/path` → `/path`
  //    `${base}/path` → `/path`
  s = s.replace(/\$\{import\.meta\.env\.BASE_URL\}\/?/g, '/');
  s = s.replace(/\$\{base\}\/?/g, '/');

  // 4. Image src strings using template that should now be plain /
  //    src={`/${something}`} sometimes produces // — collapse:
  s = s.replace(/(["'])\/\/+(?=\w)/g, '$1/');

  // 5. const base = import.meta.env.BASE_URL... lines — these are now no-ops.
  //    Remove the line entirely (with trailing newline).
  s = s.replace(/^\s*const\s+base\s*=\s*import\.meta\.env\.BASE_URL[^;\n]*;?\s*\n/gm, '');

  // 6. Inline import.meta.env.BASE_URL fragments remaining
  s = s.replace(/import\.meta\.env\.BASE_URL\.replace\([^)]*\)/g, "''");
  s = s.replace(/import\.meta\.env\.BASE_URL/g, "''");

  if (s !== before) {
    fs.writeFileSync(p, s);
    const diff = (before.match(/\/gtatire/g) || []).length;
    console.log(`✓ ${rel} (${diff} /gtatire refs cleaned)`);
    total++;
  } else {
    console.log(`  ${rel} (no changes)`);
  }
}
console.log(`\nTotal files modified: ${total}`);
