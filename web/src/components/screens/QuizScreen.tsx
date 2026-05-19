'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChromeLayout } from '../shared/Chrome';
import { useApp } from '../shared/Providers';
import { AgentLog, Btn, Card, SubjectChip, type AgentLogLine } from '../shared/atoms';
import { QUIZ_QUESTIONS } from '@/constants/seed-data';

export default function QuizScreen() {
  const { isAR, locale, bumpStreak } = useApp();
  const router = useRouter();
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<number, unknown>>({});
  const [confidence, setConfidence] = useState<Record<number, number>>({});
  const [showResult, setShowResult] = useState(false);

  const q = QUIZ_QUESTIONS[idx];
  const ans = answers[q.id];
  const conf = confidence[q.id] ?? 50;

  const setAns = (v: unknown) => setAnswers((a) => ({ ...a, [q.id]: v }));
  const setConf = (v: number) => setConfidence((c) => ({ ...c, [q.id]: v }));

  const submit = () => {
    if (idx < QUIZ_QUESTIONS.length - 1) setIdx(idx + 1);
    else setShowResult(true);
  };

  return (
    <ChromeLayout>
      <div className="border-b border-slate-200 bg-white px-5 lg:px-8 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => router.push(`/${locale}/home`)} className="text-slate-400 hover:text-slate-700 text-[18px]">{isAR ? '→' : '←'}</button>
        <div className="flex items-center gap-2 text-[12.5px] text-slate-500">
          <SubjectChip id="physics" size="sm" />
          <span className="text-slate-300">/</span>
          <span className="text-slate-900 font-semibold">{isAR ? 'اختبار سريع' : 'Quick check'}</span>
        </div>
        <div className="ms-auto flex items-center gap-3">
          <span className="text-[12px] text-slate-500 ltr font-mono">{idx + 1} / {QUIZ_QUESTIONS.length}</span>
          <div className="hidden sm:flex gap-1">
            {QUIZ_QUESTIONS.map((_, i) => (
              <span key={i} className={`w-7 h-1.5 rounded-full ${i < idx ? 'bg-emerald-500' : i === idx ? 'bg-sky-500' : 'bg-slate-200'}`} />
            ))}
          </div>
        </div>
      </div>

      <div className="px-5 lg:px-8 py-10 max-w-2xl mx-auto">
        {!showResult ? (
          <>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[10.5px] font-bold text-slate-400 uppercase tracking-wider ltr">Question {idx + 1}</span>
              <span className="text-[10.5px] font-bold bg-violet-50 text-violet-700 px-1.5 py-0.5 rounded uppercase">
                {q.kind === 'mcq' ? (isAR ? 'اختر' : 'MCQ')
                  : q.kind === 'short' ? (isAR ? 'إجابة قصيرة' : 'Short')
                  : (isAR ? 'ترتيب' : 'Order')}
              </span>
            </div>
            <Card className="p-7">
              <div className="text-[18px] lg:text-[20px] font-bold text-slate-900 leading-relaxed mb-6">
                {isAR ? q.ar : q.en}
              </div>

              {q.kind === 'mcq' && 'choices' in q && (
                <div className="space-y-2">
                  {q.choices.map((c) => {
                    const active = ans === c.id;
                    return (
                      <button key={c.id} onClick={() => setAns(c.id)}
                        className={`w-full flex items-center gap-3 p-3.5 rounded-xl border-2 text-start transition
                          ${active ? 'border-sky-600 bg-sky-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                        <div className={`w-7 h-7 rounded-full grid place-items-center text-[12px] font-bold ltr
                          ${active ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                          {c.id.toUpperCase()}
                        </div>
                        <div className="font-semibold text-slate-800 text-[15px]">{isAR ? c.ar : c.en}</div>
                      </button>
                    );
                  })}
                </div>
              )}

              {q.kind === 'short' && 'placeholder' in q && (
                <input value={(ans as string) || ''} onChange={(e) => setAns(e.target.value)}
                  placeholder={isAR ? q.placeholder.ar : q.placeholder.en}
                  className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3.5 text-[15px] focus:outline-none focus:border-sky-500" />
              )}

              {q.kind === 'order' && 'items' in q && (
                <OrderedList question={q} answer={ans as string[] | undefined} setAnswer={setAns} />
              )}

              <div className="mt-7 pt-5 border-t border-slate-100">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[12.5px] font-bold text-slate-700">{isAR ? 'ايه نسبة تأكدك؟' : 'How confident are you?'}</span>
                  <span className="ms-auto ltr text-[13px] font-extrabold text-slate-900 tabular-nums">{conf}%</span>
                </div>
                <input type="range" min="0" max="100" value={conf}
                  onChange={(e) => setConf(Number(e.target.value))} className="w-full accent-sky-600" />
                <div className="flex justify-between text-[10.5px] text-slate-400 mt-1 ltr">
                  <span>0 · {isAR ? 'مش متأكد' : 'no idea'}</span>
                  <span>100 · {isAR ? 'متأكد جدًا' : 'certain'}</span>
                </div>
              </div>
            </Card>

            <div className="flex justify-between mt-6">
              <Btn kind="ghost" onClick={() => idx > 0 ? setIdx(idx - 1) : router.push(`/${locale}/session`)}>
                {isAR ? '→ السابق' : '← Prev'}
              </Btn>
              <Btn kind="primary" size="lg" disabled={ans === undefined || ans === null || ans === ''} onClick={submit}>
                {idx < QUIZ_QUESTIONS.length - 1 ? (isAR ? 'التالي' : 'Next') : (isAR ? 'سلّم الإجابات' : 'Submit')} <span className="ltr">→</span>
              </Btn>
            </div>
          </>
        ) : (
          <QuizResult onContinue={() => { bumpStreak(60); router.push(`/${locale}/oral`); }} />
        )}
      </div>
    </ChromeLayout>
  );
}

function OrderedList({ question, answer, setAnswer }: {
  question: { items: { id: string; ar: string; en: string }[] };
  answer: string[] | undefined;
  setAnswer: (v: string[]) => void;
}) {
  const { isAR } = useApp();
  const order = answer ?? question.items.map((i) => i.id);
  const byId = Object.fromEntries(question.items.map((i) => [i.id, i]));
  const move = (i: number, dir: number) => {
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const next = order.slice();
    [next[i], next[j]] = [next[j], next[i]];
    setAnswer(next);
  };
  return (
    <div>
      <div className="text-[11.5px] text-slate-500 mb-3">{isAR ? 'استخدم الأسهم لترتيب الخطوات' : 'Use the arrows to order the steps'}</div>
      <div className="space-y-2">
        {order.map((id, i) => {
          const it = byId[id];
          return (
            <div key={id} className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-3 py-3">
              <div className="w-7 h-7 rounded-full bg-sky-100 text-sky-700 grid place-items-center font-bold text-[12px] ltr">{i + 1}</div>
              <div className="flex-1 text-[14px] text-slate-800 font-medium">{isAR ? it.ar : it.en}</div>
              <div className="flex flex-col gap-0.5">
                <button onClick={() => move(i, -1)} disabled={i === 0}
                  className="w-7 h-5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:opacity-30 text-[10px] ltr">▲</button>
                <button onClick={() => move(i, 1)} disabled={i === order.length - 1}
                  className="w-7 h-5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:opacity-30 text-[10px] ltr">▼</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function QuizResult({ onContinue }: { onContinue: () => void }) {
  const { isAR, locale } = useApp();
  const router = useRouter();
  const lines: AgentLogLine[] = [
    { agent: 'AssessmentAgent', text: 'Scoring 3 responses…', status: 'info' },
    { agent: 'AssessmentAgent', text: 'Q1 ✓ correct — high confidence (80%) matches answer.', status: 'ok' },
    { agent: 'AssessmentAgent', text: 'Q2 ✓ correct — phrasing within acceptable variants.', status: 'ok' },
    { agent: 'AssessmentAgent', text: 'Q3 ✗ partial — steps 2 and 3 swapped.', status: 'warn' },
    { agent: 'PedagogyAgent',   text: 'Mathematical failure in isolating T in PV=nRT.', status: 'warn' },
    { agent: 'PedagogyAgent',   text: 'Misconception: "divide before rearranging" pattern.', status: 'warn' },
    { agent: 'PlannerAgent',    text: 'Adding 12-min focused drill: isolate-variable practice.', status: 'ok' },
    { agent: 'PlannerAgent',    text: 'Queued for tomorrow 4:30pm slot. Done.', status: 'ok' }
  ];

  return (
    <div>
      <div className="text-center mb-6">
        <div className="inline-block w-20 h-20 rounded-full bg-emerald-500 text-white grid place-items-center text-4xl mb-3 shadow-lg shadow-emerald-200">✓</div>
        <h1 className="text-2xl font-extrabold text-slate-900">{isAR ? 'تمام كده!' : 'Nice work!'}</h1>
        <p className="text-slate-500 mt-1 text-[14px]">{isAR ? 'حلّلنا إجاباتك — شوف اللي لقيناه:' : "We analyzed your answers — here's what we found:"}</p>
      </div>

      <Card className="p-6 mb-5">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{isAR ? 'الدرجة' : 'Score'}</div>
            <div className="text-3xl font-extrabold text-emerald-600 ltr mt-1">67<span className="text-base text-slate-400">%</span></div>
          </div>
          <div className="border-x border-slate-100">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{isAR ? 'الوقت' : 'Time'}</div>
            <div className="text-3xl font-extrabold text-slate-900 ltr mt-1">3:42</div>
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">XP</div>
            <div className="text-3xl font-extrabold text-amber-500 ltr mt-1">+60</div>
          </div>
        </div>
      </Card>

      <div className="mb-5">
        <div className="text-[12.5px] font-bold text-slate-500 uppercase tracking-wider mb-2 ltr">▸ Assessment Agent</div>
        <AgentLog lines={lines} heading="assessment.log" speed={9} />
      </div>

      <Card className="p-5 bg-gradient-to-br from-sky-50 to-white border-sky-200 mb-6">
        <div className="text-[11px] font-bold text-sky-700 uppercase tracking-wider mb-2">{isAR ? 'الخطوة الجاية' : 'What to study next'}</div>
        <div className="font-extrabold text-slate-900 text-[18px] mb-1">{isAR ? 'تمرين على عزل المتغيرات في معادلات الغاز' : 'Isolating variables in gas equations'}</div>
        <div className="text-[13px] text-slate-600">
          {isAR ? 'تمرين موجّه ١٢ دقيقة + ٤ مسائل تطبيقية، بناءً على الخطأ في السؤال ٣.'
                : '12-min focused drill + 4 application problems, based on your Q3 slip.'}
        </div>
      </Card>

      <div className="flex gap-3">
        <Btn kind="outline" className="flex-1" onClick={() => router.push(`/${locale}/home`)}>{isAR ? 'الرئيسية' : 'Back home'}</Btn>
        <Btn kind="primary" size="lg" className="flex-[2]" onClick={onContinue}>
          {isAR ? 'يلا للامتحان الشفهي' : 'Try oral exam'} <span className="ltr">→</span>
        </Btn>
      </div>
    </div>
  );
}
