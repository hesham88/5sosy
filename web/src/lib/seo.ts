import { LOCALES, DEFAULT_LOCALE, type Locale } from '@/i18n/config';

// Canonical production origin. Overridable per-environment; defaults to the
// live App Hosting URL. No trailing slash.
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || 'https://khsosyapphosting--khsosy.us-east4.hosted.app'
).replace(/\/$/, '');

// Open Graph locale codes (language_TERRITORY).
const OG_LOCALE: Record<Locale, string> = {
  ar: 'ar_EG', en: 'en_US', fr: 'fr_FR', de: 'de_DE', es: 'es_ES', it: 'it_IT', zh: 'zh_CN',
};
export const ogLocale = (l: Locale): string => OG_LOCALE[l];

// hreflang codes. Simplified Chinese is zh-Hans; the rest match the locale.
const HREFLANG: Record<Locale, string> = {
  ar: 'ar', en: 'en', fr: 'fr', de: 'de', es: 'es', it: 'it', zh: 'zh-Hans',
};
export const hreflang = (l: Locale): string => HREFLANG[l];

// Absolute alternate URLs for a path (e.g. '' for landing, '/terms'), keyed by
// hreflang, plus x-default → the default locale. For Metadata.alternates.languages.
export function languageAlternates(path: string): Record<string, string> {
  const langs: Record<string, string> = {};
  for (const l of LOCALES) langs[hreflang(l)] = `${SITE_URL}/${l}${path}`;
  langs['x-default'] = `${SITE_URL}/${DEFAULT_LOCALE}${path}`;
  return langs;
}
