'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInAnonymously as fbSignInAnonymously,
  signInWithPopup,
  signOut as fbSignOut,
  type User
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getFirebase } from './client';

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
      if (u) await upsertUserDoc(u);
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
    await fbSignOut(auth);
  };

  return (
    <AuthCtx.Provider value={{ user, loading, signInWithGoogle, signInAsGuest, signOut }}>
      {children}
    </AuthCtx.Provider>
  );
}

async function upsertUserDoc(u: User) {
  try {
    const provider = (process.env.NEXT_PUBLIC_DATABASE_PROVIDER || 'firestore').toLowerCase();

    if (provider === 'mongodb') {
      const token = await u.getIdToken();
      const res = await fetch('/api/users/profile', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (res.status === 404) {
        const baseProfile = {
          uid: u.uid,
          displayName: u.displayName ?? (u.isAnonymous ? 'Guest' : ''),
          email: u.email ?? null,
          photoURL: u.photoURL ?? null,
          isAnonymous: u.isAnonymous,
          username: (u.email?.split('@')[0] ?? `student-${u.uid.slice(0, 6)}`).toLowerCase(),
          locale: 'ar',
          grade: 'g3',
          track: 'sci_sci',
          subjects: ['physics', 'chemistry', 'math'],
          streak: 0,
          xp: 0,
          onboardingCompleted: false,
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
          body: JSON.stringify(baseProfile)
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
          uid: u.uid,
          displayName: u.displayName ?? (u.isAnonymous ? 'Guest' : ''),
          email: u.email ?? null,
          photoURL: u.photoURL ?? null,
          isAnonymous: u.isAnonymous,
          username: (u.email?.split('@')[0] ?? `student-${u.uid.slice(0, 6)}`).toLowerCase(),
          locale: 'ar',
          grade: 'g3',
          track: 'sci_sci',
          subjects: ['physics', 'chemistry', 'math'],
          streak: 0,
          xp: 0,
          onboardingCompleted: false,
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
