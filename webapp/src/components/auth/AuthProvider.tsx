import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

interface AuthState {
  isDistributor: boolean;
  login: (password: string) => boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthState>({
  isDistributor: false,
  login: () => false,
  logout: () => {},
});

const DIST_KEY = 'gta_dist_auth';
const DIST_PASSWORD = 'gtatire2025';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isDistributor, setIsDistributor] = useState(false);

  useEffect(() => {
    setIsDistributor(localStorage.getItem(DIST_KEY) === 'true');
  }, []);

  function login(password: string): boolean {
    if (password === DIST_PASSWORD) {
      localStorage.setItem(DIST_KEY, 'true');
      setIsDistributor(true);
      return true;
    }
    return false;
  }

  function logout() {
    localStorage.removeItem(DIST_KEY);
    setIsDistributor(false);
  }

  return (
    <AuthContext.Provider value={{ isDistributor, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
