import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Cairo, Tajawal, Inter, JetBrains_Mono } from 'next/font/google';
import { LOCALES, dirFor, isLocale, type Locale } from '@/i18n/config';
import { getDictionary } from '@/i18n/get-dictionary';
import { Providers } from '@/components/shared/Providers';
import { AuthGate } from '@/components/shared/AuthGate';
import { FiveSosyBot } from '@/components/fivesosybot/FiveSosyBot';

const cairo = Cairo({ subsets: ['arabic', 'latin'], variable: '--font-cairo', weight: ['400','500','600','700','800'] });
const tajawal = Tajawal({ subsets: ['arabic'], variable: '--font-tajawal', weight: ['400','500','700','800'] });
const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const jetbrains = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', weight: ['400','500'] });

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
      className={`${cairo.variable} ${tajawal.variable} ${inter.variable} ${jetbrains.variable}`}
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
