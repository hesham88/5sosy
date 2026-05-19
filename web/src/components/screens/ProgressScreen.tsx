'use client';

import { useMemo } from 'react';
import { ChromeLayout } from '../shared/Chrome';
import { useApp } from '../shared/Providers';
import { Btn, Card, SubjectChip } from '../shared/atoms';
import { SUBJECT_META, HUE } from '@/constants/subjects';
import type { SubjectId } from '@/lib/types';

export default function ProgressScreen() {
  const { isAR } = useApp();
  return (
    <ChromeLayout>
      <div className="px-5 lg:px-10 py-6 lg:py-8 max-w-[1400px]">
        <div className="flex items-end justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl lg:text-3xl font-extrabold text-slate-900">{isAR ? 'تقدمك' : 'Your progress'}</h1>
            <p className="text-slate-500 mt-1 text-[14px]">
              {isAR ? 'صورة كاملة من ٥ وكلاء بيرصدوا كل تفصيلة في مذاكرتك.'
                    : 'A full picture from 5 agents tracking everything you study.'}
            </p>
          </div>
          <div className="hidden lg:flex items-center gap-2">
            <Btn kind="outline" size="sm">📤 {isAR ? 'مشاركة' : 'Share'}</Btn>
            <Btn kind="primary" size="sm">📄 {isAR ? 'تقرير ولي الأمر' : 'Parent summary'}</Btn>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 space-y-6 min-w-0">
            <StatsRow />
            <HeatmapCard />
            <ConceptGraphCard />
          </div>
          <div className="lg:col-span-4 space-y-6 min-w-0">
            <MasteryCard />
            <ParentSummaryCard />
            <BadgesCard />
          </div>
        </div>
      </div>
    </ChromeLayout>
  );
}

