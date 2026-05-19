'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '../shared/Providers';
import { Btn } from '../shared/atoms';
import { Logo } from '../shared/atoms';
import { ORAL_SCRIPT } from '@/constants/seed-data';

type Stage = 'idle' | 'running' | 'finished';
type Scores = { pronunciation: number; confidence: number; accuracy: number; structure: number };

const ROLE_LABEL = {
  examiner: { ar: 'الممتحن', en: 'Examiner' },
  student:  { ar: 'أنت',     en: 'You' }
};

export default function OralScreen() {
  const { isAR, locale, bumpStreak } = useApp();
  const router = useRouter();
  const [stage, setStage] = useState<Stage>('idle');
  const [transcript, setTranscript] = useState<typeof ORAL_SCRIPT>([]);
  const [scores, setScores] = useState<Scores>({ pronunciation: 0, confidence: 0, accuracy: 0, structure: 0 });
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (stage !== 'running') return;
    let cancelled = false;
    let i = 0;
    const next = () => {
      if (cancelled) return;
      if (i >= ORAL_SCRIPT.length) {
        setTimeout(() => { if (!cancelled) setStage('finished'); }, 1400);
        return;
      }
      const line = ORAL_SCRIPT[i++];
      setTimeout(() => {
        if (cancelled) return;
        setTranscript((t) => [...t, line]);
        if (line.who === 'student') {
          setScores((s) => ({
            pronunciation: Math.min(0.92, s.pronunciation + 0.22 + Math.random() * 0.1),
            confidence:    Math.min(0.88, s.confidence    + 0.18 + Math.random() * 0.12),
            accuracy:      Math.min(0.95, s.accuracy      + 0.24 + Math.random() * 0.06),
            structure:     Math.min(0.83, s.structure     + 0.20 + Math.random() * 0.08)
          }));
        }
        next();
      }, line.delay);
    };
    next();
    return () => { cancelled = true; };
  }, [stage]);

  useEffect(() => {
    if (stage !== 'running') return;
    setElapsed(0);
    const start = Date.now();
    timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [stage]);

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(80% 50% at 50% 50%, rgba(56,189,248,.12), transparent 70%), radial-gradient(60% 80% at 100% 0%, rgba(168,85,247,.08), transparent 60%)' }} />

      <div className="relative px-5 lg:px-8 py-4 flex items-center gap-3 border-b border-slate-800/80">
        <button onClick={() => router.push(`/${locale}/home`)} className="text-slate-400 hover:text-slate-200 text-[18px]">{isAR ? '→' : '←'}</button>
        <div className="flex items-center gap-2">
          <Logo size={32} />
          <span className="font-extrabold text-[15px]">{isAR ? 'محاكاة شفهي' : 'Oral exam · sim'}</span>
        </div>
        <div className="ms-auto flex items-center gap-4">
          <div className="flex items-center gap-2 text-[12px]">
            <span className="w-2 h-2 bg-rose-500 rounded-full animate-pulse" />
            <span className="font-bold text-rose-300 uppercase tracking-wider ltr">{isAR ? 'تسجيل' : 'rec'}</span>
            <span className="font-mono text-slate-300 ltr">{fmt(elapsed)}</span>
          </div>
        </div>
      </div>

      <div className="relative grid lg:grid-cols-12 gap-6 px-5 lg:px-8 py-6">
        <div className="lg:col-span-3 space-y-4">
          <ExaminerCard />
          <SessionInfoCard />
        </div>

        <div className="lg:col-span-6 flex flex-col items-center">
          <div className="relative grid place-items-center my-4" style={{ width: 220, height: 220 }}>
            <span className="mic-ring" />
            <span className="mic-ring r2" />
            <span className="mic-ring r3" />
            <div className="mic-orb rounded-full grid place-items-center text-5xl" style={{ width: 180, height: 180 }}>
              <span style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,.4))' }}>🎤</span>
            </div>
          </div>

          <div className="text-center mb-3">
            {stage === 'idle' && (
              <>
                <div className="text-[13px] uppercase tracking-wider text-sky-400 font-bold mb-2">{isAR ? 'جاهز للبدء' : 'Ready to begin'}</div>
                <div className="text-slate-300 text-[14px] max-w-md mx-auto">
                  {isAR ? 'هتدخل لجنة محاكاة لمدة ٥ دقايق. خصوصي هيمتحنك صوتيًا.'
                        : "You'll enter a 5-minute simulated panel. 5sosy will examine you by voice."}
                </div>
                <button onClick={() => setStage('running')}
                  className="mt-5 inline-flex items-center gap-2 bg-sky-500 hover:bg-sky-400 text-white font-bold px-6 py-3 rounded-xl shadow-lg shadow-sky-900/40 transition">
                  <span>{isAR ? 'ابدأ المحاكاة' : 'Start oral'}</span>
                  <span className="ltr">▶</span>
                </button>
              </>
            )}
            {stage === 'running' && (
              <div className="text-[12px] uppercase tracking-wider text-sky-400 font-bold">{isAR ? 'يستمع…' : 'Listening…'}</div>
            )}
            {stage === 'finished' && (
              <div className="text-[12px] uppercase tracking-wider text-emerald-400 font-bold">{isAR ? 'انتهى الامتحان' : 'Exam finished'}</div>
            )}
          </div>

          <div className="w-full max-w-2xl">
            <TranscriptStream transcript={transcript} />
          </div>

          <div className="mt-6 flex items-center gap-2">
            {stage === 'running' && (
              <>
                <button className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[12.5px] font-semibold">
                  {isAR ? '⏸ إيقاف مؤقت' : '⏸ Pause'}
                </button>
                <button onClick={() => setStage('finished')}
                  className="px-5 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[12.5px] font-bold">
                  {isAR ? 'إنهاء الامتحان' : 'End exam'}
                </button>
              </>
            )}
            {stage === 'finished' && (
              <Btn kind="primary" size="lg" onClick={() => { bumpStreak(120); router.push(`/${locale}/progress`); }}>
                {isAR ? 'شوف نتيجتك' : 'See your report'} <span className="ltr">→</span>
              </Btn>
            )}
          </div>
        </div>

        <div className="lg:col-span-3">
          <RubricPanel scores={scores} stage={stage} />
        </div>
      </div>
    </div>
  );
}

