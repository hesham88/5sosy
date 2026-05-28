'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/firebase/auth-context';
import { identifyAnalyticsUser, trackClientException, trackEvent } from '@/lib/firebase/analytics';
import { recordActivity } from '@/lib/activity';

export function Observability() {
  const pathname = usePathname();
  const { user } = useAuth();
  const lastPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user) {
      void identifyAnalyticsUser(null);
      return;
    }
    void identifyAnalyticsUser(user.isAnonymous ? null : user.uid, {
      auth_provider: user.isAnonymous ? 'guest' : 'firebase'
    });
  }, [user]);

  useEffect(() => {
    if (!pathname || lastPathRef.current === pathname) return;
    lastPathRef.current = pathname;
    void trackEvent('page_view', { page_path: pathname });
    void recordActivity(user, {
      type: 'page_view',
      title: `Viewed ${pathname}`,
      resourceType: 'route',
      resourceId: pathname,
      visibility: 'private'
    });
  }, [pathname, user]);

  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      void trackClientException(event.error ?? event.message, {
        source: event.filename,
        line: event.lineno
      });
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      void trackClientException(event.reason, { source: 'unhandledrejection' });
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return null;
}

