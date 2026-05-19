import 'server-only';
import type { Locale } from './config';

const loaders = {
  ar: () => import('./dictionaries/ar').then((m) => m.default),
  en: () => import('./dictionaries/en').then((m) => m.default)
} as const;

export type Dictionary = Awaited<ReturnType<typeof loaders.ar>>;

export async function getDictionary(locale: Locale): Promise<Dictionary> {
  return loaders[locale]();
}
