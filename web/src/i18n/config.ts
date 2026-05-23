export const LOCALES = ['ar', 'en', 'fr', 'de', 'es', 'it', 'zh'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'ar';

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

// Only Arabic flips RTL. The five new locales (French, German, Spanish,
// Italian, Chinese-Mandarin/Simplified) are all written left-to-right.
const RTL_LOCALES: ReadonlySet<Locale> = new Set(['ar']);

export function dirFor(locale: Locale): 'rtl' | 'ltr' {
  return RTL_LOCALES.has(locale) ? 'rtl' : 'ltr';
}

// Human-readable labels for the language switcher. `native` is shown in the
// option itself so e.g. a French speaker sees "Français" regardless of the
// current UI locale.
export const LOCALE_LABELS: Record<Locale, { native: string; en: string }> = {
  ar: { native: 'العربية',  en: 'Arabic'   },
  en: { native: 'English',  en: 'English'  },
  fr: { native: 'Français', en: 'French'   },
  de: { native: 'Deutsch',  en: 'German'   },
  es: { native: 'Español',  en: 'Spanish'  },
  it: { native: 'Italiano', en: 'Italian'  },
  zh: { native: '中文',      en: 'Chinese'  },
};
