'use client';

import { useState } from 'react';
import { ChromeLayout } from '../shared/Chrome';
import { useApp } from '../shared/Providers';
import { AgentLog, Btn, Card } from '../shared/atoms';
import { SUBJECT_META, HUE } from '@/constants/subjects';

export default function SettingsScreen() {
  const { isAR, locale, setLocale } = useApp();
  const [accent, setAccent] = useState<'eg' | 'msa'>('eg');
  const [notif, setNotif] = useState({ daily: true, weekly: true, weak: true, exam: true });
  const [reIngest, setReIngest] = useState(false);

  return (
    <ChromeLayout>
      <div className="px-5 lg:px-10 py-6 lg:py-8 max-w-3xl">
        <h1 className="text-2xl lg:text-3xl font-extrabold text-slate-900">{isAR ? 'الإعدادات' : 'Settings'}</h1>
        <p className="text-slate-500 mt-1 text-[14px] mb-8">{isAR ? 'فصّل خصوصي على ذوقك.' : 'Tailor 5sosy to how you study.'}</p>

        <SettingSection title={isAR ? 'اللغة والاتجاه' : 'Language & direction'} icon="🌐">
          <Row label={isAR ? 'لغة الواجهة' : 'Interface language'}>
            <Segmented
              options={[{ id: 'ar', label: 'العربية' }, { id: 'en', label: 'English' }]}
              value={locale}
              onChange={(v) => setLocale(v as 'ar' | 'en')}
            />
          </Row>
          <Row label={isAR ? 'لهجة TTS' : 'TTS accent'} sub={isAR ? 'الصوت اللي 5sosy بيشرح بيه' : "Voice 5sosy uses to read lessons"}>
            <Segmented
              options={[{ id: 'eg', label: isAR ? 'مصري' : 'Egyptian', glyph: '🇪🇬' }, { id: 'msa', label: isAR ? 'فصحى' : 'MSA', glyph: 'ع' }]}
              value={accent}
              onChange={(v) => setAccent(v as 'eg' | 'msa')}
            />
          </Row>
        </SettingSection>

        <SettingSection title={isAR ? 'التنبيهات' : 'Notifications'} icon="🔔">
          <Toggle label={isAR ? 'تذكير المذاكرة اليومي' : 'Daily study reminder'} sub={isAR ? '٤:٠٠م كل يوم' : 'Every day at 4:00pm'}
                  value={notif.daily} onChange={(v) => setNotif((n) => ({ ...n, daily: v }))} />
          <Toggle label={isAR ? 'تقرير أسبوعي' : 'Weekly report'} sub={isAR ? 'كل سبت ٩:٠٠ص' : 'Saturdays at 9:00am'}
                  value={notif.weekly} onChange={(v) => setNotif((n) => ({ ...n, weekly: v }))} />
          <Toggle label={isAR ? 'تنبيهي لمفهوم ضعيف' : 'Weak-concept alert'} sub={isAR ? 'لما الوكيل البيداغوجي يلاقي ضعف' : 'When pedagogy agent flags a slip'}
                  value={notif.weak} onChange={(v) => setNotif((n) => ({ ...n, weak: v }))} />
          <Toggle label={isAR ? 'عد تنازلي للامتحانات' : 'Exam countdown'} sub={isAR ? 'تنبيهات قبل الامتحانات' : 'Heads-up before exams'}
                  value={notif.exam} onChange={(v) => setNotif((n) => ({ ...n, exam: v }))} />
        </SettingSection>

        <SettingSection title={isAR ? 'الكتب المربوطة' : 'Connected textbooks'} icon="📚">
          <div className="space-y-2">
            {[
              { id: 'physics' as const,   indexed: true,  when: isAR ? 'منذ ١٢ يوم' : '12 days ago' },
              { id: 'chemistry' as const, indexed: true,  when: isAR ? 'منذ ٨ أيام'  : '8 days ago' },
              { id: 'math' as const,      indexed: false, when: isAR ? 'لم تتم الفهرسة' : 'not yet indexed' }
            ].map((b) => {
              const m = SUBJECT_META[b.id];
              return (
                <div key={b.id} className="flex items-center gap-3 px-3 py-3 bg-slate-50 rounded-lg">
                  <div className={`w-9 h-9 rounded-lg grid place-items-center text-xl ${HUE[m.hue].bg}`}>{m.glyph}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-slate-900 truncate">{isAR ? m.ar : m.en} — G12</div>
                    <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${b.indexed ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                      <span>{b.indexed ? (isAR ? 'مفهرس' : 'indexed') : (isAR ? 'في الانتظار' : 'pending')}</span>
                      <span>·</span>
                      <span>{b.when}</span>
                    </div>
                  </div>
                  <button className="text-[11.5px] font-bold text-sky-700 hover:text-sky-800">
                    {b.indexed ? (isAR ? 'إعادة فهرسة' : 'Re-index') : (isAR ? 'فهرسة' : 'Index')}
                  </button>
                </div>
              );
            })}
          </div>
          <Btn kind="outline" className="mt-3 w-full">＋ {isAR ? 'إضافة كتاب' : 'Add textbook'}</Btn>

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
            {isAR ? '▸ إعادة تشغيل وكيل الاستيعاب لكل الكتب' : '▸ Re-run ingestion for all books'}
          </button>
        </SettingSection>

        <SettingSection title={isAR ? 'البيانات والخصوصية' : 'Data & privacy'} icon="🔒">
          <Row label={isAR ? 'حفظ سجل المحادثات' : 'Save chat history'} sub={isAR ? '٣٠ يوم على جهازك' : 'Stored 30 days on this device'}>
            <Toggle inline value={true} onChange={() => {}} />
          </Row>
          <Row label={isAR ? 'مشاركة بيانات مجهولة لتحسين الوكلاء' : 'Share anonymous data to improve agents'} sub={isAR ? 'محظور أي معرّف شخصي' : 'No personal identifiers ever shared'}>
            <Toggle inline value={false} onChange={() => {}} />
          </Row>
          <div className="flex gap-2 mt-3">
            <Btn kind="outline" size="sm">{isAR ? 'تنزيل بياناتي' : 'Download my data'}</Btn>
            <Btn kind="ghost" size="sm" className="text-rose-600 hover:bg-rose-50">{isAR ? 'حذف الحساب' : 'Delete account'}</Btn>
          </div>
        </SettingSection>

        <SettingSection title={isAR ? 'الاشتراك' : 'Subscription'} icon="💳">
          <div className="flex items-center gap-3 p-4 bg-gradient-to-br from-sky-50 to-amber-50 rounded-xl">
            <div className="text-3xl">✦</div>
            <div className="flex-1">
              <div className="font-extrabold text-slate-900">
                {isAR ? 'خطة الطالب' : 'Student plan'}
                <span className="ms-2 text-[10.5px] bg-emerald-500 text-white font-bold px-1.5 py-0.5 rounded-full uppercase ltr">active</span>
              </div>
              <div className="text-[12.5px] text-slate-600 mt-0.5">
                <span className="ltr font-bold">99 EGP</span> / {isAR ? 'شهر' : 'month'} · {isAR ? 'تجديد ١٥ يونيو' : 'renews June 15'}
              </div>
            </div>
            <Btn kind="outline" size="sm">{isAR ? 'إدارة' : 'Manage'}</Btn>
          </div>
        </SettingSection>

        <div className="text-center text-[11px] text-slate-400 mt-8">
          5sosy v0.9 · {isAR ? 'مبني بـ Google ADK + Gemini 2.5' : 'Built on Google ADK + Gemini 2.5'}
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
