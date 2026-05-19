/**
 * Local SQLite catalog. Source of truth for products + fitment, populated
 * from raw supplier scrapes by build-internal-db.js. The Astro static site
 * is fed by JSON snapshots exported from this DB so the deployment pipeline
 * doesn't change.
 *
 * File: data/gta.sqlite  (gitignored — large, rebuildable from raw JSON)
 *
 * Why SQLite (not JSON):
 *   - One queryable artifact instead of 6 split JSON files
 *   - Foreign-key constraints catch broken fitment references
 *   - Brand/spec audit becomes one SQL statement instead of a node script
 *   - Re-runs of build-internal-db.js are idempotent — same supplier SKUs
 *     map to the same product IDs (a-/s-/r-prefixed) so UPSERT just works
 */

const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'gta.sqlite');

function openDb() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');
  return db;
}

function createSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS suppliers (
      name TEXT PRIMARY KEY,
      prefix TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      supplier TEXT NOT NULL REFERENCES suppliers(name),
      supplier_sku TEXT NOT NULL,
      category TEXT NOT NULL,
      brand TEXT,
      wheel_type TEXT,
      name TEXT,
      description TEXT,
      image TEXT,
      price_num REAL,
      dist_price_num REAL,
      compare_at_num REAL,
      stock TEXT,
      hub_centric INTEGER DEFAULT 0,
      rim_diameter INTEGER,
      rim_width REAL,
      bolt_pattern TEXT,
      offset_mm INTEGER,
      hub_bore REAL,
      finish TEXT,
      tire_size TEXT,
      tire_width INTEGER,
      tire_aspect INTEGER,
      no_image INTEGER DEFAULT 0,
      UNIQUE(supplier, supplier_sku)
    );

    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
    CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand);
    CREATE INDEX IF NOT EXISTS idx_products_diameter ON products(rim_diameter);
    CREATE INDEX IF NOT EXISTS idx_products_supplier ON products(supplier);

    CREATE TABLE IF NOT EXISTS product_images (
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      url TEXT NOT NULL,
      PRIMARY KEY (product_id, position)
    );

    CREATE TABLE IF NOT EXISTS fitment (
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      year INTEGER NOT NULL,
      make TEXT NOT NULL,
      model TEXT NOT NULL,
      PRIMARY KEY (product_id, year, make, model)
    );

    CREATE INDEX IF NOT EXISTS idx_fitment_vehicle ON fitment(year, make, model);

    CREATE TABLE IF NOT EXISTS vehicle_tire_sizes (
      year INTEGER NOT NULL,
      make TEXT NOT NULL,
      model TEXT NOT NULL,
      tire_size TEXT NOT NULL,
      is_oe INTEGER DEFAULT 0,
      PRIMARY KEY (year, make, model, tire_size)
    );

    CREATE TABLE IF NOT EXISTS build_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // Seed suppliers (idempotent)
  const seedSupplier = db.prepare(
    `INSERT INTO suppliers (name, prefix) VALUES (?, ?)
     ON CONFLICT(name) DO UPDATE SET prefix = excluded.prefix`
  );
  seedSupplier.run('alltire', 'a');
  seedSupplier.run('superspeed', 's');
  seedSupplier.run('rwc', 'r');
}

// Truncate live tables before bulk-load. We delete rather than DROP so
// schema (and any future user-defined views) survives.
function truncateAll(db) {
  db.exec(`
    DELETE FROM fitment;
    DELETE FROM product_images;
    DELETE FROM products;
    DELETE FROM vehicle_tire_sizes;
  `);
}

/**
 * Bulk-insert products array into the products + product_images tables.
 * Wrapped in a single transaction (better-sqlite3 ~100k rows/sec this way).
 *
 * Each product is the shape produced by build-internal-db.js. The skuMap
 * argument is the parallel array of { gtaId, supplier, supplierSku } so we
 * can populate the supplier columns without changing the product shape.
 */
