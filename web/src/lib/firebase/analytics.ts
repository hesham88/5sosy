'use client';

import {
  getAnalytics,
  isSupported,
  logEvent,
  setUserId,
  setUserProperties,
  type Analytics
} from 'firebase/analytics';
import { getFirebase } from './client';

let analyticsPromise: Promise<Analytics | null> | null = null;

async function analyticsInstance(): Promise<Analytics | null> {
  if (typeof window === 'undefined') return null;
  if (!analyticsPromise) {
    analyticsPromise = isSupported()
      .then((supported) => (supported ? getAnalytics(getFirebase().app) : null))
      .catch(() => null);
  }
  return analyticsPromise;
}

export async function trackEvent(name: string, params?: Record<string, unknown>) {
  const analytics = await analyticsInstance();
  if (!analytics) return;
  logEvent(analytics, name, params as Record<string, string | number | boolean> | undefined);
}

export async function identifyAnalyticsUser(
  uid: string | null,
  properties?: Record<string, string | number | boolean | null>
) {
  const analytics = await analyticsInstance();
  if (!analytics) return;
  setUserId(analytics, uid);
  if (properties) setUserProperties(analytics, properties);
}

export async function trackClientException(error: unknown, context?: Record<string, unknown>) {
  const err = error instanceof Error ? error : new Error(String(error));
  await trackEvent('web_exception', {
    message: err.message.slice(0, 180),
    name: err.name,
    fatal: false,
    ...context
  });
}

