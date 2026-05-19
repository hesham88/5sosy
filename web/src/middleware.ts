import { NextResponse, type NextRequest } from 'next/server';
import { DEFAULT_LOCALE, LOCALES, isLocale } from './i18n/config';

const PUBLIC_FILE = /\.(.*)$/;

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/static') ||
    PUBLIC_FILE.test(pathname)
  ) {
    return NextResponse.next();
  }

  const firstSegment = pathname.split('/')[1];
  if (isLocale(firstSegment)) return NextResponse.next();

  const cookieLocale = req.cookies.get('locale')?.value;
  const headerLocale = req.headers.get('accept-language')?.split(',')[0]?.split('-')[0];
  const target =
    (cookieLocale && isLocale(cookieLocale) && cookieLocale) ||
    (headerLocale && isLocale(headerLocale) && headerLocale) ||
    DEFAULT_LOCALE;

  const url = req.nextUrl.clone();
  url.pathname = `/${target}${pathname === '/' ? '' : pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)']
};

export const _ = LOCALES;
