'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useApp } from './Providers';
import { Logo } from './atoms';
import { useAuth } from '@/lib/firebase/auth-context';
import { useProfile } from '@/lib/firebase/use-profile';
import { dicebearUrl } from '@/lib/avatar';
import { YEAR_OF_EDUCATION_OPTIONS } from '@/constants/onboarding';
import type { AvatarStyle } from '@/lib/types';

const NAV_ITEMS = [
  { id: 'home',     icon: '🏠' },
  { id: 'subjects', icon: '📚' },
  { id: 'books',    icon: '📖' },
  { id: 'plan',     icon: '🗓️' },
  { id: 'practice', icon: '🧠' },
  { id: 'oral',     icon: '🎤' },
  { id: 'progress', icon: '📈' },
  { id: 'settings', icon: '⚙️' }
] as const;

const NAV_TO_PATH: Record<string, string> = {
  home: 'home', subjects: 'subjects', books: 'books', plan: 'plan',
  practice: 'quiz', oral: 'oral', progress: 'progress', settings: 'settings'
};

function activeKeyFor(pathname: string): string {
  const seg = pathname.split('/').slice(2)[0] ?? 'home';
  if (seg === 'session') return 'plan';
  if (seg === 'quiz') return 'practice';
  return seg;
}

function NavList({ activeKey, onPick }: { activeKey: string; onPick?: () => void }) {
  const { locale, t } = useApp();
  return (
    <nav className="px-3 py-2 flex-1">
      {NAV_ITEMS.map((item) => {
        const active = activeKey === item.id;
        const href = `/${locale}/${NAV_TO_PATH[item.id] ?? item.id}`;
        return (
          <Link
            key={item.id}
            href={href}
            onClick={onPick}
            className={`w-full flex items-center gap-3 px-3 py-2.5 my-0.5 rounded-lg text-[14px] font-medium transition
              ${active
                ? 'bg-sky-50 text-sky-700 shadow-sm'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
          >
            <span className="text-[17px] leading-none">{item.icon}</span>
            <span>{t.nav[item.id as keyof typeof t.nav]}</span>
            {active && <span className="ms-auto w-1.5 h-1.5 rounded-full bg-sky-500" />}
          </Link>
        );
      })}
    </nav>
  );
}

function yearLabel(profile: { yearOfEducation?: string; grade?: string } | null, isAR: boolean): string {
  const yo = profile?.yearOfEducation;
  if (yo) {
    const opt = YEAR_OF_EDUCATION_OPTIONS.find((o) => o.id === yo);
    if (opt) return isAR ? opt.ar : opt.en;
    return yo;
  }
  if (profile?.grade === 'g1') return isAR ? 'الأول الثانوي' : 'Grade 10';
  if (profile?.grade === 'g2') return isAR ? 'الثاني الثانوي' : 'Grade 11';
  if (profile?.grade === 'g3') return isAR ? 'الثالث الثانوي' : 'Grade 12';
  return '';
}

function UserFooter({ onPick }: { onPick?: () => void }) {
  const { locale, t, isAR } = useApp();
  const { user, signOut } = useAuth();
  const { profile } = useProfile();

  const displayName =
    profile?.preferredName ||
    profile?.displayName ||
    user?.displayName ||
    (isAR ? 'ضيف' : 'Guest');
  const photoUrl =
    profile?.photoURL ||
    (profile?.avatarStyle && profile?.avatarSeed
      ? dicebearUrl(profile.avatarStyle as AvatarStyle, profile.avatarSeed)
      : user?.photoURL || null);
  const initial = (displayName || (isAR ? 'ي' : 'Y')).slice(0, 1);
  const yearText = yearLabel(profile, isAR);
  const profileHref = user
    ? `/${locale}/u/${(profile?.username || profile?.displayName || user.displayName || 'me')
        .toLowerCase()
        .replace(/\s+/g, '-')}`
    : `/${locale}/sign-in`;

  return (
    <div className="border-t border-slate-200 px-4 py-3 flex items-center gap-3">
      <Link
        href={profileHref}
        onClick={onPick}
        className="w-9 h-9 rounded-full grid place-items-center overflow-hidden bg-gradient-to-br from-amber-300 to-amber-500 text-white font-bold text-sm"
        title={t.nav.profile}
      >
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          initial
        )}
      </Link>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold text-slate-900 truncate">{displayName}</div>
        {yearText && <div className="text-[11px] text-slate-500 truncate">{yearText}</div>}
      </div>
      {user && (
        <button
          onClick={() => { void signOut(); onPick?.(); }}
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-rose-600 bg-slate-50 hover:bg-rose-50 rounded-md px-2 py-1 transition"
          title={t.nav.signOut}
          aria-label={t.nav.signOut}
        >
          <span aria-hidden="true">⎋</span>
          <span className="hidden sm:inline">{t.nav.signOut}</span>
        </button>
      )}
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { t, isAR, setLocale } = useApp();
  const activeKey = activeKeyFor(pathname);

  return (
    <aside className="hidden lg:flex flex-col w-[232px] shrink-0 bg-white border-e border-slate-200 h-screen sticky top-0">
      <div className="px-5 py-5 flex items-center gap-2.5">
        <Logo size={36} />
        <div>
          <div className="font-extrabold text-slate-900 text-[17px] leading-none">{t.appName}</div>
          <div className="text-[11px] text-slate-500 mt-1">{t.appSub}</div>
        </div>
      </div>

      <NavList activeKey={activeKey} />

      <div className="px-3 pb-3">
        <button
          onClick={() => setLocale(isAR ? 'en' : 'ar')}
          className="w-full flex items-center justify-center gap-2 text-[12px] font-semibold text-slate-500 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 rounded-lg py-2 transition"
        >
          <span>🌐</span>
          <span className="ltr">{isAR ? 'English' : 'العربية'}</span>
        </button>
      </div>

      <UserFooter />
    </aside>
  );
}

export function MobileBar() {
  const pathname = usePathname();
  const { t, isAR, setLocale } = useApp();
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const activeKey = activeKeyFor(pathname);

  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  return (
    <>
      <div className="lg:hidden sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? t.nav.close : t.nav.menu}
          aria-expanded={open}
          className="w-10 h-10 -ms-2 grid place-items-center rounded-lg hover:bg-slate-100 active:bg-slate-200 transition"
        >
          <div className="relative w-5 h-5 flex flex-col justify-center gap-[5px]">
            <span className={`block h-0.5 w-5 bg-slate-700 rounded transition-transform origin-center ${open ? 'translate-y-[7px] rotate-45' : ''}`} />
            <span className={`block h-0.5 w-5 bg-slate-700 rounded transition-opacity ${open ? 'opacity-0' : ''}`} />
            <span className={`block h-0.5 w-5 bg-slate-700 rounded transition-transform origin-center ${open ? '-translate-y-[7px] -rotate-45' : ''}`} />
          </div>
        </button>
        <Logo size={32} />
        <div className="font-extrabold text-slate-900">{t.appName}</div>
        <div className="ms-auto flex items-center gap-2">
          <button onClick={() => setLocale(isAR ? 'en' : 'ar')}
            className="text-[12px] font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg px-2.5 py-1.5 transition">
            {isAR ? 'EN' : 'ع'}
          </button>
          {user && (
            <button
              onClick={() => void signOut()}
              className="text-[12px] font-semibold text-slate-600 hover:text-rose-600 bg-slate-100 hover:bg-rose-50 rounded-lg px-2.5 py-1.5 transition"
              title={t.nav.signOut}
              aria-label={t.nav.signOut}
            >
              ⎋
            </button>
          )}
        </div>
      </div>

      {/* Backdrop */}
      <div
        onClick={() => setOpen(false)}
        className={`lg:hidden fixed inset-0 z-20 bg-slate-900/40 transition-opacity ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        aria-hidden="true"
      />

      {/* Slide-down drawer */}
      <div
        className={`lg:hidden fixed inset-x-0 top-[60px] z-30 bg-white border-b border-slate-200 shadow-lg overflow-hidden transition-[max-height] duration-300 ease-out
          ${open ? 'max-h-[80vh]' : 'max-h-0'}`}
        role="dialog"
        aria-label={t.nav.menu}
      >
        <div className="flex flex-col max-h-[80vh] overflow-y-auto">
          <NavList activeKey={activeKey} onPick={() => setOpen(false)} />
          <UserFooter onPick={() => setOpen(false)} />
        </div>
      </div>
    </>
  );
}

export function ChromeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col">
        <MobileBar />
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
