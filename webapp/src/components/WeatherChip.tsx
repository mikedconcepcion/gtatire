import { useEffect, useRef, useState } from 'react';

// Three-state weather chip for the GTA. Defaults to Toronto; on user request
// upgrades to the GTA city nearest the browser-geolocated position. Behavior
// escalates with conditions:
//   mild  → passive temp + icon, popover shows forecast only
//   cold  → blue accent, popover adds a 7°C-rule winter-tire link
//   alert → amber/red, popover shows alert details + vehicle-search CTA
//
// Data: api.weather.gc.ca citypageweather-realtime + weather-alerts. CORS open.
// Caches a fetch for 15 min in sessionStorage to avoid hitting on every nav.
// Hides itself entirely on fetch failure (graceful degrade).

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, '') || '';
const API = 'https://api.weather.gc.ca/collections';
const CACHE_KEY = 'jsdc_weather_v1';
const CACHE_MS = 15 * 60 * 1000;
const GEO_KEY = 'jsdc_weather_city';
// Below this temp (Celsius), winter tire compounds outperform all-seasons.
// Industry standard cited by Kal Tire, Tire Rack, Michelin.
const COLD_THRESHOLD = 7;

// GTA cities also returned by the EC bbox query. Coordinates used to map a
// geolocated browser position to the nearest city's EC identifier.
const GTA_CITIES: { id: string; name: string; lat: number; lon: number }[] = [
  { id: 'on-143', name: 'Toronto',       lat: 43.65, lon: -79.38 },
  { id: 'on-24',  name: 'Mississauga',   lat: 43.59, lon: -79.64 },
  { id: 'on-4',   name: 'Brampton',      lat: 43.73, lon: -79.76 },
  { id: 'on-64',  name: 'Vaughan',       lat: 43.84, lon: -79.51 },
  { id: 'on-85',  name: 'Markham',       lat: 43.87, lon: -79.26 },
  { id: 'on-59',  name: 'Richmond Hill', lat: 43.87, lon: -79.44 },
  { id: 'on-79',  name: 'Oakville',      lat: 43.47, lon: -79.69 },
  { id: 'on-68',  name: 'Halton Hills',  lat: 43.63, lon: -79.95 },
  { id: 'on-54',  name: 'Pickering',     lat: 43.84, lon: -79.09 },
  { id: 'on-119', name: 'Whitby',        lat: 43.88, lon: -78.94 },
  { id: 'on-117', name: 'Oshawa',        lat: 43.90, lon: -78.86 },
  { id: 'on-32',  name: 'Caledon',       lat: 43.86, lon: -79.86 },
  { id: 'on-25',  name: 'Newmarket',     lat: 44.06, lon: -79.46 },
];
const GTA_BBOX = '-80.2,43.4,-78.6,44.2';

// Subset of the EC citypageweather payload we actually render.
type Snapshot = {
  cityId: string;
  cityName: string;
  tempC: number | null;
  conditionText: string;
  iconCode: number | null;
  windChillC: number | null;
  humidity: number | null;
  forecast: { period: string; tempC: number | null; summary: string }[];
  alert: { name: string; colour: string; area: string; expires?: string } | null;
  fetchedAt: number;
};

function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

function nearestCity(lat: number, lon: number) {
  let best = GTA_CITIES[0];
  let bestDist = Infinity;
  for (const c of GTA_CITIES) {
    const d = haversineKm({ lat, lon }, c);
    if (d < bestDist) { bestDist = d; best = c; }
  }
  return best;
}

// Read a value from possibly bilingual payloads (.value.en or .value).
function pick(obj: any, ...path: string[]): any {
  let cur = obj;
  for (const k of path) {
    if (cur == null) return null;
    cur = cur[k];
  }
  return cur;
}

