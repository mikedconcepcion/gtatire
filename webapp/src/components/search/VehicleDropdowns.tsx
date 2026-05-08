import { useState, useEffect } from 'react';

interface VehicleTree {
  [year: string]: {
    [make: string]: any;
  };
}

export default function VehicleDropdowns() {
  const [year, setYear] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
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
    ? (Array.isArray(vehicleTree[year][make])
        ? vehicleTree[year][make]
        : Object.keys(vehicleTree[year][make])
      ).sort()
    : [];

  function handleSearch() {
    if (year && make && model) {
      const q = `${year} ${make} ${model}`;
      window.location.href = import.meta.env.BASE_URL + `/search/?q=${encodeURIComponent(q)}`;
    }
  }

  const selectClass = "bg-dark-800 border border-dark-600 text-white rounded-lg px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent appearance-none cursor-pointer w-full";

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex flex-col sm:flex-row gap-2">
        <select
          value={year}
          onChange={e => { setYear(e.target.value); setMake(''); setModel(''); }}
          disabled={loading}
          className={selectClass}
        >
          <option value="">Year</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>

        <select
          value={make}
          onChange={e => { setMake(e.target.value); setModel(''); }}
          disabled={!year}
          className={`${selectClass} ${!year ? 'opacity-40' : ''}`}
        >
          <option value="">Make</option>
          {makes.map(m => <option key={m} value={m}>{m}</option>)}
        </select>

        <select
          value={model}
          onChange={e => setModel(e.target.value)}
          disabled={!make}
          className={`${selectClass} ${!make ? 'opacity-40' : ''}`}
        >
          <option value="">Model</option>
          {models.map(m => <option key={m} value={m}>{m}</option>)}
        </select>

        <button
          onClick={handleSearch}
          disabled={!year || !make || !model}
          className="bg-primary-600 hover:bg-primary-700 disabled:bg-dark-700 disabled:text-dark-500 text-white font-semibold py-3 px-6 rounded-lg transition-all text-sm whitespace-nowrap shrink-0"
        >
          Find Tires & Wheels
        </button>
      </div>
    </div>
  );
}