function ExaminerCard() {
  const { isAR } = useApp();
  return (
    <div className="bg-slate-900/70 backdrop-blur border border-slate-800 rounded-2xl p-4">
      <div className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500 mb-3 ltr">Examiner</div>
      <div className="flex items-center gap-3">
        <div className="relative">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-400 to-fuchsia-600 grid place-items-center text-white text-lg font-bold">د</div>
          <span className="absolute -bottom-0.5 -end-0.5 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-slate-900" />
        </div>
        <div>
          <div className="font-bold text-slate-100">{isAR ? 'د. منى عبد الرحمن' : 'Dr. Mona Abdelrahman'}</div>
          <div className="text-[11.5px] text-slate-400">{isAR ? 'ممتحنة افتراضية · فيزياء' : 'AI examiner · Physics'}</div>
        </div>
      </div>
      <div className="mt-3 text-[11.5px] text-slate-400 bg-slate-800/60 rounded-lg p-2 leading-relaxed">
        {isAR ? '«هاسألك ٧ أسئلة عن الغازات والترموديناميكا. خد وقتك واتكلم بثقة.»'
              : '"I\'ll ask you 7 questions on gases and thermodynamics. Take your time and speak with confidence."'}
      </div>
    </div>
  );
}

function SessionInfoCard() {
  const { isAR } = useApp();
  const rows = [
    { k: isAR ? 'الموضوع' : 'Topic',     v: isAR ? 'الغازات والترموديناميكا' : 'Gases & thermo' },
    { k: isAR ? 'المستوى' : 'Difficulty', v: isAR ? 'محاكاة وزارة'             : 'MOE-level' },
    { k: isAR ? 'اللهجة' : 'Accent',      v: isAR ? 'مصري'                      : 'Egyptian Arabic' },
    { k: isAR ? 'المدة'  : 'Length',      v: isAR ? '٥ دقائق'                    : '5 minutes' }
  ];
  return (
    <div className="bg-slate-900/70 backdrop-blur border border-slate-800 rounded-2xl p-4">
      <div className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500 mb-3 ltr">Session</div>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center justify-between text-[12.5px]">
            <span className="text-slate-400">{r.k}</span>
            <span className="font-semibold text-slate-200">{r.v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TranscriptStream({ transcript }: { transcript: typeof ORAL_SCRIPT }) {
  const { isAR } = useApp();
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [transcript]);

  if (transcript.length === 0) {
    return (
      <div className="text-center text-slate-500 text-[12.5px] italic">
        {isAR ? 'النص الحي هيظهر هنا…' : 'Live transcript will appear here…'}
      </div>
    );
  }
  return (
    <div ref={ref} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 max-h-[300px] overflow-y-auto slim space-y-3">
      {transcript.map((line, i) => {
        const isStudent = line.who === 'student';
        return (
          <div key={i} className={`flex ${isStudent ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5
              ${isStudent ? 'bg-sky-600/30 border border-sky-500/40 text-slate-100' : 'bg-slate-800 text-slate-200'}`}>
              <div className={`text-[10.5px] font-bold uppercase tracking-wider mb-1 ${isStudent ? 'text-sky-300' : 'text-violet-300'}`}>
                {ROLE_LABEL[line.who][isAR ? 'ar' : 'en']}
              </div>
              <div className="text-[13.5px] leading-relaxed">{isAR ? line.ar : line.en}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RubricPanel({ scores, stage }: { scores: Scores; stage: Stage }) {
  const { isAR } = useApp();
  const items = [
    { key: 'pronunciation' as const, ar: 'النطق',  en: 'Pronunciation', icon: '🗣️' },
    { key: 'confidence'    as const, ar: 'الثقة',   en: 'Confidence',    icon: '💪' },
    { key: 'accuracy'      as const, ar: 'الدقة',   en: 'Accuracy',      icon: '🎯' },
    { key: 'structure'     as const, ar: 'البناء',  en: 'Structure',     icon: '🏗️' }
  ];
  const total = (scores.pronunciation + scores.confidence + scores.accuracy + scores.structure) / 4;

  return (
    <div className="bg-slate-900/70 backdrop-blur border border-slate-800 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500 ltr">Live rubric</div>
        <div className="text-[10.5px] text-violet-300 font-bold ltr">assessment.agent</div>
      </div>

      <div className="mb-5 text-center">
        <div className="text-[11px] text-slate-400 uppercase tracking-wider font-bold mb-1">{isAR ? 'النتيجة الكلية' : 'Overall'}</div>
        <div className="text-4xl font-extrabold text-slate-100 ltr tabular-nums">
          {Math.round(total * 100)}<span className="text-base text-slate-500">%</span>
        </div>
      </div>

      <div className="space-y-3.5">
        {items.map((it) => {
          const v = scores[it.key];
          const pct = Math.round(v * 100);
          const color = pct < 40 ? '#ef4444' : pct < 70 ? '#f59e0b' : '#22c55e';
          return (
            <div key={it.key}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[14px]">{it.icon}</span>
                <span className="text-[12.5px] font-semibold text-slate-200">{isAR ? it.ar : it.en}</span>
                <span className="ms-auto text-[12px] font-bold ltr tabular-nums" style={{ color }}>{pct}</span>
              </div>
              <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bar-fill" style={{ width: `${pct}%`, background: color }} />
              </div>
            </div>
          );
        })}
      </div>

      {stage === 'finished' && (
        <div className="mt-5 pt-4 border-t border-slate-800 text-[11.5px] text-slate-400 leading-relaxed">
          <span className="text-emerald-400 font-bold">✓ </span>
          {isAR ? 'أداء قوي. الدقة العلمية فوق المتوسط، النطق ممتاز. اشتغل على البناء.'
                : 'Strong run. Above-average accuracy, excellent pronunciation. Tighten your structure.'}
        </div>
      )}
    </div>
  );
}
