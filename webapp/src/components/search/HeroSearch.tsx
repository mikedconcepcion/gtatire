import { useState, useEffect, useMemo } from 'react';

interface VehicleTree {
  [year: string]: { [make: string]: any };
}

const POPULAR = [
  { label: 'Honda Civic', q: 'Honda Civic' },
  { label: 'Toyota RAV4', q: 'Toyota RAV4' },
  { label: 'Hyundai Elantra', q: 'Hyundai Elantra' },
  { label: 'Hyundai Tucson', q: 'Hyundai Tucson' },
  { label: 'Hyundai Ioniq 5', q: 'Hyundai Ioniq 5' },
  { label: 'Ford F-150', q: 'Ford F-150' },
  { label: 'Tesla Model 3', q: 'Tesla Model 3' },
  { label: 'BMW 3 Series', q: 'BMW 3 Series' },
];

const RIM_SIZES = [15, 16, 17, 18, 19, 20, 21, 22];

export default function HeroSearch() {
  const [query, setQuery] = useState('');
  const [vehicleTree, setVehicleTree] = useState<VehicleTree>({});
  const [selYear, setSelYear] = useState('');
  const [selMake, setSelMake] = useState('');
  const [selModel, setSelModel] = useState('');
  const [selSize, setSelSize] = useState('');

  useEffect(() => {
    fetch(import.meta.env.BASE_URL + '/data/vehicles.json')
      .then(r => r.json())
      .then(data => setVehicleTree(data))
      .catch(() => {});
  }, []);

  const years = Object.keys(vehicleTree).sort((a, b) => Number(b) - Number(a));
  const makes = selYear && vehicleTree[selYear] ? Object.keys(vehicleTree[selYear]).sort() : [];
  const models = selYear && selMake && vehicleTree[selYear]?.[selMake]
    ? (Array.isArray(vehicleTree[selYear][selMake])
        ? vehicleTree[selYear][selMake]
        : Object.keys(vehicleTree[selYear][selMake])
      ).sort()
    : [];

  // Build query from dropdowns
  function buildQuery(year: string, make: string, model: string, size: string) {
    const parts = [year, make, model, size ? `${size}` : ''].filter(Boolean);
    return parts.join(' ');
  }

  function onYearChange(v: string) {
    setSelYear(v); setSelMake(''); setSelModel(''); setSelSize('');
    setQuery(buildQuery(v, '', '', ''));
  }
  function onMakeChange(v: string) {
    setSelMake(v); setSelModel(''); setSelSize('');
    setQuery(buildQuery(selYear, v, '', ''));
  }
  function onModelChange(v: string) {
    setSelModel(v); setSelSize('');
    setQuery(buildQuery(selYear, selMake, v, ''));
  }
  function onSizeChange(v: string) {
    setSelSize(v);
    setQuery(buildQuery(selYear, selMake, selModel, v));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim()) {
      window.location.href = `${import.meta.env.BASE_URL}/search/?q=${encodeURIComponent(query.trim())}`;
    }
  }

  function goTo(q: string) {
    window.location.href = `${import.meta.env.BASE_URL}/search/?q=${encodeURIComponent(q)}`;
  }

  const selClass = "bg-dark-700/70 border border-dark-500 text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none cursor-pointer w-full hover:border-primary-600/50 transition-colors";

  return (
    <div className="w-full max-w-3xl mx-auto">
      {/* Search bar */}
      <form onSubmit={handleSubmit} className="relative mb-4">
        <input
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setSelYear(''); setSelMake(''); setSelModel(''); setSelSize(''); }}
          placeholder="Search by vehicle, brand, size, or bolt pattern..."
          className="w-full bg-dark-800/90 border border-dark-600 text-white rounded-2xl pl-14 pr-28 py-4.5 text-base focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent placeholder:text-dark-500 shadow-lg shadow-black/20"
        />
        <svg className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <button
          type="submit"
          disabled={!query.trim()}
          className="absolute right-3 top-1/2 -translate-y-1/2 bg-primary-600 hover:bg-primary-700 disabled:bg-dark-700 disabled:text-dark-500 text-white text-sm font-medium px-5 py-2 rounded-xl transition-colors"
        >
          Search
        </button>
      </form>

      {/* Dropdown helpers — populate the search bar */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-5">
        <select value={selYear} onChange={e => onYearChange(e.target.value)} className={selClass}>
          <option value="">Year</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={selMake} onChange={e => onMakeChange(e.target.value)} disabled={!selYear} className={`${selClass} ${!selYear ? 'opacity-40' : ''}`}>
          <option value="">Make</option>
          {makes.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select value={selModel} onChange={e => onModelChange(e.target.value)} disabled={!selMake} className={`${selClass} ${!selMake ? 'opacity-40' : ''}`}>
          <option value="">Model</option>
          {models.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select value={selSize} onChange={e => onSizeChange(e.target.value)} disabled={!selModel} className={`${selClass} ${!selModel ? 'opacity-40' : ''}`}>
          <option value="">Size</option>
          {RIM_SIZES.map(s => <option key={s} value={s}>{s}"</option>)}
        </select>
        <button
          onClick={handleSubmit as any}
          disabled={!query.trim()}
          className="bg-primary-600 hover:bg-primary-700 disabled:bg-primary-600/40 disabled:text-white/70 text-white font-semibold py-2.5 px-4 rounded-lg transition-all text-sm col-span-2 sm:col-span-1"
        >
          Find Tires & Wheels
        </button>
      </div>

      {/* Hints + Popular */}
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1.5 text-xs text-dark-500 mb-4">
        <span>Try:</span>
        <span className="text-dark-400">"Hyundai Tucson"</span>
        <span>·</span>
        <span className="text-dark-400">"225/45R17"</span>
        <span>·</span>
        <span className="text-dark-400">"Michelin winter"</span>
        <span>·</span>
        <span className="text-dark-400">"5x114.3"</span>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <span className="text-dark-500 text-xs self-center mr-1">Popular:</span>
        {POPULAR.map(v => (
          <button key={v.label} onClick={() => goTo(v.q)}
            className="text-xs text-dark-400 hover:text-primary-400 bg-dark-800/60 hover:bg-dark-800 px-3 py-1.5 rounded-full transition-all border border-dark-700/50">
            {v.label}
          </button>
        ))}
      </div>
    </div>
  );
}
