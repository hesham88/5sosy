'use client';

import { useState } from 'react';
import { ChromeLayout } from '../shared/Chrome';
import { useApp } from '../shared/Providers';
import { AgentLog, Btn, Card } from '../shared/atoms';
import { LanguageSwitcher } from '../shared/LanguageSwitcher';
import { HUE, metaFor } from '@/constants/subjects';

export default function SettingsScreen() {
  const { isAR, t } = useApp();
  const s = t.settings;
  const [accent, setAccent] = useState<'eg' | 'msa'>('eg');
  const [notif, setNotif] = useState({ daily: true, weekly: true, weak: true, exam: true });
  const [reIngest, setReIngest] = useState(false);

  return (
    <ChromeLayout>
      <div className="px-5 lg:px-10 py-6 lg:py-8 max-w-3xl">
        <h1 className="text-2xl lg:text-3xl font-extrabold text-slate-900">{s.title}</h1>
        <p className="text-slate-500 mt-1 text-[14px] mb-8">{s.sub}</p>

        <SettingSection title={s.langSection} icon="🌐">
          <div className="py-1">
            <div className="text-[13.5px] font-semibold text-slate-900 mb-1">
              {s.interfaceLang}
            </div>
            <div className="text-[11.5px] text-slate-500 mb-3">
              {s.interfaceLangHint}
            </div>
            <LanguageSwitcher variant="grid" />
          </div>
          <Row label={s.ttsAccent} sub={s.ttsAccentSub}>
            <Segmented
              options={[{ id: 'eg', label: s.accentEg, glyph: '🇪🇬' }, { id: 'msa', label: s.accentMsa, glyph: 'ع' }]}
              value={accent}
              onChange={(v) => setAccent(v as 'eg' | 'msa')}
            />
          </Row>
        </SettingSection>

        <SettingSection title={s.notifications} icon="🔔">
          <Toggle label={s.dailyReminder} sub={s.dailyReminderSub}
                  value={notif.daily} onChange={(v) => setNotif((n) => ({ ...n, daily: v }))} />
          <Toggle label={s.weeklyReport} sub={s.weeklyReportSub}
                  value={notif.weekly} onChange={(v) => setNotif((n) => ({ ...n, weekly: v }))} />
          <Toggle label={s.weakAlert} sub={s.weakAlertSub}
                  value={notif.weak} onChange={(v) => setNotif((n) => ({ ...n, weak: v }))} />
          <Toggle label={s.examCountdown} sub={s.examCountdownSub}
                  value={notif.exam} onChange={(v) => setNotif((n) => ({ ...n, exam: v }))} />
        </SettingSection>

        <SettingSection title={s.connectedBooks} icon="📚">
          <div className="space-y-2">
            {[
              { id: 'physics' as const,   indexed: true,  when: isAR ? 'منذ ١٢ يوم' : '12 days ago' },
              { id: 'chemistry' as const, indexed: true,  when: isAR ? 'منذ ٨ أيام'  : '8 days ago' },
              { id: 'math' as const,      indexed: false, when: isAR ? 'لم تتم الفهرسة' : 'not yet indexed' }
            ].map((b) => {
              const m = metaFor(b.id);
              return (
                <div key={b.id} className="flex items-center gap-3 px-3 py-3 bg-slate-50 rounded-lg">
                  <div className={`w-9 h-9 rounded-lg grid place-items-center text-xl ${HUE[m.hue].bg}`}>{m.glyph}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-slate-900 truncate">{isAR ? m.ar : m.en} — G12</div>
                    <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${b.indexed ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                      <span>{b.indexed ? s.indexed : s.pending}</span>
                      <span>·</span>
                      <span>{b.when}</span>
                    </div>
                  </div>
                  <button className="text-[11.5px] font-bold text-sky-700 hover:text-sky-800">
                    {b.indexed ? s.reindex : s.index}
                  </button>
                </div>
              );
            })}
          </div>
          <Btn kind="outline" className="mt-3 w-full">＋ {s.addTextbook}</Btn>

          {reIngest && (
            <div className="mt-4">
              <AgentLog heading="ingestion.log · re-run" speed={9}
                lines={[
                  { agent: 'IngestionAgent', text: 'Re-reading math.pdf from MOE source…', status: 'info' },
                  { agent: 'TopologyAgent',  text: 'Refreshing chapter graph (24 chapters).' },
                  { agent: 'IngestionAgent', text: 'Index updated ✓', status: 'ok' }
                ]} />
            </div>
          )}
          <button onClick={() => setReIngest(true)} className="mt-3 text-[12px] font-semibold text-slate-500 hover:text-slate-800">
            ▸ {s.reRunIngestion}
          </button>
        </SettingSection>

        <SettingSection title={s.dataPrivacy} icon="🔒">
          <Row label={s.saveChat} sub={s.saveChatSub}>
            <Toggle inline value={true} onChange={() => {}} />
          </Row>
          <Row label={s.shareAnon} sub={s.shareAnonSub}>
            <Toggle inline value={false} onChange={() => {}} />
          </Row>
          <div className="flex gap-2 mt-3">
            <Btn kind="outline" size="sm">{s.downloadData}</Btn>
            <Btn kind="ghost" size="sm" className="text-rose-600 hover:bg-rose-50">{s.deleteAccount}</Btn>
          </div>
        </SettingSection>

        <SettingSection title={s.subscription} icon="💳">
          <div className="flex items-center gap-3 p-4 bg-gradient-to-br from-sky-50 to-amber-50 rounded-xl">
            <div className="text-3xl">✦</div>
            <div className="flex-1">
              <div className="font-extrabold text-slate-900">
                {s.studentPlan}
                <span className="ms-2 text-[10.5px] bg-emerald-500 text-white font-bold px-1.5 py-0.5 rounded-full uppercase">{s.active}</span>
              </div>
              <div className="text-[12.5px] text-slate-600 mt-0.5">
                <span className="ltr font-bold">99 EGP</span> / {s.perMonth} · {s.renews}
              </div>
            </div>
            <Btn kind="outline" size="sm">{s.manage}</Btn>
          </div>
        </SettingSection>

        <div className="text-center text-[11px] text-slate-400 mt-8">
          5sosy v0.9 · {s.builtOn}
        </div>
      </div>
    </ChromeLayout>
  );
}

function SettingSection({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="mb-7">
      <h2 className="text-[13px] font-extrabold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
        <span className="text-base">{icon}</span>{title}
      </h2>
      <Card className="p-4 space-y-3">{children}</Card>
    </div>
  );
}

function Row({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <div className="flex-1 min-w-0">
        <div className="text-[13.5px] font-semibold text-slate-900">{label}</div>
        {sub && <div className="text-[11.5px] text-slate-500 mt-0.5">{sub}</div>}
      </div>
      {children}
    </div>
  );
}

function Toggle({ label, sub, value, onChange, inline }: { label?: string; sub?: string; value: boolean; onChange: (v: boolean) => void; inline?: boolean }) {
  const btn = (
    <button onClick={() => onChange(!value)}
      className={`relative w-11 h-6 rounded-full transition shrink-0 ${value ? 'bg-sky-600' : 'bg-slate-300'}`}>
      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition ${value ? 'start-[22px]' : 'start-0.5'}`} />
    </button>
  );
  if (inline) return btn;
  return (
    <div className="flex items-center gap-3 py-1">
      <div className="flex-1 min-w-0">
        <div className="text-[13.5px] font-semibold text-slate-900">{label}</div>
        {sub && <div className="text-[11.5px] text-slate-500 mt-0.5">{sub}</div>}
      </div>
      {btn}
    </div>
  );
}

function Segmented({ options, value, onChange }: {
  options: { id: string; label: string; glyph?: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="inline-flex bg-slate-100 rounded-lg p-1">
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button key={o.id} onClick={() => onChange(o.id)}
            className={`px-3 py-1.5 rounded-md text-[12.5px] font-bold transition flex items-center gap-1.5
              ${active ? 'bg-white text-sky-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            {o.glyph && <span>{o.glyph}</span>}
            <span>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
