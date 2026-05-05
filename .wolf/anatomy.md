# anatomy.md

> Auto-maintained by OpenWolf. Last scanned: 2026-05-05T01:46:36.614Z
> Files: 56 tracked | Anatomy hits: 0 | Misses: 0

## ./

- `.gitignore` — Git ignore rules (~103 tok)
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
- `MEMORY.md` — Memory Index (~165 tok)
- `project_overview.md` (~618 tok)
- `reference_credentials.md` (~253 tok)
- `user_james.md` (~201 tok)

## scrapers/

- `build-database.js` — Build a normalized database from raw scraped data. (~2104 tok)
- `config.js` — Supplier credentials and URLs (~123 tok)
- `download-images.js` — fs: ensureDir, downloadImage, delay, downloadAllImages (~1196 tok)
- `mobile-screenshots.js` — Declares browser (~301 tok)
- `recon-alltire.js` — Declares config (~1122 tok)
- `recon-rwc.js` — Declares config (~1033 tok)
- `recon-superspeed.js` — Declares config (~921 tok)
- `recon-superspeed2.js` — Declares config (~1155 tok)
- `scrape-alltire-fast.js` — fs: delay, save, loadIfExists, parseWheelHtml (~2094 tok)
- `scrape-alltire-tires.js` — fs: delay, save, loadIfExists + 4 more (~3777 tok)
- `scrape-alltire-wheels.js` — fs: delay, save, loadIfExists, scrapeWheelTree, scrapeWheelProducts (~2902 tok)
- `scrape-alltire.js` — fs: delay, login, scrapeWheelTree, scrapeWheelProducts, scrapeTires (~2524 tok)
- `test-all-wheels.js` — config: delay (~1477 tok)
- `test-alltire.js` — fs: delay (~2230 tok)
- `test-api-direct.js` — config: delay (~746 tok)
- `test-column-map.js` — config: delay (~790 tok)
- `test-wheel-extract.js` — config: delay (~1027 tok)

## webapp/

- `astro.config.mjs` — https://astro.build/config (~91 tok)

## webapp/public/

- `robots.txt` (~22 tok)

## webapp/src/components/

- `Footer.astro` — Astro: Footer (~580 tok)
- `Header.astro` — Astro: Header (~818 tok)
- `ProductCard.astro` — Astro: ProductCard (~763 tok)
- `ProductDetail.tsx` — ProductDetailInner (~1959 tok)
- `VehicleResults.tsx` — StockBadge (~2452 tok)
- `WheelVisualizer.tsx` — COLORS (~1787 tok)
- `WheelVisualizerModal.tsx` — COLORS (~3043 tok)

## webapp/src/components/auth/

- `AuthProvider.tsx` — AuthContext (~320 tok)
- `LoginForm.tsx` — LoginForm — renders form (~827 tok)
- `LoginPage.tsx` — LoginPage (~58 tok)
- `PriceDisplay.tsx` — PriceDisplay (~439 tok)

## webapp/src/components/search/

- `SmartSearchResults.tsx` — StockBadge — renders form (~2024 tok)
- `VehicleSearch.tsx` — POPULAR_VEHICLES — renders form (~1908 tok)

## webapp/src/data/

- `products.ts` — Product types and data loading from static JSON files (~594 tok)

## webapp/src/layouts/

- `Layout.astro` — Astro: Layout (~655 tok)

## webapp/src/pages/

- `404.astro` — Astro: 404 (~237 tok)
- `contact.astro` — Astro: contact (~1359 tok)
- `index.astro` — Astro: index (~2163 tok)
- `login.astro` — Astro: login (~74 tok)
- `search.astro` — Astro: search (~156 tok)
- `tires.astro` — Placeholder — tire data will come from the tire scraper (~502 tok)
- `wheels.astro` — Load products at build time (~919 tok)

## webapp/src/pages/vehicle/[year]/[make]/

- `[model].astro` — Astro: [model] (~1476 tok)

## webapp/src/pages/wheels/

- `[id].astro` — Astro: [id] (~1070 tok)

## webapp/src/styles/

- `global.css` — Styles: 4 rules, 24 vars (~371 tok)
