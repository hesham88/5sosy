import { redirect } from 'next/navigation';
import { isLocale, DEFAULT_LOCALE } from '@/i18n/config';

export default async function LocaleIndex({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const safe = isLocale(locale) ? locale : DEFAULT_LOCALE;
  redirect(`/${safe}/home`);
}
