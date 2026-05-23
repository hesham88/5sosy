import 'server-only';
import type { Locale } from './config';

const loaders = {
  ar: () => import('./dictionaries/ar').then((m) => m.default),
  en: () => import('./dictionaries/en').then((m) => m.default),
  fr: () => import('./dictionaries/fr').then((m) => m.default),
  de: () => import('./dictionaries/de').then((m) => m.default),
  es: () => import('./dictionaries/es').then((m) => m.default),
  it: () => import('./dictionaries/it').then((m) => m.default),
  zh: () => import('./dictionaries/zh').then((m) => m.default)
} as const;

export type Dictionary = Awaited<ReturnType<typeof loaders.ar>>;

export async function getDictionary(locale: Locale): Promise<Dictionary> {
  return loaders[locale]() as Promise<Dictionary>;
}
