'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import {
  deleteUser,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInAnonymously as fbSignInAnonymously,
  signInWithPopup,
  signOut as fbSignOut,
  type User
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getFirebase } from './client';
import { recordActivity } from '@/lib/activity';
import { identifyAnalyticsUser, trackEvent } from './analytics';
import { buildBaseUserProfile } from '@/lib/profile';

type AuthState = {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInAsGuest: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthCtx = createContext<AuthState | null>(null);

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { auth } = getFirebase();
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setLoading(false);
      if (u?.isAnonymous) {
        await identifyAnalyticsUser(null, { auth_provider: 'guest' });
        await trackEvent('guest_login');
        return;
      }
      if (u) {
        await upsertUserDoc(u);
        await identifyAnalyticsUser(u.uid, { auth_provider: 'firebase' });
        await recordActivity(u, {
          type: 'login',
          title: 'Signed in',
          resourceType: 'auth',
          visibility: 'private'
        });
      }
    });
  }, []);

  const signInWithGoogle = async () => {
    const { auth } = getFirebase();
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const signInAsGuest = async () => {
    const { auth } = getFirebase();
    await fbSignInAnonymously(auth);
  };

  const signOut = async () => {
    const { auth } = getFirebase();
    const current = auth.currentUser;
    if (current && !current.isAnonymous) {
      await recordActivity(current, {
        type: 'logout',
        title: 'Signed out',
        resourceType: 'auth',
        visibility: 'private'
      });
    }
    if (current?.isAnonymous) {
      clearGuestState();
      try {
        await deleteUser(current);
        return;
      } catch {
        // Fall through to signOut if the anonymous account cannot be deleted.
      }
    }
    await fbSignOut(auth);
  };

  return (
    <AuthCtx.Provider value={{ user, loading, signInWithGoogle, signInAsGuest, signOut }}>
      {children}
    </AuthCtx.Provider>
  );
}

function clearGuestState() {
  if (typeof window === 'undefined') return;
  for (const key of Object.keys(window.localStorage)) {
    if (key.startsWith('5sosy.guest.') || key.startsWith('5sosy.temp.')) {
      window.localStorage.removeItem(key);
    }
  }
}

async function upsertUserDoc(u: User) {
  try {
    if (u.isAnonymous) return;
    const provider = (process.env.NEXT_PUBLIC_DATABASE_PROVIDER || 'firestore').toLowerCase();
    const baseProfile = buildBaseUserProfile({
      uid: u.uid,
      displayName: u.displayName,
      email: u.email,
      photoURL: u.photoURL,
      isAnonymous: u.isAnonymous
    });

    if (provider === 'mongodb') {
      const token = await u.getIdToken();
      const res = await fetch('/api/users/profile', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (res.status === 404) {
        const writeProfile = {
          ...baseProfile,
          createdAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString(),
          lastLoginAt: new Date().toISOString()
        };

        await fetch('/api/users/profile', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'content-type': 'application/json'
          },
          body: JSON.stringify(writeProfile)
        });
      } else if (res.ok) {
        await fetch('/api/users/profile', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            lastSeenAt: new Date().toISOString(),
            lastLoginAt: new Date().toISOString()
          })
        });
      }
    } else {
      const { db } = getFirebase();
      const ref = doc(db, 'users', u.uid);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        await setDoc(ref, {
          ...baseProfile,
          createdAt: serverTimestamp(),
          lastSeenAt: serverTimestamp(),
          lastLoginAt: serverTimestamp()
        });
      } else {
        await setDoc(
          ref,
          { lastSeenAt: serverTimestamp(), lastLoginAt: serverTimestamp() },
          { merge: true }
        );
      }
    }
  } catch (e) {
    console.error('upsertUserDoc failed', e);
  }
}
