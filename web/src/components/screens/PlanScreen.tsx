'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChromeLayout } from '../shared/Chrome';
import { useApp } from '../shared/Providers';
import { AgentLog, Btn, Card, SubjectChip, type AgentLogLine } from '../shared/atoms';
import { SUBJECT_META, HUE } from '@/constants/subjects';
import { WEEK_PLAN } from '@/constants/seed-data';
import { callAgent } from '@/lib/agents';

const TYPE_GLYPH: Record<string, string> = { review: '↻', quiz: '✓', lesson: '📖', practice: '✎', audio: '🎧', oral: '🎤' };

export default function PlanScreen() {
  const { isAR, t, locale } = useApp();
  const router = useRouter();
  const todayIdx = Math.max(0, WEEK_PLAN.findIndex((d) => d.isToday));
  const [activeIdx, setActiveIdx] = useState(todayIdx);
  const [regenLog, setRegenLog] = useState<AgentLogLine[] | null>(null);
  const [regen, setRegen] = useState(false);

  const day = WEEK_PLAN[activeIdx];
  const totalMin = day.blocks.reduce((s, b) => s + b.dur, 0);
  const weekMin = useMemo(() => WEEK_PLAN.reduce((s, d) => s + d.blocks.reduce((a, b) => a + b.dur, 0), 0), []);

  const regenerate = async () => {
    setRegen(true);
    setRegenLog([
      { agent: 'Orchestrator', text: 'Recompute requested. Sampling latest mastery deltas…', status: 'info' },
      { agent: 'PedagogyAgent', text: 'Re-ranking weak concepts (PV=nRT ↑, titration ↓)…' },
      { agent: 'PlannerAgent',  text: 'Re-balancing this week — 4h26m across 7 days.', status: 'ok' },
      { agent: 'Orchestrator',  text: 'Plan refreshed.', status: 'ok' }
    ]);
    void callAgent('orchestrator', { intent: 'regenerate_plan', locale }).catch(() => undefined);
    setTimeout(() => setRegen(false), 2400);
  };

  return (
    <ChromeLayout>
      <div className="px-5 lg:px-10 py-6 lg:py-8 max-w-[1400px]">
        <div className="flex items-end justify-between gap-4 mb-6 flex-wrap">
          <div>
            <h1 className="text-2xl lg:text-3xl font-extrabold text-slate-900">{t.plan.title}</h1>
            <p className="text-slate-500 mt-1 text-[14px]">{t.plan.sub}</p>
          </div>
          <Btn kind="primary" onClick={regenerate} disabled={regen}>
            {regen
              ? <><span className="inline-block w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" /> {t.plan.regenerating}</>
              : <>✦ {t.plan.regenerate}</>}
          </Btn>
        </div>

        {/* Week strip */}
        <Card className="p-3 mb-6 overflow-hidden">
          <div className="flex gap-2 overflow-x-auto slim">
            {WEEK_PLAN.map((d, idx) => {
              const isActive = idx === activeIdx;
              const isToday = !!d.isToday;
              const minutes = d.blocks.reduce((s, b) => s + b.dur, 0);
              return (
                <button
                  key={d.dayKey}
                  onClick={() => setActiveIdx(idx)}
                  className={`shrink-0 w-[88px] py-3 rounded-xl text-center transition border
                    ${isActive
                      ? 'bg-sky-600 text-white border-sky-600 shadow-sm'
                      : isToday
                        ? 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-sky-300 hover:bg-sky-50'}`}
                >
                  <div className={`text-[11px] font-bold uppercase tracking-wider ${isActive ? 'text-sky-100' : 'text-slate-400'}`}>
                    {isAR ? d.arLabel : d.enLabel}
                  </div>
                  <div className="text-[22px] font-extrabold leading-none mt-1 ltr">{d.date}</div>
                  <div className={`text-[10.5px] mt-1 ltr ${isActive ? 'text-sky-100' : 'text-slate-400'}`}>
                    {minutes}m · {d.blocks.length} {t.plan.sessions}
                  </div>
                  {isToday && !isActive && (
                    <div className="text-[9px] font-bold text-amber-700 mt-1">{t.plan.today}</div>
                  )}
                </button>
              );
            })}
          </div>
        </Card>

        {regenLog && (
          <div className="mb-6">
            <AgentLog lines={regenLog} heading="planner.log" speed={12} />
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 min-w-0">
            <Card className="overflow-hidden">
              <div className="px-5 pt-5 pb-3 flex items-center gap-3">
                <div>
                  <div className="font-extrabold text-slate-900 text-[17px]">
                    {isAR ? day.arLabel : day.enLabel} · {day.date}
                  </div>
                  <div className="text-[12px] text-slate-500 mt-0.5">
                    {day.blocks.length} {t.plan.blocks} · {totalMin} {t.plan.minutes}
                  </div>
                </div>
                <div className="ms-auto">
                  <Btn kind="outline" size="sm">+ {t.plan.addBlock}</Btn>
                </div>
              </div>

              {day.blocks.length === 0 ? (
                <div className="px-5 py-10 text-center text-slate-500 text-[14px]">{t.plan.empty}</div>
              ) : (
                <ul className="p-3 pt-2 space-y-1">
                  {day.blocks.map((b, idx) => {
                    const m = SUBJECT_META[b.subject];
                    const h = HUE[m.hue];
                    return (
                      <li key={b.id} className="relative">
                        {idx !== day.blocks.length - 1 && (
                          <div className="absolute top-9 bottom-0 start-[26px] w-px bg-slate-200" />
                        )}
                        <button
                          onClick={() => router.push(`/${locale}/${b.type === 'quiz' ? 'quiz' : b.type === 'oral' ? 'oral' : 'session'}`)}
                          className="w-full flex items-start gap-3 p-2.5 rounded-lg text-start transition hover:bg-slate-50"
                        >
                          <div className={`w-6 h-6 mt-0.5 rounded-full ${h.dot} text-white grid place-items-center font-bold text-[11px] ltr shrink-0`}>
                            {idx + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                              <SubjectChip id={b.subject} size="sm" />
                              <span className="text-[10.5px] text-slate-400 ltr inline-flex items-center gap-1">
                                <span>{TYPE_GLYPH[b.type]}</span>
                                <span className="capitalize">{b.type}</span>
                              </span>
                              <span className="ms-auto text-[11px] font-bold text-slate-500 ltr">{b.dur}m</span>
                            </div>
                            <div className="font-semibold text-[14px] text-slate-900">
                              {isAR ? b.arT : b.enT}
                            </div>
                            <div className="text-[11.5px] text-slate-500 mt-0.5">{isAR ? b.arSub : b.enSub}</div>
                          </div>
                          <span className="shrink-0 w-9 h-9 rounded-full bg-white border border-slate-200 text-slate-600 grid place-items-center hover:border-sky-400 hover:text-sky-600 transition">
                            <span className="text-[12px] ltr">▶</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </div>

          <div className="lg:col-span-4 space-y-5 min-w-0">
            <Card className="p-5">
              <div className="font-extrabold text-slate-900 text-[15px] mb-3">{t.plan.daySummary}</div>
              <div className="space-y-3">
                <Row label={t.plan.total} value={`${totalMin} ${t.plan.minutes}`} />
                <Row label={t.plan.done} value="0 m" tone="emerald" />
                <Row label={t.plan.remaining} value={`${totalMin} ${t.plan.minutes}`} tone="amber" />
              </div>
              <div className="border-t border-slate-100 mt-4 pt-4">
                <div className="text-[12px] text-slate-500 mb-1">{t.plan.weekTotal}</div>
                <div className="text-[22px] font-extrabold text-slate-900 ltr">
                  {Math.round(weekMin / 60 * 10) / 10}h
                </div>
              </div>
            </Card>

            <Card className="p-5">
              <div className="font-extrabold text-slate-900 text-[15px] mb-3 flex items-center gap-2">
                <span>📊</span>{t.plan.weekDistribution}
              </div>
              <div className="space-y-2">
                {bySubject(WEEK_PLAN).map((row) => {
                  const meta = SUBJECT_META[row.subject];
                  const h = HUE[meta.hue];
                  return (
                    <div key={row.subject}>
                      <div className="flex items-center justify-between text-[12px] mb-1">
                        <SubjectChip id={row.subject} size="sm" />
                        <span className="ltr text-slate-500">{row.minutes}m</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full ${h.dot}`} style={{ width: `${(row.minutes / weekMin) * 100}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </ChromeLayout>
  );
}

function Row({ label, value, tone = 'slate' }: { label: string; value: string; tone?: 'slate' | 'emerald' | 'amber' }) {
  const c = tone === 'emerald' ? 'text-emerald-600' : tone === 'amber' ? 'text-amber-600' : 'text-slate-900';
  return (
    <div className="flex items-center justify-between">
      <div className="text-[12.5px] text-slate-500">{label}</div>
      <div className={`text-[14px] font-extrabold ltr ${c}`}>{value}</div>
    </div>
  );
}

function bySubject(week: typeof WEEK_PLAN) {
  const map = new Map<string, number>();
  for (const d of week) for (const b of d.blocks) map.set(b.subject, (map.get(b.subject) ?? 0) + b.dur);
  return [...map.entries()]
    .map(([subject, minutes]) => ({ subject: subject as keyof typeof SUBJECT_META, minutes }))
    .sort((a, b) => b.minutes - a.minutes);
}
