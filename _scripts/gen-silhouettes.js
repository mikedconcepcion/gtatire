const fs = require('fs');
const path = require('path');
const https = require('https');

const KEY = 'XAI_API_KEY_REDACTED_ROTATE_AT_CONSOLE_X_AI';
const OUT_DIR = 'E:/James/gtatire/webapp/public/images/silhouettes';
fs.mkdirSync(OUT_DIR, { recursive: true });

const BODIES = [
  { slug: 'sedan', desc: 'compact-to-midsize 4-door sedan with classic three-box proportions' },
  { slug: 'hatchback', desc: 'compact 5-door hatchback with a steeply sloping rear and short trunk' },
  { slug: 'suv', desc: 'midsize 5-door crossover SUV with moderately raised ride height' },
  { slug: 'pickup', desc: 'full-size four-door pickup truck with crew cab and 5.5-foot bed' },
  { slug: 'minivan', desc: 'family minivan with sliding rear doors and elongated proportions' },
  { slug: 'coupe', desc: 'two-door performance coupe with lowered ride height and rakish profile' },
  { slug: 'cargo-van', desc: 'tall commercial cargo van with high roof and flat panel sides' },
];

function basePrompt(body) {
  return `Cinematic photoreal side-view profile photograph of a generic premium ${body}, parked at rest, strict perpendicular 90-degree side camera angle (NOT three-quarter), the entire vehicle in frame from front bumper to rear bumper. Matte black factory wheels intentionally kept subtle and recessed-looking (they will be covered by overlay graphics). Dark moody atmospheric backdrop — deep blacks with subtle gold rim-lighting catching the upper body line. Slight reflective wet asphalt ground beneath. Wide cinematic aspect ratio 16:9. No people in frame, no text or signage, no readable badges or logos on the vehicle, no license plate text, no decals. Premium dealership-studio aesthetic with cinematic film grain. Solid dark background, no city skyline or distracting elements.`;
}

function post(prompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model: 'grok-imagine-image-quality', prompt, n: 1 });
    const req = https.request({
      method: 'POST',
      hostname: 'api.x.ai',
      path: '/v1/images/generations',
      headers: {
        'Authorization': `Bearer ${KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let data = '';
      res.on('data', c => (data += c));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode === 200) {
        const f = fs.createWriteStream(dest);
        res.pipe(f);
        f.on('finish', () => f.close(resolve));
        f.on('error', reject);
      } else {
        reject(new Error(`Download failed: ${res.statusCode} ${url}`));
      }
    }).on('error', reject);
  });
}

async function genOne(body) {
  console.log(`[${body.slug}] generating…`);
  const json = await post(basePrompt(body.desc));
  if (!json.data || !json.data[0] || !json.data[0].url) {
    console.error(`[${body.slug}] no URL in response`, JSON.stringify(json));
    return;
  }
  const url = json.data[0].url;
  const dest = path.join(OUT_DIR, `${body.slug}.jpg`);
  await download(url, dest);
  const size = fs.statSync(dest).size;
  console.log(`[${body.slug}] done — ${(size / 1024).toFixed(0)} KB`);
}

(async () => {
  await Promise.all(BODIES.map(genOne));
  console.log('\nAll silhouettes generated:');
  console.log(fs.readdirSync(OUT_DIR).join('\n'));
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