async function fetchCity(cityId: string): Promise<Partial<Snapshot> | null> {
  try {
    const res = await fetch(`${API}/citypageweather-realtime/items/${cityId}?f=json`);
    if (!res.ok) return null;
    const data = await res.json();
    const p = data.properties || {};
    const cc = p.currentConditions || {};
    const fg = p.forecastGroup || {};
    const fcasts = (fg.forecast || []).slice(0, 4).map((f: any) => ({
      period: pick(f, 'period', 'textForecastName', 'en') || '',
      tempC: pick(f, 'temperatures', 'temperature', 'value', 'en') ?? null,
      summary: pick(f, 'abbreviatedForecast', 'textSummary', 'en') ||
               pick(f, 'textSummary', 'en') || '',
    }));
    return {
      cityName: pick(p, 'name', 'en') || 'Toronto',
      tempC: pick(cc, 'temperature', 'value', 'en') ?? null,
      conditionText: pick(cc, 'condition', 'en') || '',
      iconCode: pick(cc, 'iconCode', 'value') ?? null,
      windChillC: pick(cc, 'windChill', 'value', 'en') ?? null,
      humidity: pick(cc, 'relativeHumidity', 'value', 'en') ?? null,
      forecast: fcasts,
    };
  } catch { return null; }
}

async function fetchGtaAlert(): Promise<Snapshot['alert']> {
  try {
    const res = await fetch(`${API}/weather-alerts/items?bbox=${GTA_BBOX}&f=json&limit=5`);
    if (!res.ok) return null;
    const data = await res.json();
    const feats = data.features || [];
    if (!feats.length) return null;
    // Pick the most severe (red > orange > yellow), else first.
    const rank = (c: string) => (c === 'red' ? 3 : c === 'orange' ? 2 : c === 'yellow' ? 1 : 0);
    feats.sort((a: any, b: any) =>
      rank(b.properties?.risk_colour_en || '') - rank(a.properties?.risk_colour_en || '')
    );
    const a = feats[0].properties || {};
    return {
      name: a.alert_name_en || 'Weather alert',
      colour: (a.risk_colour_en || '').toLowerCase(),
      area: a.feature_name_en || 'GTA',
      expires: a.expiration_datetime,
    };
  } catch { return null; }
}

function readCache(cityId: string): Snapshot | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Snapshot;
    if (parsed.cityId !== cityId) return null;
    if (Date.now() - parsed.fetchedAt > CACHE_MS) return null;
    return parsed;
  } catch { return null; }
}

function writeCache(snap: Snapshot) {
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(snap)); } catch {}
}

