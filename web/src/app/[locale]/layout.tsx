import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Cairo, Inter, JetBrains_Mono, Noto_Sans_SC } from 'next/font/google';
import { LOCALES, dirFor, isLocale, type Locale } from '@/i18n/config';
import { getDictionary } from '@/i18n/get-dictionary';
import { Providers } from '@/components/shared/Providers';
import { AuthGate } from '@/components/shared/AuthGate';
import { FiveSosyBot } from '@/components/fivesosybot/FiveSosyBot';
import { SITE_URL, ogLocale, languageAlternates } from '@/lib/seo';

const cairo = Cairo({ subsets: ['arabic', 'latin'], variable: '--font-cairo', weight: ['400','500','600','700','800'] });
const inter = Inter({ subsets: ['latin', 'latin-ext'], variable: '--font-inter' });
const jetbrains = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', weight: ['400','500'] });
// Simplified Chinese — only enabled on the html element when locale='zh' (see
// font-family CSS in globals.css); the next/font loader still ships the file
// behind a CSS variable either way, but the class is conditional.
const notoSC = Noto_Sans_SC({ subsets: ['latin'], variable: '--font-zh', weight: ['400','500','700'] });

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const dict = await getDictionary(locale as Locale);
  const title = `${dict.appName} — ${dict.appSub}`;
  const description = dict.landing.heroSubtitle;
  return {
    title,
    description,
    alternates: {
      canonical: `${SITE_URL}/${locale}`,
      languages: languageAlternates(''),
    },
    openGraph: {
      type: 'website',
      siteName: dict.appName,
      locale: ogLocale(locale as Locale),
      url: `${SITE_URL}/${locale}`,
      title,
      description,
    },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export async function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = await getDictionary(locale as Locale);
  const dir = dirFor(locale as Locale);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${SITE_URL}#org`,
        name: '5sosy',
        url: SITE_URL,
      },
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}#website`,
        url: SITE_URL,
        name: '5sosy',
        inLanguage: locale,
        publisher: { '@id': `${SITE_URL}#org` },
      },
      {
        '@type': 'WebApplication',
        name: dict.appName,
        url: `${SITE_URL}/${locale}`,
        applicationCategory: 'EducationalApplication',
        operatingSystem: 'Web',
        inLanguage: locale,
        description: dict.landing.heroSubtitle,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'EGP' },
      },
    ],
  };

  return (
    <html
      lang={locale}
      dir={dir}
      className={`${cairo.variable} ${inter.variable} ${jetbrains.variable} ${notoSC.variable}`}
      data-locale={locale}
    >
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <Providers locale={locale as Locale} dict={dict}>
          <AuthGate>
            {children}
            <FiveSosyBot />
          </AuthGate>
        </Providers>
      </body>
    </html>
  );
}
