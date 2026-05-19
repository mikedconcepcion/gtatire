# anatomy.md

> Auto-maintained by OpenWolf. Last scanned: 2026-05-19T04:07:47.105Z
> Files: 64 tracked | Anatomy hits: 0 | Misses: 0

## ./

- `.gitignore` — Git ignore rules (~390 tok)

## .claude/


## .claude/rules/


## .github/workflows/

- `deploy-cloudflare.yml` — CI: Deploy to Cloudflare Pages (~782 tok)

## C:/Users/miked/.claude/projects/E--James-gtatire/memory/

- `feedback_no_whatsapp.md` (~234 tok)
- `MEMORY.md` — Memory Index (~249 tok)

## _wheel-tier2-pov/

- `compose.py` — autocrop_alpha, paste_wheel, composite_vehicle, main (~1470 tok)
- `README.md` — Project documentation (~514 tok)
- `render_meshes.py` — autocrop_alpha, paste_wheel, render_mesh, main (~1732 tok)
- `requirements.txt` — Python dependencies (~26 tok)
- `run_hunyuan.py` — main (~612 tok)
- `run.py` — log, load_depth_pipe, remove_white_bg, build_pointcloud (~2611 tok)

## _wheel-tier2-pov/TripoSR/tsr/models/

- `isosurface.py` — Swap torchmcubes (CUDA build pain on Windows) for PyMCubes (pure-Python+C, (~681 tok)

## docs/


## pricing-analysis/


## pricing-tool/


## pricing-tool/src/


## pricing-tool/src/components/


## pricing-tool/src/lib/


## scrapers/

- `build-internal-db.js` — Build internal GTA database from raw supplier data. (~10310 tok)
- `probe-alltire-detail.js` — Probe: log in to Alltire, navigate to a known alloy-wheel search result, (~1120 tok)
- `probe-click-diag.js` — Diagnostic: for ONE failing vehicle (2020 Acura ILX), navigate to the (~971 tok)
- `probe-fastco-api.js` — Probe fastco's REST API endpoints with our logged-in session cookies. (~602 tok)
- `probe-fastco-picker.js` — Probe: open fastco's vehicle picker page, dump the dropdown structure (~894 tok)
- `probe-fastco-url-pattern.js` — Probe: try fastco URL variants WITHOUT submodel to see how the site (~789 tok)
- `probe-gpibtob-brands.js` — Probe: enumerate brands/manufacturers on gpibtob.com. Saves the full list (~637 tok)
- `probe-gpibtob-catalog.js` — Probe: gpibtob.com global catalog beyond just RWC-branded items. (~1104 tok)
- `probe-row-icon.js` — Probe: after navigating to a working wheel-search URL, dump the first (~853 tok)
- `probe-rwc-stock.js` — Probe: log in to gpibtob.com, look at both (a) one product on the listing (~1314 tok)
- `recon-fastco-images.js` — Recon: open fastco, you log in + pick dealer + navigate to the (~774 tok)
- `recon-fastco-xhr.js` — Recon: capture every XHR/fetch/JSON call during a configurator session. (~879 tok)
- `scrape-alltire-wheels.js` — fs: delay, save, loadIfExists, scrapeWheelTree, scrapeWheelProducts (~3061 tok)
- `scrape-iconfig-one.js` — Proof-of-one: auto-walk fastco for a single YMM and capture the (~1789 tok)
- `scrape-iconfig-vehicles.js` — Bulk scraper: for each YMM in webapp/public/data/vehicles.json, fetch (~4019 tok)
- `scrape-rwc-fitment.js` — RWC fitment scrape — fetch year/make/model tree from the LIVE portal (~1837 tok)
- `scrape-rwc.js` — Declares config (~3107 tok)
- `scrape-superspeed-fitment.js` — Build Superspeed wheel fitment via AAIA. Walks AAIA's tree (~2164 tok)
- `scrape-tire-fitment.js` — config: save, loadIfExists (~1426 tok)
- `scrape-wheelsize-vehicles.js` — Scrape vehicle reference photos + fitment data from wheel-size.com. (~2810 tok)
- `update-rwc-stock.js` — One-shot: log in to gpibtob.com, fetch the full RWC listing once (~1098 tok)

## scrapers/lib/

- `db.js` — Local SQLite catalog. Source of truth for products + fitment, populated (~2483 tok)

## webapp/

- `package.json` — Node.js package manifest (~180 tok)

## webapp/public/

- `_redirects` — Cloudflare Pages redirects (~641 tok)

## webapp/public/data/

- `vehicle-images.json` (~1 tok)

## webapp/scripts/

- `strip-cdn-assets.mjs` — Strip GitHub-CDN-served assets from dist/ after `astro build` so Cloudflare (~505 tok)

## webapp/src/components/

- `CompatibleProducts.tsx` — CompatibleProducts (~1711 tok)
- `Header.astro` — Astro: Header (~4543 tok)
- `ProductCard.astro` — Astro: ProductCard (~1393 tok)
- `ProductCard.tsx` — TSX version of ProductCard.astro for use inside other React components (~1397 tok)
- `VehicleResults.tsx` — isInStock (~3236 tok)

## webapp/src/components/auth/

- `PriceDisplay.tsx` — PriceDisplay (~494 tok)

## webapp/src/components/detail/

- `TireDetailPage.tsx` — Mirrors WheelDetailPage for /tires/{id} — see that file for the rationale (~1056 tok)
- `TiresListingPage.tsx` — PAGE_SIZE (~1695 tok)
- `VehicleDetailPage.tsx` — Hydrator for /vehicle/{year}/{make}/{model}. Replaces the previously (~1918 tok)
- `WheelDetailPage.tsx` — Reads /wheels/{id} from window.location, fetches products + fitment from the (~1451 tok)
- `WheelsListingPage.tsx` — PAGE_SIZE (~1612 tok)

## webapp/src/components/search/

- `HeroSearch.tsx` — POPULAR — renders form (~2139 tok)
- `SmartSearchResults.tsx` — StockBadge (~12322 tok)
- `VehicleDropdowns.tsx` — VehicleDropdowns (~1512 tok)
- `VehiclePackageBuilder.tsx` — MAKE_MAP (~9529 tok)
- `VehicleSearch.tsx` — POPULAR_VEHICLES — renders form (~1984 tok)

## webapp/src/data/

- `products.ts` — Product types and data loading from static JSON files (~695 tok)

## webapp/src/layouts/

- `Layout.astro` — Astro: Layout (~3806 tok)

## webapp/src/lib/

- `cdn.ts` — CDN base for static catalogue assets (images, large JSON). (~490 tok)

## webapp/src/pages/

- `tires.astro` — Astro: tires (~55 tok)
- `wheels.astro` — Astro: wheels (~56 tok)

## webapp/src/pages/tires/

- `[id].astro` — Parametric SSG for every tire detail page (~4,748). Mirrors the wheel (~587 tok)
- `detail.astro` — Astro: detail (~55 tok)

## webapp/src/pages/vehicle/

- `detail.astro` — Astro: detail (~59 tok)

## webapp/src/pages/vehicle/[year]/[make]/

- `[model].astro` — Parametric SSG route for every vehicle in the catalogue (~7,540 pages). (~675 tok)

## webapp/src/pages/wheels/

- `[id].astro` — Parametric SSG for every wheel detail page (~2,137). Same idea as the (~751 tok)
- `detail.astro` — Astro: detail (~56 tok)

## webapp/src/styles/

