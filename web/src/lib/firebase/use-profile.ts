'use client';

import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { useAuth } from './auth-context';
import { getFirebase } from './client';
import type { UserDoc } from '@/lib/types';

export type ProfileState = {
  profile: UserDoc | null;
  loading: boolean;
  /** True when the profile fetch failed for a reason OTHER than "no such user"
   *  (e.g. 500/network). Callers must NOT treat this as "onboarding incomplete",
   *  otherwise a transient hiccup bounces the user back into onboarding. */
  error: boolean;
};

export function useProfile(): ProfileState {
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<UserDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setProfile(null);
      setError(false);
      setLoading(false);
      return;
    }

    const provider = (process.env.NEXT_PUBLIC_DATABASE_PROVIDER || 'firestore').toLowerCase();

    if (provider === 'mongodb') {
      let active = true;
      const fetchProfile = async () => {
        try {
          setLoading(true);
          const token = await user.getIdToken();
          const res = await fetch('/api/users/profile', {
            headers: { 'Authorization': `Bearer ${token}` },
            cache: 'no-store',
          });
          if (!active) return;
          if (res.ok) {
            setProfile((await res.json()) as UserDoc);
            setError(false);
          } else if (res.status === 404) {
            // Brand-new user with no doc yet — legitimately go to onboarding.
            setProfile(null);
            setError(false);
          } else {
            // Server/transient error: keep whatever we had and flag it.
            console.error('Profile fetch failed:', res.status);
            setError(true);
          }
        } catch (err) {
          if (active) {
            console.error('Failed to fetch profile from MongoDB API:', err);
            setError(true);
          }
        } finally {
          if (active) setLoading(false);
        }
      };

      fetchProfile();
      return () => {
        active = false;
      };
    } else {
      setLoading(true);
      const { db } = getFirebase();
      const unsub = onSnapshot(
        doc(db, 'users', user.uid),
        (snap) => {
          setProfile(snap.exists() ? (snap.data() as UserDoc) : null);
          setError(false);
          setLoading(false);
        },
        (err) => {
          console.error('useProfile snapshot error', err);
          setError(true);
          setLoading(false);
        }
      );
      return () => unsub();
    }
  }, [user, authLoading]);

  return { profile, loading: authLoading || loading, error };
}
