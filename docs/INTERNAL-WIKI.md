# GTA Tire — Internal Wiki

> Last updated: 2026-05-06
> For internal use only. Do not commit credentials or share publicly.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture](#2-architecture)
3. [Data Pipeline](#3-data-pipeline)
4. [Internal Database](#4-internal-database)
5. [Build Process](#5-build-process)
6. [Pricing Strategy](#6-pricing-strategy)
7. [Frontend](#7-frontend)
8. [Search System](#8-search-system)
9. [Deployment](#9-deployment)
10. [Supplier Access](#10-supplier-access)
11. [File Reference](#11-file-reference)
12. [Common Operations](#12-common-operations)

---

## 1. Project Overview

**GTA Tire** is a B2B wholesale tire and wheel catalog for GTA Tire Distributor / JSDC Tires and Wheels. The site allows:

- Public customers to browse and search tires and wheels with retail-discounted pricing
- Distributor/dealer customers (logged in) to see wholesale pricing tiers
- Vehicle-based fitment search (Year/Make/Model) to find compatible wheels
- Smart text search (vehicle name, tire size, brand, specs)

**Business owner:** James (JSDC Tires and Wheels / GTA Tire Distributor)

**Live site:** `https://mikedconcepcion.github.io/gtatire/`

**Tech stack:**
- Node.js (CommonJS) — scrapers and build scripts
- Playwright — headless browser for supplier portal scraping
- Astro 5 + React — static site generator with React islands
- Tailwind CSS v4 — styling
- Fuse.js — client-side fuzzy search
- GitHub Actions — CI/CD
- GitHub Pages — hosting

---

## 2. Architecture

The system has three distinct layers that run in sequence:

```
[Supplier Portals] → [Scrapers] → [Raw Data] → [Build Script] → [Static Files] → [Astro Build] → [GitHub Pages]
```

### Layer 1 — Scraping (manual, run locally)
Playwright scripts log into each supplier's B2B portal and extract product data (price, stock, specs, images) into JSON files in `data/`. These scripts run on demand when catalog updates are needed. **Requires VPN for RWC and Superspeed** (Canadian servers). Alltire does not require VPN.

### Layer 2 — Internal DB Build (manual, run locally)
`build-internal-db.js` reads all raw supplier JSON files, assigns internal GTA IDs (GTA-W-XXXX / GTA-T-XXXX), calculates pricing, deduplicates products, merges fitment data, and outputs:
- `data/gta-products.json` — internal master catalog (includes supplier info, not public)
- `data/gta-sku-map.json` — supplier SKU ↔ GTA ID cross-reference (internal)
- `webapp/public/data/*.json` — public-safe data files served by the site

### Layer 3 — Frontend Build + Deploy (automatic via GitHub Actions)
On every push to `main`, GitHub Actions runs `npx astro build` inside `webapp/`. Astro reads the JSON files from `webapp/public/data/` at build time to generate static HTML pages. The built output goes to `webapp/dist/` and is deployed to GitHub Pages.

---

## 3. Data Pipeline

### 3.1 Alltire Wheels — `scrape-alltire-fast.js`

**What it does:** Logs into the Alltire B2B portal (`alltire.ca/weborder.asp`) using Playwright to establish a session, then calls the internal search API directly (much faster than DOM scraping). Iterates Year → Make → Model → each available Diameter and fetches the HTML product table via `searchWheel.asp`.

**API endpoint pattern:**
```
searchWheel.asp?year=X&make=X&model=X&diameter=X&wtype=&by=weborder&cid=6340&checkhub=false
```

**Key parsing notes:**
- Product table rows have 15 `<td>` cells: `[0]`=rowNum, `[3]`=productNo, `[5]`=type, `[6]`=description, `[7]`=price, `[8]`=MSRP, `[9]`=stock
- Steel wheel images: `https://alltire.ca/Wheel/Steel/{productNo}.jpg`
- Alloy wheel images: `https://alltire.ca/Wheel/Alloy/{name}.jpg`
- Scrapes 2020–present only (older vehicles not needed)
- Diameter must be selected for products to appear — iterates all available diameters per model

**Output:** `data/alltire-wheels.json` (also saves intermediate `data/alltire-wheels-scraped.json`)

**Predecessor:** `scrape-alltire-wheels.js` (DOM-based, slower, same output format). Use `scrape-alltire-fast.js` for production runs.

---

### 3.2 Alltire Tires — `scrape-alltire-tires.js`

**What it does:** Logs into Alltire, then searches by tire size (e.g., `2257516` compact format or `225/75R16` full format) across a large pre-defined list of common passenger car and light truck sizes. Captures brand, model, size, price, MSRP, stock, and image for each result.

**Search coverage:** ~200+ tire size combinations across widths 155–315, aspects 25–85, rim diameters 13–24.

**Output:** `data/alltire-tires.json` (also saves `data/alltire-tires-scraped.json`)

---

### 3.3 Alltire Tire Fitment — `scrape-tire-fitment.js`

**What it does:** Uses the Alltire tire search by Year/Make/Model (via `searchTire.asp`) to determine OE tire sizes per vehicle. Builds a map of `"year|make|model"` → `{ tireSizes: [...], oeWheelSize: N }`.

**Scope:** 2020–present vehicles only (controlled by `MIN_YEAR = 2020`).

**Resume support:** Loads existing `alltire-tire-fitment.json` on start and skips already-scraped vehicles.

**Output:** `data/alltire-tire-fitment.json`

---

### 3.4 Superspeed Wheels — `scrape-superspeed.js`

**What it does:** Logs into the Superspeed B2B Angular SPA (`b2b.super-speed.ca/#/login`). Intercepts the login API response to capture the dealer `Aid` (dealer ID). Then calls the REST API directly with `pageSize: 1000` to get all wheels in a single request. Downloads product images from the image API.

**Login credentials:** `james@jsdctiresandwheels.com` / PIN `1125`

**API pattern:**
- Login: POST to endpoint matching `Dealer/login`
- Products: POST `webapi/api/Product/getWheelsListByAengtId` with `{ pageSize: 1000, aengtId: Aid }`
- Images: `webapi/api//Product/GetImage?imgName=FILENAME`

**Volume:** 803 wheels across 81 pages (fetched in one API call)

**Output:** `data/superspeed-wheels-raw.json`, images in `data/images/superspeed/`

**VPN required:** Yes — Canadian IP required (use ExpressVPN → Canada)

---

### 3.5 RWC Wheels — `scrape-rwc.js`

**What it does:** Logs into the RWC OpenCart portal (`gpibtob.com`). Loads all products in a single page using `limit=99999` search URL. Extracts SKU, name, price (dealer cost from hidden `.price-product` div), specs, and images. Also attempts to scrape per-product fitment data.

**Login credentials:** `james@gtatiredistributor.ca` / `gpi123456`

**Volume:** ~964 products

**Key quirk:** Dealer cost is in a `display:none` div toggled by JS — the scraper clicks or evaluates in-page JS to reveal it.

**Output:** `data/rwc-wheels-raw.json`, images in `data/images/rwc/`

**VPN required:** Yes — Canadian IP required (use ExpressVPN → Canada)

---

## 4. Internal Database

### GTA ID System

Every product gets a unique internal identifier assigned by `build-internal-db.js`:

| Format | Category | Example |
|--------|----------|---------|
| `GTA-W-XXXX` | Wheels | `GTA-W-0042` |
| `GTA-T-XXXX` | Tires | `GTA-T-0013` |

Counter resets each time `build-internal-db.js` runs — GTA IDs are **not stable across builds**. Do not use them as permanent external references.

### gta-products.json (`data/gta-products.json`)

Master internal catalog. Contains all products from all suppliers with:
- GTA ID and SKU
- Full pricing (public + wholesale + MSRP)
- All specs
- Image paths (resolved to `/gtatire/data/images/...`)

**Not committed to git.** Gitignored because it contains data derived from scraped supplier portals.

### gta-sku-map.json (`data/gta-sku-map.json`)

Maps each GTA ID back to the original supplier SKU:

```json
{
  "gtaId": "GTA-W-0042",
  "gtaSku": "GTA-W-0042",
  "supplier": "alltire",
  "supplierSku": "AW12345",
  "supplierProductNo": "AW12345"
}
```

Use this to:
- Look up a product on the supplier portal for pricing, stock, or ordering
- Trace a GTA product back to its source
- Update pricing after re-scraping

**Not committed to git.**

### Vehicle Fitment

Fitment data (`fitmentMap`) is built per-product during `build-internal-db.js` using the `vehicleYear|vehicleMake|vehicleModel` keys from Alltire wheel records. Each wheel from Alltire arrives with vehicle metadata (since it was scraped by searching Year/Make/Model). RWC provides fitment data per product when available.

Superspeed does not provide fitment data — those products appear in general search but not vehicle-specific searches.

---

## 5. Build Process

Run from the project root (`E:\James\gtatire\`):

```bash
node scrapers/build-internal-db.js
```

### What it produces

| Output File | Location | Contents |
|-------------|----------|---------|
| `gta-products.json` | `data/` | Internal master catalog (gitignored) |
| `gta-sku-map.json` | `data/` | Supplier SKU mappings (gitignored) |
| `products.json` | `webapp/public/data/` | Public product list |
| `fitment.json` | `webapp/public/data/` | GTA ID → vehicle list |
| `vehicles.json` | `webapp/public/data/` | Year/Make/Model tree |
| `stats.json` | `webapp/public/data/` | Catalog statistics |
| `cross-ref.json` | `webapp/public/data/` | Tire ↔ wheel by rim diameter |
| `tire-fitment.json` | `webapp/public/data/` | Vehicle → OE tire sizes |
| Images | `webapp/public/data/images/wheels/` and `/tires/` | Renamed to GTA SKU |

### Image Handling

Images are copied from `data/images/{supplier}/` to `webapp/public/data/images/wheels/` (or `/tires/`) and renamed to the GTA SKU (e.g., `GTA-W-0042.jpg`). Additional Superspeed images get a suffix: `GTA-W-0042-1.jpg`, `GTA-W-0042-2.jpg`.

The copy is skipped if the destination already exists (idempotent).

### Cross-Reference (cross-ref.json)

Built automatically during the database build. Groups tires and wheels by rim diameter, then for each diameter records the top 20 cheapest tires and 20 cheapest wheels. Used by product detail pages to suggest compatible tires for a wheel (and vice versa).

### Tire Fitment (tire-fitment.json)

Loaded from `data/alltire-tire-fitment.json` if present. Maps `"year|make|model"` → `{ sizes: ["225/65R17", ...], oeWheel: 17 }`. Used by SmartSearchResults to show matching tires when a user searches by vehicle.

### Stats (stats.json)

Computed at build time:
- `totalProducts`, `totalFitments`
- `years`, `makes`, `models` (vehicle tree counts)
- `byType` — count by wheel type / tire category
- `byBrand` — count per brand
- `byDiameter` — count per rim diameter
- `topFinishes` — top 20 finishes by count
- `priceRange` — min/max public price
- `lastUpdated` — ISO timestamp

---

## 6. Pricing Strategy

Pricing is calculated in `build-internal-db.js` by the `calcPricing(msrp, dealerCost)` function.

### Public Price (retail customers)

```
public_price = MSRP × 0.75
```

Shown as the regular price. The MSRP is shown as `compareAt` (strikethrough) to imply a 25% discount.

### Wholesale Price (distributor login)

```
dist_price = dealer_cost × 1.20   (if dealer_cost is known and < public_price)
          OR MSRP × 0.60           (fallback when dealer_cost unavailable or would exceed public)
```

The wholesale price is always capped below the public price.

### Per-Supplier Pricing Source

| Supplier | MSRP Source | Dealer Cost Source |
|----------|-------------|-------------------|
| Alltire Wheels | `msrp` column in product table | `price` column (dealer cost) |
| Alltire Tires | `msrp` field | Estimated as MSRP × 0.60 (hidden on portal) |
| Superspeed | `w.MSRP` from API | `w.COST` from API |
| RWC | Estimated: `dealer_cost × 1.6` | `cost` field (from hidden `.price-product` div) |

### Display

- `price` / `priceNum` — public retail price (75% MSRP)
- `distPrice` / `distPriceNum` — wholesale price (DC+20% or MSRP×60%)
- `compareAt` / `compareAtNum` — MSRP strikethrough
- `PriceDisplay.tsx` component handles showing the correct price based on login state

---

## 7. Frontend

### Stack

- **Astro 5** — static site generation, file-based routing
- **React** — interactive islands (search, visualizer, auth, product detail)
- **Tailwind CSS v4** — dark blue/black theme
- **Base path:** `/gtatire` (GitHub Pages subdirectory)

### Key Pages

| Route | File | Description |
|-------|------|-------------|
| `/` | `pages/index.astro` | Hero + HeroSearch, brand grid, stats display |
| `/wheels` | `pages/wheels.astro` | Full wheel catalog with filters |
| `/tires` | `pages/tires.astro` | Tire catalog |
| `/search` | `pages/search.astro` | Smart search results (React island) |
| `/wheels/[id]` | `pages/wheels/[id].astro` | Individual wheel detail page |
| `/tires/[id]` | `pages/tires/[id].astro` | Individual tire detail page |
| `/vehicle/[year]/[make]/[model]` | `pages/vehicle/[year]/[make]/[model].astro` | Vehicle fitment page |
| `/login` | `pages/login.astro` | Distributor login |
| `/contact` | `pages/contact.astro` | Contact form |
| `/404` | `pages/404.astro` | Custom 404 page |

**Build output:** ~4,246 static pages (2,089 vehicle pages + 2,150 product pages + 7 other)
**Build time:** ~142 seconds

### Key Components

| Component | File | Description |
|-----------|------|-------------|
| `HeroSearch` | `components/search/HeroSearch.tsx` | Homepage search bar with quick-search buttons |
| `SmartSearchResults` | `components/search/SmartSearchResults.tsx` | Full search results with vehicle detection, tire size parsing, Fuse.js fuzzy matching |
| `VehiclePackageBuilder` | `components/search/VehiclePackageBuilder.tsx` | Guided Year/Make/Model → wheel/tire package flow |
| `VehicleSearch` | `components/search/VehicleSearch.tsx` | Classic Year/Make/Model dropdown form |
| `VehicleResults` | `components/VehicleResults.tsx` | Grid of compatible products for a vehicle |
| `ProductCard` | `components/ProductCard.astro` | Reusable product tile |
| `ProductDetail` | `components/ProductDetail.tsx` | Full product detail with image gallery, specs, price |
| `CompatibleProducts` | `components/CompatibleProducts.tsx` | Cross-sell: tires for wheels, wheels for tires (from cross-ref.json) |
| `WheelVisualizer` | `components/WheelVisualizer.tsx` | SVG wheel-on-car visual preview |
| `WheelVisualizerModal` | `components/WheelVisualizerModal.tsx` | Full-screen visualizer modal |
| `AuthProvider` | `components/auth/AuthProvider.tsx` | React context for login state |
| `LoginForm` | `components/auth/LoginForm.tsx` | Distributor login form |
| `PriceDisplay` | `components/auth/PriceDisplay.tsx` | Shows public or wholesale price based on auth state |

### Auth / Login

Currently uses a simple client-side password gate (`gtatire2025`) stored in JS — this is intentionally lightweight for demo purposes. Planned replacement: Supabase auth before production launch.

When logged in, the `AuthProvider` context exposes `isDistributor: true`, which `PriceDisplay` uses to show wholesale pricing. Fitment data (which vehicles fit a product) is also gated to distributor login only — this is competitive information not shown to the public.

### Design Conventions

- Max content width: `max-w-3xl` on product detail pages (not wider — prevents oversized layout on desktop)
- Product images capped at `280px` height
- Dark theme: `primary-950`, `dark-950` backgrounds, `primary-400` accents
- Base path: all internal links use `/gtatire/` prefix (e.g., `href="/gtatire/wheels"`)
- `import.meta.env.BASE_URL` = `/gtatire` (no trailing slash) — always append `/` when building paths

---

## 8. Search System

### Two Search Modes

**1. Classic Vehicle Search (`VehicleSearch`, `/vehicle/[year]/[make]/[model]`)**
Dropdown-based Year/Make/Model selection. On submit, navigates to a static vehicle page that shows all compatible wheels (from `fitment.json`) and OE tire sizes (from `tire-fitment.json`).

**2. Smart Text Search (`SmartSearchResults`, `/search`)**
Handles freeform queries. Runs client-side after fetching `products.json`, `fitment.json`, `vehicles.json`, and `tire-fitment.json`.

### Smart Search Flow

1. **Vehicle detection** — Query checked against known makes, models, and year patterns from `vehicles.json`. Detects patterns like "2022 Toyota RAV4", "Honda Civic", "RAV4". If a vehicle match is found, shows compatible wheels + OE tire sizes.

2. **Tire size detection** — Regex matches patterns like `225/65R17`, `2256517`, `17"`. If detected, filters products by `tireSize` or `rimDiameter`.

3. **Bolt pattern / diameter detection** — Matches `5x114.3`, `18"` etc. Filters by `boltPattern` and `rimDiameter`.

4. **Brand / name matching** — Falls through to Fuse.js fuzzy search across `name`, `brand`, `description`, `boltPattern`, `finish` fields.

5. **Direct productNo match** — Checked first before fuzzy search.

**Fuse.js config:** `ignoreLocation: true`, low threshold — cast a wide net and sort by score.

### VehiclePackageBuilder

A multi-step guided flow that combines vehicle selection + wheel filtering + tire suggestion into a single "package" UX. Used on the homepage and vehicle pages. Make/model maps are embedded in the component for fast client-side filtering without an API call.

---

## 9. Deployment

### GitHub Actions Workflow (`.github/workflows/deploy.yml`)

Triggers on every push to `main` and on manual `workflow_dispatch`.

Steps:
1. Checkout code
2. Setup Node 22
3. `npm ci` inside `webapp/`
4. `npx astro build` inside `webapp/`
5. Upload `webapp/dist/` as GitHub Pages artifact
6. Deploy to GitHub Pages

**Live URL:** `https://mikedconcepcion.github.io/gtatire/`

### Base Path

Astro config (`webapp/astro.config.mjs`):
```js
site: 'https://mikedconcepcion.github.io',
base: '/gtatire',
```

This means:
- All generated URLs are prefixed with `/gtatire`
- `import.meta.env.BASE_URL` = `/gtatire` (no trailing slash)
- All `href` and `src` in `.astro` files must use `/gtatire/` prefix (not bare `/`)
- Data fetches: `` `${import.meta.env.BASE_URL}/data/products.json` ``

### What Is and Is Not Committed

**Committed:**
- All source code (`scrapers/*.js`, `webapp/src/**`)
- Public data files (`webapp/public/data/*.json` — products, fitment, vehicles, stats, cross-ref, tire-fitment)
- Product images (`webapp/public/data/images/`)
- Astro config, package.json, GitHub Actions workflow

**NOT committed (gitignored):**
- `scrapers/config.js` — contains supplier credentials
- `data/` raw scraped JSON files — large, derived data
- `data/images/` — raw supplier images
- `data/gta-products.json`, `data/gta-sku-map.json` — internal DB with supplier info
- `node_modules/`, `dist/`, `.astro/`

---

## 10. Supplier Access

**All three supplier portals are Canadian-region restricted.** Use ExpressVPN connected to a Canadian server before scraping RWC or Superspeed.

| Supplier | Portal URL | VPN Required | Notes |
|----------|-----------|--------------|-------|
| Alltire | `https://alltire.ca/weborder.asp` | No | Classic ASP site, tab-based UI |
| Superspeed | `https://b2b.super-speed.ca/#/login` | Yes (Canada) | Angular SPA, hash routing |
| RWC | `https://gpibtob.com/account/login` | Yes (Canada) | OpenCart-based |

Credentials are stored in `scrapers/config.js` (gitignored). See `reference_credentials.md` in the memory store for credential management notes.

**Never commit `scrapers/config.js` to git.**

---

## 11. File Reference

### Root

| File | Description |
|------|-------------|
| `CLAUDE.md` | OpenWolf context management config |
| `package.json` | Root Node.js manifest (scraper dependencies: playwright, sharp) |
| `.gitignore` | Excludes credentials, raw data, images, node_modules |
| `.github/workflows/deploy.yml` | GitHub Actions: build + deploy to GitHub Pages |

### scrapers/

| File | Description |
|------|-------------|
| `config.js` | Supplier credentials and portal URLs (GITIGNORED) |
| `scrape-alltire-fast.js` | Fast Alltire wheel scraper (API-direct approach) |
| `scrape-alltire-wheels.js` | DOM-based Alltire wheel scraper (slower, legacy) |
| `scrape-alltire-tires.js` | Alltire tire scraper by size |
| `scrape-tire-fitment.js` | Alltire tire fitment scraper (vehicle → OE tire sizes) |
| `scrape-superspeed.js` | Superspeed B2B scraper (REST API) |
| `scrape-rwc.js` | RWC OpenCart scraper |
| `build-internal-db.js` | Merges all raw data → GTA products + public JSON files |
| `build-database.js` | Earlier version of build script (legacy) |
| `download-images.js` | Batch image downloader utility |
| `recon-alltire.js` | Exploration/recon script for Alltire |
| `recon-rwc.js` | Exploration/recon script for RWC |
| `recon-superspeed.js` | Exploration/recon script for Superspeed |
| `test-*.js` | Various test/debug scripts |

### data/ (gitignored, local only)

| File | Description |
|------|-------------|
| `alltire-wheels.json` | Raw Alltire wheel data (per-vehicle-fitment format) |
| `alltire-wheels-scraped.json` | Intermediate scrape checkpoint |
| `alltire-tires.json` | Raw Alltire tire data |
| `alltire-tires-scraped.json` | Intermediate tire scrape checkpoint |
| `alltire-tire-fitment.json` | Vehicle → OE tire sizes (from tire fitment scraper) |
| `alltire-tire-fitment-scraped.json` | Intermediate tire fitment checkpoint |
| `alltire-wheel-tree.json` | Year/Make/Model tree from Alltire |
| `superspeed-wheels-raw.json` | Raw Superspeed API response |
| `rwc-wheels-raw.json` | Raw RWC product data |
| `rwc-fitment-tree.json` | RWC fitment data |
| `gta-products.json` | Internal master catalog (post-build) |
| `gta-sku-map.json` | Supplier SKU ↔ GTA ID mappings (post-build) |
| `images/alltire/` | Downloaded Alltire wheel images |
| `images/superspeed/` | Downloaded Superspeed wheel images |
| `images/rwc/` | Downloaded RWC wheel images |

### webapp/public/data/ (committed, served by site)

| File | Description |
|------|-------------|
| `products.json` | Public product catalog (all products, no supplier info) |
| `fitment.json` | GTA wheel ID → array of "year|make|model" strings |
| `vehicles.json` | Year → Make → Model tree |
| `stats.json` | Catalog statistics (counts, price range, brands) |
| `cross-ref.json` | Rim diameter → top tires + wheels (for cross-sell) |
| `tire-fitment.json` | Vehicle key → OE tire sizes + OE wheel diameter |
| `images/wheels/` | Wheel images renamed to GTA SKUs |
| `images/tires/` | Tire images renamed to GTA SKUs |

### webapp/src/

| File | Description |
|------|-------------|
| `data/products.ts` | TypeScript interfaces + data loading functions |
| `layouts/Layout.astro` | Base HTML layout with Header/Footer |
| `styles/global.css` | Global CSS vars and base styles |
| `pages/index.astro` | Homepage |
| `pages/wheels.astro` | Wheel catalog page |
| `pages/tires.astro` | Tire catalog page |
| `pages/search.astro` | Smart search page (mounts SmartSearchResults) |
| `pages/login.astro` | Distributor login page |
| `pages/contact.astro` | Contact form page |
| `pages/wheels/[id].astro` | Dynamic wheel detail page |
| `pages/tires/[id].astro` | Dynamic tire detail page |
| `pages/vehicle/[year]/[make]/[model].astro` | Vehicle fitment page |
| `components/search/SmartSearchResults.tsx` | Full smart search UI |
| `components/search/VehiclePackageBuilder.tsx` | Guided package builder |
| `components/search/VehicleSearch.tsx` | Year/Make/Model dropdowns |
| `components/search/HeroSearch.tsx` | Homepage search bar |
| `components/ProductDetail.tsx` | Product detail React island |
| `components/CompatibleProducts.tsx` | Cross-sell compatible products |
| `components/VehicleResults.tsx` | Compatible products grid for a vehicle |
| `components/WheelVisualizer.tsx` | Inline SVG wheel visualizer |
| `components/WheelVisualizerModal.tsx` | Full-screen visualizer modal |
| `components/auth/AuthProvider.tsx` | Auth context (login state) |
| `components/auth/LoginForm.tsx` | Distributor login form |
| `components/auth/PriceDisplay.tsx` | Public vs wholesale price display |
| `components/ProductCard.astro` | Product tile card |
| `components/Header.astro` | Site header with nav |
| `components/Footer.astro` | Site footer |

---

## 12. Common Operations

### Re-scrape Alltire Wheels

```bash
# Requires: Node.js, Playwright installed, VPN NOT required for Alltire
cd E:\James\gtatire
node scrapers/scrape-alltire-fast.js
```

Output: `data/alltire-wheels.json`

### Re-scrape Alltire Tires

```bash
node scrapers/scrape-alltire-tires.js
```

Output: `data/alltire-tires.json`

### Re-scrape Tire Fitment

```bash
node scrapers/scrape-tire-fitment.js
```

Output: `data/alltire-tire-fitment.json`
Note: Supports resume — re-running skips already-scraped vehicles.

### Re-scrape Superspeed

```bash
# Requires: ExpressVPN → Canada connected
node scrapers/scrape-superspeed.js
```

Output: `data/superspeed-wheels-raw.json`, images in `data/images/superspeed/`

### Re-scrape RWC

```bash
# Requires: ExpressVPN → Canada connected
node scrapers/scrape-rwc.js
```

Output: `data/rwc-wheels-raw.json`, images in `data/images/rwc/`

### Rebuild the Internal Database

After any scraper has been updated:

```bash
node scrapers/build-internal-db.js
```

This regenerates all files in `data/` and `webapp/public/data/`. Required before deploying updated data.

### Deploy

Push to `main` — GitHub Actions handles the rest automatically:

```bash
git add webapp/public/data/
git commit -m "Update catalog data"
git push origin main
```

Monitor deployment at: `https://github.com/mikedconcepcion/gtatire/actions`

### Run Astro Dev Server Locally

```bash
cd E:\James\gtatire\webapp
npm install
npx astro dev
```

Site runs at `http://localhost:4321/gtatire/`

### Build Astro Locally

```bash
cd E:\James\gtatire\webapp
npx astro build
```

Output goes to `webapp/dist/`.

### Add a New Supplier

1. Create `scrapers/scrape-{supplier}.js` following the pattern of existing scrapers:
   - Use `config.js` for credentials
   - Save raw data to `data/{supplier}-raw.json`
   - Download images to `data/images/{supplier}/`

2. Add credentials to `scrapers/config.js` (never commit this file).

3. Add a processing block to `build-internal-db.js` following the Superspeed or RWC pattern:
   - Load the raw JSON
   - Assign GTA IDs with `nextSku('W')` or `nextSku('T')`
   - Calculate pricing with `calcPricing(msrp, dealerCost)`
   - Copy images with `copyImage(srcPath, gtaId)`
   - Push to `products` and `skuMap` arrays
   - Add fitment if available

4. Add the new raw data file to `.gitignore`.

5. Run `build-internal-db.js` and verify the new products appear in `webapp/public/data/products.json`.

6. Update this wiki with the new supplier's section in Chapter 3.
