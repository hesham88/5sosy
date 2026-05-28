'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useApp } from '@/components/shared/Providers';
import { useAuth } from '@/lib/firebase/auth-context';

export default function ParentConsentApproval({ token }: { token: string }) {
  const { locale } = useApp();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<'idle' | 'approved' | 'error'>('idle');
  const [error, setError] = useState('');

  const approve = async () => {
    if (!user || user.isAnonymous) return;
    setBusy(true);
    setError('');
    try {
      const idToken = await user.getIdToken();
      const res = await fetch('/api/parent-consent/approve', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({ token })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setStatus('approved');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Approval failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center bg-slate-50 px-5">
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="text-[12px] font-bold uppercase tracking-wider text-slate-400">
          Parent consent
        </div>
        <h1 className="mt-2 text-2xl font-extrabold text-slate-900">
          Approve child access to 5sosy
        </h1>
        <p className="mt-2 text-[14px] leading-6 text-slate-600">
          Sign in with the parent email that received this link, then approve the
          child account. The child will appear under your relationship view.
        </p>

        {!user || user.isAnonymous ? (
          <Link
            href={`/${locale}/sign-in?next=${encodeURIComponent(`/${locale}/parent-consent/${token}`)}`}
            className="mt-5 inline-flex w-full items-center justify-center rounded-lg bg-sky-600 px-4 py-3 text-[14px] font-bold text-white hover:bg-sky-700"
          >
            Sign in to approve
          </Link>
        ) : status === 'approved' ? (
          <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] font-semibold text-emerald-800">
            Approval complete. The child profile is now linked to your parent profile.
          </div>
        ) : (
          <button
            type="button"
            onClick={approve}
            disabled={busy}
            className="mt-5 inline-flex w-full items-center justify-center rounded-lg bg-sky-600 px-4 py-3 text-[14px] font-bold text-white hover:bg-sky-700 disabled:opacity-60"
          >
            {busy ? 'Approving...' : 'Approve child account'}
          </button>
        )}

        {status === 'error' && (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-700">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

