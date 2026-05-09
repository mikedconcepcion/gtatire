# anatomy.md

> Auto-maintained by OpenWolf. Last scanned: 2026-05-09T03:37:18.013Z
> Files: 79 tracked | Anatomy hits: 0 | Misses: 0

## ./

- `.gitignore` — Git ignore rules (~138 tok)
- `CLAUDE.md` — OpenWolf (~57 tok)

## .claude/

- `settings.json` (~441 tok)

## .claude/rules/

- `openwolf.md` (~313 tok)

## .github/workflows/

- `deploy.yml` — CI: Deploy to GitHub Pages (~246 tok)

## C:/Users/miked/.claude/projects/E--James-gtatire/memory/

- `feedback_basepath.md` (~220 tok)
- `feedback_competitive_data.md` (~189 tok)
- `feedback_design.md` (~177 tok)
- `feedback_hubcentric.md` (~225 tok)
- `feedback_pricing.md` (~200 tok)
- `MEMORY.md` — Memory Index (~188 tok)
- `project_overview.md` (~652 tok)
- `reference_credentials.md` (~253 tok)
- `user_james.md` (~201 tok)

## docs/

- `DATA-DICTIONARY.md` — Full schema documentation for all JSON data files: products, fitment, vehicles, tire-fitment, cross-ref, stats, SKU map, raw scraped data formats (~3000 tok)
- `DATA-DICTIONARY.md` — GTA Tire — Data Dictionary (~4397 tok)
- `INTERNAL-WIKI.md` — Comprehensive internal documentation: architecture, data pipeline, scrapers, pricing, frontend, deployment, supplier access, file reference, common operations (~4200 tok)
- `INTERNAL-WIKI.md` — GTA Tire — Internal Wiki (~6597 tok)

## pricing-analysis/

- `brand-ranking.csv` (~1002 tok)
- `margin-analysis.md` — GTA Tire Distributor -- Brand Margin Analysis (~2515 tok)
- `pricing-strategy.md` — GTA Tire Distributor -- Pricing Strategy Recommendations (~2997 tok)

## scrapers/

- `build-database.js` — Build a normalized database from raw scraped data. (~3800 tok)
- `build-internal-db.js` — Build internal GTA database from raw supplier data. (~5997 tok)
- `config.js` — Supplier credentials and URLs (~123 tok)
- `download-images.js` — fs: ensureDir, downloadImage, delay, downloadAllImages (~1196 tok)
- `mobile-screenshots.js` — Declares browser (~301 tok)
- `recon-alltire.js` — Declares config (~1122 tok)
- `recon-rwc.js` — Declares config (~1033 tok)
- `recon-superspeed.js` — Declares config (~921 tok)
- `recon-superspeed2.js` — Declares config (~1155 tok)
- `scrape-alltire-fast.js` — fs: delay, save, loadIfExists, parseWheelHtml (~2149 tok)
- `scrape-alltire-tires.js` — fs: save, loadIfExists, getSearchSizes (~1925 tok)
- `scrape-alltire-wheels.js` — fs: delay, save, loadIfExists, scrapeWheelTree, scrapeWheelProducts (~2902 tok)
- `scrape-alltire.js` — fs: delay, login, scrapeWheelTree, scrapeWheelProducts, scrapeTires (~2524 tok)
- `scrape-rwc.js` — Declares config (~3039 tok)
- `scrape-superspeed.js` — Declares config (~1435 tok)
- `scrape-tire-fitment.js` — config: save, loadIfExists (~1426 tok)
- `test-all-wheels.js` — config: delay (~1477 tok)
- `test-alltire.js` — fs: delay (~2230 tok)
- `test-api-direct.js` — config: delay (~746 tok)
- `test-column-map.js` — config: delay (~790 tok)
- `test-dc-price.js` — Declares config (~431 tok)
- `test-wheel-extract.js` — config: delay (~1027 tok)

## webapp/

- `astro.config.mjs` — https://astro.build/config (~91 tok)

## webapp/public/

- `llms.txt` — GTA Tire Distributor (~596 tok)
- `robots.txt` (~115 tok)

## webapp/src/components/

- `CompatibleProducts.tsx` — CompatibleProducts (~1721 tok)
- `Footer.astro` — Astro: Footer (~727 tok)
- `Header.astro` — Astro: Header (~1320 tok)
- `ProductCard.astro` — Astro: ProductCard (~1044 tok)
- `ProductDetail.tsx` — ProductDetailInner (~1994 tok)
- `VehicleResults.tsx` — StockBadge (~2453 tok)
- `WheelVisualizer.tsx` — COLORS (~1787 tok)
- `WheelVisualizerModal.tsx` — COLORS (~3106 tok)

## webapp/src/components/auth/

- `AuthProvider.tsx` — AuthContext (~320 tok)
- `LoginForm.tsx` — LoginForm — renders form (~827 tok)
- `LoginPage.tsx` — LoginPage (~58 tok)
- `PriceDisplay.tsx` — PriceDisplay (~500 tok)

## webapp/src/components/search/

- `HeroSearch.tsx` — POPULAR — renders form (~1870 tok)
- `SmartSearchResults.tsx` — StockBadge (~11217 tok)
- `VehicleDropdowns.tsx` — VehicleDropdowns (~1311 tok)
- `VehiclePackageBuilder.tsx` — MAKE_MAP (~5056 tok)
- `VehicleSearch.tsx` — POPULAR_VEHICLES — renders form (~1905 tok)

## webapp/src/data/

- `products.ts` — Product types and data loading from static JSON files (~675 tok)

## webapp/src/layouts/

- `Layout.astro` — Astro: Layout (~2597 tok)

## webapp/src/pages/

- `404.astro` — Astro: 404 (~237 tok)
- `accessibility.astro` — Astro: accessibility (~2199 tok)
- `contact.astro` — Astro: contact (~1359 tok)
- `index.astro` — Astro: index (~2730 tok)
- `login.astro` — Astro: login (~74 tok)
- `privacy.astro` — Astro: privacy (~2559 tok)
- `search.astro` — Astro: search (~79 tok)
- `terms.astro` — Astro: terms (~2685 tok)
- `tires.astro` — Astro: tires (~1742 tok)
- `wheels.astro` — Astro: wheels (~1713 tok)

## webapp/src/pages/tires/

- `[id].astro` — Astro: [id] (~931 tok)

## webapp/src/pages/vehicle/[year]/[make]/

- `[model].astro` — Astro: [model] (~1476 tok)

## webapp/src/pages/wheels/

- `[id].astro` — Astro: [id] (~1259 tok)

## webapp/src/styles/

- `global.css` — Styles: 4 rules, 24 vars (~376 tok)
