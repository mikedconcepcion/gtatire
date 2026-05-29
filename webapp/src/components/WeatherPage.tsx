import { useEffect, useState } from 'react';
import { cdnUrl } from '../lib/cdn';

// Full GTA weather page — public-service framing. Live conditions for every
// GTA city, multi-day forecast, active alerts, drive-safe educational content,
// and a contextual product strip that only escalates when conditions warrant
// (cold or winter alert). Pulls Environment Canada data direct in-browser
// (CORS open). Tire product data comes from the catalog JSON via CDN.

const API = 'https://api.weather.gc.ca/collections';
const COLD_THRESHOLD = 7;
const BASE = import.meta.env.BASE_URL?.replace(/\/$/, '') || '';

const GTA_CITIES = [
  { id: 'on-143', name: 'Toronto',       region: 'City of Toronto' },
  { id: 'on-24',  name: 'Mississauga',   region: 'Peel Region' },
  { id: 'on-4',   name: 'Brampton',      region: 'Peel Region' },
  { id: 'on-64',  name: 'Vaughan',       region: 'York Region' },
  { id: 'on-85',  name: 'Markham',       region: 'York Region' },
  { id: 'on-59',  name: 'Richmond Hill', region: 'York Region' },
  { id: 'on-79',  name: 'Oakville',      region: 'Halton Region' },
  { id: 'on-68',  name: 'Halton Hills',  region: 'Halton Region' },
  { id: 'on-54',  name: 'Pickering',     region: 'Durham Region' },
  { id: 'on-119', name: 'Whitby',        region: 'Durham Region' },
  { id: 'on-117', name: 'Oshawa',        region: 'Durham Region' },
];
const GTA_BBOX = '-80.2,43.4,-78.6,44.2';

type CityWeather = {
  id: string;
  name: string;
  region: string;
  tempC: number | null;
  feelsLikeC: number | null;
  conditionText: string;
  iconCode: number | null;
  windKmh: number | null;
  windDir: string | null;
  humidity: number | null;
  pressureKpa: number | null;
  visibilityKm: number | null;
  observationTime: string | null;
  forecast: { period: string; tempC: number | null; summary: string; iconCode: number | null }[];
  sunrise: string | null;
  sunset: string | null;
};

type Alert = {
  name: string;
  colour: string;
  area: string;
  headline: string;
  expires: string | null;
};

type Product = {
  id: string;
  category: string;
  brand: string;
  name: string;
  description: string;
  image: string;
  priceNum: number;
  price: string;
  stock: string;
  wheelType?: string;
  tireSize?: string;
};

function pick(obj: any, ...path: string[]): any {
  let cur = obj;
  for (const k of path) { if (cur == null) return null; cur = cur[k]; }
  return cur;
}

async function fetchCity(cityId: string, name: string, region: string): Promise<CityWeather | null> {
  try {
    const res = await fetch(`${API}/citypageweather-realtime/items/${cityId}?f=json`);
    if (!res.ok) return null;
    const data = await res.json();
    const p = data.properties || {};
    const cc = p.currentConditions || {};
    const fg = p.forecastGroup || {};
    const sun = p.riseSet?.dateTime || [];
    const sunrise = sun.find?.((d: any) => d.name === 'sunrise')?.dateTimeUTC || null;
    const sunset = sun.find?.((d: any) => d.name === 'sunset')?.dateTimeUTC || null;
    return {
      id: cityId,
      name,
      region,
      tempC: pick(cc, 'temperature', 'value', 'en') ?? null,
      feelsLikeC: pick(cc, 'windChill', 'value', 'en') ?? pick(cc, 'humidex', 'value', 'en') ?? null,
      conditionText: pick(cc, 'condition', 'en') || '',
      iconCode: pick(cc, 'iconCode', 'value') ?? null,
      windKmh: pick(cc, 'windSpeed', 'value', 'en') ?? null,
      windDir: pick(cc, 'windDirection', 'value', 'en') ?? null,
      humidity: pick(cc, 'relativeHumidity', 'value', 'en') ?? null,
      pressureKpa: pick(cc, 'pressure', 'value', 'en') ?? null,
      visibilityKm: pick(cc, 'visibility', 'value', 'en') ?? null,
      observationTime: pick(cc, 'observationDateTimeUtc') ?? null,
      forecast: (fg.forecast || []).slice(0, 10).map((f: any) => ({
        period: pick(f, 'period', 'textForecastName', 'en') || '',
        tempC: pick(f, 'temperatures', 'temperature', 'value', 'en') ?? null,
        summary: pick(f, 'textSummary', 'en') || pick(f, 'abbreviatedForecast', 'textSummary', 'en') || '',
        iconCode: pick(f, 'abbreviatedForecast', 'iconCode', 'value') ?? null,
      })),
      sunrise,
      sunset,
    };
  } catch { return null; }
}

