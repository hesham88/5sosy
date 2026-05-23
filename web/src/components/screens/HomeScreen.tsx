'use client';

import { forwardRef, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChromeLayout } from '../shared/Chrome';
import { useApp } from '../shared/Providers';
import { AgentLog, Btn, Card, Confetti, Ring, SubjectChip, type AgentLogLine } from '../shared/atoms';
import { SUBJECT_META, HUE } from '@/constants/subjects';
import { HOME_PLAN, WEAK_TOPICS, UPCOMING, ACTIVITY } from '@/constants/seed-data';
import { callAgent } from '@/lib/agents';
import { useProfile } from '@/lib/firebase/use-profile';
import { dirFor } from '@/i18n/config';

export default function HomeScreen() {
  const { isAR, t, locale, pulseStreak } = useApp();
  const router = useRouter();
  const { profile } = useProfile();
  const [intent, setIntent] = useState('');
  const [parsing, setParsing] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const firstName = (profile?.preferredName || profile?.displayName || '').split(' ')[0];
  const greeting = firstName
    ? isAR ? `أهلاً ${firstName} 👋` : `Hi ${firstName} 👋`
    : t.home.greet;

  const submit = async (txt: string) => {
    setIntent(txt);
    setParsing(true);
    void callAgent('orchestrator', { intent: txt, locale }).catch(() => undefined);
    setTimeout(() => { setParsing(false); router.push(`/${locale}/session`); }, 2200);
  };

  return (
    <ChromeLayout>
      <div className="px-5 lg:px-10 py-6 lg:py-8 max-w-[1400px]">
        <div className="flex items-end justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl lg:text-3xl font-extrabold text-slate-900">{greeting}</h1>
            <p className="text-slate-500 mt-1 text-[14px]">{t.home.sub}</p>
          </div>
          <div className="hidden lg:flex items-center gap-3 text-[12px] text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {isAR ? '٥ وكلاء نشطين' : '5 agents online'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 space-y-6 min-w-0">
            <IntentInput ref={inputRef} value={intent} setValue={setIntent} onSubmit={submit} parsing={parsing} />
            <TodayPlan />
            <WeakTopicsRow />
          </div>
          <div className="lg:col-span-4 space-y-6 min-w-0">
            <StreakCard pulse={pulseStreak} />
            <UpcomingExams />
            <ActivityFeed />
          </div>
        </div>
      </div>
    </ChromeLayout>
  );
}

const IntentInput = forwardRef<HTMLTextAreaElement, {
  value: string; setValue: (v: string) => void; onSubmit: (v: string) => void; parsing: boolean;
}>(function IntentInput({ value, setValue, onSubmit, parsing }, ref) {
  const { t, isAR, locale } = useApp();
  const parseLines: AgentLogLine[] = [
    { agent: 'Orchestrator', text: 'Received intent. tokenizing Egyptian Arabic…' },
    { agent: 'Orchestrator', text: 'Subject = Physics · Topic = Gas Laws · Urgency = 48h', status: 'ok' },
    { agent: 'PlannerAgent', text: 'Drafting 4-session plan, biasing toward PV=nRT…' },
    { agent: 'PedagogyAgent', text: 'Pulling 3 misconception drills from your weak list.', status: 'ok' },
    { agent: 'Orchestrator', text: 'Ready. Opening study session ▸', status: 'ok' }
  ];

  return (
    <div className="relative">
      <div className="absolute -top-3 start-5 inline-flex items-center gap-1.5 bg-sky-600 text-white text-[11px] font-bold px-2.5 py-1 rounded-md shadow-sm">
        <span>✦</span><span>{isAR ? 'اسأل خصوصي' : 'Ask 5sosy'}</span>
      </div>
      <div className="bg-white rounded-2xl border-2 border-slate-200 hover:border-sky-300 focus-within:border-sky-500 transition shadow-sm">
        <textarea
          ref={ref}
          rows={2}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t.home.intentPh}
          className="w-full bg-transparent resize-none px-5 pt-6 pb-2 text-[16px] text-slate-900 placeholder:text-slate-400 focus:outline-none"
          dir={dirFor(locale)}
        />
        <div className="flex items-center gap-2 px-3 pb-3">
          <button className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100" title={isAR ? 'صوت' : 'Voice'}>🎙️</button>
          <button className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100" title={isAR ? 'مرفق' : 'Attach'}>📎</button>
          <div className="flex-1" />
          <span className="text-[11px] text-slate-400 hidden sm:inline">{isAR ? 'اضغط Enter للبدء' : 'Press Enter to start'}</span>
          <Btn kind="primary" disabled={!value.trim() || parsing}
               onClick={() => onSubmit(value || t.home.examples[0])}>
            {parsing
              ? <><span className="inline-block w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" /> {isAR ? 'بحلّل…' : 'Parsing…'}</>
              : <>{isAR ? 'يلا بينا' : "Let's go"} <span className="ltr">→</span></>}
          </Btn>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mt-3">
        {t.home.examples.map((ex, i) => (
          <button key={i} onClick={() => setValue(ex)}
            className="text-[12.5px] bg-white border border-slate-200 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700 text-slate-600 rounded-full px-3 py-1.5 transition">
            {ex}
          </button>
        ))}
      </div>

      {parsing && (
        <div className="mt-4">
          <AgentLog lines={parseLines} heading="orchestrator.log" speed={12} />
        </div>
      )}
    </div>
  );
});