// Group EC iconCodes into broad categories and render a single inline SVG.
// Mapping reference: dd.weather.gc.ca/citypage_weather/docs/current_conditions_icon_code_documentation_en.csv
function WeatherGlyph({ code, className }: { code: number | null; className?: string }) {
  const base = { className: className || 'w-4 h-4', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (code == null) return <svg {...base}><circle cx="12" cy="12" r="9" /></svg>;
  // Night icons: 30-39
  const isNight = code >= 30 && code <= 39;
  // Sunny / clear
  if (code === 0 || code === 1) {
    if (isNight) return <svg {...base}><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" /></svg>;
    return <svg {...base}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5" /></svg>;
  }
  // Partly cloudy
  if (code >= 2 && code <= 5 || code === 32 || code === 33) {
    return <svg {...base}><circle cx="8" cy="9" r="3" /><path d="M14 17a4 4 0 100-8 5 5 0 00-9.8 1.5A4 4 0 005 17h9z" /></svg>;
  }
  // Cloudy
  if (code === 10) {
    return <svg {...base}><path d="M17 17a4 4 0 100-8 5 5 0 00-9.8 1.5A4 4 0 008 17h9z" /></svg>;
  }
  // Light rain / drizzle / showers
  if (code === 6 || code === 11 || code === 12 || code === 28 || code === 36) {
    return <svg {...base}><path d="M17 13a4 4 0 100-8 5 5 0 00-9.8 1.5A4 4 0 008 13h9z" /><path d="M9 18l-1 2M13 18l-1 2M17 18l-1 2" /></svg>;
  }
  // Heavy rain
  if (code === 13) {
    return <svg {...base}><path d="M17 13a4 4 0 100-8 5 5 0 00-9.8 1.5A4 4 0 008 13h9z" /><path d="M8 16v4M12 16v4M16 16v4" strokeWidth={2} /></svg>;
  }
  // Thunderstorm
  if (code === 9 || code === 19 || code === 39) {
    return <svg {...base}><path d="M17 13a4 4 0 100-8 5 5 0 00-9.8 1.5A4 4 0 008 13h9z" /><path d="M12 15l-2 4h3l-1 3" /></svg>;
  }
  // Snow
  if (code === 15 || code === 16 || code === 17 || code === 18 || code === 37 || code === 38) {
    return <svg {...base}><path d="M17 13a4 4 0 100-8 5 5 0 00-9.8 1.5A4 4 0 008 13h9z" /><path d="M10 17l.01 0M14 17l.01 0M12 19l.01 0M9 20l.01 0M15 20l.01 0" strokeWidth={2.4} /></svg>;
  }
  // Freezing rain / ice pellets
  if (code === 7 || code === 14) {
    return <svg {...base}><path d="M17 13a4 4 0 100-8 5 5 0 00-9.8 1.5A4 4 0 008 13h9z" /><path d="M9 17v3M13 17v3M12 3v2M15 5l-2 2M9 5l2 2" /></svg>;
  }
  // Fog / haze
  if (code === 24 || code === 44) {
    return <svg {...base}><path d="M4 10h16M3 14h18M5 18h14" /></svg>;
  }
  // Clear night fallback
  if (isNight) return <svg {...base}><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" /></svg>;
  // Generic cloud
  return <svg {...base}><path d="M17 17a4 4 0 100-8 5 5 0 00-9.8 1.5A4 4 0 008 17h9z" /></svg>;
}

type Tone = 'mild' | 'cold' | 'alert';
function tone(snap: Snapshot | null): Tone {
  if (!snap) return 'mild';
  if (snap.alert) return 'alert';
  if (snap.tempC != null && snap.tempC <= COLD_THRESHOLD) return 'cold';
  return 'mild';
}

type Variant = 'both' | 'desktop' | 'mobile';

export default function WeatherChip({ variant = 'both' }: { variant?: Variant } = {}) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const popRef = useRef<HTMLDivElement | null>(null);

  async function load(cityId: string, cityFallbackName: string) {
    const cached = readCache(cityId);
    if (cached) { setSnap(cached); setLoading(false); return; }
    const [city, alert] = await Promise.all([fetchCity(cityId), fetchGtaAlert()]);
    if (!city) { setFailed(true); setLoading(false); return; }
    const next: Snapshot = {
      cityId,
      cityName: city.cityName || cityFallbackName,
      tempC: city.tempC ?? null,
      conditionText: city.conditionText || '',
      iconCode: city.iconCode ?? null,
      windChillC: city.windChillC ?? null,
      humidity: city.humidity ?? null,
      forecast: city.forecast || [],
      alert,
      fetchedAt: Date.now(),
    };
    writeCache(next);
    setSnap(next);
    setLoading(false);
  }

  useEffect(() => {
    // Default to Toronto, OR a previously-saved geolocated city.
    let initialId = 'on-143';
    let initialName = 'Toronto';
    try {
      const saved = sessionStorage.getItem(GEO_KEY);
      if (saved) {
        const c = GTA_CITIES.find(x => x.id === saved);
        if (c) { initialId = c.id; initialName = c.name; }
      }
    } catch {}
    load(initialId, initialName);
  }, []);

  // Close popover on outside click / Escape
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function useMyLocation() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = nearestCity(pos.coords.latitude, pos.coords.longitude);
        try { sessionStorage.setItem(GEO_KEY, c.id); } catch {}
        try { sessionStorage.removeItem(CACHE_KEY); } catch {}
        setLoading(true);
        load(c.id, c.name);
      },
      () => {/* user denied — keep Toronto default */},
      { timeout: 8000, maximumAge: 10 * 60 * 1000 }
    );
  }

  const showMobile = variant === 'both' || variant === 'mobile';
  const showDesktop = variant === 'both' || variant === 'desktop';

  if (failed) return null;
  if (loading) {
    return (
      <>
        {showMobile && (
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-sky-500/10 border border-sky-400/30">
            <span className="w-5 h-5 rounded-full bg-sky-400/30 animate-pulse" />
          </div>
        )}
        {showDesktop && (
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-sky-500/10 border border-sky-400/30 text-sky-300 text-sm shadow-sm">
            <span className="w-4 h-4 rounded-full bg-sky-400/30 animate-pulse" />
            <span className="w-16 h-3 bg-sky-400/20 rounded animate-pulse" />
          </div>
        )}
      </>
    );
  }

  const t = tone(snap);
  // High-contrast chip — always reads as "weather widget" at a glance.
  // Background is colored even in mild state so it stands apart from the
  // dark header strip; escalates to deeper sky / red as conditions worsen.
  const chipBase =
    'hidden md:inline-flex items-center gap-2 pl-1.5 pr-2.5 py-1 rounded-lg border text-sm font-semibold transition-all shadow-sm';
  const chipStyle =
    t === 'alert'
      ? 'bg-gradient-to-r from-red-600 to-amber-600 border-amber-300/60 text-white shadow-amber-500/30 hover:from-red-500 hover:to-amber-500'
      : t === 'cold'
        ? 'bg-gradient-to-r from-sky-600 to-sky-500 border-sky-300/60 text-white shadow-sky-500/30 hover:from-sky-500 hover:to-sky-400'
        : 'bg-gradient-to-r from-sky-700/80 to-sky-600/80 border-sky-400/50 text-white shadow-sky-700/30 hover:from-sky-600 hover:to-sky-500';

  const iconBubble =
    t === 'alert' ? 'bg-white/25'
    : t === 'cold' ? 'bg-white/20'
    : 'bg-white/15';

  // Compact 40×40 button for mobile — matches phone/menu button sizing,
  // background colour escalates with conditions, alert state pulses to draw
  // attention. Tapping opens the same popover the desktop chip uses.
  const mobileStyle =
    t === 'alert'
      ? 'bg-gradient-to-br from-red-600 to-amber-600 border-amber-300/60 text-white shadow-amber-500/40 animate-pulse'
      : t === 'cold'
        ? 'bg-gradient-to-br from-sky-600 to-sky-500 border-sky-300/60 text-white shadow-sky-500/30'
        : 'bg-gradient-to-br from-sky-700 to-sky-600 border-sky-400/50 text-white shadow-sky-700/30';

  return (
    <div className="relative">
      {/* MOBILE: 40×40 button beside phone/menu */}
      {showMobile && (
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`inline-flex flex-col items-center justify-center w-12 h-10 rounded-lg border text-white shadow-md transition-colors leading-none gap-0.5 ${mobileStyle}`}
        aria-label={`Weather in ${snap?.cityName}: ${snap?.conditionText || 'unknown'}`}
        aria-expanded={open}
      >
        <WeatherGlyph code={snap?.iconCode ?? null} className="w-3.5 h-3.5 opacity-90" />
        {snap?.tempC != null && (
          <span className="text-sm font-extrabold tracking-tight">{Math.round(snap.tempC)}°</span>
        )}
      </button>
      )}

      {/* DESKTOP: full chip */}
      {showDesktop && (
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`${chipBase} ${chipStyle}`}
        aria-label={`Weather in ${snap?.cityName}: ${snap?.conditionText || 'unknown'}`}
        aria-expanded={open}
      >
        {/* Icon in its own colored bubble — reads as a weather button */}
        <span className={`inline-flex items-center justify-center w-7 h-7 rounded-md ${iconBubble}`}>
          <WeatherGlyph code={snap?.iconCode ?? null} className="w-4 h-4" />
        </span>

        {/* Label: city + temp, always visible */}
        <span className="flex flex-col leading-tight items-start">
          <span className="text-[9px] font-bold uppercase tracking-wider opacity-80 inline-flex items-center gap-1">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
            {t === 'alert' ? 'Alert' : 'Live'}
          </span>
          <span className="inline-flex items-baseline gap-1">
            <span className="truncate max-w-[5rem]">{snap?.cityName || 'Toronto'}</span>
            {snap?.tempC != null && <span className="text-base font-bold">{Math.round(snap.tempC)}°</span>}
          </span>
        </span>

        {/* Alert name (only when active) */}
        {t === 'alert' && snap?.alert && (
          <span className="hidden lg:inline-block max-w-[9rem] truncate capitalize text-xs font-medium border-l border-white/30 pl-2">
            ⚠ {snap.alert.name}
          </span>
        )}

        {/* Chevron — signals expandability */}
        <svg
          className={`w-3 h-3 opacity-80 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      )}

      {open && snap && (
        <div
          ref={popRef}
          className="fixed left-2 right-2 top-16 md:absolute md:left-auto md:right-0 md:top-auto md:mt-2 md:w-80 rounded-lg border border-primary-600/30 bg-dark-900/98 backdrop-blur-md shadow-2xl shadow-black/60 p-4 z-50"
          role="dialog"
          aria-label="Weather details"
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <div className="text-white text-sm font-semibold">{snap.cityName}</div>
              <div className="text-dark-400 text-xs mt-0.5">{snap.conditionText}</div>
            </div>
            <div className="text-right">
              {snap.tempC != null && (
                <div className="text-white text-2xl font-bold leading-none">{Math.round(snap.tempC)}°</div>
              )}
              {snap.windChillC != null && snap.tempC != null && snap.windChillC < snap.tempC - 1 && (
                <div className="text-sky-300 text-[10px] mt-1">feels {Math.round(snap.windChillC)}°</div>
              )}
            </div>
          </div>

          {/* Active alert */}
          {snap.alert && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 mb-3">
              <div className="text-amber-200 text-xs font-semibold capitalize">⚠ {snap.alert.name}</div>
              <div className="text-amber-200/70 text-[11px] mt-0.5">{snap.alert.area}</div>
              <a
                href={`${BASE}/winter-tires`}
                className="mt-2 inline-flex items-center gap-1 text-white bg-amber-500 hover:bg-amber-400 active:bg-amber-600 px-2.5 py-1 rounded text-xs font-semibold transition-colors"
              >
                Find winter tires for your vehicle
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
              </a>
            </div>
          )}

          {/* Cold weather tip (only when no alert is also showing) */}
          {!snap.alert && t === 'cold' && (
            <div className="rounded-md border border-sky-500/30 bg-sky-500/5 p-2.5 mb-3">
              <div className="text-sky-200 text-xs">
                Below 7°C — winter tire compounds stay flexible while all-seasons stiffen.
              </div>
              <a
                href={`${BASE}/winter-tires`}
                className="mt-1.5 inline-flex items-center gap-1 text-sky-300 hover:text-sky-200 text-xs font-semibold"
              >
                Browse winter tires
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
              </a>
            </div>
          )}

          {/* Forecast */}
          {snap.forecast.length > 0 && (
            <div className="border-t border-dark-700/60 pt-3">
              <div className="text-dark-500 text-[10px] font-semibold uppercase tracking-wider mb-2">Next periods</div>
              <ul className="space-y-1.5">
                {snap.forecast.map((f, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-dark-300 truncate flex-1">{f.period}</span>
                    <span className="text-dark-400 truncate flex-1 text-right">{f.summary}</span>
                    {f.tempC != null && <span className="text-white font-semibold w-8 text-right">{Math.round(f.tempC)}°</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Full-page link */}
          <a
            href={`${BASE}/weather`}
            className="mt-3 flex items-center justify-between gap-2 rounded-md bg-dark-800/80 hover:bg-dark-700 border border-dark-700/60 px-3 py-2 text-xs text-dark-200 hover:text-white transition-colors"
          >
            <span className="font-medium">Full forecast &amp; drive-safe guide</span>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.4}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
          </a>

          {/* Footer: geolocation + attribution */}
          <div className="border-t border-dark-700/60 mt-3 pt-3 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={useMyLocation}
              className="text-primary-400 hover:text-primary-300 text-[11px] font-medium inline-flex items-center gap-1"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 21s-7-7.5-7-12a7 7 0 1114 0c0 4.5-7 12-7 12z M12 11a2 2 0 100-4 2 2 0 000 4z" /></svg>
              Use my location
            </button>
            <span className="text-dark-600 text-[10px]">Environment Canada</span>
          </div>
        </div>
      )}
    </div>
  );
}
