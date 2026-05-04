import { useState } from 'react';
import { useAuth } from './AuthProvider';

export default function LoginForm() {
  const { isDistributor, login, logout } = useAuth();
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);

  if (isDistributor) {
    return (
      <div className="max-w-sm mx-auto text-center py-12">
        <div className="w-14 h-14 bg-green-500/10 rounded-xl flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Distributor Access Active</h2>
        <p className="text-dark-400 text-sm mb-6">You can see wholesale pricing and stock details across the site.</p>
        <button
          onClick={logout}
          className="text-dark-400 hover:text-white text-sm transition-colors underline"
        >
          Sign Out
        </button>
      </div>
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const ok = login(password);
    if (!ok) {
      setError(true);
      setPassword('');
    } else {
      window.location.reload();
    }
  }

  return (
    <div className="max-w-sm mx-auto">
      <div className="text-center mb-6">
        <div className="w-14 h-14 bg-primary-600 rounded-xl flex items-center justify-center mx-auto mb-4">
          <span className="text-white font-bold text-xl">GT</span>
        </div>
        <h2 className="text-xl font-bold text-white">Distributor Portal</h2>
        <p className="text-dark-400 text-sm mt-1">Enter your access code to see wholesale pricing</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <input
            type="password"
            value={password}
            onChange={e => { setPassword(e.target.value); setError(false); }}
            placeholder="Access code"
            className={`w-full bg-dark-800 border ${error ? 'border-red-500' : 'border-dark-600'} text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent`}
            autoFocus
          />
          {error && <p className="text-red-400 text-xs mt-1">Invalid access code</p>}
        </div>
        <button
          type="submit"
          className="w-full bg-primary-600 hover:bg-primary-700 text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
        >
          Sign In
        </button>
      </form>

      <p className="text-dark-500 text-xs text-center mt-4">
        Need access? <a href="/gtatire/contact" className="text-primary-400 hover:underline">Contact us</a>
      </p>
    </div>
  );
}