function StatsRow() {
  const { isAR, streak, xp } = useApp();
  const stats = [
    { k: isAR ? 'أيام متواصلة' : 'Day streak',        v: streak,               sub: '🔥',   accent: 'text-amber-600' },
    { k: isAR ? 'XP إجمالي'    : 'Total XP',          v: xp.toLocaleString(),  sub: '✦',   accent: 'text-sky-600' },
    { k: isAR ? 'ساعات مذاكرة' : 'Study hours',       v: 38,                   sub: '⏱️',   accent: 'text-slate-900' },
    { k: isAR ? 'مفاهيم مُتقنة' : 'Concepts mastered', v: 47,                   sub: '🧩',   accent: 'text-emerald-600' }
  ];
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {stats.map((s, i) => (
        <Card key={i} className="px-4 py-4">
          <div className="flex items-start gap-2">
            <div>
              <div className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">{s.k}</div>
              <div className={`text-2xl font-extrabold ltr mt-1 ${s.accent}`}>{s.v}</div>
            </div>
            <div className="ms-auto text-2xl opacity-60">{s.sub}</div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function HeatmapCard() {
  const { isAR } = useApp();
  const cols = 26;
  const data = useMemo(() => {
    const out: number[][] = [];
    let seed = 1;
    for (let c = 0; c < cols; c++) {
      const week: number[] = [];
      for (let r = 0; r < 7; r++) {
        seed = (seed * 9301 + 49297) % 233280;
        const r0 = seed / 233280;
        const recency = c / cols;
        let v = r0 * (0.55 + recency * 0.4);
        if (r === 5 || r === 6) v *= 0.65;
        let level = v > 0.85 ? 4 : v > 0.65 ? 3 : v > 0.45 ? 2 : v > 0.25 ? 1 : 0;
        if (c === cols - 1 && r === 3) level = 4;
        week.push(level);
      }
      out.push(week);
    }
    return out;
  }, []);
  const totalDays = data.flat().filter((v) => v > 0).length;

  const months = isAR ? ['ينا','فبر','مار','أبر','ماي','يون'] : ['Dec','Jan','Feb','Mar','Apr','May'];

  return (
    <Card className="p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="font-extrabold text-slate-900 text-[15px]">{isAR ? 'خريطة مذاكرتك' : 'Study heatmap'}</div>
        <div className="text-[12px] text-slate-500">
          {isAR ? `${totalDays} يوم نشط آخر ٦ شهور` : `${totalDays} active days in last 6 months`}
        </div>
        <div className="ms-auto flex items-center gap-1.5 text-[10.5px] text-slate-500 ltr">
          <span>less</span>
          {[0,1,2,3,4].map((l) => <span key={l} className={`hm${l} w-3 h-3 rounded-sm`} />)}
          <span>more</span>
        </div>
      </div>

      <div className="overflow-x-auto slim ltr">
        <div className="flex gap-[3px] min-w-min">
          {data.map((week, c) => (
            <div key={c} className="flex flex-col gap-[3px]">
              {c % 4 === 0 ? (
                <div className="text-[9.5px] text-slate-400 h-3 -mt-3 -mb-0">{months[Math.floor(c / 4)] ?? ''}</div>
              ) : <div className="h-0" />}
              {week.map((v, r) => (
                <div key={r} title={`level ${v}`} className={`hm${v} w-3 h-3 rounded-sm hover:ring-2 hover:ring-sky-400 transition cursor-pointer`} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function ConceptGraphCard() {
  const { isAR } = useApp();
  const nodes = [
    { id: 'pv',     x:  90, y:  60, ar: 'P·V=k',      en: 'P·V=k',        status: 'mastered' as const },
    { id: 'boyle',  x: 230, y:  60, ar: 'بويل',        en: 'Boyle',         status: 'mastered' as const },
    { id: 'charles',x: 230, y: 180, ar: 'شارل',        en: 'Charles',       status: 'progress' as const },
    { id: 'gay',    x: 230, y: 300, ar: 'جاي-لوساك',   en: 'Gay-Lussac',    status: 'progress' as const },
    { id: 'ideal',  x: 410, y: 180, ar: 'PV=nRT',     en: 'PV=nRT',        status: 'weak'     as const },
    { id: 'kelvin', x: 580, y:  80, ar: 'كلفن',        en: 'Kelvin scale',  status: 'mastered' as const },
    { id: 'moles',  x: 580, y: 180, ar: 'المولات n',   en: 'Moles n',       status: 'progress' as const },
    { id: 'isolate',x: 580, y: 300, ar: 'عزل المتغير T',en: 'Isolate T',     status: 'weak'     as const },
    { id: 'thermo', x: 750, y: 180, ar: 'ترموديناميكا',en: 'Thermo',        status: 'weak'     as const }
  ];
  const edges: [string, string][] = [
    ['pv','boyle'],['boyle','ideal'],['charles','ideal'],['gay','ideal'],
    ['ideal','kelvin'],['ideal','moles'],['ideal','isolate'],['isolate','thermo'],
    ['kelvin','thermo'],['moles','thermo']
  ];
  const COLOR = { mastered: '#0284c7', progress: '#f59e0b', weak: '#64748b' };
  const FILL  = { mastered: '#e0f2fe', progress: '#fef3c7', weak: '#e2e8f0' };
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));

  return (
    <Card className="p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="font-extrabold text-slate-900 text-[15px]">{isAR ? 'خريطة المفاهيم — فيزياء' : 'Concept graph — Physics'}</div>
        <div className="ms-auto flex items-center gap-3 text-[11.5px]">
          <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-sky-600" /> {isAR ? 'مُتقن' : 'mastered'}</span>
          <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> {isAR ? 'متوسط' : 'in progress'}</span>
          <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-slate-400" /> {isAR ? 'ضعيف' : 'weak'}</span>
        </div>
      </div>

      <div className="overflow-x-auto slim ltr">
        <svg viewBox="0 0 880 380" className="w-full h-[300px] min-w-[600px]">
          <defs>
            <marker id="arrow" markerWidth="6" markerHeight="6" refX="6" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 z" fill="#cbd5e1" />
            </marker>
          </defs>
          {edges.map(([a, b], i) => {
            const A = byId[a]; const B = byId[b];
            return <line key={i} x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke="#cbd5e1" strokeWidth="1.5" markerEnd="url(#arrow)" />;
          })}
          {nodes.map((n) => (
            <g key={n.id}>
              <circle cx={n.x} cy={n.y} r="34" fill={FILL[n.status]} stroke={COLOR[n.status]} strokeWidth="2" />
              <text x={n.x} y={n.y + 4} textAnchor="middle" fontWeight="700" fontSize="11" fill="#0f172a">
                {n.en}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </Card>
  );
}

function MasteryCard() {
  const { isAR } = useApp();
  const subjects: { id: SubjectId; v: number }[] = [
    { id: 'physics',   v: 0.72 },
    { id: 'chemistry', v: 0.61 },
    { id: 'math',      v: 0.83 },
    { id: 'biology',   v: 0.45 },
    { id: 'arabic',    v: 0.68 }
  ];
  return (
    <Card className="p-5">
      <div className="font-extrabold text-slate-900 text-[15px] mb-4">{isAR ? 'إتقان المواد' : 'Per-subject mastery'}</div>
      <div className="space-y-3.5">
        {subjects.map((s) => {
          const m = SUBJECT_META[s.id];
          const pct = Math.round(s.v * 100);
          return (
            <div key={s.id}>
              <div className="flex items-center gap-2 mb-1.5">
                <SubjectChip id={s.id} size="sm" />
                <span className="ms-auto ltr font-bold text-[13px] tabular-nums text-slate-800">{pct}%</span>
              </div>
              <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div className={`h-full bar-fill ${HUE[m.hue].dot}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function ParentSummaryCard() {
  const { isAR } = useApp();
  return (
    <Card className="p-5 bg-gradient-to-br from-amber-50 to-white border-amber-200">
      <div className="flex items-start gap-3">
        <div className="text-3xl">📄</div>
        <div>
          <div className="font-extrabold text-slate-900 text-[15px]">{isAR ? 'ملخص ولي الأمر' : 'Parent summary'}</div>
          <div className="text-[12.5px] text-slate-600 mt-0.5">{isAR ? 'تقرير PDF لأسبوع كامل، جاهز للإرسال.' : 'Weekly PDF report, ready to share.'}</div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="bg-white rounded-lg p-2 border border-amber-100">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{isAR ? 'ساعات' : 'Hours'}</div>
          <div className="font-extrabold ltr text-slate-900">9.4</div>
        </div>
        <div className="bg-white rounded-lg p-2 border border-amber-100">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{isAR ? 'اختبارات' : 'Quizzes'}</div>
          <div className="font-extrabold ltr text-slate-900">7</div>
        </div>
        <div className="bg-white rounded-lg p-2 border border-amber-100">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{isAR ? 'متوسط' : 'Avg'}</div>
          <div className="font-extrabold ltr text-emerald-600">81%</div>
        </div>
      </div>
      <Btn kind="amber" className="w-full mt-4">📥 {isAR ? 'تحميل PDF' : 'Download PDF'}</Btn>
    </Card>
  );
}

function BadgesCard() {
  const { isAR } = useApp();
  const badges = [
    { icon: '🔥', ar: 'سلسلة أسبوع', en: 'Week streak',    earned: true },
    { icon: '🧠', ar: '٥٠ سؤال',      en: '50 questions',   earned: true },
    { icon: '🎤', ar: 'شفهي أول',     en: 'First oral',     earned: true },
    { icon: '⚡',  ar: 'حلّ سريع',    en: 'Speed solver',   earned: false },
    { icon: '🏆', ar: 'إتقان فصل',   en: 'Chapter mastery', earned: false },
    { icon: '🌙', ar: 'بومة ليل',     en: 'Night owl',      earned: false }
  ];
  return (
    <Card className="p-5">
      <div className="font-extrabold text-slate-900 text-[15px] mb-4">{isAR ? 'شاراتك' : 'Badges'}</div>
      <div className="grid grid-cols-3 gap-2">
        {badges.map((b, i) => (
          <div key={i} className={`aspect-square rounded-xl grid place-items-center text-2xl border-2
            ${b.earned ? 'bg-amber-50 border-amber-300' : 'bg-slate-50 border-slate-200 opacity-40 grayscale'}`}
            title={isAR ? b.ar : b.en}>
            {b.icon}
          </div>
        ))}
      </div>
    </Card>
  );
}
