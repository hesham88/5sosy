'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChromeLayout } from '../shared/Chrome';
import { useApp } from '../shared/Providers';
import { Btn, Card, SubjectChip } from '../shared/atoms';

export default function SessionScreen() {
  const { isAR, locale } = useApp();
  const router = useRouter();
  const [progress] = useState(0.35);
  const [explained, setExplained] = useState<Record<string, boolean>>({});
  const [chatMsgs, setChatMsgs] = useState([
    { who: '5sosy', ar: 'أنا معاك. سألني أي حاجة عن قانون بويل.', en: "I'm here. Ask me anything about Boyle's Law." }
  ]);
  const [chatInput, setChatInput] = useState('');

  const toggleExplain = (id: string) => setExplained((e) => ({ ...e, [id]: !e[id] }));

  const sendChat = () => {
    if (!chatInput.trim()) return;
    const user = chatInput;
    setChatMsgs((m) => [...m, { who: 'me', ar: user, en: user }]);
    setChatInput('');
    setTimeout(() => {
      setChatMsgs((m) => [...m, {
        who: '5sosy',
        ar: 'تمام، لما الحجم بيقل والحرارة ثابتة، الضغط بيزيد — ده اللي بيقوله قانون بويل.',
        en: "Right — when volume drops at constant temperature, pressure rises. That's Boyle's law."
      }]);
    }, 700);
  };

  return (
    <ChromeLayout>
      <div className="border-b border-slate-200 bg-white px-5 lg:px-8 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => router.push(`/${locale}/home`)} className="text-slate-400 hover:text-slate-700 text-[18px]">{isAR ? '→' : '←'}</button>
        <div className="flex items-center gap-1.5 text-[12.5px] text-slate-500">
          <SubjectChip id="physics" size="sm" />
          <span className="text-slate-300">/</span>
          <span>{isAR ? 'الفصل ٤ — الغازات' : 'Ch.4 — Gases'}</span>
          <span className="text-slate-300">/</span>
          <span className="text-slate-900 font-semibold">{isAR ? 'قانون بويل' : "Boyle's Law"}</span>
        </div>
        <div className="ms-auto flex items-center gap-3">
          <div className="hidden sm:block w-40">
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-sky-500 bar-fill" style={{ width: `${progress * 100}%` }} />
            </div>
            <div className="text-[10.5px] text-slate-400 mt-0.5 ltr text-end">{Math.round(progress * 100)}%</div>
          </div>
          <Btn kind="outline" size="sm">⏸ {isAR ? 'إيقاف' : 'Pause'}</Btn>
        </div>
      </div>

      <div className="px-5 lg:px-8 py-6 grid lg:grid-cols-12 gap-6 max-w-[1400px]">
        <div className="lg:col-span-8 min-w-0">
          <div className="mb-4 flex items-center gap-2">
            <span className="text-[11px] font-bold text-sky-700 bg-sky-50 px-2 py-1 rounded">
              {isAR ? 'درس مولّد بالذكاء' : 'Smart lesson'}
            </span>
            <span className="text-[11px] text-slate-400">·</span>
            <span className="text-[11px] text-slate-500 ltr">~12 min read · adjusted to your level</span>
          </div>

          <h1 className="text-3xl lg:text-4xl font-extrabold text-slate-900 mb-3 leading-tight">
            {isAR ? 'قانون بويل وعلاقة الضغط بالحجم' : "Boyle's Law: Pressure & Volume"}
          </h1>
          <p className="text-slate-500 text-[14px] mb-6">
            {isAR ? 'لما الحرارة ثابتة، الغاز بيتصرف بطريقة منطقية جدًا. هنفكّك القانون خطوة بخطوة.'
                  : 'At constant temperature, gases behave in a very predictable way. Let’s unpack it step by step.'}
          </p>

          <Paragraph
            id="p1"
            explained={!!explained.p1}
            onToggle={() => toggleExplain('p1')}
            ar="الغاز عبارة عن جزيئات بتتحرك بسرعة في كل الاتجاهات. كل ما الحيز اللي بتتحرك فيه يقل، كل ما الجزيئات بتصطدم بجوانب الإناء أكتر — وده اللي بنحس بيه على شكل ضغط أعلى."
            en="A gas is a swarm of molecules moving in every direction. The smaller the space you trap them in, the more often they hit the container walls — and that's what we read as higher pressure."
            egAr="تخيّل عربية ملياااانة ركاب. كل ما العربية تصغر، الزحمة تزيد ⇒ الناس تخبط في الباب أكتر — ده الضغط!"
            egEn="Imagine a packed minibus — the smaller it gets, the more people slam against the doors. That bang-bang on the door? That's pressure."
          />

          <div className="my-6">
            <FigurePlaceholder ar="رسم: غاز محبوس في مكبس عند ٣ أحجام مختلفة" en="Figure: gas trapped in a piston at 3 different volumes" />
          </div>

          <h2 className="text-xl font-extrabold text-slate-900 mt-8 mb-3">
            {isAR ? 'الصيغة الرياضية' : 'The mathematical form'}
          </h2>

          <div className="bg-gradient-to-br from-sky-50 to-white border border-sky-200 rounded-xl p-6 my-4">
            <div className="text-[11.5px] font-bold uppercase tracking-wider text-sky-700 mb-3">
              {isAR ? 'قانون بويل' : "Boyle's law"}
            </div>
            <div className="eq text-3xl text-slate-900 ltr">
              P<sub>1</sub> · V<sub>1</sub>  =  P<sub>2</sub> · V<sub>2</sub>
            </div>
            <div className="mt-4 grid sm:grid-cols-2 gap-3 text-[13px]">
              <div className="flex gap-2"><span className="eq ltr text-sky-600">P</span><span className="text-slate-600">{isAR ? 'الضغط' : 'Pressure (atm, Pa)'}</span></div>
              <div className="flex gap-2"><span className="eq ltr text-sky-600">V</span><span className="text-slate-600">{isAR ? 'الحجم' : 'Volume (L, m³)'}</span></div>
              <div className="flex gap-2"><span className="text-slate-400">∝</span><span className="text-slate-600">{isAR ? 'علاقة عكسية' : 'inverse proportion'}</span></div>
              <div className="flex gap-2"><span className="text-slate-400">T</span><span className="text-slate-600">{isAR ? 'الحرارة ثابتة' : 'temperature held constant'}</span></div>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
            <div className="text-2xl shrink-0">💡</div>
            <div className="text-[13.5px] text-amber-900">
              <div className="font-bold mb-1">{isAR ? 'فخ شائع' : 'Common pitfall'}</div>
              {isAR
                ? 'لما تستخرج T من PV=nRT لازم تستخدم كلفن (K) مش سيليزيوس. ده اللي وقعت فيه آخر اختبار.'
                : 'When you isolate T from PV=nRT, you must use Kelvin (K), not Celsius. This is exactly where you slipped last test.'}
            </div>
          </div>

          <div className="mt-8 bg-slate-900 rounded-2xl p-6 flex items-center gap-4 text-white">
            <div className="w-14 h-14 rounded-2xl bg-sky-500/20 grid place-items-center text-3xl">🧠</div>
            <div className="flex-1">
              <div className="font-extrabold text-[17px]">{isAR ? 'جاهز لاختبار سريع؟' : 'Ready for a quick check?'}</div>
              <div className="text-slate-300 text-[13px]">{isAR ? '٣ أسئلة، أقل من دقيقتين' : '3 questions, under 2 minutes'}</div>
            </div>
            <Btn kind="primary" size="lg" onClick={() => router.push(`/${locale}/quiz`)}>
              {isAR ? 'يلا نختبر' : 'Take the check'} <span className="ltr">→</span>
            </Btn>
          </div>
        </div>

        <div className="lg:col-span-4 space-y-5 min-w-0">
          <AudioSummary />
          <AskChat msgs={chatMsgs} input={chatInput} setInput={setChatInput} send={sendChat} />
          <KeyConceptsCard />
        </div>
      </div>
    </ChromeLayout>
  );
}

