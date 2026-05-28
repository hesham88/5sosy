'use client';

import { useEffect, useState } from 'react';
import { ChromeLayout } from '../shared/Chrome';
import { useApp } from '../shared/Providers';
import { Btn, Card } from '../shared/atoms';
import { LanguageSwitcher } from '../shared/LanguageSwitcher';
import { useAuth } from '@/lib/firebase/auth-context';
import { useProfile } from '@/lib/firebase/use-profile';
import { defaultUserSettings } from '@/lib/profile';
import { recordActivity } from '@/lib/activity';
import type { UserSettings } from '@/lib/types';

type TabId = 'account' | 'preferences' | 'privacy';

const tabs: Array<{ id: TabId; label: string }> = [
  { id: 'account', label: 'Account Settings' },
  { id: 'preferences', label: 'Preferences' },
  { id: 'privacy', label: 'Privacy' }
];

export default function SettingsScreen() {
  const { t } = useApp();
  const { user } = useAuth();
  const { profile } = useProfile();
  const [active, setActive] = useState<TabId>('account');
  const [settings, setSettings] = useState<UserSettings>(defaultUserSettings());
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSettings({ ...defaultUserSettings(), ...(profile?.settings ?? {}) });
  }, [profile?.settings]);

  const patch = (area: keyof UserSettings, values: Record<string, unknown>) => {
    setSettings((prev) => ({
      ...prev,
      [area]: {
        ...(prev[area] as Record<string, unknown> | undefined),
        ...values
      }
    }));
  };

  const save = async () => {
    if (!user || user.isAnonymous) return;
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
        body: JSON.stringify({ settings })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      await recordActivity(user, {
        type: 'system_action',
        title: `Updated ${active} settings`,
        resourceType: 'settings',
        resourceId: active,
        visibility: 'private'
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
      <div className="px-5 py-6 lg:px-10 lg:py-8 max-w-[1100px]">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 lg:text-3xl">{t.settings.title}</h1>
            <p className="mt-1 text-[14px] text-slate-500">
              Account identity, learning preferences, and activity/privacy controls are managed separately.
            </p>
          </div>
          <Btn kind="primary" onClick={save} disabled={!user || user.isAnonymous || saving}>
            {saving ? 'Saving...' : 'Save settings'}
          </Btn>
        </div>

        {user?.isAnonymous && (
          <Card className="mb-5 p-4 text-[13px] text-slate-600">
            Guest settings are temporary and are cleared when the guest signs out.
          </Card>
        )}

        <div className="mb-5 flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActive(tab.id)}
              className={`rounded-lg px-4 py-2 text-[13px] font-bold transition ${
                active === tab.id
                  ? 'bg-sky-600 text-white'
                  : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {active === 'account' && (
          <SettingsPanel
            title="Account Settings"
            description="Core account data and security-facing account choices."
          >
            <InfoRow label="Email" value={user?.email ?? 'Guest account'} />
            <InfoRow label="UID" value={user?.uid ?? 'Not signed in'} mono />
            <Toggle
              label="Email notifications"
              sub="Allow 5sosy to send account and product emails."
              value={settings.account?.emailNotifications ?? true}
              onChange={(value) => patch('account', { emailNotifications: value })}
            />
            <Toggle
              label="Login alerts"
              sub="Record and surface sign-in activity in your history."
              value={settings.account?.loginAlerts ?? true}
              onChange={(value) => patch('account', { loginAlerts: value })}
            />
          </SettingsPanel>
        )}

        {active === 'preferences' && (
          <SettingsPanel
            title="Preferences"
            description="Choices that affect interface behavior and learning reminders."
          >
            <div>
              <Label>Interface language</Label>
              <LanguageSwitcher variant="grid" />
            </div>
            <SelectRow
              label="Interface density"
              value={settings.preferences?.interfaceDensity ?? 'comfortable'}
              options={['compact', 'comfortable', 'spacious']}
              onChange={(value) => patch('preferences', { interfaceDensity: value })}
            />
            <SelectRow
              label="TTS accent"
              value={settings.preferences?.ttsAccent ?? 'eg'}
              options={['eg', 'msa']}
              onChange={(value) => patch('preferences', { ttsAccent: value })}
            />
            <Toggle label="Daily reminder" value={settings.preferences?.dailyReminder ?? true} onChange={(value) => patch('preferences', { dailyReminder: value })} />
            <Toggle label="Weekly report" value={settings.preferences?.weeklyReport ?? true} onChange={(value) => patch('preferences', { weeklyReport: value })} />
            <Toggle label="Weak-concept alerts" value={settings.preferences?.weakConceptAlerts ?? true} onChange={(value) => patch('preferences', { weakConceptAlerts: value })} />
            <Toggle label="Exam countdown" value={settings.preferences?.examCountdown ?? true} onChange={(value) => patch('preferences', { examCountdown: value })} />
          </SettingsPanel>
        )}

        {active === 'privacy' && (
          <SettingsPanel
            title="Privacy"
            description="Visibility and security controls for profile, activity, and chat history."
          >
            <SelectRow
              label="Profile visibility"
              value={settings.privacy?.profileVisibility ?? 'public'}
              options={['public', 'connections', 'private']}
              onChange={(value) => patch('privacy', { profileVisibility: value })}
            />
            <SelectRow
              label="Activity visibility"
              value={settings.privacy?.activityVisibility ?? 'private'}
              options={['private', 'connections', 'public']}
              onChange={(value) => patch('privacy', { activityVisibility: value })}
            />
            <Toggle label="Show badges publicly" value={settings.privacy?.showBadges ?? true} onChange={(value) => patch('privacy', { showBadges: value })} />
            <Toggle label="Save chat history" value={settings.privacy?.saveChatHistory ?? true} onChange={(value) => patch('privacy', { saveChatHistory: value })} />
            <Toggle
              label="Anonymous product analytics"
              sub="Share aggregate usage signals without personal identifiers."
              value={settings.privacy?.allowAnonymousProductAnalytics ?? false}
              onChange={(value) => patch('privacy', { allowAnonymousProductAnalytics: value })}
            />
          </SettingsPanel>
        )}

        {status && (
          <div className={`mt-4 rounded-lg px-3 py-2 text-[13px] ${status === 'Saved' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
            {status}
          </div>
        )}
      </div>
    </ChromeLayout>
  );
}

function SettingsPanel({
  title,
  description,
  children
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="mb-5">
        <h2 className="text-[17px] font-extrabold text-slate-900">{title}</h2>
        <p className="mt-1 text-[13px] text-slate-500">{description}</p>
      </div>
      <div className="space-y-4">{children}</div>
    </Card>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="mb-1 text-[12px] font-bold text-slate-600">{children}</div>;
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg bg-slate-50 px-3 py-2">
      <div className="text-[12px] font-bold text-slate-600">{label}</div>
      <div className={`truncate text-[13px] text-slate-700 ${mono ? 'font-mono ltr' : ''}`}>{value}</div>
    </div>
  );
}

function Toggle({
  label,
  sub,
  value,
  onChange
}: {
  label: string;
  sub?: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-semibold text-slate-900">{label}</div>
        {sub && <div className="mt-0.5 text-[11.5px] text-slate-500">{sub}</div>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${value ? 'bg-sky-600' : 'bg-slate-300'}`}
        aria-pressed={value}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${value ? 'start-[22px]' : 'start-0.5'}`} />
      </button>
    </div>
  );
}

function SelectRow({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <Label>{label}</Label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[14px] text-slate-900 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-500/20"
      >
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

