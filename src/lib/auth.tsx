import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { ADMIN_EMAIL, ADMIN_PASSWORD } from './constants';
import type { AlumniProfile } from './constants';

type AuthState = {
  isLoggedIn: boolean;
  isAdmin: boolean;
  currentProfile: AlumniProfile | null;
  accessCode: string | null;
  login: (code: string, profile: AlumniProfile) => void;
  adminLogin: (email: string, password: string) => boolean;
  logout: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentProfile, setCurrentProfile] = useState<AlumniProfile | null>(null);
  const [accessCode, setAccessCode] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('teu_auth');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        setIsLoggedIn(data.isLoggedIn);
        setIsAdmin(data.isAdmin);
        setCurrentProfile(data.currentProfile);
        setAccessCode(data.accessCode);
      } catch {}
    }
  }, []);

  const persist = (state: Partial<AuthState>) => {
    localStorage.setItem('teu_auth', JSON.stringify(state));
  };

  const login = (code: string, profile: AlumniProfile) => {
    setIsLoggedIn(true);
    setIsAdmin(false);
    setCurrentProfile(profile);
    setAccessCode(code);
    persist({ isLoggedIn: true, isAdmin: false, currentProfile: profile, accessCode: code });
  };

  const adminLogin = (email: string, password: string) => {
    if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
      setIsLoggedIn(true);
      setIsAdmin(true);
      setCurrentProfile(null);
      setAccessCode(null);
      persist({ isLoggedIn: true, isAdmin: true, currentProfile: null, accessCode: null });
      return true;
    }
    return false;
  };

  const logout = () => {
    setIsLoggedIn(false);
    setIsAdmin(false);
    setCurrentProfile(null);
    setAccessCode(null);
    localStorage.removeItem('teu_auth');
  };

  return (
    <AuthContext.Provider value={{ isLoggedIn, isAdmin, currentProfile, accessCode, login, adminLogin, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
