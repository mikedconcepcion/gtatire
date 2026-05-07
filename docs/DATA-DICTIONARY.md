# GTA Tire — Data Dictionary

> Last updated: 2026-05-06
> Documents all JSON schemas used in the GTA Tire data pipeline.

---

## Table of Contents

1. [products.json — Public Product Schema](#1-productsjson--public-product-schema)
2. [fitment.json — Wheel Fitment Schema](#2-fitmentjson--wheel-fitment-schema)
3. [vehicles.json — Vehicle Tree Schema](#3-vehiclesjson--vehicle-tree-schema)
4. [tire-fitment.json — Tire Fitment Schema](#4-tire-fitmentjson--tire-fitment-schema)
5. [cross-ref.json — Cross-Reference Schema](#5-cross-refjson--cross-reference-schema)
6. [stats.json — Catalog Stats Schema](#6-statsjson--catalog-stats-schema)
7. [gta-sku-map.json — SKU Map Schema (Internal)](#7-gta-sku-mapjson--sku-map-schema-internal)
8. [gta-products.json — Internal Product Schema](#8-gta-productsjson--internal-product-schema)
9. [Raw Scraped Data Schemas](#9-raw-scraped-data-schemas)

---

## 1. products.json — Public Product Schema

**File:** `webapp/public/data/products.json`
**Format:** JSON array of Product objects
**Served at:** `/gtatire/data/products.json`

This is the primary public product catalog. It is loaded client-side by search and product detail components. It contains no supplier-identifying information.

### Product Object

```typescript
interface Product {
  id: string;            // GTA internal ID — "GTA-W-0042" or "GTA-T-0013"
  sku: string;           // Same as id (duplicate field for compatibility)
  category: 'wheel' | 'tire';
  brand: string;         // Brand name — "Superspeed", "RWC", "Steel", "Macpek", "Michelin", etc.
  wheelType: string;     // Wheel: "Steel Wheel" | "Alloy Wheel". Tire: "All Season" | "Winter" | etc.
  name: string;          // Model name — e.g., "Rocktrix", "RT205"
  description: string;   // Full description string — e.g., "RT205 18x8 5x114.3 ET35 CB73.1 Gloss Black"
  image: string;         // Primary image path — "/gtatire/data/images/wheels/GTA-W-0042.jpg"
  images?: string[];     // Additional images (Superspeed only) — ["/gtatire/data/images/wheels/GTA-W-0042-1.jpg", ...]

  // Pricing
  price: string;         // Public retail price — "$89.99" (75% of MSRP). Empty string if unknown.
  priceNum: number;      // Public price as float — 89.99. 0 if unknown.
  distPrice: string;     // Wholesale price — "$74.99" (DC+20% or MSRP×60%). Empty if unknown.
  distPriceNum: number;  // Wholesale price as float. 0 if unknown.
  compareAt: string;     // MSRP strikethrough price — "$119.99". Empty if unknown.
  compareAtNum: number;  // MSRP as float. 0 if unknown.

  // Inventory
  stock: string;         // Stock status — "20+ In Stock" | "7 In Stock" | "Out of Stock" | "ETA: Jun 2026" | "Available"

  // Wheel specs (null/empty for tires)
  hubCentric: boolean;   // Whether the wheel is hub-centric
  rimDiameter: number | null;  // Rim diameter in inches — 18. Also used for tires (rim size).
  rimWidth: number | null;     // Rim width in inches — 8.0 (wheels only; null for tires)
  boltPattern: string;         // Bolt pattern — "5x114.3". Empty for tires.
  offset: number | null;       // ET offset in mm — 35. Null if unknown.
  hubBore: number | null;      // Center bore in mm — 73.1. Null if unknown.
  finish: string;              // Finish/color — "Gloss Black", "Silver", "Machine Face". Empty for tires.
  seat?: string;               // Lug nut seat type (Superspeed only) — "Conical" | "Ball" | etc.
  tpmsCompatible?: string;     // TPMS compatibility note (RWC only)
  runflatCertified?: string;   // Runflat certification (RWC only)
  loadRating?: string;         // Load rating (RWC only)

  // Tire specs (null/empty for wheels)
  tireSize?: string;           // Full tire size string — "225/65R17"
  tireWidth?: number | null;   // Section width in mm — 225
  tireAspect?: number | null;  // Aspect ratio — 65
  // Note: rimDiameter is reused for tires to store rim fitment diameter
}
```

### Notes

- `id` and `sku` are always identical. Both exist for historical compatibility.
- `rimDiameter` is shared between wheels and tires. For tires it represents the rim diameter the tire fits (e.g., a `225/65R17` tire has `rimDiameter: 17`).
- The `price`, `distPrice`, and `compareAt` fields are formatted strings. Use `priceNum`, `distPriceNum`, `compareAtNum` for sorting and comparison.
- Images are always served from `/gtatire/data/images/wheels/` or `/gtatire/data/images/tires/` — no external image URLs.
- Superspeed products may have 1–3 images in `images[]`. Alltire and RWC products typically have one image.
- GTA IDs are reassigned on every full database rebuild — do not rely on them as stable external identifiers.

---

## 2. fitment.json — Wheel Fitment Schema

**File:** `webapp/public/data/fitment.json`
**Format:** JSON object (map)
**Served at:** `/gtatire/data/fitment.json`

Maps each GTA wheel product ID to the list of vehicles it fits.

```typescript
interface FitmentMap {
  [gtaId: string]: string[];  // Array of "year|make|model" strings
}
```

### Example

```json
{
  "GTA-W-0042": [
    "2021|Toyota|RAV4",
    "2022|Toyota|RAV4",
    "2023|Toyota|RAV4",
    "2021|Honda|CR-V"
  ],
  "GTA-W-0043": [
    "2020|Ford|F-150"
  ]
}
```

### Notes

- Keys are GTA wheel IDs. Only wheels appear here — tires do not have vehicle fitment in this file.
- Vehicle strings use `year|make|model` format with pipe separators.
- Year is a 4-digit string. Make and model use the same casing as in `vehicles.json`.
- Fitment comes from Alltire wheel data (which is scraped per-vehicle) and RWC product data where available.
- Superspeed wheels have no fitment data — they don't appear in this map.
- Used by: `getProductsForVehicle()` in `products.ts`, `VehicleResults`, `SmartSearchResults`.

---

## 3. vehicles.json — Vehicle Tree Schema

**File:** `webapp/public/data/vehicles.json`
**Format:** JSON object (nested tree)
**Served at:** `/gtatire/data/vehicles.json`

Year → Make → Model tree for populating the vehicle search UI and detecting vehicle names in smart search.

```typescript
interface VehicleTree {
  [year: string]: {
    [make: string]: {
      [model: string]: string[];  // Array of available diameters for this vehicle
      // OR in some cases, a flat array (legacy format):
    } | string[];
  };
}
```

### Example

```json
{
  "2022": {
    "Toyota": {
      "RAV4": ["17", "18", "19"],
      "Camry": ["17", "18"]
    },
    "Honda": {
      "Civic": ["16", "17", "18"],
      "CR-V": ["17", "18"]
    }
  }
}
```

### Notes

- Year keys are strings ("2022" not 2022).
- Make and model casing matches Alltire's portal data.
- The leaf values (diameter arrays) come from the Alltire wheel tree scraper.
- This file is built from `data/alltire-wheel-tree.json` during the database build.
- Covers 2020–present (older vehicles excluded by scraper config).
- Used by: `VehicleSearch`, `VehiclePackageBuilder`, `SmartSearchResults` (vehicle detection), vehicle page static generation.

---

## 4. tire-fitment.json — Tire Fitment Schema

**File:** `webapp/public/data/tire-fitment.json`
**Format:** JSON object (map)
**Served at:** `/gtatire/data/tire-fitment.json`

Maps each vehicle to its OE (original equipment) tire sizes and rim diameter.

```typescript
interface TireFitmentMap {
  [vehicleKey: string]: {
    sizes: string[];       // Array of OE tire sizes — ["225/65R17", "235/60R17"]
    oeWheel: number | null; // OE rim diameter in inches — 17. Null if not determined.
  };
}
```

### Example

```json
{
  "2022|Toyota|RAV4": {
    "sizes": ["225/65R17", "235/55R19"],
    "oeWheel": 17
  },
  "2022|Honda|Civic": {
    "sizes": ["215/55R16", "235/40R18"],
    "oeWheel": 16
  }
}
```

### Notes

- Vehicle key format: `"year|make|model"` — same as fitment.json.
- `sizes` contains all OE tire sizes for the vehicle (multiple trims may have different sizes).
- `oeWheel` is the most common OE rim diameter for the vehicle.
- This data is sourced from `scrape-tire-fitment.js` → `data/alltire-tire-fitment.json`.
- Used by: `SmartSearchResults` to show matching tires when a user searches by vehicle name.
- May not exist if the tire fitment scraper has not been run — the file is only generated if `alltire-tire-fitment.json` is present in `data/`.

---

## 5. cross-ref.json — Cross-Reference Schema

**File:** `webapp/public/data/cross-ref.json`
**Format:** JSON object (map)
**Served at:** `/gtatire/data/cross-ref.json`

Groups tires and wheels by rim diameter for cross-sell recommendations on product detail pages.

```typescript
interface CrossRefMap {
  [rimDiameter: string]: {
    tires: CrossRefItem[];   // Top compatible tires (up to 20, sorted by price)
    wheels: CrossRefItem[];  // Top compatible wheels (up to 20, sorted by price)
  };
}

interface CrossRefItem {
  id: string;         // GTA product ID
  name: string;       // Product name
  brand: string;      // Brand name
  priceNum: number;   // Public price as float
  image: string;      // Image path
  // For tires only:
  tireSize?: string;  // Tire size string — "225/65R17"
  type?: string;      // Tire type — "All Season"
  // For wheels only:
  boltPattern?: string; // Bolt pattern — "5x114.3"
}
```

### Example

```json
{
  "17": {
    "tires": [
      { "id": "GTA-T-0023", "name": "Optimo H724", "brand": "Hankook", "tireSize": "225/65R17", "priceNum": 89.99, "image": "/gtatire/data/images/tires/GTA-T-0023.jpg" }
    ],
    "wheels": [
      { "id": "GTA-W-0042", "name": "RT205", "brand": "Rocktrix", "boltPattern": "5x114.3", "priceNum": 119.99, "image": "/gtatire/data/images/wheels/GTA-W-0042.jpg" }
    ]
  }
}
```

### Notes

- Keys are rim diameter strings ("17", "18", etc.).
- Both arrays are sorted by `priceNum` ascending (cheapest first) and capped at 20 items each.
- Used by `CompatibleProducts.tsx` on product detail pages.
- Cross-reference is based purely on rim diameter — bolt pattern compatibility is NOT checked here. It's a "same diameter" suggestion, not a guaranteed fitment match.

---

## 6. stats.json — Catalog Stats Schema

**File:** `webapp/public/data/stats.json`
**Format:** JSON object
**Served at:** `/gtatire/data/stats.json`

Summary statistics for the catalog. Used on the homepage to display catalog scale.

```typescript
interface CatalogStats {
  totalProducts: number;    // Total products across all suppliers — e.g., 2150
  totalFitments: number;    // Total product-vehicle fitment pairs — e.g., 45000
  years: number;            // Number of unique vehicle years — e.g., 5
  makes: number;            // Number of unique makes — e.g., 30
  models: number;           // Number of unique models — e.g., 180
  byType: {                 // Product count per wheel type / tire category
    [type: string]: number; // e.g., "Steel Wheel": 383, "All Season": 450
  };
  byBrand: {                // Product count per brand
    [brand: string]: number; // e.g., "Superspeed": 803, "RWC": 964, "Steel": 200
  };
  byDiameter: {             // Product count per rim diameter
    [diameter: string]: number; // e.g., "17": 320, "18": 450
  };
  topFinishes: [string, number][]; // Top 20 finishes by count — [["Gloss Black", 120], ...]
  priceRange: {
    min: number;            // Lowest public price — e.g., 39.99
    max: number;            // Highest public price — e.g., 599.99
  };
  lastUpdated: string;      // ISO 8601 timestamp — "2026-05-06T14:32:00.000Z"
}
```

### Notes

- Regenerated every time `build-internal-db.js` runs.
- `totalFitments` counts vehicle-product pairs, not unique vehicles or products.
- `byType` includes both wheel types (Steel Wheel, Alloy Wheel) and tire categories (All Season, Winter, etc.) in the same object.
- Used by: `pages/index.astro` for homepage stats display.

---

## 7. gta-sku-map.json — SKU Map Schema (Internal)

**File:** `data/gta-sku-map.json`
**Format:** JSON array
**NOT committed to git (gitignored)**

Maps each GTA internal ID back to the original supplier SKU for reverse lookup and ordering.

```typescript
interface SkuMapEntry {
  gtaId: string;              // GTA internal ID — "GTA-W-0042"
  gtaSku: string;             // Same as gtaId (duplicate field)
  supplier: string;           // Source supplier — "alltire" | "superspeed" | "rwc"
  supplierSku: string;        // Supplier's own SKU/product number
  supplierProductNo: string;  // Same as supplierSku (duplicate field)
}
```

### Example

```json
[
  {
    "gtaId": "GTA-W-0042",
    "gtaSku": "GTA-W-0042",
    "supplier": "superspeed",
    "supplierSku": "SS-RT205-18X8-5114-35-73-GB",
    "supplierProductNo": "SS-RT205-18X8-5114-35-73-GB"
  }
]
```

### Notes

- Use this file to trace a GTA product back to its source for re-ordering or price verification.
- `gtaId` and `gtaSku` are always the same value.
- `supplierSku` and `supplierProductNo` are always the same value.
- This file is gitignored to avoid exposing supplier relationship data.

---

## 8. gta-products.json — Internal Product Schema

**File:** `data/gta-products.json`
**Format:** JSON array
**NOT committed to git (gitignored)**

The internal master product catalog. Identical schema to `products.json` but retained in `data/` for internal use (e.g., building order reports, supplier analysis).

The public `products.json` is derived from this file with no fields stripped (currently both files are structurally identical — no supplier-identifying fields exist in the product object itself, since supplier info lives in `gta-sku-map.json`).

See [Section 1](#1-productsjson--public-product-schema) for the full product schema.

---

## 9. Raw Scraped Data Schemas

These files are produced by the scraper scripts and consumed by `build-internal-db.js`. They are gitignored.

### alltire-wheels.json

Array of wheel records, one per vehicle-product combination (same product appears multiple times if it fits multiple vehicles).

```typescript
interface AlltireWheelRaw {
  productNo: string;       // Alltire product number — "12345"
  vehicleYear: string;     // Year — "2022"
  vehicleMake: string;     // Make — "Toyota"
  vehicleModel: string;    // Model — "RAV4"
  diameter: string;        // Rim diameter — "18"
  wheelType: string;       // "Steel Wheel" | "Alloy Wheel"
  description: string;     // Full description — "MacPek_5 18x8 5x114.3 ET35 CB73.1 Gloss Black"
  image: string;           // Image URL — "https://alltire.ca/Wheel/Alloy/MacPek_5.jpg"
  dealerPrice: string;     // Dealer cost — "$74.99"
  msrp: string;            // MSRP — "$119.99"
  stock: string;           // Stock text — "15 In Stock"
  hubCentric: boolean;     // Hub centric flag
}
```

### alltire-tires.json

Array of tire records.

```typescript
interface AllireTireRaw {
  productNo: string;  // Alltire product number
  maker: string;      // Brand — "Michelin"
  model: string;      // Model name — "Pilot Sport 4"
  size: string;       // Tire size — "225/45R17"
  type: string;       // Category — "All Season" | "Winter" | "Performance"
  description: string;
  image: string;      // Image URL
  msrp: string;       // MSRP — "$189.99"
  stock: string;      // Stock text
}
```

### alltire-tire-fitment.json

Map of vehicle → OE tire data scraped from the Alltire tire search.

```typescript
interface AllireTireFitmentRaw {
  [vehicleKey: string]: {       // "year|make|model"
    tireSizes: string[];         // OE tire sizes — ["225/65R17"]
    oeWheelSize: number | null;  // OE rim diameter
  };
}
```

### superspeed-wheels-raw.json

API response from Superspeed B2B. Top-level structure has a `List` array.

```typescript
interface SuperspeedRaw {
  List: SuperspeedWheel[];
  Total: number;
}

interface SuperspeedWheel {
  SKU: string;          // Superspeed SKU
  BRAND: string;        // Brand — "Superspeed"
  MODEL: string;        // Model name — "R03"
  DIAMETER: string;     // Rim diameter — "18"
  WIDTH: number;        // Rim width — 8.0
  ET: number;           // Offset — 35
  PCD: string;          // Bolt pattern — "5x114.3"
  CB: number;           // Center bore — 73.1
  SEAT: string;         // Seat type
  FINISH: string;       // Finish — "Gloss Black"
  INVENTORY: number;    // Stock count
  ETA: string;          // ETA string if out of stock
  MSRP: number;         // MSRP as float — 119.99
  COST: number;         // Dealer cost as float — 74.99
  FACE_IMG: string;     // Comma-separated image filenames — "SS-R03-18-GB.jpg,SS-R03-18-GB-2.jpg"
}
```

### rwc-wheels-raw.json

Array of RWC product records.

```typescript
interface RwcWheelRaw {
  sku: string;            // RWC SKU
  name: string;           // Full product name
  modelCode1: string;     // Short model code
  size: string;           // Size string — "18x8"
  boltPattern: string;    // Bolt pattern — "5x114.3"
  offset: string;         // Offset string — "ET35" or "35"
  centerBore: string;     // Center bore string — "73.1"
  finish: string;         // Finish description
  cost: number;           // Dealer cost as float
  stock: string;          // Stock text
  image: string;          // Image URL path
  customFit: string;      // Custom fit notes — may include "HUB CENTRIC"
  tpmsCompatible: string; // TPMS compatibility note
  runflatCertified: string;
  loadRating: string;
  fitment?: Array<{       // Per-product fitment (when available)
    year: string;
    make: string;
    model: string;
  }>;
}
```

### alltire-wheel-tree.json

Year/Make/Model tree exactly as used in `vehicles.json`. This file is loaded directly by `build-internal-db.js` and passed through as-is to `webapp/public/data/vehicles.json`.

See [Section 3](#3-vehiclesjson--vehicle-tree-schema) for the schema.
