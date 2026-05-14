# Cerebrum

> OpenWolf's learning memory. Updated automatically as the AI learns from interactions.
> Do not edit manually unless correcting an error.
> Last updated: 2026-05-05

## User Preferences

- James (the user/admin) is not the site owner — "james" (the owner) provides credentials and business decisions
- Prefers lightweight webapp, no heavy CMS (rejected WordPress/WooCommerce approach)
- Wants AI-like intelligent search, not tree-based dropdowns
- Key feature: wheel visualizer — customers see how wheels fit on their car
- Don't expose cross-vehicle fitment data to customers — that's competitive info. Product pages should NOT show "fits these other vehicles"

## Key Learnings

- **Project:** gtatire
- **Supplier portals are Canadian-region restricted** — All three portals (Alltire, RWC, Superspeed) work with ExpressVPN connected to Canada
- **Alltire portal is classic ASP** — tab-based UI, Year/Make/Model dropdowns for wheels and fitment, text search for tires. Data loads dynamically via JS, no REST API
- **Superspeed B2B is an Angular SPA** — hash routing (#/login), needs SPA-aware scraping with wait times
- **Superspeed PIN is 1125** (not 1308). Login: james@jsdctiresandwheels.com / 1125. Lands on `#/app/product/productWheels`
- **Superspeed has 803 wheels** — paginated (81 pages, 10/page). Table columns: Image, Brand, SKU, Model, Diameter, Width, ET, PCD, CB, Seat, Finish, Inventory, ETA, MSRP. Also has accessories (lug nuts, bolts, hub rings, spacers, TPMS, center caps)
- **RWC (gpibtob.com) is OpenCart-based** — Year/Make/Model wheel search at `/product/searchwheel`, brands at `/product/manufacturer`, quick search input. Logged in as james@gtatiredistributor.ca / gpi123456
- **Alltire search fields:** Quick Size (compact format e.g. 2257516), Product No., Description, Maker, Model, Full Size (e.g. LT225/75R16)
- **Alltire wheel search:** Year → Make → Model → Diameter → Steel/Alloy/All + Hub Centric filter
- **Alltire API endpoint:** `searchWheel.asp?year=X&make=X&model=X&diameter=X&wtype=&by=weborder&cid=6340&checkhub=false` — returns HTML table directly, much faster than DOM scraping
- **Wheel product table columns (15 cells):** [0]=rowNum [1]=hubCentric [2]=empty [3]=productNo [4]=image [5]=type [6]=description [7]=price [8]=msrp [9]=stock [10-13]=qty [14]=Add
- **Image URLs:** `https://alltire.ca/Wheel/Steel/{productNo}.jpg` or `Alloy/{name}.jpg`
- **GitHub Pages base path:** Site at `/gtatire/` — all links need prefix, `import.meta.env.BASE_URL` resolves to `/gtatire` (no trailing slash!) in client JS
- **Astro static generation:** ~8,999 pages — 12 static .astro routes + 2,089 vehicle + 2,150 wheel detail + 4,748 tire detail (as of 2026-05-13). Was 4,246 at 2026-05-04 before tire detail pages got their own routes. Build time scales with page count — expect 3+ min for full generation.
- **Superspeed API is clean REST** — POST to `webapi/api/Product/getWheelsListByAengtId` with `pageSize:1000` returns all 803 wheels in one request. Image API: `webapi/api//Product/GetImage?imgName=FILENAME`. Login returns dealer ID (`Aid`) needed for API calls
- **RWC (gpibtob.com) is OpenCart** — search `?route=product/search&search=RWC&limit=99999` returns all 964 products. Dealer cost is hidden in `.price-product` div (display:none), toggled by JS click. SKU in `.cart-button .pull-right` span
- **Multi-supplier database:** build-internal-db.js merges Alltire wheels (383) + tires (4,748), Superspeed (803), RWC (964) = 6,898 total. Internal GTA SKU system (GTA-W-XXXX, GTA-T-XXXX). No supplier names in public output.
- **Tire fitment:** 9,153 vehicles (2020-2026) with OE tire sizes from `searchTire.asp` API. Stored in tire-fitment.json.
- **Vehicle Package Builder:** Interactive component — select tire + wheel, live 4+4 pricing, season picker, alloy/steel toggle, IMAGIN.studio vehicle render with color/angle
- **Hub centric policy:** Vehicle search only shows hub centric wheels (from Alltire fitment). Aftermarket wheels browsable by brand/spec but not in fitment results.
- **noImage fallback:** 228 products with placeholder images use SVG fallbacks (tire silhouette or wheel rim icon). Threshold: tire images < 10KB = placeholder.
- **Fuse.js for smart search:** client-side fuzzy matching, also parses diameter ("18") and bolt pattern ("5x114.3") from queries
- **Vehicle package recommendations mix tiers + brands:** `diversifyMix()` in VehiclePackageBuilder.tsx splits products into 3 price terciles (budget/mid/premium), then round-robins by brand within each tier. Result: top 20 cards span all 3 tiers and multiple brands, not just the cheapest brand stacked. Applied to filteredTires, alloy wheels, steel wheels, and fallback wheel list. Final order still sorted by price ascending.

## Do-Not-Repeat

- [2026-05-04] Alltire wheel search requires Year → Make → Model → **Diameter** selection before products load. Without diameter, the product table stays empty. Always iterate through each diameter for every model.
- [2026-05-04] The Alltire wheel products load as regular HTML `<tr>` rows (not Tabulator widgets). Product rows have 12+ `<td>` cells where cell[0] is a row number (digit).
- [2026-05-04] Don't use relative paths like `../data` in Node scripts run from different CWDs. Use `path.join(__dirname, '..', 'data')` instead.
- [2026-05-04] `import.meta.env.BASE_URL` in Astro client bundles does NOT include trailing slash. Always add `/` between BASE_URL and the path: `` `${import.meta.env.BASE_URL}/data/file.json` `` not `` `${import.meta.env.BASE_URL}data/file.json` ``
- [2026-05-04] All hardcoded `href="/"` in .astro files must be `href="/gtatire/"` for GitHub Pages subpath deployment. Same for `/wheels`, `/search`, etc.
- [2026-05-05] Product detail pages were "way too large" on desktop. Use max-w-3xl, not 5xl or 7xl. Cap image height at 280px.

## Decision Log

- [2026-05-04] **Tech stack: Astro + React + Tailwind v4** — chosen for lightweight static output, React islands for interactive components (search, visualizer), Tailwind for mobile-first blue/black theme. Rejected WordPress/WooCommerce (too heavy, existing site already uses it).
- [2026-05-04] **Scrape 2020-present only** — user decided older vehicles aren't needed, cuts scraping time by 75%.
- [2026-05-04] **Supabase for auth/DB** — free tier sufficient, handles distributor login, wholesale pricing tiers.
- [2026-05-04] **Dual search: classic Year/Make/Model + smart text search** — users expect the classic dropdown flow but also want intelligent search as a differentiator.
- [2026-05-04] **Direct API scraping over DOM scraping** — calling searchWheel.asp directly via fetch (with session cookies from Playwright login) is 10x faster than clicking through the UI. Headless browser just provides the session.
- [2026-05-04] **Simple password gate for demo** — hardcoded password in client JS (gtatire2025) is fine for demo. Will replace with Supabase auth before production.
- [2026-05-05] **Fitment data is distributor-only** — product pages show vehicle fitment list only when logged in. Public customers see specs/price/stock only.
