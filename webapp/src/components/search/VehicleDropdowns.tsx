import { useState, useEffect, useMemo } from 'react';

interface VehicleTree {
  [year: string]: {
    [make: string]: any;
  };
}

interface TireFitmentMap {
  [key: string]: { sizes: string[]; oeWheel: number | null };
}

export default function VehicleDropdowns() {
  const [year, setYear] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [size, setSize] = useState('');
  const [vehicleTree, setVehicleTree] = useState<VehicleTree>({});
  const [tireFitment, setTireFitment] = useState<TireFitmentMap>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(base + '/data/vehicles.json').then(r => r.json()),
      fetch(base + '/data/tire-fitment.json').then(r => r.json()).catch(() => ({})),
    ]).then(([vehs, tFit]) => {
      setVehicleTree(vehs);
      setTireFitment(tFit);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const years = Object.keys(vehicleTree).sort((a, b) => Number(b) - Number(a));
  const makes = year && vehicleTree[year]
    ? Object.keys(vehicleTree[year]).sort()
    : [];
  const models = year && make && vehicleTree[year]?.[make]
    ? (Array.isArray(vehicleTree[year][make])
        ? vehicleTree[year][make]
        : Object.keys(vehicleTree[year][make])
      ).sort()
    : [];

  // Get OE tire sizes for selected vehicle from tire fitment data
  const availableSizes = useMemo(() => {
    if (!year || !make || !model) return [];
    const sizes = new Set<string>();

    // Exact match
    const exactKey = `${year}|${make}|${model}`;
    if (tireFitment[exactKey]?.sizes) {
      tireFitment[exactKey].sizes.forEach(s => sizes.add(s));
    }

    // Partial match — model may be a substring (e.g., "CIVIC" matches "CIVIC LX SEDAN")
    for (const [key, data] of Object.entries(tireFitment)) {
      const parts = key.split('|');
      if (parts[0] === year && parts[1] === make && parts[2]?.includes(model) && data.sizes) {
        data.sizes.forEach(s => sizes.add(s));
      }
    }

    return [...sizes].sort();
  }, [year, make, model, tireFitment]);

  function handleSearch() {
    if (year && make && model) {
      let q = `${year} ${make} ${model}`;
      if (size) q += ` ${size.replace('R', '/')}`;
      window.location.href = '' + `/search/?q=${encodeURIComponent(q)}`;
    }
  }

  const selectClass = "bg-dark-800 border border-dark-600 text-white rounded-lg pl-3 pr-9 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent appearance-none cursor-pointer w-full hover:border-primary-600/40 transition-colors";
  const chevron = (
    <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
    </svg>
  );

  return (
    <div className="max-w-4xl mx-auto">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <div className="relative">
          <select
            value={year}
            onChange={e => { setYear(e.target.value); setMake(''); setModel(''); setSize(''); }}
            disabled={loading}
            className={selectClass}
          >
            <option value="">Year</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          {chevron}
        </div>

        <div className={`relative ${!year ? 'opacity-50' : ''}`}>
          <select
            value={make}
            onChange={e => { setMake(e.target.value); setModel(''); setSize(''); }}
            disabled={!year}
            className={selectClass}
          >
            <option value="">Make</option>
            {makes.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          {chevron}
        </div>

        <div className={`relative ${!make ? 'opacity-50' : ''}`}>
          <select
            value={model}
            onChange={e => { setModel(e.target.value); setSize(''); }}
            disabled={!make}
            className={selectClass}
          >
            <option value="">Model</option>
            {models.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          {chevron}
        </div>

        <div className={`relative ${!model ? 'opacity-50' : ''}`}>
          <select
            value={size}
            onChange={e => setSize(e.target.value)}
            disabled={!model}
            className={selectClass}
          >
            <option value="">{availableSizes.length > 0 ? 'Size (optional)' : 'All Sizes'}</option>
            {availableSizes.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {chevron}
        </div>

        <button
          onClick={handleSearch}
          disabled={!year || !make || !model}
          className="bg-primary-600 hover:bg-primary-700 disabled:bg-dark-700 disabled:text-dark-500 text-white font-semibold py-3 px-4 rounded-lg transition-all text-sm whitespace-nowrap col-span-2 sm:col-span-1 shadow-lg shadow-primary-900/30"
        >
          Find Tires & Wheels
        </button>
      </div>
    </div>
  );
}
