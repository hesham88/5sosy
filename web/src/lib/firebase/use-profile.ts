'use client';

import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { useAuth } from './auth-context';
import { getFirebase } from './client';
import type { UserDoc } from '@/lib/types';

export type ProfileState = {
  profile: UserDoc | null;
  loading: boolean;
};

export function useProfile(): ProfileState {
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<UserDoc | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setProfile(null);
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
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          });
          if (res.ok && active) {
            const data = await res.json();
            setProfile(data);
          }
        } catch (err) {
          console.error('Failed to fetch profile from MongoDB API:', err);
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
          setLoading(false);
        },
        (err) => {
          console.error('useProfile snapshot error', err);
          setLoading(false);
        }
      );
      return () => unsub();
    }
  }, [user, authLoading]);

  return { profile, loading: authLoading || loading };
}
