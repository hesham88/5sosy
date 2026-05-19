'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '../shared/Providers';
import { Btn, Logo, AgentLog, type AgentLogLine } from '../shared/atoms';
import { SUBJECT_META, HUE } from '@/constants/subjects';
import type { SubjectId } from '@/lib/types';

const GRADES = [
  { id: 'g1', ar: 'الصف الأول الثانوي',  en: 'Grade 10' },
  { id: 'g2', ar: 'الصف الثاني الثانوي', en: 'Grade 11' },
  { id: 'g3', ar: 'الصف الثالث الثانوي', en: 'Grade 12 (Final)' }
] as const;

const TRACKS = [
  { id: 'sci_sci',  ar: 'علمي علوم',  en: 'Science — Bio',  glyph: '🧬', tint: 'emerald' as const },
  { id: 'sci_math', ar: 'علمي رياضة', en: 'Science — Math', glyph: '∑',  tint: 'sky' as const },
  { id: 'lit',      ar: 'أدبي',        en: 'Literature',     glyph: '📜', tint: 'amber' as const }
];

const SUBJECTS_FOR_TRACK: Record<string, SubjectId[]> = {
  sci_sci:  ['physics','chemistry','biology','arabic','english','geology'],
  sci_math: ['physics','chemistry','math','arabic','english'],
  lit:      ['arabic','history','geography','philosophy','english']
};