function Paragraph({ id, ar, en, egAr, egEn, explained, onToggle }: {
  id: string; ar: string; en: string; egAr: string; egEn: string; explained: boolean; onToggle: () => void;
}) {
  const { isAR } = useApp();
  const body = explained ? (isAR ? egAr : egEn) : (isAR ? ar : en);
  return (
    <div id={id} className="relative group mb-4">
      <p className={`text-[15.5px] leading-[1.85] text-slate-700 ${explained ? 'bg-amber-50/60 border-s-2 border-amber-400 ps-4 py-1 rounded-e-md' : ''}`}>
        {body}
      </p>
      <button onClick={onToggle}
        className={`mt-2 inline-flex items-center gap-1.5 text-[11px] font-bold rounded-full px-2.5 py-1 transition
          ${explained ? 'bg-amber-500 text-white' : 'bg-white text-amber-700 border border-amber-300 hover:bg-amber-50'}`}>
        <span>🇪🇬</span>
        <span>{explained ? (isAR ? 'رجّع الفصحى' : 'Show formal') : (isAR ? 'افهمها بالمصري' : 'Explain in Egyptian')}</span>
      </button>
    </div>
  );
}

function FigurePlaceholder({ ar, en }: { ar: string; en: string }) {
  const { isAR } = useApp();
  return (
    <div className="relative rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
      <svg viewBox="0 0 600 200" className="w-full block">
        <defs>
          <pattern id="diag" patternUnits="userSpaceOnUse" width="14" height="14" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="14" stroke="#e2e8f0" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="600" height="200" fill="url(#diag)" />
        {[[80, 60, 100], [240, 90, 70], [400, 130, 40]].map(([x, h, v], i) => (
          <g key={i}>
            <rect x={x} y={200 - h - 20} width="100" height={h} rx="4" fill="#fff" stroke="#94a3b8" strokeWidth="1.5" />
            <rect x={x} y={200 - v - 20} width="100" height="6" fill="#0284c7" />
            {[...Array(10)].map((_, j) => (
              <circle key={j}
                cx={x + 10 + (j * 9) % 80}
                cy={200 - 20 - 4 - (j * 7) % (v - 8)}
                r="2.5" fill="#0ea5e9" opacity=".7" />
            ))}
            <text x={x + 50} y={200 - 5} fontFamily="JetBrains Mono" fontSize="10" fill="#64748b" textAnchor="middle">V{i + 1}</text>
          </g>
        ))}
      </svg>
      <div className="px-4 py-2.5 bg-white border-t border-slate-200 text-[11.5px] text-slate-500 font-mono ltr">
        ▸ figure · {isAR ? ar : en}
      </div>
    </div>
  );
}