function TodayPlan() {
  const { isAR, t, locale } = useApp();
  const router = useRouter();
  const [activeId, setActiveId] = useState(1);
  const totalMin = HOME_PLAN.reduce((s, b) => s + b.dur, 0);
  const doneMin = HOME_PLAN.filter((b) => b.id < activeId).reduce((s, b) => s + b.dur, 0);
  const pct = (doneMin / totalMin) * 100;
  const TYPE_GLYPH: Record<string, string> = { review: '↻', quiz: '✓', lesson: '📖', practice: '✎', audio: '🎧', oral: '🎤' };

  return (
    <Card className="overflow-hidden">
      <div className="px-5 pt-5 pb-3 flex items-center gap-3">
        <div>
          <div className="font-extrabold text-slate-900 text-[17px]">{t.home.plan}</div>
          <div className="text-[12px] text-slate-500 mt-0.5">{t.home.planSub}</div>
        </div>
        <div className="ms-auto text-end">
          <div className="text-[20px] font-extrabold text-slate-900 ltr">{Math.round(totalMin / 60 * 10) / 10}h</div>
          <div className="text-[11px] text-slate-500">{isAR ? `${HOME_PLAN.length} جلسات` : `${HOME_PLAN.length} sessions`}</div>
        </div>
      </div>
      <div className="px-5">
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full bg-sky-500 bar-fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex justify-between text-[10.5px] text-slate-400 mt-1 ltr">
          <span>{doneMin}m done</span><span>{totalMin}m total</span>
        </div>
      </div>

      <ul className="p-3 pt-4 space-y-1">
        {HOME_PLAN.map((b, idx) => {
          const m = SUBJECT_META[b.subject];
          const h = HUE[m.hue];
          const isActive = activeId === b.id;
          const isDone = b.id < activeId;
          return (
            <li key={b.id} className="relative">
              {idx !== HOME_PLAN.length - 1 && (
                <div className="absolute top-9 bottom-0 start-[26px] w-px bg-slate-200" />
              )}
              <button onClick={() => setActiveId(b.id)}
                className={`w-full flex items-start gap-3 p-2.5 rounded-lg text-start transition
                  ${isActive ? 'bg-sky-50' : 'hover:bg-slate-50'}`}>
                <div className="relative shrink-0 mt-0.5">
                  <div className={`w-6 h-6 rounded-full grid place-items-center font-bold text-[11px] ltr
                    ${isDone ? 'bg-emerald-500 text-white'
                     : isActive ? `${h.dot} text-white ring-4 ring-sky-100`
                     : 'bg-slate-200 text-slate-500'}`}>
                    {isDone ? '✓' : idx + 1}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <SubjectChip id={b.subject} size="sm" />
                    <span className="text-[10.5px] text-slate-400 ltr inline-flex items-center gap-1">
                      <span>{TYPE_GLYPH[b.type]}</span>
                      <span className="capitalize">{b.type}</span>
                    </span>
                    <span className="ms-auto text-[11px] font-bold text-slate-500 ltr">{b.dur}m</span>
                  </div>
                  <div className={`font-semibold text-[14px] ${isActive ? 'text-slate-900' : 'text-slate-800'}`}>
                    {isAR ? b.arT : b.enT}
                  </div>
                  <div className="text-[11.5px] text-slate-500 mt-0.5">{isAR ? b.arSub : b.enSub}</div>
                </div>
                <span
                  role="button"
                  onClick={(e) => { e.stopPropagation(); router.push(`/${locale}/${b.type === 'quiz' ? 'quiz' : b.type === 'oral' ? 'oral' : 'session'}`); }}
                  className={`shrink-0 w-9 h-9 rounded-full grid place-items-center transition cursor-pointer
                    ${isActive ? 'bg-sky-600 text-white hover:bg-sky-700' : 'bg-white border border-slate-200 text-slate-600 hover:border-sky-400 hover:text-sky-600'}`}>
                  <span className="text-[12px] ltr">▶</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function WeakTopicsRow() {
  const { isAR, t } = useApp();
  return (
    <Card className="overflow-hidden">
      <div className="px-5 pt-5 pb-3 flex items-center gap-3">
        <div>
          <div className="font-extrabold text-slate-900 text-[17px] flex items-center gap-2">
            {t.home.weak}
            <span className="text-[10.5px] font-bold text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded">
              {isAR ? 'وكيل التحليل التربوي' : 'Pedagogy agent'}
            </span>
          </div>
          <div className="text-[12px] text-slate-500 mt-0.5">
            {isAR ? 'مفاهيم ضعفت في تقييماتك الأخيرة' : 'Concepts your last assessments flagged'}
          </div>
        </div>
        <button className="ms-auto text-[12px] font-semibold text-sky-700 hover:text-sky-800">
          {isAR ? 'الكل ←' : 'See all →'}
        </button>
      </div>

      <div className="overflow-x-auto slim px-5 pb-5">
        <div className="flex gap-3 min-w-min">
          {WEAK_TOPICS.map((w) => (
            <div key={w.id} className="shrink-0 w-[180px] bg-white border border-slate-200 rounded-xl p-4 card-lift cursor-pointer">
              <div className="flex items-start justify-between mb-2">
                <SubjectChip id={w.subject} size="sm" />
                <Ring value={w.conf} size={36} stroke={4} />
              </div>
              <div className="font-bold text-[14px] text-slate-900 mt-2 leading-snug">{isAR ? w.arT : w.enT}</div>
              <div className="flex items-center justify-between mt-3 text-[11px]">
                <span className="ltr text-slate-500">{Math.round(w.conf * 100)}% mastery</span>
                <span className="text-sky-700 font-semibold">{isAR ? 'تمرّن' : 'Drill'} {isAR ? '←' : '→'}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function StreakCard({ pulse }: { pulse: boolean }) {
  const { isAR, streak, xp, t } = useApp();
  const days = [-3, -2, -1, 0, 1, 2, 3];
  return (
    <Card className={`overflow-hidden relative ${pulse ? 'ring-2 ring-amber-400' : ''}`}>
      <Confetti show={pulse} />
      <div className="px-5 pt-5 pb-5 bg-gradient-to-br from-amber-50 via-white to-white">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-500 text-white grid place-items-center text-2xl shadow-md shadow-amber-200">🔥</div>
          <div>
            <div className="text-[11.5px] font-bold uppercase tracking-wider text-amber-700">{t.home.streak}</div>
            <div className="text-[24px] font-extrabold text-slate-900 leading-none ltr mt-0.5">
              {streak} <span className="text-[12px] font-semibold text-slate-500">{t.home.streakDay}</span>
            </div>
          </div>
          <div className="ms-auto text-end">
            <div className="text-[11.5px] font-bold uppercase tracking-wider text-slate-500">XP</div>
            <div className="text-[20px] font-extrabold text-slate-900 ltr">{xp.toLocaleString()}</div>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1.5 mt-4">
          {days.map((d, i) => {
            const past = d < 0;
            const today = d === 0;
            return (
              <div key={i} className={`relative aspect-square rounded-md grid place-items-center text-[11px] font-bold
                ${today ? 'bg-amber-500 text-white ring-2 ring-amber-300'
                  : past ? 'bg-amber-100 text-amber-700'
                  : 'bg-slate-100 text-slate-400'}`}>
                {past || today ? '🔥' : ''}
              </div>
            );
          })}
        </div>
        <div className="text-[11.5px] text-slate-500 text-center mt-2">
          {isAR ? 'استمر! متبقي ٣ أيام لشارة الأسبوع 🏅' : 'Keep going! 3 days to weekly badge 🏅'}
        </div>
      </div>
    </Card>
  );
}

function UpcomingExams() {
  const { isAR, t } = useApp();
  return (
    <Card>
      <div className="px-5 pt-5 pb-3 font-extrabold text-slate-900 text-[15px] flex items-center gap-2">
        <span>⏱️</span> {t.home.next}
      </div>
      <div className="px-3 pb-3 space-y-1.5">
        {UPCOMING.map((u) => {
          const m = SUBJECT_META[u.subject];
          return (
            <div key={u.id} className={`flex items-center gap-3 p-2.5 rounded-lg
              ${u.urgent ? 'bg-rose-50' : 'hover:bg-slate-50'}`}>
              <div className={`w-9 h-9 rounded-lg grid place-items-center text-lg ${HUE[m.hue].bg}`}>{m.glyph}</div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-slate-900 truncate">{isAR ? u.arT : u.enT}</div>
                <div className="text-[11px] text-slate-500">{isAR ? `خلال ${u.days} أيام` : `In ${u.days} days`}</div>
              </div>
              {u.urgent && (
                <span className="text-[10.5px] font-bold text-rose-600 bg-rose-100 px-1.5 py-0.5 rounded uppercase">
                  {isAR ? 'قريب' : 'soon'}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function ActivityFeed() {
  const { isAR, t } = useApp();
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <button onClick={() => setOpen((o) => !o)} className="w-full px-5 pt-5 pb-4 flex items-center gap-2 text-start">
        <span className="font-extrabold text-slate-900 text-[15px] flex items-center gap-2">
          <span className="relative">
            <span className="w-2 h-2 rounded-full bg-emerald-500 absolute -end-3 top-1 animate-pulse" />
            ⚙️
          </span>
          {t.home.activity}
        </span>
        <span className="ms-auto text-[11px] text-slate-400 ltr">{open ? '▲' : '▼'}</span>
      </button>
      {open ? (
        <div className="px-5 pb-5 space-y-2.5">
          {ACTIVITY.map((a, i) => (
            <div key={i} className="flex items-start gap-2.5 text-[12.5px]">
              <div className="w-7 h-7 rounded-full bg-slate-100 grid place-items-center text-[14px] shrink-0">{a.glyph}</div>
              <div className="flex-1 min-w-0">
                <div className="text-slate-700">{isAR ? a.arT : a.enT}</div>
                <div className="text-[10.5px] text-slate-400 mt-0.5 ltr">{a.agent} · {isAR ? a.ago : a.agoEn}</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="px-5 pb-5 flex flex-wrap gap-1.5">
          {ACTIVITY.slice(0, 2).map((a, i) => (
            <span key={i} className="inline-flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-full px-2 py-1 text-[10.5px] text-slate-600">
              <span>{a.glyph}</span><span>{isAR ? a.ago : a.agoEn}</span>
            </span>
          ))}
        </div>
      )}
    </Card>
  );
}
