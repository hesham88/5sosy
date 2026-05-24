'use client';

/**
 * LanguageSwitcher — 7-option language picker for the user's UI locale
 * (axis 1: user preference locale).
 *
 * This is a NEW component intended to replace the inline Segmented control
 * in SettingsScreen.tsx as a follow-up (the existing ar/en toggle stays
 * untouched until that swap lands, per the additive-changes preference).
 *
 * Variants:
 *   - <LanguageSwitcher variant="dropdown" /> — compact, used in nav bars
 *   - <LanguageSwitcher variant="grid" />     — full cards, used in Settings
 *
 * Each option shows the language's NATIVE name (Français, Deutsch, 中文…)
 * regardless of the current UI locale, so a speaker recognizes their own
 * language even if they've ended up on the wrong shell.
 */
import { useState } from 'react';
import { useApp } from './Providers';
import { LOCALES, LOCALE_LABELS, dirFor, type Locale } from '@/i18n/config';

type Variant = 'dropdown' | 'grid';

export function LanguageSwitcher({
  variant = 'dropdown',
  className = '',
  placement = 'bottom',
  fullWidth = false,
}: {
  variant?: Variant;
  className?: string;
  /** Which way the floating menu opens. Use 'top' when anchored near the
   *  bottom of a column (e.g. the sidebar footer) so it doesn't clip. */
  placement?: 'bottom' | 'top';
  /** Stretch the trigger to fill its container (sidebar). */
  fullWidth?: boolean;
}) {
  const { locale, setLocale } = useApp();
  const [open, setOpen] = useState(false);

  if (variant === 'grid') {
    return (
      <div className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 ${className}`}>
        {LOCALES.map((code) => {
          const active = code === locale;
          const labels = LOCALE_LABELS[code];
          const dir = dirFor(code);
          return (
            <button
              key={code}
              onClick={() => setLocale(code)}
              dir={dir}
              lang={code}
              className={`px-3 py-2.5 rounded-lg border text-start transition
                ${active
                  ? 'bg-sky-50 border-sky-500 text-sky-700 ring-2 ring-sky-200'
                  : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50'}`}
              aria-pressed={active}
            >
              <div className="text-[14px] font-bold leading-tight">{labels.native}</div>
              <div className="text-[10.5px] text-slate-500 uppercase tracking-wide mt-0.5 ltr">
                {code} · {labels.en}
              </div>
            </button>
          );
        })}
      </div>
    );
  }

  // dropdown variant
  const current = LOCALE_LABELS[locale];
  const menuPos = placement === 'top' ? 'bottom-full mb-1' : 'mt-1';
  return (
    <div className={`relative ${fullWidth ? 'block' : 'inline-block'} ${className}`}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-[12.5px] font-bold text-slate-700 ${fullWidth ? 'w-full justify-center' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="text-base leading-none">🌐</span>
        <span lang={locale} dir={dirFor(locale)}>{current.native}</span>
        <span className="text-[10px] text-slate-400 ltr uppercase">{locale}</span>
      </button>
      {open && (
        <>
          <button
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <ul
            role="listbox"
            className={`absolute z-50 ${menuPos} end-0 min-w-[160px] py-1 bg-white border border-slate-200 rounded-lg shadow-lg`}
          >
            {LOCALES.map((code) => {
              const active = code === locale;
              const labels = LOCALE_LABELS[code];
              return (
                <li key={code} role="option" aria-selected={active}>
                  <button
                    onClick={() => {
                      setLocale(code);
                      setOpen(false);
                    }}
                    dir={dirFor(code)}
                    lang={code}
                    className={`w-full text-start px-3 py-2 text-[13px] flex items-center justify-between gap-3
                      ${active
                        ? 'bg-sky-50 text-sky-700 font-bold'
                        : 'text-slate-700 hover:bg-slate-50'}`}
                  >
                    <span>{labels.native}</span>
                    <span className="text-[10px] text-slate-400 ltr uppercase">{code}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