function insertProducts(db, products, skuMap) {
  const skuBySku = new Map(skuMap.map(s => [s.gtaId, s]));

  const insertProduct = db.prepare(`
    INSERT INTO products (
      id, supplier, supplier_sku, category, brand, wheel_type, name, description,
      image, price_num, dist_price_num, compare_at_num, stock, hub_centric,
      rim_diameter, rim_width, bolt_pattern, offset_mm, hub_bore, finish,
      tire_size, tire_width, tire_aspect, no_image
    ) VALUES (
      @id, @supplier, @supplier_sku, @category, @brand, @wheel_type, @name, @description,
      @image, @price_num, @dist_price_num, @compare_at_num, @stock, @hub_centric,
      @rim_diameter, @rim_width, @bolt_pattern, @offset_mm, @hub_bore, @finish,
      @tire_size, @tire_width, @tire_aspect, @no_image
    )
  `);

  const insertImage = db.prepare(
    `INSERT INTO product_images (product_id, position, url) VALUES (?, ?, ?)`
  );

  const tx = db.transaction(() => {
    for (const p of products) {
      const sku = skuBySku.get(p.id);
      if (!sku) continue;
      insertProduct.run({
        id: p.id,
        supplier: sku.supplier,
        supplier_sku: sku.supplierSku,
        category: p.category,
        brand: p.brand || null,
        wheel_type: p.wheelType || null,
        name: p.name || null,
        description: p.description || null,
        image: p.image || null,
        price_num: p.priceNum || null,
        dist_price_num: p.distPriceNum || null,
        compare_at_num: p.compareAtNum || null,
        stock: p.stock || null,
        hub_centric: p.hubCentric ? 1 : 0,
        rim_diameter: p.rimDiameter || null,
        rim_width: p.rimWidth || null,
        bolt_pattern: p.boltPattern || null,
        offset_mm: p.offset != null ? p.offset : null,
        hub_bore: p.hubBore || null,
        finish: p.finish || null,
        tire_size: p.tireSize || null,
        tire_width: p.tireWidth || null,
        tire_aspect: p.tireAspect || null,
        no_image: p.noImage ? 1 : 0,
      });
      if (p.image) insertImage.run(p.id, 0, p.image);
      if (Array.isArray(p.images)) {
        for (let i = 0; i < p.images.length; i++) insertImage.run(p.id, i + 1, p.images[i]);
      }
    }
  });
  tx();
}

/**
 * Insert fitment from the in-memory map: { productId -> Set("YYYY|MAKE|MODEL") }
 * Skips entries whose year doesn't parse to a 4-digit integer (a few sources
 * occasionally emit fractional years like 2017.5 — normalized upstream).
 */
function insertFitment(db, fitmentMap) {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO fitment (product_id, year, make, model) VALUES (?, ?, ?, ?)`
  );
  const tx = db.transaction(() => {
    for (const [productId, vehicleSet] of Object.entries(fitmentMap)) {
      for (const vk of vehicleSet) {
        const [y, mk, md] = vk.split('|');
        const year = parseInt(y, 10);
        if (!year || !mk || !md) continue;
        insert.run(productId, year, mk, md);
      }
    }
  });
  tx();
}

function insertVehicleTireSizes(db, vehicleTireSizes) {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO vehicle_tire_sizes (year, make, model, tire_size, is_oe) VALUES (?, ?, ?, ?, ?)`
  );
  const tx = db.transaction(() => {
    for (const [key, data] of Object.entries(vehicleTireSizes)) {
      const [y, mk, md] = key.split('|');
      const year = parseInt(y, 10);
      if (!year || !mk || !md) continue;
      const sizes = data.sizes || [];
      const oeSize = data.oeWheel || '';
      for (const sz of sizes) {
        insert.run(year, mk, md, sz, sz === oeSize ? 1 : 0);
      }
    }
  });
  tx();
}

function setMeta(db, key, value) {
  db.prepare(
    `INSERT INTO build_meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, String(value));
}

function summary(db) {
  const counts = {
    products: db.prepare('SELECT COUNT(*) AS n FROM products').get().n,
    fitment: db.prepare('SELECT COUNT(*) AS n FROM fitment').get().n,
    images: db.prepare('SELECT COUNT(*) AS n FROM product_images').get().n,
    byCategory: db.prepare('SELECT category, COUNT(*) AS n FROM products GROUP BY category').all(),
    byBrand: db.prepare(
      'SELECT brand, COUNT(*) AS n FROM products WHERE brand IS NOT NULL GROUP BY brand ORDER BY n DESC LIMIT 30'
    ).all(),
    bySupplier: db.prepare('SELECT supplier, COUNT(*) AS n FROM products GROUP BY supplier').all(),
  };
  return counts;
}

module.exports = {
  DB_PATH,
  openDb,
  createSchema,
  truncateAll,
  insertProducts,
  insertFitment,
  insertVehicleTireSizes,
  setMeta,
  summary,
};
