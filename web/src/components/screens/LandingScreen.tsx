'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApp } from '../shared/Providers';
import { Logo } from '../shared/atoms';
import { LanguageSwitcher } from '../shared/LanguageSwitcher';
import { useAuth } from '@/lib/firebase/auth-context';

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" className="shrink-0">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.17-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.34A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.94H.96a9 9 0 0 0 0 8.12l3.01-2.34z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.94l3.01 2.34C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}

// Icon + accent per agent, paired by index with the localized t.landing.agents array.
const AGENT_VISUALS = [
  { icon: '🦉', accent: 'from-blue-500 to-blue-600', ring: 'ring-blue-200' },
  { icon: '📖', accent: 'from-orange-500 to-amber-500', ring: 'ring-orange-200' },
  { icon: '🗓️', accent: 'from-amber-400 to-yellow-500', ring: 'ring-amber-200' },
  { icon: '📝', accent: 'from-sky-500 to-blue-500', ring: 'ring-sky-200' },
  { icon: '🎤', accent: 'from-blue-500 to-indigo-500', ring: 'ring-indigo-200' },
  { icon: '📈', accent: 'from-orange-500 to-rose-500', ring: 'ring-orange-200' },
  { icon: '🔍', accent: 'from-amber-500 to-orange-500', ring: 'ring-amber-200' },
];

const FEATURE_ICONS = ['📚', '🌍', '🧭', '🎯'];
const STATS = [
  { value: '1,533', key: 'statBooks', color: 'text-blue-600' },
  { value: '34,796', key: 'statPages', color: 'text-orange-500' },
  { value: '7', key: 'statAgents', color: 'text-amber-500' },
  { value: '7', key: 'statLangs', color: 'text-sky-600' },
] as const;

