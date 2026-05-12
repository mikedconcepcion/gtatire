import React, { useState } from 'react';

const ACCESS_CODE = 'gtapricing2025';

export default function AuthGate({ onAuth }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState(false);

  function handleSubmit(e) {
    e.preventDefault();
    if (code === ACCESS_CODE) {
      sessionStorage.setItem('gta-pricing-auth', '1');
      onAuth();
    } else {
      setError(true);
      setCode('');
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-6">
      <div className="max-w-sm w-full">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold">
            <span className="text-yellow-400">GTA</span> Pricing
          </h1>
          <p className="text-gray-500 text-sm mt-2">Internal pricing tool — authorized access only</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="password"
              value={code}
              onChange={e => { setCode(e.target.value); setError(false); }}
              placeholder="Enter access code"
              className={`w-full bg-gray-900 border ${error ? 'border-red-500' : 'border-gray-700'} text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-yellow-400`}
              autoFocus
            />
            {error && <p className="text-red-400 text-xs mt-1.5">Invalid code</p>}
          </div>
          <button
            type="submit"
            className="w-full bg-yellow-400/20 text-yellow-400 border border-yellow-400/50 font-medium py-3 rounded-xl text-sm active:bg-yellow-400/30"
          >
            Sign In
          </button>
        </form>
      </div>
    </div>
  );
}
