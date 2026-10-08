'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { LOCALES, translate, type Locale, type MessageKey } from './messages';

interface I18n {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: MessageKey) => string;
}
const Ctx = createContext<I18n>({ locale: 'en', setLocale: () => undefined, t: (k) => translate('en', k) });

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en');
  useEffect(() => {
    try {
      const saved = localStorage.getItem('trk.locale') as Locale | null;
      if (saved && LOCALES.some((l) => l.code === saved)) setLocaleState(saved);
    } catch { /* storage can be blocked; English stays */ }
  }, []);
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);
  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try { localStorage.setItem('trk.locale', l); } catch { /* ignore */ }
  }, []);
  const value = useMemo<I18n>(() => ({ locale, setLocale, t: (k) => translate(locale, k) }), [locale, setLocale]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useT = (): I18n => useContext(Ctx);
