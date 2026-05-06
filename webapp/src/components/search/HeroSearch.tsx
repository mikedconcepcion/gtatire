import { useState } from 'react';

const QUICK_SEARCHES = [
  { label: 'Honda Civic', q: 'Honda Civic' },
  { label: 'Toyota RAV4', q: 'Toyota RAV4' },
  { label: 'Hyundai Tucson', q: 'Hyundai Tucson' },
  { label: 'Ford F-150', q: 'Ford F-150' },
  { label: 'Tesla Model 3', q: 'Tesla Model 3' },
  { label: 'BMW 3 Series', q: 'BMW 3 Series' },
];

export default function HeroSearch() {
  const [query, setQuery] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim()) {
      window.location.href = `${import.meta.env.BASE_URL}/search/?q=${encodeURIComponent(query.trim())}`;
    }
  }

  function goTo(q: string) {
    window.location.href = `${import.meta.env.BASE_URL}/search/?q=${encodeURIComponent(q)}`;
  }

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Single search bar */}
      <form onSubmit={handleSubmit} className="relative mb-5">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search by vehicle, brand, size, or bolt pattern..."
          className="w-full bg-dark-800/90 border border-dark-600 text-white rounded-2xl pl-14 pr-6 py-4.5 text-base focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent placeholder:text-dark-500 shadow-lg shadow-black/20"
        />
        <svg className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        {query.trim() && (
          <button
            type="submit"
            className="absolute right-3 top-1/2 -translate-y-1/2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors"
          >
            Search
          </button>
        )}
      </form>

      {/* Examples */}
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1.5 text-xs text-dark-500 mb-6">
        <span>Try:</span>
        <span className="text-dark-400">"Hyundai Tucson"</span>
        <span>·</span>
        <span className="text-dark-400">"18 black alloy"</span>
        <span>·</span>
        <span className="text-dark-400">"5x114.3"</span>
        <span>·</span>
        <span className="text-dark-400">"Superspeed"</span>
      </div>

      {/* Popular vehicles */}
      <div className="flex flex-wrap justify-center gap-2">
        <span className="text-dark-500 text-xs self-center mr-1">Popular:</span>
        {QUICK_SEARCHES.map(v => (
          <button
            key={v.label}
            onClick={() => goTo(v.q)}
            className="text-xs text-dark-400 hover:text-primary-400 bg-dark-800/60 hover:bg-dark-800 px-3 py-1.5 rounded-full transition-all border border-dark-700/50"
          >
            {v.label}
          </button>
        ))}
      </div>
    </div>
  );
}