async function fetchAlerts(): Promise<Alert[]> {
  try {
    const res = await fetch(`${API}/weather-alerts/items?bbox=${GTA_BBOX}&f=json&limit=10`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.features || []).map((f: any) => {
      const p = f.properties || {};
      return {
        name: p.alert_name_en || 'Weather alert',
        colour: (p.risk_colour_en || '').toLowerCase(),
        area: p.feature_name_en || 'GTA',
        headline: p.headline_en || '',
        expires: p.expiration_datetime || null,
      };
    });
  } catch { return []; }
}

// Same EC iconCode → SVG mapping used by the chip; sized larger here.
function WeatherGlyph({ code, className }: { code: number | null; className?: string }) {
  const base = { className: className || 'w-8 h-8', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (code == null) return <svg {...base}><circle cx="12" cy="12" r="9" /></svg>;
  const isNight = code >= 30 && code <= 39;
  if (code === 0 || code === 1) {
    if (isNight) return <svg {...base}><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" /></svg>;
    return <svg {...base}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5" /></svg>;
  }
  if ((code >= 2 && code <= 5) || code === 32 || code === 33) {
    return <svg {...base}><circle cx="8" cy="9" r="3" /><path d="M14 17a4 4 0 100-8 5 5 0 00-9.8 1.5A4 4 0 005 17h9z" /></svg>;
  }
  if (code === 10) return <svg {...base}><path d="M17 17a4 4 0 100-8 5 5 0 00-9.8 1.5A4 4 0 008 17h9z" /></svg>;
  if (code === 6 || code === 11 || code === 12 || code === 28 || code === 36) {
    return <svg {...base}><path d="M17 13a4 4 0 100-8 5 5 0 00-9.8 1.5A4 4 0 008 13h9z" /><path d="M9 18l-1 2M13 18l-1 2M17 18l-1 2" /></svg>;
  }
  if (code === 13) return <svg {...base}><path d="M17 13a4 4 0 100-8 5 5 0 00-9.8 1.5A4 4 0 008 13h9z" /><path d="M8 16v4M12 16v4M16 16v4" strokeWidth={2} /></svg>;
  if (code === 9 || code === 19 || code === 39) {
    return <svg {...base}><path d="M17 13a4 4 0 100-8 5 5 0 00-9.8 1.5A4 4 0 008 13h9z" /><path d="M12 15l-2 4h3l-1 3" /></svg>;
  }
  if (code === 15 || code === 16 || code === 17 || code === 18 || code === 37 || code === 38) {
    return <svg {...base}><path d="M17 13a4 4 0 100-8 5 5 0 00-9.8 1.5A4 4 0 008 13h9z" /><path d="M10 17l.01 0M14 17l.01 0M12 19l.01 0M9 20l.01 0M15 20l.01 0" strokeWidth={2.4} /></svg>;
  }
  if (code === 7 || code === 14) {
    return <svg {...base}><path d="M17 13a4 4 0 100-8 5 5 0 00-9.8 1.5A4 4 0 008 13h9z" /><path d="M9 17v3M13 17v3M12 3v2M15 5l-2 2M9 5l2 2" /></svg>;
  }
  if (code === 24 || code === 44) return <svg {...base}><path d="M4 10h16M3 14h18M5 18h14" /></svg>;
  if (isNight) return <svg {...base}><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" /></svg>;
  return <svg {...base}><path d="M17 17a4 4 0 100-8 5 5 0 00-9.8 1.5A4 4 0 008 17h9z" /></svg>;
}

function fmtTime(iso: string | null) {
  if (!iso) return '--';
  try {
    return new Date(iso).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Toronto' });
  } catch { return '--'; }
}

function isWinterTire(p: Product) {
  const t = (p.wheelType || '').toLowerCase();
  return t.includes('winter') || t.includes('snow');
}
function isAllSeasonTire(p: Product) {
  const t = (p.wheelType || '').toLowerCase();
  return t.includes('all season') || t.includes('all-season') || t.includes('all weather');
}

// Pick 6 tires diversified by brand from the supplied list.
function pickDiverse(list: Product[], n: number): Product[] {
  const byBrand: Record<string, Product[]> = {};
  for (const p of list) {
    const b = p.brand || 'Other';
    if (!byBrand[b]) byBrand[b] = [];
    byBrand[b].push(p);
  }
  const picks: Product[] = [];
  const brands = Object.keys(byBrand).sort((a, b) => byBrand[b].length - byBrand[a].length);
  while (picks.length < n && brands.length > 0) {
    for (const b of brands) {
      if (byBrand[b].length === 0) continue;
      byBrand[b].sort((x, y) => x.priceNum - y.priceNum);
      picks.push(byBrand[b].shift()!);
      if (picks.length >= n) break;
    }
    for (let i = brands.length - 1; i >= 0; i--) if (byBrand[brands[i]].length === 0) brands.splice(i, 1);
  }
  return picks;
}

// A few popular GTA vehicles for quick-pick chips on the search section.
// Picked from common-sales models — gives users a 1-tap path without typing.
const POPULAR_VEHICLES = [
  { label: '2024 Honda Civic',     q: '2024 Honda Civic' },
  { label: '2023 Toyota RAV4',     q: '2023 Toyota RAV4' },
  { label: '2024 Tesla Model Y',   q: '2024 Tesla Model Y' },
  { label: '2023 Ford F-150',      q: '2023 Ford F-150' },
];

export default function WeatherPage() {
  const [cities, setCities] = useState<Record<string, CityWeather | null>>({});
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [activeCity, setActiveCity] = useState<string>('on-143');
  const [winterTires, setWinterTires] = useState<Product[]>([]);
  const [allSeasonTires, setAllSeasonTires] = useState<Product[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // Kick off every GTA city + alerts + product catalog in parallel.
    (async () => {
      const [cityResults, alertList] = await Promise.all([
        Promise.all(GTA_CITIES.map(c => fetchCity(c.id, c.name, c.region))),
        fetchAlerts(),
      ]);
      const map: Record<string, CityWeather | null> = {};
      GTA_CITIES.forEach((c, i) => { map[c.id] = cityResults[i]; });
      setCities(map);
      setAlerts(alertList);

      // Fetch winter + all-season picks to surface contextually based on
      // current conditions (page is never a dead end).
      try {
        const res = await fetch(cdnUrl('/data/products.json'));
        if (res.ok) {
          const all: Product[] = await res.json();
          const inStock = (p: Product) =>
            p.category === 'tire' &&
            /in stock|^\d+/i.test(p.stock || '') &&
            p.priceNum > 0;
          setWinterTires(pickDiverse(all.filter(p => inStock(p) && isWinterTire(p)), 6));
          setAllSeasonTires(pickDiverse(all.filter(p => inStock(p) && isAllSeasonTire(p)), 6));
        }
      } catch { /* product strip silently absent */ }

      setLoaded(true);
    })();
  }, []);

  const active = cities[activeCity] || null;
  const isCold = active?.tempC != null && active.tempC <= COLD_THRESHOLD;
  const hasWinterAlert = alerts.some(a => /snow|freezing rain|winter storm|blowing snow|wind chill|ice/i.test(a.name));

  return (
    <div className="bg-dark-950 min-h-screen text-white">
      {/* HERO ===================================================== */}
      <section className="bg-gradient-to-br from-dark-900 via-dark-800 to-dark-900 border-b border-primary-600/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
          <div className="flex items-center gap-2 text-primary-400 text-xs font-semibold uppercase tracking-[0.2em] mb-3">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Live GTA weather · public service
          </div>
          <h1 className="text-3xl sm:text-5xl font-bold tracking-tight">Greater Toronto Area weather</h1>
          <p className="text-dark-300 mt-3 max-w-2xl">
            Live conditions, forecasts, and active alerts for every major GTA city — sourced direct from
            Environment Canada. Built for drivers: see when winter tires matter, when to delay travel, and
            what's coming.
          </p>

          {/* Active alerts ribbon */}
          {alerts.length > 0 && (
            <div className="mt-6 space-y-2">
              {alerts.slice(0, 3).map((a, i) => (
                <div key={i} className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 sm:p-4 flex items-start gap-3">
                  <svg className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M5.07 19h13.86a2 2 0 001.74-3L13.74 4a2 2 0 00-3.48 0L3.33 16a2 2 0 001.74 3z" /></svg>
                  <div className="flex-1 min-w-0">
                    <div className="text-amber-200 font-semibold capitalize text-sm sm:text-base">{a.name}</div>
                    <div className="text-amber-200/80 text-xs sm:text-sm mt-0.5">{a.area}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* City tabs */}
          <div className="mt-6 flex flex-wrap gap-1.5">
            {GTA_CITIES.map(c => {
              const isActive = c.id === activeCity;
              return (
                <button
                  key={c.id}
                  onClick={() => setActiveCity(c.id)}
                  className={`px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-primary-600 text-white shadow-md shadow-primary-900/40'
                      : 'bg-dark-700/60 text-dark-300 hover:bg-dark-700 hover:text-white'
                  }`}
                >
                  {c.name}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* CURRENT CONDITIONS DETAIL ================================ */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {!loaded ? (
          <div className="text-dark-500 text-sm">Loading current conditions…</div>
        ) : !active ? (
          <div className="text-dark-500 text-sm">Conditions unavailable for this city right now. Try another, or check back shortly.</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Big card */}
            <div className="lg:col-span-2 rounded-xl bg-gradient-to-br from-dark-800 to-dark-900 border border-primary-600/20 p-6 sm:p-8">
              <div className="flex items-start justify-between gap-6">
                <div>
                  <div className="text-dark-400 text-sm">{active.name} · {active.region}</div>
                  <div className="text-7xl sm:text-8xl font-bold text-white leading-none mt-2">
                    {active.tempC != null ? `${Math.round(active.tempC)}°` : '--'}
                  </div>
                  <div className="text-primary-300 text-base mt-2">{active.conditionText || '—'}</div>
                  {active.feelsLikeC != null && active.tempC != null && Math.abs(active.feelsLikeC - active.tempC) >= 1 && (
                    <div className="text-sky-300 text-sm mt-1">Feels like {Math.round(active.feelsLikeC)}°</div>
                  )}
                </div>
                <WeatherGlyph code={active.iconCode} className="w-24 h-24 text-primary-300" />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-8 pt-6 border-t border-dark-700/50">
                <div>
                  <div className="text-dark-500 text-[10px] uppercase tracking-wider">Humidity</div>
                  <div className="text-white text-lg font-semibold mt-1">{active.humidity ?? '--'}{active.humidity != null && '%'}</div>
                </div>
                <div>
                  <div className="text-dark-500 text-[10px] uppercase tracking-wider">Wind</div>
                  <div className="text-white text-lg font-semibold mt-1">
                    {active.windKmh != null ? `${active.windKmh} km/h` : '--'}
                    {active.windDir && <span className="text-dark-400 text-sm font-normal ml-1">{active.windDir}</span>}
                  </div>
                </div>
                <div>
                  <div className="text-dark-500 text-[10px] uppercase tracking-wider">Pressure</div>
                  <div className="text-white text-lg font-semibold mt-1">{active.pressureKpa != null ? `${active.pressureKpa} kPa` : '--'}</div>
                </div>
                <div>
                  <div className="text-dark-500 text-[10px] uppercase tracking-wider">Visibility</div>
                  <div className="text-white text-lg font-semibold mt-1">{active.visibilityKm != null ? `${active.visibilityKm} km` : '--'}</div>
                </div>
              </div>

              {(active.sunrise || active.sunset) && (
                <div className="flex items-center gap-6 mt-6 pt-6 border-t border-dark-700/50 text-sm">
                  <div className="flex items-center gap-2 text-amber-300">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v3M3 12h3M12 21v-3M21 12h-3M5.6 5.6l2 2M16.4 16.4l2 2M5.6 18.4l2-2M16.4 7.6l2-2M12 8a4 4 0 100 8 4 4 0 000-8z" /></svg>
                    Sunrise <span className="text-white font-medium ml-1">{fmtTime(active.sunrise)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-orange-300">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8a4 4 0 100 8 4 4 0 000-8zM3 12h3M21 12h-3M12 21v-3" /></svg>
                    Sunset <span className="text-white font-medium ml-1">{fmtTime(active.sunset)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Conditions-aware tire context — only shows when relevant */}
            <aside className="space-y-4">
              {hasWinterAlert ? (
                <div className="rounded-xl border-2 border-amber-500/50 bg-amber-500/10 p-5">
                  <div className="text-amber-400 text-xs font-semibold uppercase tracking-wider">Active winter alert</div>
                  <div className="text-white text-lg font-semibold mt-1">Plan for tough conditions</div>
                  <p className="text-amber-100/80 text-sm mt-2 leading-relaxed">
                    GTA roads will be affected. If you're still on all-seasons, winter tires reduce stopping distance by up to 30% on snow and ice.
                  </p>
                  <a href={`${BASE}/search`} className="mt-4 inline-flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-white font-semibold text-sm px-4 py-2 rounded-lg transition-colors">
                    Find winter tires for your vehicle
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.4}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                  </a>
                </div>
              ) : isCold ? (
                <div className="rounded-xl border border-sky-500/40 bg-sky-500/5 p-5">
                  <div className="text-sky-300 text-xs font-semibold uppercase tracking-wider">The 7°C rule</div>
                  <div className="text-white text-base font-semibold mt-1">Below 7°C — winter tires perform better</div>
                  <p className="text-sky-100/80 text-sm mt-2 leading-relaxed">
                    All-season rubber stiffens in cold weather. Winter compounds stay flexible for grip on cold, dry pavement too — not just snow.
                  </p>
                  <a href={`${BASE}/winter-tires`} className="mt-4 inline-flex items-center gap-1.5 text-sky-300 hover:text-sky-200 font-semibold text-sm">
                    Why winter tires matter
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.4}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                  </a>
                </div>
              ) : (
                <div className="rounded-xl border border-dark-700/50 bg-dark-800/50 p-5">
                  <div className="text-emerald-300 text-xs font-semibold uppercase tracking-wider">Good driving conditions</div>
                  <div className="text-white text-base font-semibold mt-1">Drive safe out there</div>
                  <p className="text-dark-400 text-sm mt-2 leading-relaxed">
                    No active alerts in your area. Check back during temperature drops or before storms.
                  </p>
                </div>
              )}

              {/* Quick stats card */}
              <div className="rounded-xl border border-dark-700/50 bg-dark-800/50 p-5">
                <div className="text-dark-500 text-xs font-semibold uppercase tracking-wider mb-3">GTA-wide</div>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-dark-300">Active alerts</span>
                    <span className={`font-semibold ${alerts.length > 0 ? 'text-amber-300' : 'text-emerald-300'}`}>{alerts.length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-dark-300">Cities reporting</span>
                    <span className="text-white font-semibold">
                      {Object.values(cities).filter(c => c?.tempC != null).length} / {GTA_CITIES.length}
                    </span>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        )}
      </section>

      {/* FORECAST ================================================= */}
      {active?.forecast && active.forecast.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 pb-8 sm:pb-12">
          <h2 className="text-xl sm:text-2xl font-bold text-white mb-4">Forecast — {active.name}</h2>
          <div className="rounded-xl border border-dark-700/50 bg-dark-800/40 overflow-hidden">
            <ul className="divide-y divide-dark-700/50">
              {active.forecast.map((f, i) => (
                <li key={i} className="flex items-center gap-4 px-4 sm:px-6 py-3 hover:bg-dark-800/60 transition-colors">
                  <WeatherGlyph code={f.iconCode} className="w-8 h-8 text-primary-300 shrink-0" />
                  <div className="w-32 sm:w-40 text-white font-semibold text-sm sm:text-base shrink-0">{f.period}</div>
                  <div className="flex-1 text-dark-300 text-sm hidden sm:block truncate">{f.summary}</div>
                  <div className="text-right text-white font-bold text-lg sm:text-xl shrink-0">
                    {f.tempC != null ? `${Math.round(f.tempC)}°` : '--'}
                  </div>
                </li>
              ))}
            </ul>
            {active.forecast[0]?.summary && (
              <p className="px-4 sm:px-6 py-3 text-dark-400 text-sm bg-dark-900/40 border-t border-dark-700/50 sm:hidden">
                {active.forecast[0].summary}
              </p>
            )}
          </div>
        </section>
      )}

      {/* GTA OVERVIEW GRID ======================================== */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pb-8 sm:pb-12">
        <h2 className="text-xl sm:text-2xl font-bold text-white mb-4">All GTA cities at a glance</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {GTA_CITIES.map(c => {
            const w = cities[c.id];
            const cold = w?.tempC != null && w.tempC <= COLD_THRESHOLD;
            return (
              <button
                key={c.id}
                onClick={() => { setActiveCity(c.id); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                className={`text-left p-3 rounded-lg border transition-colors ${
                  cold
                    ? 'border-sky-500/30 bg-sky-500/5 hover:bg-sky-500/10'
                    : 'border-dark-700/50 bg-dark-800/40 hover:bg-dark-800/70'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-white text-sm font-semibold truncate">{c.name}</div>
                    <div className="text-dark-500 text-[10px] uppercase tracking-wider mt-0.5 truncate">{w?.conditionText || '—'}</div>
                  </div>
                  <WeatherGlyph code={w?.iconCode ?? null} className="w-5 h-5 text-dark-400 shrink-0" />
                </div>
                <div className="text-white text-2xl font-bold mt-1">
                  {w?.tempC != null ? `${Math.round(w.tempC)}°` : '--'}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* FIND-MY-TIRES TOOL ====================================== */}
      {/* Not a CTA — just a tool. Sits here as the natural bridge from
          "you've seen the weather" to "here's what fits your car". */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pb-8 sm:pb-12">
        <div className="rounded-xl bg-gradient-to-br from-primary-900/30 via-dark-800/60 to-dark-800/60 border border-primary-600/30 p-6 sm:p-8">
          <div className="flex flex-col md:flex-row md:items-end gap-4 md:gap-8">
            <div className="md:flex-1">
              <div className="text-primary-400 text-xs font-semibold uppercase tracking-[0.2em] mb-2">Find what fits</div>
              <h2 className="text-xl sm:text-2xl font-bold text-white">Tires for your vehicle</h2>
              <p className="text-dark-300 text-sm mt-1.5 max-w-lg">
                Type your year, make, and model — or a tire size, brand, or part number. We'll show what fits and what's in stock.
              </p>
            </div>
            <form action={`${BASE}/search/`} method="get" className="md:w-2/5 flex gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  name="q"
                  required
                  placeholder="2024 Toyota Camry · 235/65R17 · Michelin"
                  className="w-full bg-dark-950/70 border border-primary-600/40 hover:border-primary-500/60 focus:border-primary-400 text-white rounded-lg pl-10 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50 placeholder:text-dark-500"
                />
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <button type="submit" className="bg-primary-600 hover:bg-primary-500 active:bg-primary-700 text-white font-semibold text-sm px-4 py-2.5 rounded-lg transition-colors">
                Search
              </button>
            </form>
          </div>

          {/* Popular vehicle quick-picks — zero-typing path */}
          <div className="mt-5 pt-5 border-t border-dark-700/40">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-dark-500 text-xs font-semibold uppercase tracking-wider mr-1">Popular:</span>
              {POPULAR_VEHICLES.map(v => (
                <a
                  key={v.q}
                  href={`${BASE}/search/?q=${encodeURIComponent(v.q)}`}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-dark-800/80 hover:bg-primary-600/20 border border-dark-700/60 hover:border-primary-500/50 text-dark-200 hover:text-white text-xs font-medium transition-colors"
                >
                  {v.label}
                </a>
              ))}
              <a href={`${BASE}/wheels`} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-dark-800/80 hover:bg-primary-600/20 border border-dark-700/60 hover:border-primary-500/50 text-dark-200 hover:text-white text-xs font-medium transition-colors">
                Browse wheels →
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* DRIVE-SAFE EDUCATIONAL =================================== */}
      <section className="bg-dark-900/60 border-y border-dark-700/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
          <div className="text-primary-400 text-xs font-semibold uppercase tracking-[0.2em] mb-2">Drive-safe guide</div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white">Why weather matters for your tires</h2>
          <p className="text-dark-300 mt-3 max-w-3xl">
            A small-but-real public-service primer. Built from the same physics tire engineers use — not sales talk.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
            <article className="rounded-xl bg-dark-800/60 border border-dark-700/50 p-5 flex flex-col">
              <div className="text-sky-400 text-3xl font-bold">7°C</div>
              <h3 className="text-white font-semibold mt-2">The temperature rule</h3>
              <p className="text-dark-300 text-sm mt-2 leading-relaxed flex-1">
                Below 7°C, all-season rubber stiffens. Winter compounds stay flexible — so they grip cold, dry pavement <em>and</em> snow. Industry standard cited by Michelin, Bridgestone, and Tire Rack.
              </p>
              <a href={`${BASE}/winter-tires`} className="inline-flex items-center gap-1 text-sky-300 hover:text-sky-200 text-xs font-semibold mt-3">
                Browse winter tires
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.4}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
              </a>
            </article>

            <article className="rounded-xl bg-dark-800/60 border border-dark-700/50 p-5 flex flex-col">
              <div className="text-amber-400 text-3xl font-bold">−1 PSI</div>
              <h3 className="text-white font-semibold mt-2">Per 5°C drop</h3>
              <p className="text-dark-300 text-sm mt-2 leading-relaxed flex-1">
                Tire pressure falls about 1 PSI for every 5°C the temperature drops. Cold mornings = soft tires = more wear and worse handling. Check pressure when the season turns.
              </p>
              <a href={`${BASE}/search`} className="inline-flex items-center gap-1 text-amber-300 hover:text-amber-200 text-xs font-semibold mt-3">
                Find tires for your vehicle
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.4}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
              </a>
            </article>

            <article className="rounded-xl bg-dark-800/60 border border-dark-700/50 p-5 flex flex-col">
              <div className="text-emerald-400 text-3xl font-bold">~5%</div>
              <h3 className="text-white font-semibold mt-2">Ontario insurance discount</h3>
              <p className="text-dark-300 text-sm mt-2 leading-relaxed flex-1">
                Ontario insurers offer a discount (typically ~5%) for vehicles fitted with winter tires from approximately Oct 1 to Apr 30. Ask your provider for specifics — JSDC supplies the tires.
              </p>
              <a href={`${BASE}/winter-tires`} className="inline-flex items-center gap-1 text-emerald-300 hover:text-emerald-200 text-xs font-semibold mt-3">
                See eligible winter tires
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.4}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
              </a>
            </article>
          </div>
        </div>
      </section>

      {/* ALWAYS-ON CONTEXTUAL PRODUCT STRIP =======================
          Adapts to conditions so the page is never a dead-end:
            - cold or active winter alert → winter tire picks
            - everything else            → all-season picks
          Tone stays informational — picks are diversified by brand and
          sorted cheapest-first so it reads as "here's what's available",
          not a sales pitch. */}
      {((isCold || hasWinterAlert) ? winterTires : allSeasonTires).length > 0 && (() => {
        const showWinter = isCold || hasWinterAlert;
        const picks = showWinter ? winterTires : allSeasonTires;
        const kicker = hasWinterAlert
          ? 'Recommended for the current alert'
          : showWinter
            ? 'Cold weather picks'
            : 'Year-round picks';
        const heading = showWinter ? 'Winter tires in stock now' : 'All-season tires in stock now';
        const allLink = showWinter ? '/winter-tires' : '/all-season-tires';
        const allLabel = showWinter ? 'See all winter tires' : 'See all all-season tires';
        return (
          <section className="max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
            <div className="flex items-end justify-between gap-4 mb-5">
              <div>
                <div className="text-primary-400 text-xs font-semibold uppercase tracking-[0.2em] mb-1">{kicker}</div>
                <h2 className="text-xl sm:text-2xl font-bold text-white">{heading}</h2>
              </div>
              <a href={`${BASE}${allLink}`} className="text-primary-400 hover:text-primary-300 text-sm font-semibold hidden sm:inline-flex items-center gap-1">
                {allLabel}
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.4}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
              </a>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {picks.map(p => (
                <a
                  key={p.id}
                  href={`${BASE}/tires/${p.id}`}
                  className="block rounded-lg border border-dark-700/50 bg-dark-800/50 hover:border-primary-500/40 hover:bg-dark-800 transition-colors overflow-hidden"
                >
                  <div className="aspect-square bg-white/95 p-2">
                    <img src={p.image} alt={p.name} loading="lazy" className="w-full h-full object-contain" />
                  </div>
                  <div className="p-2.5">
                    <div className="text-dark-400 text-[10px] uppercase tracking-wider truncate">{p.brand}</div>
                    <div className="text-white text-xs font-semibold mt-0.5 line-clamp-2 min-h-[2.25rem]">{p.name}</div>
                    {p.tireSize && <div className="text-dark-500 text-[10px] mt-1">{p.tireSize}</div>}
                    <div className="text-primary-400 text-sm font-bold mt-1.5">{p.price}</div>
                  </div>
                </a>
              ))}
            </div>
            {/* Mobile "see all" link */}
            <a href={`${BASE}${allLink}`} className="sm:hidden mt-4 inline-flex items-center gap-1 text-primary-400 hover:text-primary-300 text-sm font-semibold">
              {allLabel}
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.4}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
            </a>
          </section>
        );
      })()}

      {/* FOOTER NOTE ============================================== */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pb-10 pt-6 border-t border-dark-700/30">
        <p className="text-dark-500 text-xs leading-relaxed">
          Weather data &copy; <a href="https://eccc-msc.github.io/open-data/" rel="noopener" className="hover:text-dark-300 transition-colors">Environment and Climate Change Canada</a>,
          provided under the <a href="https://open.canada.ca/en/open-government-licence-canada" rel="noopener" className="hover:text-dark-300 transition-colors">Open Government Licence — Canada</a>.
          Conditions and forecasts refresh approximately every 15 minutes. For aviation, marine, or emergency-management decisions,
          consult <a href="https://weather.gc.ca/" rel="noopener" className="hover:text-dark-300 transition-colors">weather.gc.ca</a> directly.
        </p>
      </section>
    </div>
  );
}