export default function LandingScreen() {
  const { isAR, t, locale } = useApp();
  const L = t.landing;
  const { signInWithGoogle, signInAsGuest, user } = useAuth();
  const router = useRouter();

  const [busy, setBusy] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const handleAuth = (type: 'google' | 'guest') => async () => {
    setBusy(type);
    setAuthError(null);
    try {
      if (type === 'google') await signInWithGoogle();
      else await signInAsGuest();
      router.push(`/${locale}/home`);
    } catch (err: any) {
      const code = err?.code ?? '';
      if (code === 'auth/popup-closed-by-user') setAuthError(isAR ? 'اتقفلت نافذة تسجيل الدخول.' : 'Sign-in window was closed.');
      else if (code === 'auth/operation-not-allowed') setAuthError(isAR ? 'تسجيل دخول الضيف غير مفعّل.' : 'Guest sign-in is not enabled.');
      else setAuthError(err?.message || 'Authentication failed.');
    } finally {
      setBusy(null);
    }
  };

  const Spinner = ({ dark }: { dark?: boolean }) => (
    <span className={`w-4 h-4 border-2 ${dark ? 'border-slate-400 border-t-slate-700' : 'border-white/40 border-t-white'} rounded-full animate-spin`} />
  );

  return (
    <div className="min-h-screen relative overflow-hidden bg-gradient-to-b from-slate-50 via-white to-blue-50/40 text-slate-900">
      {/* Soft gradient orbs — blue / orange / gold */}
      <div className="pointer-events-none absolute -top-32 -start-24 w-[480px] h-[480px] rounded-full bg-blue-400/20 blur-[120px] animate-pulse" />
      <div className="pointer-events-none absolute top-40 -end-24 w-[520px] h-[520px] rounded-full bg-orange-300/20 blur-[130px] animate-pulse" style={{ animationDuration: '6s' }} />
      <div className="pointer-events-none absolute bottom-0 start-1/4 w-[420px] h-[420px] rounded-full bg-amber-300/20 blur-[120px] animate-pulse" style={{ animationDuration: '8s' }} />

      {/* Nav */}
      <header className="fixed top-0 inset-x-0 z-50 px-3 sm:px-4 py-3">
        <div className="mx-auto max-w-6xl rounded-2xl bg-white/70 backdrop-blur-xl border border-white/70 shadow-lg shadow-blue-900/5 px-4 sm:px-6 py-2.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 shrink-0">
            <Logo size={34} />
            <span className="font-extrabold text-[18px] tracking-tight bg-gradient-to-r from-blue-600 to-orange-500 bg-clip-text text-transparent">5sosy</span>
          </div>

          <nav className="hidden md:flex items-center gap-6 text-[13.5px] font-semibold text-slate-600">
            <a href="#agents" className="hover:text-blue-600 transition">{L.navAgents}</a>
            <a href="#features" className="hover:text-blue-600 transition">{L.navFeatures}</a>
            <a href="#stats" className="hover:text-blue-600 transition">{L.navStats}</a>
          </nav>

          <div className="flex items-center gap-2">
            <LanguageSwitcher variant="dropdown" />
            {user ? (
              <button onClick={() => router.push(`/${locale}/home`)}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-[13px] px-4 py-2 rounded-xl transition shadow-md shadow-blue-600/20">
                {L.dashboard}
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button onClick={handleAuth('google')} disabled={busy !== null}
                  className="inline-flex items-center gap-1.5 bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 font-bold text-[12.5px] px-3 py-2 rounded-xl transition shadow-sm disabled:opacity-60">
                  {busy === 'google' ? <Spinner dark /> : <GoogleIcon />}
                  <span className="hidden sm:inline">{isAR ? 'جوجل' : 'Google'}</span>
                </button>
                <button onClick={handleAuth('guest')} disabled={busy !== null}
                  className="inline-flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white font-bold text-[12.5px] px-3 py-2 rounded-xl transition shadow-md shadow-orange-500/20 disabled:opacity-60">
                  {busy === 'guest' ? <Spinner /> : <span>👤</span>}
                  <span className="hidden sm:inline">{isAR ? 'زائر' : 'Guest'}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section id="hero" className="relative max-w-6xl mx-auto px-5 pt-32 sm:pt-40 pb-16 grid lg:grid-cols-2 gap-10 items-center">
        <div className="text-center lg:text-start">
          <span className="inline-flex items-center gap-2 rounded-full bg-blue-50 border border-blue-100 px-3.5 py-1.5 text-[12.5px] font-bold text-blue-700">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
            {L.badge}
          </span>
          <h1 className="mt-5 text-4xl sm:text-5xl lg:text-[56px] font-extrabold leading-[1.1] tracking-tight text-slate-950">
            <span className="bg-gradient-to-r from-blue-600 via-blue-500 to-orange-500 bg-clip-text text-transparent">{L.heroTitle}</span>
          </h1>
          <p className="mt-5 text-[17px] sm:text-[18px] leading-relaxed text-slate-600 max-w-xl mx-auto lg:mx-0">{L.heroSubtitle}</p>

          <div className="mt-8 flex flex-wrap gap-3 justify-center lg:justify-start">
            <button onClick={handleAuth('google')} disabled={busy !== null}
              className="inline-flex items-center gap-2.5 bg-white hover:bg-slate-50 text-slate-900 border border-slate-200 font-bold text-[15px] px-6 py-3.5 rounded-2xl transition shadow-lg shadow-slate-900/5 disabled:opacity-60">
              {busy === 'google' ? <Spinner dark /> : <GoogleIcon />} {t.auth.google}
            </button>
            <button onClick={handleAuth('guest')} disabled={busy !== null}
              className="inline-flex items-center gap-2.5 bg-gradient-to-r from-blue-600 to-orange-500 hover:from-blue-700 hover:to-orange-600 text-white font-bold text-[15px] px-6 py-3.5 rounded-2xl transition shadow-lg shadow-blue-600/25 disabled:opacity-60">
              {busy === 'guest' ? <Spinner /> : <span>👤</span>} {t.auth.anon}
            </button>
          </div>
          {authError && <div className="mt-4 text-[12.5px] text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 inline-block">{authError}</div>}

          <div className="mt-7 flex flex-wrap gap-x-6 gap-y-2 justify-center lg:justify-start text-[13px] font-semibold text-slate-500">
            <span className="inline-flex items-center gap-1.5"><span className="text-emerald-500">✓</span> {L.trustNoInstall}</span>
            <span className="inline-flex items-center gap-1.5"><span className="text-emerald-500">✓</span> {L.trustGrounded}</span>
            <span className="inline-flex items-center gap-1.5"><span className="text-emerald-500">✓</span> {L.trustFree}</span>
          </div>
        </div>

        {/* Product image placeholder (lightweight CSS mockup — no heavy assets) */}
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-tr from-blue-500/10 to-orange-400/10 blur-2xl rounded-[2rem]" />
          <div className="relative rounded-[1.75rem] bg-white/80 backdrop-blur-xl border border-white/70 shadow-2xl shadow-blue-900/10 p-4 rotate-1 hover:rotate-0 transition-transform duration-500">
            <div className="rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 aspect-[4/3] grid place-items-center overflow-hidden relative">
              <div className="absolute top-3 start-3 flex gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-400" /><span className="w-2.5 h-2.5 rounded-full bg-amber-400" /><span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
              </div>
              <div className="text-center px-6">
                <div className="text-5xl mb-3">🦉📖</div>
                <div className="text-slate-300 text-[13px] font-medium">{L.heroImageCaption}</div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {STATS.slice(0, 3).map((s) => (
                <div key={s.key} className="rounded-xl bg-slate-50 border border-slate-100 px-2 py-2 text-center">
                  <div className={`text-[15px] font-extrabold ltr ${s.color}`}>{s.value}</div>
                  <div className="text-[9.5px] text-slate-500 mt-0.5">{L[s.key as 'statBooks']}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Agents */}
      <section id="agents" className="relative max-w-6xl mx-auto px-5 py-16">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-950">{L.agentsTitle}</h2>
          <p className="mt-3 text-[16px] text-slate-600">{L.agentsSub}</p>
        </div>
        <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {L.agents.map((a, i) => {
            const v = AGENT_VISUALS[i % AGENT_VISUALS.length];
            return (
              <div key={i}
                className={`group rounded-2xl bg-white/80 backdrop-blur border border-white/70 shadow-md shadow-blue-900/5 p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ring-1 ring-transparent hover:${v.ring}`}>
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${v.accent} grid place-items-center text-2xl shadow-md mb-4`}>{v.icon}</div>
                <h3 className="font-extrabold text-[16px] text-slate-900">{a.name}</h3>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-slate-600">{a.tagline}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="relative max-w-6xl mx-auto px-5 py-16">
        <h2 className="text-center text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-950">{L.featuresTitle}</h2>
        <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {L.features.map((f, i) => (
            <div key={i} className="rounded-2xl bg-white/80 backdrop-blur border border-white/70 shadow-md shadow-blue-900/5 p-6 hover:-translate-y-1 transition-transform duration-300">
              <div className="text-3xl mb-3">{FEATURE_ICONS[i % FEATURE_ICONS.length]}</div>
              <h3 className="font-extrabold text-[15.5px] text-slate-900">{f.title}</h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-slate-600">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Stats */}
      <section id="stats" className="relative max-w-6xl mx-auto px-5 py-16">
        <div className="rounded-3xl bg-gradient-to-br from-blue-600 to-orange-500 p-[1.5px] shadow-xl shadow-blue-900/10">
          <div className="rounded-3xl bg-white/90 backdrop-blur-xl px-6 py-10">
            <h2 className="text-center text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-950">{L.statsTitle}</h2>
            <div className="mt-8 grid grid-cols-2 lg:grid-cols-4 gap-6">
              {STATS.map((s) => (
                <div key={s.key} className="text-center">
                  <div className={`text-4xl sm:text-5xl font-extrabold ltr ${s.color}`}>{s.value}</div>
                  <div className="mt-1 text-[13px] font-semibold text-slate-500">{L[s.key as 'statBooks']}</div>
                </div>
              ))}
            </div>
            <div className="mt-9 flex flex-wrap gap-3 justify-center">
              <button onClick={handleAuth('google')} disabled={busy !== null}
                className="inline-flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-900 border border-slate-200 font-bold text-[14px] px-5 py-3 rounded-2xl transition shadow disabled:opacity-60">
                {busy === 'google' ? <Spinner dark /> : <GoogleIcon />} {t.auth.google}
              </button>
              <button onClick={handleAuth('guest')} disabled={busy !== null}
                className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-600 to-orange-500 text-white font-bold text-[14px] px-5 py-3 rounded-2xl transition shadow-lg shadow-blue-600/25 disabled:opacity-60">
                {busy === 'guest' ? <Spinner /> : <span>👤</span>} {t.auth.anon}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative border-t border-slate-200 bg-white/60 backdrop-blur mt-8">
        <div className="max-w-6xl mx-auto px-5 py-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
          <div className="lg:col-span-2">
            <div className="flex items-center gap-2.5">
              <Logo size={30} />
              <span className="font-extrabold text-[17px] bg-gradient-to-r from-blue-600 to-orange-500 bg-clip-text text-transparent">5sosy</span>
            </div>
            <p className="mt-3 text-[13.5px] text-slate-500 max-w-xs">{L.footerTagline}</p>
            <div className="mt-4 flex items-center gap-2">
              {[
                { label: 'X', href: '#' },
                { label: 'in', href: '#' },
                { label: 'IG', href: '#' },
                { label: 'YT', href: '#' },
              ].map((s) => (
                <a key={s.label} href={s.href} aria-label={s.label}
                  className="w-9 h-9 rounded-full bg-slate-100 hover:bg-blue-600 hover:text-white text-slate-600 grid place-items-center text-[12px] font-bold transition">
                  {s.label}
                </a>
              ))}
            </div>
          </div>

          <div>
            <div className="text-[12px] font-bold text-slate-400 uppercase tracking-wider mb-3">{L.footerProduct}</div>
            <ul className="space-y-2 text-[13.5px] text-slate-600">
              <li><a href="#agents" className="hover:text-blue-600 transition">{L.navAgents}</a></li>
              <li><a href="#features" className="hover:text-blue-600 transition">{L.navFeatures}</a></li>
              <li><a href="#stats" className="hover:text-blue-600 transition">{L.navStats}</a></li>
            </ul>
          </div>

          <div>
            <div className="text-[12px] font-bold text-slate-400 uppercase tracking-wider mb-3">{L.footerLegal}</div>
            <ul className="space-y-2 text-[13.5px] text-slate-600">
              <li><Link href={`/${locale}/terms`} className="hover:text-blue-600 transition">{L.footerTerms}</Link></li>
              <li><Link href={`/${locale}/privacy`} className="hover:text-blue-600 transition">{L.footerPrivacy}</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-slate-200">
          <div className="max-w-6xl mx-auto px-5 py-5 flex flex-col sm:flex-row items-center justify-between gap-2 text-[12.5px] text-slate-500">
            <span>© {new Date().getFullYear()} 5sosy · {L.footerRights}</span>
            <span className="font-semibold">{L.footerDevelopedBy}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