function AudioSummary() {
  const { isAR } = useApp();
  const [playing, setPlaying] = useState(false);
  return (
    <Card className="overflow-hidden">
      <div className="px-4 pt-4 pb-3 flex items-center gap-2">
        <span className="font-extrabold text-slate-900 text-[14px]">🎧 {isAR ? 'ملخص صوتي' : 'Audio summary'}</span>
        <span className="ms-auto text-[10.5px] text-slate-400 ltr">2:18</span>
      </div>
      <div className="bg-slate-900 p-4 flex items-center gap-3">
        <button onClick={() => setPlaying((p) => !p)}
          className="w-11 h-11 rounded-full bg-sky-500 hover:bg-sky-400 text-white grid place-items-center text-[14px] shadow-lg shadow-sky-900/40">
          <span className="ltr">{playing ? '❚❚' : '▶'}</span>
        </button>
        <div className="flex-1 flex items-end h-8 gap-[1px]">
          {Array.from({ length: 32 }).map((_, i) => (
            <span key={i} className="wave-bar"
              style={{
                animationDelay: `${(i * 60) % 700}ms`,
                animationPlayState: playing ? 'running' : 'paused',
                height: playing ? undefined : `${6 + (i % 8) * 2}px`,
                background: i > 16 ? '#0ea5e9' : '#38bdf8'
              }} />
          ))}
        </div>
      </div>
      <div className="px-4 py-3 text-[11.5px] text-slate-500 flex items-center gap-2">
        <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold ltr">EG-AR voice</span>
        <span>·</span>
        <span>{isAR ? 'مولّد ٢٠٢٦' : 'Generated 2026'}</span>
      </div>
    </Card>
  );
}

function AskChat({ msgs, input, setInput, send }: {
  msgs: { who: string; ar: string; en: string }[]; input: string; setInput: (v: string) => void; send: () => void;
}) {
  const { isAR } = useApp();
  return (
    <Card>
      <div className="px-4 pt-4 pb-3 flex items-center gap-2">
        <span className="font-extrabold text-slate-900 text-[14px]">💬 {isAR ? 'اسأل خصوصي' : 'Ask 5sosy'}</span>
        <span className="ms-auto inline-flex items-center gap-1 text-[10.5px] font-semibold text-emerald-600">
          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />{isAR ? 'متصل' : 'live'}
        </span>
      </div>
      <div className="px-4 pb-3 space-y-2 max-h-[180px] overflow-y-auto slim">
        {msgs.map((m, i) => {
          const me = m.who === 'me';
          return (
            <div key={i} className={`flex ${me ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-[13px] ${me ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-800'}`}>
                {isAR ? m.ar : m.en}
              </div>
            </div>
          );
        })}
      </div>
      <div className="px-3 pb-3 flex gap-2">
        <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder={isAR ? 'اسأل أي حاجة...' : 'Ask anything…'}
          className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-sky-400" />
        <button onClick={send} className="w-9 h-9 rounded-lg bg-sky-600 hover:bg-sky-700 text-white grid place-items-center">
          <span className="ltr text-[14px]">↑</span>
        </button>
      </div>
    </Card>
  );
}

function KeyConceptsCard() {
  const { isAR } = useApp();
  const items = [
    { ar: 'العلاقة العكسية بين P و V', en: 'Inverse P–V relationship', mastery: .82 },
    { ar: 'صياغة P₁V₁ = P₂V₂',         en: 'Form P₁V₁ = P₂V₂',         mastery: .91 },
    { ar: 'تحويل الحرارة لكلفن',       en: 'Convert °C → K',           mastery: .35 },
    { ar: 'استخراج T من PV=nRT',       en: 'Isolating T from PV=nRT',  mastery: .28 }
  ];
  return (
    <Card className="p-4">
      <div className="font-extrabold text-slate-900 text-[14px] mb-3 flex items-center gap-2">
        🧩 {isAR ? 'مفاهيم الدرس' : 'Key concepts'}
      </div>
      <div className="space-y-2.5">
        {items.map((it, i) => (
          <div key={i}>
            <div className="flex items-center gap-2 text-[12px]">
              <span className="text-slate-700 flex-1 min-w-0 truncate">{isAR ? it.ar : it.en}</span>
              <span className="ltr text-slate-400 text-[10.5px]">{Math.round(it.mastery * 100)}%</span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full mt-1">
              <div className={`h-full rounded-full ${it.mastery > .7 ? 'bg-emerald-500' : it.mastery > .4 ? 'bg-amber-500' : 'bg-rose-500'}`}
                style={{ width: `${it.mastery * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
