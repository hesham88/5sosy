import type { MetadataRoute } from 'next';
import { LOCALES } from '@/i18n/config';
import { SITE_URL, hreflang } from '@/lib/seo';

// Public, indexable routes only (the app surface behind auth is excluded).
const PUBLIC_PATHS = ['', '/sign-in', '/terms', '/privacy'] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [];
  for (const path of PUBLIC_PATHS) {
    const languages: Record<string, string> = {};
    for (const l of LOCALES) languages[hreflang(l)] = `${SITE_URL}/${l}${path}`;
    for (const l of LOCALES) {
      entries.push({
        url: `${SITE_URL}/${l}${path}`,
        lastModified: new Date(),
        changeFrequency: path === '' ? 'weekly' : 'monthly',
        priority: path === '' ? 1 : 0.5,
        alternates: { languages },
      });
    }
  }
  return entries;
}
