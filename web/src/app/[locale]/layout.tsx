import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Cairo, Inter, JetBrains_Mono, Noto_Sans_SC } from 'next/font/google';
import { LOCALES, dirFor, isLocale, type Locale } from '@/i18n/config';
import { getDictionary } from '@/i18n/get-dictionary';
import { Providers } from '@/components/shared/Providers';
import { AuthGate } from '@/components/shared/AuthGate';
import { FiveSosyBot } from '@/components/fivesosybot/FiveSosyBot';

const cairo = Cairo({ subsets: ['arabic', 'latin'], variable: '--font-cairo', weight: ['400','500','600','700','800'] });
const inter = Inter({ subsets: ['latin', 'latin-ext'], variable: '--font-inter' });
const jetbrains = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', weight: ['400','500'] });
// Simplified Chinese — only enabled on the html element when locale='zh' (see
// font-family CSS in globals.css); the next/font loader still ships the file
// behind a CSS variable either way, but the class is conditional.
const notoSC = Noto_Sans_SC({ subsets: ['latin'], variable: '--font-zh', weight: ['400','500','700'] });

export const metadata: Metadata = {
  title: '5sosy — خصوصي الذكي'
};

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

  return (
    <html
      lang={locale}
      dir={dir}
      className={`${cairo.variable} ${inter.variable} ${jetbrains.variable} ${notoSC.variable}`}
      data-locale={locale}
    >
      <body>
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
