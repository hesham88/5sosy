'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useApp } from '@/components/shared/Providers';
import { useAuth } from '@/lib/firebase/auth-context';
import { Btn, Logo } from '@/components/shared/atoms';
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher';

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

export default function SignInClient() {
  const { isAR, t, locale } = useApp();
  const { signInWithGoogle, signInAsGuest, user } = useAuth();
  const router = useRouter();
  const search = useSearchParams();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  if (user) {
    const next = search.get('next') ?? `/${locale}/home`;
    router.replace(next);
    return null;
  }

  const friendly = (e: unknown): string => {
    const code = (e as { code?: string } | null)?.code ?? '';
    const raw = (e as Error | null)?.message ?? 'unknown';
    if (code === 'auth/admin-restricted-operation' || code === 'auth/operation-not-allowed') {
      return isAR
        ? 'تسجيل دخول الضيف مش مفعّل في Firebase. روح Firebase Console → Authentication → Sign-in method وفعّل Anonymous.'
        : 'Anonymous sign-in is not enabled. Open Firebase Console → Authentication → Sign-in method and enable the Anonymous provider.';
    }
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      return isAR ? 'اتقفلت نافذة جوجل قبل ما تكمل.' : 'Google sign-in window was closed before finishing.';
    }
    if (code === 'auth/popup-blocked') {
      return isAR ? 'المتصفح حجب النافذة المنبثقة. اسمح بها ثم حاول تاني.' : 'Your browser blocked the popup. Allow popups and try again.';
    }
    if (code === 'auth/network-request-failed') {
      return isAR ? 'اتصال الإنترنت فيه مشكلة. حاول تاني.' : 'Network error — please try again.';
    }
    return raw;
  };

  const wrap = (name: string, fn: () => Promise<void>) => async () => {
    setBusy(name); setErr(null);
    try { await fn(); router.replace(search.get('next') ?? `/${locale}/home`); }
    catch (e) { setErr(friendly(e)); }
    finally { setBusy(null); }
  };

  return (
    <div className="min-h-screen grid place-items-center bg-gradient-to-br from-slate-50 via-white to-sky-50 p-6">
      <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-lg p-8">
        <div className="flex items-center gap-3 mb-6">
          <Logo size={42} />
          <div>
            <div className="font-extrabold text-slate-900 text-[19px] leading-none">{t.appName}</div>
            <div className="text-[12px] text-slate-500 mt-1">{t.appSub}</div>
          </div>
          <div className="ms-auto">
            <LanguageSwitcher variant="dropdown" />
          </div>
        </div>

        <h1 className="text-2xl font-extrabold text-slate-900 mb-1">{t.auth.title}</h1>
        <p className="text-[13.5px] text-slate-500 mb-6">{t.auth.sub}</p>

        <Btn kind="primary" size="lg" className="w-full" onClick={wrap('google', signInWithGoogle)} disabled={busy !== null}>
          {busy === 'google' ? '…' : <span className="inline-flex items-center gap-2"><GoogleIcon /> {t.auth.google}</span>}
        </Btn>

        <div className="flex items-center gap-3 my-4">
          <div className="flex-1 h-px bg-slate-200" />
          <span className="text-[11px] text-slate-400 uppercase tracking-wider">{t.auth.or}</span>
          <div className="flex-1 h-px bg-slate-200" />
        </div>

        <Btn kind="outline" size="lg" className="w-full" onClick={wrap('anon', signInAsGuest)} disabled={busy !== null}>
          {busy === 'anon' ? '…' : <>👤 {t.auth.anon}</>}
        </Btn>

        {err && <div className="mt-4 text-[12.5px] text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{err}</div>}

        <div className="mt-6 text-[11.5px] text-slate-400 text-center">
          {isAR ? 'باستخدامك للتطبيق، أنت توافق على شروط الاستخدام.' : 'By continuing you agree to our terms.'}
        </div>
      </div>
    </div>
  );
}
