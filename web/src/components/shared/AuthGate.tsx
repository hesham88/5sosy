'use client';

import { useEffect, useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/firebase/auth-context';
import { useProfile } from '@/lib/firebase/use-profile';
import { useApp } from './Providers';

const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

// Path-segment policy. SIGN_IN_SEGMENT is fully unguarded.
// ONBOARDING_SEGMENT still requires a signed-in user (so the agent can attach
// answers to a uid), but does NOT require onboardingCompleted=true.
const SIGN_IN_SEGMENT = 'sign-in';
const ONBOARDING_SEGMENT = 'onboarding';

function lastLoginMillis(profile: { lastLoginAt?: unknown } | null): number | null {
  const v = profile?.lastLoginAt as
    | { toMillis?: () => number; seconds?: number }
    | undefined;
  if (!v) return null;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v.seconds === 'number') return v.seconds * 1000;
  return null;
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { locale } = useApp();
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const { user, loading: authLoading, signOut } = useAuth();
  const { profile, loading: profileLoading } = useProfile();

  const firstSegment = useMemo(() => pathname.split('/').filter(Boolean)[1] ?? '', [pathname]);
  const isSignIn = firstSegment === SIGN_IN_SEGMENT;
  const isOnboarding = firstSegment === ONBOARDING_SEGMENT;

  useEffect(() => {
    if (isSignIn) return;
    if (authLoading) return;

    if (!user) {
      const next = encodeURIComponent(pathname);
      router.replace(`/${locale}/sign-in?next=${next}`);
      return;
    }

    if (profileLoading) return;

    const lastLogin = lastLoginMillis(profile);
    if (lastLogin && Date.now() - lastLogin > SESSION_MAX_AGE_MS) {
      void signOut().then(() => router.replace(`/${locale}/sign-in`));
      return;
    }

    if (isOnboarding) return; // signed-in but onboarding-in-progress: let them through

    if (!profile || profile.onboardingCompleted !== true) {
      router.replace(`/${locale}/onboarding`);
      return;
    }
  }, [
    isSignIn,
    isOnboarding,
    authLoading,
    user,
    profile,
    profileLoading,
    pathname,
    locale,
    router,
    signOut
  ]);

  if (isSignIn) return <>{children}</>;

  if (authLoading || (user && profileLoading)) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-50">
        <div className="text-slate-500 text-sm">…</div>
      </div>
    );
  }

  if (!user) return null;

  const lastLogin = lastLoginMillis(profile);
  if (lastLogin && Date.now() - lastLogin > SESSION_MAX_AGE_MS) return null;

  if (isOnboarding) return <>{children}</>;

  if (!profile || profile.onboardingCompleted !== true) return null;

  return <>{children}</>;
}
