import { useState, useEffect } from 'react';

interface VehicleTree {
  [year: string]: {
    [make: string]: {
      [model: string]: string[];
    };
  };
}

const POPULAR_VEHICLES = [
  { label: 'Honda Civic', year: '2025', make: 'HONDA', model: 'CIVIC' },
  { label: 'Toyota RAV4', year: '2025', make: 'TOYOTA', model: 'RAV4' },
  { label: 'Ford F-150', year: '2025', make: 'FORD', model: 'F-150' },
  { label: 'Toyota Corolla', year: '2025', make: 'TOYOTA', model: 'COROLLA' },
  { label: 'Hyundai Tucson', year: '2025', make: 'HYUNDAI', model: 'TUCSON' },
];

export default function VehicleSearch() {
  const [year, setYear] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [smartQuery, setSmartQuery] = useState('');
  const [searchMode, setSearchMode] = useState<'classic' | 'smart'>('classic');
  const [vehicleTree, setVehicleTree] = useState<VehicleTree>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(import.meta.env.BASE_URL + '/data/vehicles.json')
      .then(r => r.json())
      .then(data => { setVehicleTree(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const years = Object.keys(vehicleTree).sort((a, b) => Number(b) - Number(a));
  const makes = year && vehicleTree[year]
    ? Object.keys(vehicleTree[year]).sort()
    : [];
  const models = year && make && vehicleTree[year]?.[make]
    ? Object.keys(vehicleTree[year][make]).sort()
    : [];

  function handleClassicSearch() {
    if (year && make && model) {
      window.location.href = import.meta.env.BASE_URL + `/vehicle/${year}/${make}/${model}`;
    }
  }

  function handleSmartSearch(e: React.FormEvent) {
    e.preventDefault();
    if (smartQuery.trim()) {
      window.location.href = import.meta.env.BASE_URL + `/search?q=${encodeURIComponent(smartQuery.trim())}`;
    }
  }

  function handlePopularClick(v: typeof POPULAR_VEHICLES[0]) {
    window.location.href = import.meta.env.BASE_URL + `/vehicle/${v.year}/${v.make}/${v.model}`;
  }

  const selectClass = "w-full bg-dark-800 border border-dark-600 text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent appearance-none cursor-pointer";

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Tab switcher */}
      <div className="flex gap-1 mb-6 bg-dark-800/50 p-1 rounded-xl">
        <button
          onClick={() => setSearchMode('classic')}
          className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
            searchMode === 'classic'
              ? 'bg-primary-600 text-white shadow-lg'
              : 'text-dark-400 hover:text-white'
          }`}
        >
          Find by Vehicle
        </button>
        <button
          onClick={() => setSearchMode('smart')}
          className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
            searchMode === 'smart'
              ? 'bg-primary-600 text-white shadow-lg'
              : 'text-dark-400 hover:text-white'
          }`}
        >
          Smart Search
        </button>
      </div>

      {/* Classic search */}
      {searchMode === 'classic' && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <select
              value={year}
              onChange={(e) => { setYear(e.target.value); setMake(''); setModel(''); }}
              disabled={loading}
              className={selectClass}
            >
              <option value="">Year</option>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>

            <select
              value={make}
              onChange={(e) => { setMake(e.target.value); setModel(''); }}
              disabled={!year}
              className={`${selectClass} ${!year ? 'opacity-50' : ''}`}
            >
              <option value="">Make</option>
              {makes.map(m => <option key={m} value={m}>{m}</option>)}
            </select>

            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              disabled={!make}
              className={`${selectClass} ${!make ? 'opacity-50' : ''}`}
            >
              <option value="">Model</option>
              {models.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          <button
            onClick={handleClassicSearch}
            disabled={!year || !make || !model}
            className="w-full bg-primary-600 hover:bg-primary-700 disabled:bg-dark-700 disabled:text-dark-500 text-white font-semibold py-3 rounded-lg transition-all text-sm"
          >
            Search Tires &amp; Wheels
          </button>
        </div>
      )}

      {/* Smart search */}
      {searchMode === 'smart' && (
        <form onSubmit={handleSmartSearch} className="space-y-3">
          <div className="relative">
            <input
              type="text"
              value={smartQuery}
              onChange={(e) => setSmartQuery(e.target.value)}
              placeholder='Try "225/45R17 all season" or "18 inch black wheels for Civic"'
              className="w-full bg-dark-800 border border-dark-600 text-white rounded-lg pl-12 pr-4 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent placeholder:text-dark-500"
            />
            <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <button
            type="submit"
            disabled={!smartQuery.trim()}
            className="w-full bg-primary-600 hover:bg-primary-700 disabled:bg-dark-700 disabled:text-dark-500 text-white font-semibold py-3 rounded-lg transition-all text-sm"
          >
            Search
          </button>
        </form>
      )}

      {/* Popular vehicles */}
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <span className="text-dark-500 text-xs self-center mr-1">Popular:</span>
        {POPULAR_VEHICLES.map(v => (
          <button
            key={v.label}
            onClick={() => handlePopularClick(v)}
            className="text-xs text-dark-400 hover:text-primary-400 bg-dark-800/50 hover:bg-dark-800 px-3 py-1.5 rounded-full transition-all border border-dark-700/50"
          >
            {v.label}
          </button>
        ))}
      </div>
    </div>
  );
}
