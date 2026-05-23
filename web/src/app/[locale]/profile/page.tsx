'use client';

import { useEffect, useState } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { ChromeLayout } from '@/components/shared/Chrome';
import { useApp } from '@/components/shared/Providers';
import { useAuth } from '@/lib/firebase/auth-context';
import { getFirebase } from '@/lib/firebase/client';
import { Btn, Card } from '@/components/shared/atoms';

export default function ProfilePage() {
  const { isAR } = useApp();
  const { user, loading } = useAuth();
  const [doc1, setDoc1] = useState<Record<string, unknown> | null>(null);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!user) return;
    const provider = (process.env.NEXT_PUBLIC_DATABASE_PROVIDER || 'firestore').toLowerCase();

    if (provider === 'mongodb') {
      user.getIdToken().then((token) => {
        fetch('/api/users/profile', {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        .then((res) => res.json())
        .then((d) => {
          if (d && !d.error) {
            setDoc1(d);
            setName(d.displayName ?? '');
            setUsername(d.username ?? '');
          }
        });
      });
    } else {
      const { db } = getFirebase();
      getDoc(doc(db, 'users', user.uid)).then((s) => {
        if (s.exists()) {
          const d = s.data();
          setDoc1(d);
          setName((d.displayName as string) ?? '');
          setUsername((d.username as string) ?? '');
        }
      });
    }
  }, [user]);

  if (loading) return <ChromeLayout><div className="p-10 text-slate-500">…</div></ChromeLayout>;
  if (!user) return <ChromeLayout><div className="p-10 text-slate-500">{isAR ? 'سجّل دخول أولاً.' : 'Sign in first.'}</div></ChromeLayout>;

  const save = async () => {
    setSaving(true); setSaved(false);
    const provider = (process.env.NEXT_PUBLIC_DATABASE_PROVIDER || 'firestore').toLowerCase();

    if (provider === 'mongodb') {
      try {
        const token = await user.getIdToken();
        const res = await fetch('/api/users/profile', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'content-type': 'application/json'
          },
          body: JSON.stringify({ displayName: name, username: username.toLowerCase().trim() })
        });
        if (res.ok) {
          setSaved(true);
          const updated = { ...doc1, displayName: name, username: username.toLowerCase().trim() };
          setDoc1(updated);
        }
      } catch (err) {
        console.error('Failed to save profile via MongoDB API:', err);
      }
    } else {
      const { db } = getFirebase();
      await updateDoc(doc(db, 'users', user.uid), { displayName: name, username: username.toLowerCase().trim() });
      setSaved(true);
    }
    setSaving(false);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <ChromeLayout>
      <div className="px-5 lg:px-10 py-6 lg:py-8 max-w-2xl">
        <h1 className="text-2xl lg:text-3xl font-extrabold text-slate-900">{isAR ? 'ملفي الشخصي' : 'My profile'}</h1>
        <p className="text-slate-500 mt-1 text-[14px] mb-6">{isAR ? 'بياناتك مخزّنة في Firestore.' : 'Your data is stored in Firestore.'}</p>

        <Card className="p-6 space-y-4">
          <Field label={isAR ? 'الاسم' : 'Display name'}>
            <input value={name} onChange={(e) => setName(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-[14px] focus:outline-none focus:border-sky-400" />
          </Field>
          <Field label={isAR ? 'اسم المستخدم' : 'Username'} hint={isAR ? 'هيظهر في /u/<اسمك>' : 'Will appear at /u/<your-name>'}>
            <input value={username} onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-[14px] ltr focus:outline-none focus:border-sky-400" />
          </Field>
          <Field label={isAR ? 'البريد' : 'Email'}>
            <div className="text-[13px] text-slate-500 ltr">{user.email ?? (isAR ? 'حساب ضيف' : 'guest account')}</div>
          </Field>
          <Field label="UID">
            <div className="text-[12px] font-mono text-slate-400 ltr">{user.uid}</div>
          </Field>
          <div className="flex gap-2 pt-2">
            <Btn kind="primary" onClick={save} disabled={saving}>{saving ? '…' : (isAR ? 'حفظ' : 'Save')}</Btn>
            {saved && <span className="text-emerald-600 text-[12.5px] self-center">✓ {isAR ? 'تم الحفظ' : 'saved'}</span>}
          </div>
        </Card>

        {doc1 && (
          <Card className="p-6 mt-6">
            <div className="font-extrabold text-slate-900 mb-3">{isAR ? 'وثيقة Firestore الحالية' : 'Current Firestore doc'}</div>
            <pre className="text-[11px] bg-slate-900 text-emerald-300 p-3 rounded-lg overflow-x-auto ltr">{JSON.stringify(doc1, null, 2)}</pre>
          </Card>
        )}
      </div>
    </ChromeLayout>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-1">{label}</div>
      {children}
      {hint && <div className="text-[11px] text-slate-400 mt-1">{hint}</div>}
    </div>
  );
}
