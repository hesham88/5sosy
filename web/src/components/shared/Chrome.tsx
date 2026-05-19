'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useApp } from './Providers';
import { Logo } from './atoms';
import { useAuth } from '@/lib/firebase/auth-context';

const NAV_ITEMS = [
  { id: 'home',     icon: '🏠' },
  { id: 'subjects', icon: '📚' },
  { id: 'plan',     icon: '🗓️' },
  { id: 'practice', icon: '🧠' },
  { id: 'oral',     icon: '🎤' },
  { id: 'progress', icon: '📈' },
  { id: 'settings', icon: '⚙️' }
] as const;

const NAV_TO_PATH: Record<string, string> = {
  home: 'home', subjects: 'home', plan: 'home',
  practice: 'quiz', oral: 'oral', progress: 'progress', settings: 'settings'
};

export function Sidebar() {
  const pathname = usePathname();
  const { locale, t, isAR, setLocale } = useApp();
  const { user, signOut } = useAuth();

  const seg = pathname.split('/').slice(2)[0] ?? 'home';
  const activeKey =
    seg === 'session' ? 'plan' :
    seg === 'quiz' ? 'practice' :
    seg;

  return (
    <aside className="hidden lg:flex flex-col w-[232px] shrink-0 bg-white border-e border-slate-200 h-screen sticky top-0">
      <div className="px-5 py-5 flex items-center gap-2.5">
        <Logo size={36} />
        <div>
          <div className="font-extrabold text-slate-900 text-[17px] leading-none">{t.appName}</div>
          <div className="text-[11px] text-slate-500 mt-1">{t.appSub}</div>
        </div>
      </div>

      <nav className="px-3 py-2 flex-1">
        {NAV_ITEMS.map((item) => {
          const active = activeKey === item.id;
          const href = `/${locale}/${NAV_TO_PATH[item.id] ?? item.id}`;
          return (
            <Link
              key={item.id}
              href={href}
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

      <div className="px-3 pb-3">
        <button
          onClick={() => setLocale(isAR ? 'en' : 'ar')}
          className="w-full flex items-center justify-center gap-2 text-[12px] font-semibold text-slate-500 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 rounded-lg py-2 transition"
        >
          <span>🌐</span>
          <span className="ltr">{isAR ? 'English' : 'العربية'}</span>
        </button>
      </div>

      <div className="border-t border-slate-200 px-4 py-3 flex items-center gap-3">
        <Link
          href={user ? `/${locale}/u/${(user.displayName ?? 'me').toLowerCase().replace(/\s+/g,'-')}` : `/${locale}/sign-in`}
          className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-300 to-amber-500 grid place-items-center text-white font-bold text-sm"
          title={t.nav.profile}
        >
          {(user?.displayName ?? (isAR ? 'ي' : 'Y')).slice(0, 1)}
        </Link>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-slate-900 truncate">
            {user?.displayName ?? (isAR ? 'يوسف الشريف' : 'Youssef Sherif')}
          </div>
          <div className="text-[11px] text-slate-500 truncate">{isAR ? '٣ث علمي علوم' : 'G12 Science'}</div>
        </div>
        {user && (
          <button onClick={() => signOut()} className="text-[11px] text-slate-400 hover:text-rose-600" title={t.nav.signOut}>
            ⎋
          </button>
        )}
      </div>
    </aside>
  );
}

export function MobileBar() {
  const { t, isAR, setLocale } = useApp();
  return (
    <div className="lg:hidden sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-slate-200 px-4 py-3 flex items-center gap-3">
      <Logo size={32} />
      <div className="font-extrabold text-slate-900">{t.appName}</div>
      <div className="ms-auto flex items-center gap-2">
        <button onClick={() => setLocale(isAR ? 'en' : 'ar')}
          className="text-[12px] font-semibold text-slate-600 bg-slate-100 rounded-lg px-2.5 py-1.5">
          {isAR ? 'EN' : 'ع'}
        </button>
      </div>
    </div>
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
