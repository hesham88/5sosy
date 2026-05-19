'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import type { Locale } from '@/i18n/config';
import type { Dictionary } from '@/i18n/get-dictionary';
import { AuthProvider } from '@/lib/firebase/auth-context';

type AppState = {
  locale: Locale;
  isAR: boolean;
  t: Dictionary;
  streak: number;
  setStreak: (n: number) => void;
  xp: number;
  setXp: (n: number) => void;
  bumpStreak: (n?: number) => void;
  pulseStreak: boolean;
  setLocale: (loc: Locale) => void;
};

const Ctx = createContext<AppState | null>(null);

export function useApp(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp must be used inside <Providers>');
  return ctx;
}

export function Providers({
  children,
  locale,
  dict
}: {
  children: React.ReactNode;
  locale: Locale;
  dict: Dictionary;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [streak, setStreakState] = useState(7);
  const [xp, setXpState] = useState(1240);
  const [pulseStreak, setPulseStreak] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const s = Number(localStorage.getItem('5sosy.streak') ?? '7');
    const x = Number(localStorage.getItem('5sosy.xp') ?? '1240');
    if (!Number.isNaN(s)) setStreakState(s);
    if (!Number.isNaN(x)) setXpState(x);
  }, []);

  const setStreak = (n: number) => { setStreakState(n); try { localStorage.setItem('5sosy.streak', String(n)); } catch {} };
  const setXp = (n: number) => { setXpState(n); try { localStorage.setItem('5sosy.xp', String(n)); } catch {} };

  const bumpStreak = (n = 50) => {
    setXp(xp + n);
    setPulseStreak(true);
    setTimeout(() => setPulseStreak(false), 1400);
  };

  const setLocale = (next: Locale) => {
    document.cookie = `locale=${next}; path=/; max-age=${60 * 60 * 24 * 365}`;
    const parts = pathname.split('/');
    parts[1] = next;
    router.push(parts.join('/'));
    router.refresh();
  };

  return (
    <Ctx.Provider value={{
      locale, isAR: locale === 'ar', t: dict,
      streak, setStreak, xp, setXp, bumpStreak, pulseStreak,
      setLocale
    }}>
      <AuthProvider>{children}</AuthProvider>
    </Ctx.Provider>
  );
}
