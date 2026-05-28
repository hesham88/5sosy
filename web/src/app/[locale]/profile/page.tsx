'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChromeLayout } from '@/components/shared/Chrome';
import { useApp } from '@/components/shared/Providers';
import { useAuth } from '@/lib/firebase/auth-context';
import { useProfile } from '@/lib/firebase/use-profile';
import { Btn, Card } from '@/components/shared/atoms';
import { ONBOARDING_ROLES, ROLE_LABELS, ROLE_STYLES, type UserRole } from '@/lib/roles';
import type { ActivityLogEntry, UserBadge } from '@/lib/types';
import { recordActivity } from '@/lib/activity';

type EditableProfile = {
  displayName: string;
  username: string;
  role: UserRole;
  title: string;
  description: string;
  grade: string;
  photoURL: string;
  coverURL: string;
};

const BLANK: EditableProfile = {
  displayName: '',
  username: '',
  role: 'student',
  title: '',
  description: '',
  grade: 'g3',
  photoURL: '',
  coverURL: ''
};

export default function ProfilePage() {
  const { locale } = useApp();
  const { user, loading: authLoading } = useAuth();
  const { profile, loading: profileLoading } = useProfile();
  const [draft, setDraft] = useState<EditableProfile>(BLANK);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [activity, setActivity] = useState<ActivityLogEntry[]>([]);

  useEffect(() => {
    if (!profile) return;
    setDraft({
      displayName: profile.displayName ?? '',
      username: profile.username ?? '',
      role: profile.role ?? 'student',
      title: profile.title ?? '',
      description: profile.description ?? '',
      grade: profile.grade ?? 'g3',
      photoURL: profile.photoURL ?? '',
      coverURL: profile.coverURL ?? ''
    });
  }, [profile]);

  useEffect(() => {
    if (!user || user.isAnonymous) return;
    let active = true;
    user.getIdToken().then((token) =>
      fetch('/api/activity?limit=30', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store'
      })
        .then((res) => res.json())
        .then((data) => {
          if (active) setActivity(Array.isArray(data.items) ? data.items : []);
        })
        .catch(() => undefined)
    );
    return () => {
      active = false;
    };
  }, [user, status]);

  const roleOptions = useMemo(() => {
    const current = profile?.role;
    if (current === 'super_admin' || current === 'admin') return [current, ...ONBOARDING_ROLES] as UserRole[];
    return ONBOARDING_ROLES;
  }, [profile?.role]);

  if (authLoading || profileLoading) {
    return <ChromeLayout><div className="p-10 text-slate-500">Loading...</div></ChromeLayout>;
  }

  if (!user) {
    return (
      <ChromeLayout>
        <div className="p-10 text-slate-500">Sign in first.</div>
      </ChromeLayout>
    );
  }

  if (user.isAnonymous) {
    return (
      <ChromeLayout>
        <div className="max-w-2xl px-5 py-8 lg:px-10">
          <Card className="p-6">
            <div className="text-[12px] font-bold uppercase tracking-wider text-slate-400">Guest mode</div>
            <h1 className="mt-2 text-2xl font-extrabold text-slate-900">Guests do not have profiles</h1>
            <p className="mt-2 text-[14px] leading-6 text-slate-600">
              Guest sessions are temporary. Activity, profile data, and chat history are not
              persisted after sign-out.
            </p>
            <Link
              href={`/${locale}/sign-in`}
              className="mt-5 inline-flex rounded-lg bg-sky-600 px-4 py-2.5 text-[13px] font-bold text-white hover:bg-sky-700"
            >
              Sign in for a persistent profile
            </Link>
          </Card>
        </div>
      </ChromeLayout>
    );
  }

  const role = draft.role ?? 'student';
  const style = ROLE_STYLES[role];
  const publicHref = draft.username ? `/${locale}/u/${draft.username}` : '#';

  const update = <K extends keyof EditableProfile>(key: K, value: EditableProfile[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const save = async () => {
    setSaving(true);
    setStatus('');
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/users/profile', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify(draft)
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      await recordActivity(user, {
        type: 'profile_update',
        title: 'Updated profile',
        resourceType: 'profile',
        visibility: 'private',
        metadata: { username: draft.username, role: draft.role }
      });
      setStatus('Saved');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ChromeLayout>
      <div className="px-5 py-6 lg:px-10 lg:py-8 max-w-[1200px]">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 lg:text-3xl">My profile</h1>
            <p className="mt-1 text-[14px] text-slate-500">
              Manage your public profile, account identity, badges, and activity history.
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href={publicHref}
              className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-[13px] font-semibold text-slate-700 hover:border-slate-300"
            >
              View public URL
            </Link>
            <Btn kind="primary" onClick={save} disabled={saving}>
              {saving ? 'Saving...' : 'Save profile'}
            </Btn>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="lg:col-span-8 space-y-6">
            <Card className="overflow-hidden">
              <div
                className="h-40 bg-slate-200"
                style={{
                  backgroundImage: draft.coverURL
                    ? `linear-gradient(rgba(15,23,42,.15),rgba(15,23,42,.15)),url(${draft.coverURL})`
                    : 'linear-gradient(135deg,#0ea5e9,#f59e0b)',
                  backgroundSize: 'cover',
                  backgroundPosition: 'center'
                }}
              />
              <div className="px-5 pb-5">
                <div className="-mt-10 flex items-end gap-4">
                  <div className={`h-20 w-20 overflow-hidden rounded-2xl bg-white p-1 ring-4 ${style.ring}`}>
                    <div className="grid h-full w-full place-items-center rounded-xl bg-slate-100 text-2xl font-extrabold text-slate-700">
                      {draft.photoURL ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={draft.photoURL} alt="" className="h-full w-full object-cover" />
                      ) : (
                        draft.displayName.slice(0, 1) || '5'
                      )}
                    </div>
                  </div>
                  <div className="min-w-0 pb-1">
                    <div className={`inline-flex rounded-md px-2 py-1 text-[11px] font-bold ${style.soft}`}>
                      {ROLE_LABELS[role]}
                    </div>
                    <div className="mt-1 text-[12px] text-slate-500 ltr">/{locale}/u/{draft.username || 'username'}</div>
                  </div>
                </div>
              </div>
            </Card>

            <Card className="p-5">
              <SectionTitle title="Core profile" />
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Display name">
                  <input className={inputClass} value={draft.displayName} onChange={(e) => update('displayName', e.target.value)} />
                </Field>
                <Field label="Username" hint="3-32 chars, letters, numbers, hyphen, underscore.">
                  <input className={`${inputClass} ltr`} value={draft.username} onChange={(e) => update('username', e.target.value)} />
                </Field>
                <Field label="Role">
                  <select className={inputClass} value={draft.role} onChange={(e) => update('role', e.target.value as UserRole)}>
                    {roleOptions.map((r) => (
                      <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Grade">
                  <input className={inputClass} value={draft.grade} onChange={(e) => update('grade', e.target.value)} />
                </Field>
                <Field label="Profile title">
                  <input className={inputClass} value={draft.title} onChange={(e) => update('title', e.target.value)} />
                </Field>
                <Field label="Profile picture URL">
                  <input className={`${inputClass} ltr`} value={draft.photoURL} onChange={(e) => update('photoURL', e.target.value)} />
                </Field>
                <Field label="Cover image URL">
                  <input className={`${inputClass} ltr`} value={draft.coverURL} onChange={(e) => update('coverURL', e.target.value)} />
                </Field>
                <Field label="Email">
                  <div className="rounded-lg bg-slate-50 px-3 py-2 text-[13px] text-slate-500 ltr">{user.email}</div>
                </Field>
              </div>
              <Field label="Description">
                <textarea
                  className={`${inputClass} min-h-24 resize-y`}
                  value={draft.description}
                  onChange={(e) => update('description', e.target.value)}
                />
              </Field>
              {status && (
                <div className={`mt-4 rounded-lg px-3 py-2 text-[13px] ${status === 'Saved' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                  {status}
                </div>
              )}
            </Card>
          </div>

          <div className="lg:col-span-4 space-y-6">
            <Card className="p-5">
              <SectionTitle title="Badges and achievements" />
              <div className="space-y-2">
                {(profile?.badges as UserBadge[] | undefined)?.length ? (
                  profile?.badges?.map((badge) => (
                    <div key={badge.id} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                      <div className="text-[13px] font-bold text-slate-800">{badge.label}</div>
                      <div className="text-[11px] text-slate-400">Achievement slot</div>
                    </div>
                  ))
                ) : (
                  <div className="text-[13px] text-slate-500">No badges yet.</div>
                )}
              </div>
            </Card>

            <Card className="p-5">
              <SectionTitle title="Activity history" />
              <div className="space-y-2">
                {activity.length ? activity.map((item) => (
                  <div key={item.id ?? item.occurredAtIso} className="rounded-lg border border-slate-100 px-3 py-2">
                    <div className="text-[12px] font-bold text-slate-800">{item.title}</div>
                    <div className="mt-0.5 text-[11px] text-slate-400 ltr">
                      {item.type} - {item.occurredAtIso ?? 'server time'}
                    </div>
                  </div>
                )) : (
                  <div className="text-[13px] text-slate-500">No activity recorded yet.</div>
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </ChromeLayout>
  );
}

const inputClass =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[14px] text-slate-900 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-500/20';

function SectionTitle({ title }: { title: string }) {
  return <h2 className="mb-4 text-[13px] font-extrabold uppercase tracking-wider text-slate-500">{title}</h2>;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-bold text-slate-600">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-slate-400">{hint}</span>}
    </label>
  );
}