export default function OnboardingScreen() {
  const { isAR, t, locale } = useApp();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [grade, setGrade] = useState<typeof GRADES[number]['id']>('g3');
  const [track, setTrack] = useState<keyof typeof SUBJECTS_FOR_TRACK>('sci_sci');
  const [subjects, setSubjects] = useState<SubjectId[]>(['physics','chemistry','math']);

  useEffect(() => {
    setSubjects((s) => s.filter((id) => SUBJECTS_FOR_TRACK[track].includes(id)));
  }, [track]);

  const toggleSubject = (id: SubjectId) => {
    setSubjects((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  };

  const stepTitle = isAR
    ? ['', 'صفك ومسارك', 'موادك', 'كتبك']
    : ['', 'Grade & track', 'Your subjects', 'Textbooks'];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <div className="px-6 lg:px-10 py-5 flex items-center gap-3 border-b border-slate-200 bg-white">
        <Logo size={36} />
        <div>
          <div className="font-extrabold text-slate-900 text-[17px] leading-none">{t.appName}</div>
          <div className="text-[11px] text-slate-500 mt-1">{t.appSub}</div>
        </div>
        <div className="ms-auto">
          <Btn kind="ghost" size="sm" onClick={() => router.push(`/${locale}/home`)}>{t.cta.skip}</Btn>
        </div>
      </div>

      <div className="max-w-3xl w-full mx-auto px-6 lg:px-0 py-8 lg:py-14 flex-1">
        <div className="flex items-center gap-3 mb-8">
          {[1,2,3].map((i) => (
            <div key={i} className="flex items-center gap-3 flex-1">
              <div className={`w-8 h-8 grid place-items-center rounded-full text-[13px] font-bold ltr
                ${step >= i ? 'bg-sky-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
                {step > i ? '✓' : i}
              </div>
              <div className={`flex-1 h-1 rounded-full ${step > i ? 'bg-sky-600' : 'bg-slate-200'}`} />
            </div>
          ))}
          <div className="text-[12px] text-slate-500 ltr">{step}/3</div>
        </div>

        <h1 className="text-2xl lg:text-3xl font-extrabold text-slate-900 mb-1.5">{stepTitle[step]}</h1>
        <p className="text-slate-600 mb-7 text-[14px]">
          {isAR ? 'هنفصّل خصوصي عشانك — كل ما تقولّي أكتر، الخطة هتبقى أدق.'
                : "We'll tailor 5sosy just for you — the more we know, the sharper the plan."}
        </p>

        {step === 1 && (
          <div className="space-y-7">
            <div>
              <div className="text-[12.5px] font-bold text-slate-500 uppercase tracking-wider mb-3">
                {isAR ? 'صفك الدراسي' : 'Grade level'}
              </div>
              <div className="grid sm:grid-cols-3 gap-3">
                {GRADES.map((g) => {
                  const active = grade === g.id;
                  return (
                    <button key={g.id} onClick={() => setGrade(g.id)}
                      className={`text-start p-4 rounded-xl border-2 transition card-lift
                        ${active ? 'border-sky-600 bg-sky-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                      <div className={`text-[12px] font-semibold mb-1 ltr ${active ? 'text-sky-600' : 'text-slate-400'}`}>
                        {g.id === 'g3' ? (isAR ? 'الصف النهائي' : 'Final year') : (isAR ? 'صف' : 'Level')}
                      </div>
                      <div className="font-bold text-slate-900 text-[15px]">{isAR ? g.ar : g.en}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="text-[12.5px] font-bold text-slate-500 uppercase tracking-wider mb-3">
                {isAR ? 'مسارك' : 'Track'}
              </div>
              <div className="grid sm:grid-cols-3 gap-3">
                {TRACKS.map((tr) => {
                  const active = track === tr.id;
                  const h = HUE[tr.tint];
                  return (
                    <button key={tr.id} onClick={() => setTrack(tr.id)}
                      className={`text-start p-4 rounded-xl border-2 transition card-lift relative overflow-hidden
                        ${active ? `border-sky-600 ${h.bg}` : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                      <div className="text-3xl mb-3 leading-none">{tr.glyph}</div>
                      <div className="font-bold text-slate-900 text-[15px]">{isAR ? tr.ar : tr.en}</div>
                      <div className="text-[11.5px] text-slate-500 mt-1">
                        {tr.id === 'sci_sci'  ? (isAR ? 'فيزياء، كيمياء، أحياء' : 'Phys, Chem, Bio') :
                         tr.id === 'sci_math' ? (isAR ? 'فيزياء، كيمياء، رياضة' : 'Phys, Chem, Math') :
                                                (isAR ? 'تاريخ، جغرافيا، فلسفة' : 'History, Geo, Philosophy')}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <SubjectsStep subjects={subjects} list={SUBJECTS_FOR_TRACK[track]} toggle={toggleSubject} />
        )}

        {step === 3 && (
          <TextbooksStep subjects={subjects} />
        )}

        <div className="flex items-center gap-3 mt-10">
          {step > 1 && <Btn kind="outline" onClick={() => setStep(step - 1)}>{t.cta.back}</Btn>}
          <div className="ms-auto" />
          {step < 3
            ? <Btn kind="primary" size="lg" onClick={() => setStep(step + 1)} disabled={step === 2 && subjects.length === 0}>
                {t.cta.next} <span className="ltr">{isAR ? '←' : '→'}</span>
              </Btn>
            : <Btn kind="primary" size="lg" onClick={() => router.push(`/${locale}/home`)}>
                {t.cta.start} <span className="ltr">{isAR ? '←' : '→'}</span>
              </Btn>}
        </div>
      </div>
    </div>
  );
}

function SubjectsStep({ subjects, list, toggle }: { subjects: SubjectId[]; list: SubjectId[]; toggle: (id: SubjectId) => void }) {
  const { isAR } = useApp();
  return (
    <div>
      <p className="text-[13px] text-slate-500 mb-4">
        {isAR ? 'اختار المواد اللي عاوز 5sosy يساعدك فيها' : 'Pick the subjects you want 5sosy to help with'}
      </p>
      <div className="flex flex-wrap gap-2.5">
        {list.map((id) => {
          const m = SUBJECT_META[id];
          const h = HUE[m.hue];
          const active = subjects.includes(id);
          return (
            <button key={id} onClick={() => toggle(id)}
              className={`inline-flex items-center gap-2 rounded-lg border-2 px-3.5 py-2.5 text-[13.5px] font-semibold transition
                ${active ? `${h.bg} ${h.text} ${h.border}` : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}>
              <span className="text-base">{m.glyph}</span>
              <span>{isAR ? m.ar : m.en}</span>
              <span className={`w-4 h-4 rounded grid place-items-center text-[10px] ${active ? 'bg-sky-600 text-white' : 'bg-slate-100 text-transparent'}`}>✓</span>
            </button>
          );
        })}
      </div>
      <div className="mt-6 text-[12.5px] text-slate-500">
        {isAR ? `اخترت ${subjects.length} مادة` : `${subjects.length} subjects selected`}
      </div>
    </div>
  );
}

function TextbooksStep({ subjects }: { subjects: SubjectId[] }) {
  const { isAR } = useApp();
  const [ingesting, setIngesting] = useState(false);
  const [done, setDone] = useState(false);

  const MOE = subjects.map((id) => {
    const m = SUBJECT_META[id];
    return { id, label: isAR ? m.ar : m.en, glyph: m.glyph };
  });

  const [enabled, setEnabled] = useState<Record<string, boolean>>(() => Object.fromEntries(MOE.map((b) => [b.id, true])));
  const toggle = (id: string) => setEnabled((e) => ({ ...e, [id]: !e[id] }));

  const lines: AgentLogLine[] = [
    { agent: 'IngestionAgent',   text: 'Connecting to MOE textbook source…', status: 'info' },
    { agent: 'IngestionAgent',   text: `Found ${MOE.length} textbooks across ${subjects.length} subjects.`, status: 'ok' },
    { agent: 'OCR',              text: 'Decoding embedded Arabic typography (Naskh + math glyphs)…' },
    { agent: 'TopologyAgent',    text: 'Building chapter → section → concept graph.' },
    { agent: 'TopologyAgent',    text: 'Extracted 42 core theorems, 318 worked examples.', status: 'ok' },
    { agent: 'EmbeddingService', text: 'Embedding 4,206 chunks → Vertex AI (text-embedding-005).' },
    { agent: 'PedagogyAgent',    text: 'Linking misconception clusters from past student data.' },
    { agent: 'IngestionAgent',   text: 'Index ready. Knowledge base online ✓', status: 'ok' }
  ];

  return (
    <div className="space-y-6">
      <div className="border-2 border-dashed border-slate-300 rounded-xl bg-white px-6 py-8 text-center hover:border-sky-400 hover:bg-sky-50/40 transition">
        <div className="text-3xl mb-2">📥</div>
        <div className="font-bold text-slate-900">{isAR ? 'اسحب ملفات PDF هنا' : 'Drop PDF files here'}</div>
        <div className="text-[12.5px] text-slate-500 mt-1">
          {isAR ? 'أو اختار من كتب الوزارة المتاحة تحت' : 'or pick from the available MOE textbooks below'}
        </div>
        <Btn kind="outline" size="sm" className="mt-4">{isAR ? 'استعراض' : 'Browse files'}</Btn>
      </div>

      <div>
        <div className="text-[12.5px] font-bold text-slate-500 uppercase tracking-wider mb-3">
          {isAR ? 'كتب وزارة التربية والتعليم' : 'MOE textbooks'}
        </div>
        <div className="space-y-2">
          {MOE.map((b) => (
            <div key={b.id} className="flex items-center gap-3 bg-white border border-slate-200 rounded-lg px-4 py-3">
              <div className="text-xl">{b.glyph}</div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-slate-900 text-[13.5px]">{b.label}</div>
                <div className="text-[11.5px] text-slate-500">PDF · 18 {isAR ? 'فصل' : 'chapters'} · 4.2 MB</div>
              </div>
              <button onClick={() => toggle(b.id)}
                className={`relative w-10 h-6 rounded-full transition ${enabled[b.id] ? 'bg-sky-600' : 'bg-slate-300'}`}>
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition
                  ${enabled[b.id] ? 'start-[18px]' : 'start-0.5'}`} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-3">
          <div className="text-[12.5px] font-bold text-slate-500 uppercase tracking-wider">
            {isAR ? 'وكيل الاستيعاب' : 'Ingestion agent'}
          </div>
          {!ingesting && !done && (
            <Btn kind="soft" size="sm" onClick={() => setIngesting(true)}>
              {isAR ? '▸ شغّل الفهرسة' : '▸ Run ingestion'}
            </Btn>
          )}
          {done && <span className="text-[11px] font-semibold text-emerald-600 ltr">● indexed</span>}
        </div>
        {ingesting
          ? <AgentLog lines={lines} heading="ingestion.log" onDone={() => setDone(true)} />
          : <div className="terminal rounded-xl p-4 ltr opacity-60">
              <span className="dim">▸ </span><span className="lab">[IngestionAgent]</span> idle. press <span className="ok">▸ Run ingestion</span> to build the knowledge base.
            </div>}
      </div>
    </div>
  );
}
