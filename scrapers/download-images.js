const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const DATA_DIR = path.join(__dirname, '..', 'data');
const IMG_DIR = path.join(DATA_DIR, 'images');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function downloadImage(url, filepath) {
  return new Promise((resolve, reject) => {
    if (!url || url === '' || url === 'undefined') return resolve(false);
    if (fs.existsSync(filepath)) return resolve(true); // Already downloaded

    const protocol = url.startsWith('https') ? https : http;
    protocol.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return downloadImage(res.headers.location, filepath).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return resolve(false);

      const stream = fs.createWriteStream(filepath);
      res.pipe(stream);
      stream.on('finish', () => { stream.close(); resolve(true); });
      stream.on('error', () => resolve(false));
    }).on('error', () => resolve(false));
  });
}

async function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function downloadAllImages() {
  // Load wheel data
  const wheelsPath = path.join(DATA_DIR, 'alltire-wheels.json');
  const tiresPath = path.join(DATA_DIR, 'alltire-tires.json');

  let totalDownloaded = 0;
  let totalSkipped = 0;
  let totalFailed = 0;

  // Download wheel images
  if (fs.existsSync(wheelsPath)) {
    const wheels = JSON.parse(fs.readFileSync(wheelsPath, 'utf8'));
    const wheelImgDir = path.join(IMG_DIR, 'wheels');
    ensureDir(wheelImgDir);

    console.log(`\nDownloading wheel images (${wheels.length} products)...`);

    for (let i = 0; i < wheels.length; i++) {
      const product = wheels[i];
      if (!product.image) { totalSkipped++; continue; }

      const ext = path.extname(new URL(product.image).pathname) || '.jpg';
      const filename = `${product.productNo}${ext}`;
      const filepath = path.join(wheelImgDir, filename);

      const success = await downloadImage(product.image, filepath);
      if (success) {
        totalDownloaded++;
        // Store local path back in the product
        product.localImage = `images/wheels/${filename}`;
      } else {
        totalFailed++;
      }

      if ((i + 1) % 100 === 0) {
        console.log(`  Progress: ${i + 1}/${wheels.length} (downloaded: ${totalDownloaded}, skipped: ${totalSkipped}, failed: ${totalFailed})`);
        await delay(100); // Brief pause to avoid hammering the server
      }
    }

    // Save updated data with local image paths
    fs.writeFileSync(wheelsPath, JSON.stringify(wheels, null, 2));
    console.log(`Wheel images done: ${totalDownloaded} downloaded, ${totalSkipped} skipped, ${totalFailed} failed`);
  }

  // Download tire images
  if (fs.existsSync(tiresPath)) {
    const tires = JSON.parse(fs.readFileSync(tiresPath, 'utf8'));
    const tireImgDir = path.join(IMG_DIR, 'tires');
    ensureDir(tireImgDir);

    console.log(`\nDownloading tire images (${tires.length} products)...`);
    let tireDown = 0, tireSkip = 0, tireFail = 0;

    for (let i = 0; i < tires.length; i++) {
      const product = tires[i];
      if (!product.image) { tireSkip++; continue; }

      const ext = path.extname(new URL(product.image).pathname) || '.jpg';
      const filename = `${product.productNo}${ext}`;
      const filepath = path.join(tireImgDir, filename);

      const success = await downloadImage(product.image, filepath);
      if (success) {
        tireDown++;
        product.localImage = `images/tires/${filename}`;
      } else {
        tireFail++;
      }

      if ((i + 1) % 100 === 0) {
        console.log(`  Progress: ${i + 1}/${tires.length} (downloaded: ${tireDown}, skipped: ${tireSkip}, failed: ${tireFail})`);
        await delay(100);
      }
    }

    fs.writeFileSync(tiresPath, JSON.stringify(tires, null, 2));
    console.log(`Tire images done: ${tireDown} downloaded, ${tireSkip} skipped, ${tireFail} failed`);
  }

  console.log(`\nAll images downloaded. Total: ${totalDownloaded} files`);
}

downloadAllImages().catch(console.error);
