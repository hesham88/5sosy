
/* ━━━━━━━━━━━━━━━ shared.jsx ━━━━━━━━━━━━━━━ */
/* shared.jsx — i18n, layout chrome, agent log, small UI atoms */

const { useState, useEffect, useRef, useCallback, useMemo, createContext, useContext } = React;

/* ─────────────────────────────  i18n  ───────────────────────────── */
const STRINGS = {
  ar: {
    appName: '٥سوسي',
    appSub: 'خصوصيك الذكي',
    nav: {
      home: 'الرئيسية', subjects: 'المواد', plan: 'خطة اليوم',
      practice: 'تمرين', oral: 'شفهي', progress: 'تقدمك', settings: 'الإعدادات'
    },
    cta: { start: 'ابدأ الآن', next: 'التالي', back: 'رجوع', save: 'حفظ', finish: 'إنهاء', skip: 'تخطّي' },
    home: {
      greet: 'أهلاً يوسف 👋',
      sub: 'جاهز نذاكر إيه النهاردة؟',
      intentPh: 'قولّي إيه اللي محتاج تذاكره النهاردة...',
      examples: [
        'اختبار فيزياء بعد ٤٨ ساعة',
        'مش فاهم قانون الغازات',
        'راجع الفصل التاني تاريخ',
        'كيمياء — التحليل الكمي'
      ],
      plan: 'خطة النهاردة',
      planSub: 'مقترحة من المنسّق بناءً على هدفك',
      weak: 'مفاهيم تحتاج مراجعة',
      streak: 'سلسلتك',
      streakDay: 'يوم متواصل',
      xp: 'نقطة',
      next: 'الاختبارات القادمة',
      activity: 'نشاط 5sosy'
    },
  },
  en: {
    appName: '5sosy',
    appSub: 'Your AI tutor',
    nav: {
      home: 'Home', subjects: 'Subjects', plan: 'Plan',
      practice: 'Practice', oral: 'Oral', progress: 'Progress', settings: 'Settings'
    },
    cta: { start: 'Get started', next: 'Next', back: 'Back', save: 'Save', finish: 'Finish', skip: 'Skip' },
    home: {
      greet: 'Hi Youssef 👋',
      sub: "What are we studying today?",
      intentPh: 'Tell me what you need to study today…',
      examples: [
        'Physics exam in 48 hours',
        "I don't get gas laws",
        'Review history chapter 2',
        'Chemistry — quantitative analysis'
      ],
      plan: "Today's plan",
      planSub: 'Built by the planner from your goal',
      weak: 'Concepts to revisit',
      streak: 'Streak',
      streakDay: 'days in a row',
      xp: 'XP',
      next: 'Upcoming exams',
      activity: '5sosy activity'
    },
  }
};

/* ─────────────────────────────  App context  ───────────────────────────── */
const AppCtx = createContext(null);
const useApp = () => useContext(AppCtx);

function AppProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem('5sosy.lang') || 'ar');
  const [route, setRoute] = useState(() => (location.hash.replace('#','') || 'onboarding'));
  const [streak, setStreak] = useState(() => Number(localStorage.getItem('5sosy.streak') || 7));
  const [xp, setXp] = useState(() => Number(localStorage.getItem('5sosy.xp') || 1240));
  const [completedSession, setCompletedSession] = useState(false);
  const [pulseStreak, setPulseStreak] = useState(false);

  useEffect(() => {
    const onHash = () => setRoute(location.hash.replace('#','') || 'onboarding');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    localStorage.setItem('5sosy.lang', lang);
  }, [lang]);

  useEffect(() => { localStorage.setItem('5sosy.streak', String(streak)); }, [streak]);
  useEffect(() => { localStorage.setItem('5sosy.xp', String(xp)); }, [xp]);

  const t = STRINGS[lang];
  const isAR = lang === 'ar';

  const go = (r) => { location.hash = r; };

  const bumpStreak = (n = 50) => {
    setXp(x => x + n);
    setPulseStreak(true);
    setTimeout(() => setPulseStreak(false), 1400);
  };

  return (
    <AppCtx.Provider value={{
      lang, setLang, isAR, t,
      route, go,
      streak, setStreak, xp, setXp, bumpStreak, pulseStreak,
      completedSession, setCompletedSession
    }}>
      {children}
    </AppCtx.Provider>
  );
}

/* ─────────────────────────────  Logo  ───────────────────────────── */
function Logo({ size = 36 }) {
  return (
    <div className="flex items-center gap-2.5">
      <div
        className="relative grid place-items-center rounded-2xl text-white font-extrabold shadow-md"
        style={{
          width: size, height: size,
          background: 'linear-gradient(135deg,#0ea5e9 0%,#0284c7 60%,#0c4a6e 100%)'
        }}
      >
        <span className="ltr" style={{ fontSize: size * 0.45 }}>5</span>
        <span className="absolute -bottom-1 -end-1 grid place-items-center bg-amber-400 rounded-full"
              style={{ width: size*0.4, height: size*0.4, fontSize: size*0.22 }}>
          📖
        </span>
      </div>
    </div>
  );
}

/* ─────────────────────────────  Sidebar  ───────────────────────────── */
const NAV_ITEMS = [
  { id: 'home',     icon: '🏠' },
  { id: 'subjects', icon: '📚' },
  { id: 'plan',     icon: '🗓️' },
  { id: 'practice', icon: '🧠' },
  { id: 'oral',     icon: '🎤' },
  { id: 'progress', icon: '📈' },
  { id: 'settings', icon: '⚙️' },
];

function Sidebar() {
  const { route, go, t, isAR, lang, setLang } = useApp();
  const activeKey = route === 'session' ? 'plan'
                  : route === 'quiz' ? 'practice'
                  : route;

  // map nav ids to actual routes (subjects/plan stub → home)
  const navTo = (id) => {
    if (id === 'subjects' || id === 'plan') return go('home');
    if (id === 'practice') return go('quiz');
    go(id);
  };

  return (
    <aside className="hidden lg:flex flex-col w-[232px] shrink-0 bg-white border-e border-slate-200 h-screen sticky top-0">
      <div className="px-5 py-5 flex items-center gap-2.5">
        <Logo size={36} />
        <div>
          <div className="font-extrabold text-slate-900 text-[17px] leading-none">{t.appName}</div>
          <div className="text-[11px] text-slate-500 mt-1">{t.appSub}</div>
        </div>
      </div>

      <nav className="px-3 py-2 flex-1">
        {NAV_ITEMS.map(item => {
          const active = activeKey === item.id;
          return (
            <button key={item.id}
              onClick={() => navTo(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 my-0.5 rounded-lg text-[14px] font-medium transition
                ${active
                  ? 'bg-sky-50 text-sky-700 shadow-sm'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
              <span className="text-[17px] leading-none">{item.icon}</span>
              <span>{t.nav[item.id]}</span>
              {active && <span className="ms-auto w-1.5 h-1.5 rounded-full bg-sky-500" />}
            </button>
          );
        })}
      </nav>

      <div className="px-3 pb-3">
        <button
          onClick={() => setLang(isAR ? 'en' : 'ar')}
          className="w-full flex items-center justify-center gap-2 text-[12px] font-semibold text-slate-500 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 rounded-lg py-2 transition">
          <span>🌐</span>
          <span className="ltr">{isAR ? 'English' : 'العربية'}</span>
        </button>
      </div>

      <div className="border-t border-slate-200 px-4 py-3 flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-300 to-amber-500 grid place-items-center text-white font-bold text-sm">ي</div>
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-slate-900 truncate">{isAR ? 'يوسف الشريف' : 'Youssef Sherif'}</div>
          <div className="text-[11px] text-slate-500 truncate">{isAR ? '٣ث علمي علوم' : 'G12 Science'}</div>
        </div>
      </div>
    </aside>
  );
}

/* ─────────────────────────────  Top bar (mobile)  ───────────────────────────── */
function MobileBar() {
  const { route, go, t, isAR, lang, setLang } = useApp();
  return (
    <div className="lg:hidden sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-slate-200 px-4 py-3 flex items-center gap-3">
      <Logo size={32} />
      <div className="font-extrabold text-slate-900">{t.appName}</div>
      <div className="ms-auto flex items-center gap-2">
        <button onClick={() => setLang(isAR ? 'en' : 'ar')}
          className="text-[12px] font-semibold text-slate-600 bg-slate-100 rounded-lg px-2.5 py-1.5">
          {isAR ? 'EN' : 'ع'}
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────  AgentLog (typewriter)  ───────────────────────────── */
/**
 * lines: [{ agent, text, status?: 'ok'|'warn'|'info', delay? }]
 */
function AgentLog({ lines, speed = 18, onDone, height = 'auto', heading }) {
  const [shown, setShown] = useState([]);
  const [typing, setTyping] = useState(true);
  const lineIdx = useRef(0);
  const charIdx = useRef(0);

  useEffect(() => {
    setShown([]); lineIdx.current = 0; charIdx.current = 0; setTyping(true);
    let raf, timer;
    const tick = () => {
      const i = lineIdx.current;
      if (i >= lines.length) { setTyping(false); onDone && onDone(); return; }
      const ln = lines[i];
      const full = ln.text;
      charIdx.current += 1;
      const partial = full.slice(0, charIdx.current);
      setShown(prev => {
        const next = prev.slice();
        next[i] = { ...ln, partial };
        return next;
      });
      if (charIdx.current >= full.length) {
        lineIdx.current += 1;
        charIdx.current = 0;
        timer = setTimeout(tick, ln.delay ?? 220);
      } else {
        timer = setTimeout(tick, speed);
      }
    };
    timer = setTimeout(tick, 200);
    return () => { clearTimeout(timer); cancelAnimationFrame(raf); };
  }, [lines]);

  return (
    <div className="terminal rounded-xl p-4 ltr" style={{ height }}>
      {heading && (
        <div className="flex items-center gap-2 pb-2 mb-2 border-b border-slate-700/60">
          <span className="w-2 h-2 rounded-full bg-rose-400" />
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span className="dim ms-2">{heading}</span>
        </div>
      )}
      {shown.map((ln, i) => {
        const isLast = i === shown.length - 1 && typing;
        const cls = ln.status === 'ok' ? 'ok' : ln.status === 'warn' ? 'warn' : '';
        return (
          <div key={i} className={`whitespace-pre-wrap ${isLast ? 'tw-cursor' : ''}`}>
            <span className="dim">▸ </span>
            <span className="lab">[{ln.agent}]</span>
            <span className={cls}> {ln.partial}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────  Ring progress (concept confidence)  ───────────────────────────── */
function Ring({ value = 0.4, size = 44, stroke = 5, color }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  const dash = c * v;
  const auto = v < .4 ? '#ef4444' : v < .7 ? '#f59e0b' : '#22c55e';
  return (
    <svg className="ring-svg" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle className="track" cx={size/2} cy={size/2} r={r} stroke="#e2e8f0" strokeWidth={stroke} fill="none" />
      <circle className="fill" cx={size/2} cy={size/2} r={r}
              stroke={color || auto} strokeWidth={stroke} fill="none"
              strokeDasharray={`${dash} ${c - dash}`}
              transform={`rotate(-90 ${size/2} ${size/2})`} />
    </svg>
  );
}

/* ─────────────────────────────  Button  ───────────────────────────── */
function Btn({ children, kind = 'primary', size = 'md', className = '', ...rest }) {
  const base = 'inline-flex items-center justify-center gap-2 font-semibold rounded-lg transition focus:outline-none focus:ring-2 focus:ring-sky-500/30 disabled:opacity-50';
  const sz = size === 'lg' ? 'px-5 py-3 text-[15px]'
           : size === 'sm' ? 'px-3 py-1.5 text-[12px]'
           : 'px-4 py-2.5 text-[13.5px]';
  const k = kind === 'primary' ? 'bg-sky-600 hover:bg-sky-700 text-white shadow-sm shadow-sky-600/20'
          : kind === 'amber'   ? 'bg-amber-500 hover:bg-amber-600 text-white'
          : kind === 'ghost'   ? 'text-slate-700 hover:bg-slate-100'
          : kind === 'danger'  ? 'bg-rose-600 hover:bg-rose-700 text-white'
          : kind === 'soft'    ? 'bg-sky-50 hover:bg-sky-100 text-sky-700'
          : 'bg-white border border-slate-200 hover:border-slate-300 text-slate-700';
  return <button className={`${base} ${sz} ${k} ${className}`} {...rest}>{children}</button>;
}

/* ─────────────────────────────  Card  ───────────────────────────── */
function Card({ children, className = '', as: As = 'div', lift = false, ...rest }) {
  return (
    <As className={`bg-white rounded-xl border border-slate-200 ${lift ? 'card-lift' : ''} ${className}`} {...rest}>
      {children}
    </As>
  );
}

/* ─────────────────────────────  Subject pill  ───────────────────────────── */
const SUBJECT_META = {
  physics:    { ar: 'فيزياء',     en: 'Physics',     hue: 'sky',    glyph: '🔬' },
  chemistry:  { ar: 'كيمياء',     en: 'Chemistry',   hue: 'violet', glyph: '⚗️' },
  biology:    { ar: 'أحياء',      en: 'Biology',     hue: 'emerald',glyph: '🧬' },
  arabic:     { ar: 'لغة عربية',  en: 'Arabic',      hue: 'amber',  glyph: '📜' },
  history:    { ar: 'تاريخ',      en: 'History',     hue: 'rose',   glyph: '🏛️' },
  english:    { ar: 'لغة انجليزية',en: 'English',    hue: 'indigo', glyph: '🇬🇧' },
  math:       { ar: 'رياضيات',    en: 'Math',        hue: 'cyan',   glyph: '∑'  },
  geology:    { ar: 'جيولوجيا',   en: 'Geology',     hue: 'stone',  glyph: '🪨' },
  philosophy: { ar: 'فلسفة',      en: 'Philosophy',  hue: 'fuchsia',glyph: '💭' },
  geography:  { ar: 'جغرافيا',    en: 'Geography',   hue: 'teal',   glyph: '🌍' },
};

const HUE = {
  sky:     { bg: 'bg-sky-50',     text: 'text-sky-700',     border: 'border-sky-200',     dot: 'bg-sky-500' },
  violet:  { bg: 'bg-violet-50',  text: 'text-violet-700',  border: 'border-violet-200',  dot: 'bg-violet-500' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  amber:   { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',   dot: 'bg-amber-500' },
  rose:    { bg: 'bg-rose-50',    text: 'text-rose-700',    border: 'border-rose-200',    dot: 'bg-rose-500' },
  indigo:  { bg: 'bg-indigo-50',  text: 'text-indigo-700',  border: 'border-indigo-200',  dot: 'bg-indigo-500' },
  cyan:    { bg: 'bg-cyan-50',    text: 'text-cyan-700',    border: 'border-cyan-200',    dot: 'bg-cyan-500' },
  stone:   { bg: 'bg-stone-50',   text: 'text-stone-700',   border: 'border-stone-200',   dot: 'bg-stone-500' },
  fuchsia: { bg: 'bg-fuchsia-50', text: 'text-fuchsia-700', border: 'border-fuchsia-200', dot: 'bg-fuchsia-500' },
  teal:    { bg: 'bg-teal-50',    text: 'text-teal-700',    border: 'border-teal-200',    dot: 'bg-teal-500' },
};

function SubjectChip({ id, size = 'md' }) {
  const { isAR } = useApp();
  const m = SUBJECT_META[id];
  if (!m) return null;
  const h = HUE[m.hue];
  const sz = size === 'sm' ? 'text-[11px] px-2 py-0.5' : 'text-[12px] px-2.5 py-1';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md font-semibold ${h.bg} ${h.text} ${sz}`}>
      <span>{m.glyph}</span>
      <span>{isAR ? m.ar : m.en}</span>
    </span>
  );
}

/* ─────────────────────────────  Layout wrapper for routed screens  ───────────────────────────── */
function ChromeLayout({ children }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col">
        <MobileBar />
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}

/* ─────────────────────────────  Confetti burst  ───────────────────────────── */
function Confetti({ show, count = 24 }) {
  const pieces = useMemo(() => {
    return Array.from({ length: count }).map((_, i) => ({
      left: Math.random() * 100,
      delay: Math.random() * 0.3,
      bg: ['#f59e0b','#0284c7','#ef4444','#22c55e','#a78bfa'][i % 5],
      rot: Math.random() * 360,
    }));
  }, [count]);
  if (!show) return null;
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {pieces.map((p, i) => (
        <span key={i} className="confetti" style={{
          left: `${p.left}%`,
          background: p.bg,
          animationDelay: `${p.delay}s`,
          transform: `rotate(${p.rot}deg)`,
          top: 0
        }} />
      ))}
    </div>
  );
}

/* ─────────────────────────────  Export  ───────────────────────────── */
Object.assign(window, {
  AppCtx, AppProvider, useApp,
  Logo, Sidebar, MobileBar, ChromeLayout,
  AgentLog, Ring, Btn, Card, SubjectChip, SUBJECT_META, HUE,
  Confetti, STRINGS
});


/* ━━━━━━━━━━━━━━━ onboarding.jsx ━━━━━━━━━━━━━━━ */
/* onboarding.jsx — 3-step wizard */

function Onboarding() {
  const { t, isAR, go } = useApp();
  const [step, setStep] = useState(1);
  const [grade, setGrade] = useState('g3');     // g1, g2, g3
  const [track, setTrack] = useState('sci_sci'); // sci_sci, sci_math, lit
  const [subjects, setSubjects] = useState(['physics','chemistry','math']);

  const GRADES = [
    { id: 'g1', ar: 'الصف الأول الثانوي', en: 'Grade 10' },
    { id: 'g2', ar: 'الصف الثاني الثانوي', en: 'Grade 11' },
    { id: 'g3', ar: 'الصف الثالث الثانوي', en: 'Grade 12 (Final)' },
  ];
  const TRACKS = [
    { id: 'sci_sci',  ar: 'علمي علوم',   en: 'Science — Bio',   glyph: '🧬', tint: 'emerald' },
    { id: 'sci_math', ar: 'علمي رياضة',  en: 'Science — Math',  glyph: '∑',  tint: 'sky' },
    { id: 'lit',      ar: 'أدبي',        en: 'Literature',      glyph: '📜', tint: 'amber' },
  ];

  const SUBJECTS_FOR_TRACK = {
    sci_sci:  ['physics','chemistry','biology','arabic','english','geology'],
    sci_math: ['physics','chemistry','math','arabic','english'],
    lit:      ['arabic','history','geography','philosophy','english']
  };

  const subjectList = SUBJECTS_FOR_TRACK[track];

  const toggleSubject = (id) => {
    setSubjects(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  };

  // when track changes, prune subjects
  useEffect(() => {
    setSubjects(s => s.filter(id => SUBJECTS_FOR_TRACK[track].includes(id)));
  }, [track]);

  const stepTitle = isAR
    ? ['', 'صفك ومسارك', 'موادك', 'كتبك']
    : ['', 'Grade & track', 'Your subjects', 'Textbooks'];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <div className="px-6 lg:px-10 py-5 flex items-center gap-3 border-b border-slate-200 bg-white">
        <Logo size={36} />
        <div>
          <div className="font-extrabold text-slate-900 text-[17px] leading-none">{t.appName}</div>
          <div className="text-[11px] text-slate-500 mt-1">{t.appSub}</div>
        </div>
        <div className="ms-auto">
          <Btn kind="ghost" size="sm" onClick={() => go('home')}>{t.cta.skip}</Btn>
        </div>
      </div>

      <div className="max-w-3xl w-full mx-auto px-6 lg:px-0 py-8 lg:py-14 flex-1">
        {/* Step progress */}
        <div className="flex items-center gap-3 mb-8">
          {[1,2,3].map(i => (
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

        <h1 className="text-2xl lg:text-3xl font-extrabold text-slate-900 mb-1.5">
          {stepTitle[step]}
        </h1>
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
                {GRADES.map(g => {
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
                {TRACKS.map(tr => {
                  const active = track === tr.id;
                  const h = HUE[tr.tint];
                  return (
                    <button key={tr.id} onClick={() => setTrack(tr.id)}
                      className={`text-start p-4 rounded-xl border-2 transition card-lift relative overflow-hidden
                        ${active ? `border-sky-600 ${h.bg}` : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                      <div className="text-3xl mb-3 leading-none">{tr.glyph}</div>
                      <div className="font-bold text-slate-900 text-[15px]">{isAR ? tr.ar : tr.en}</div>
                      <div className="text-[11.5px] text-slate-500 mt-1">
                        {{
                          sci_sci:  isAR ? 'فيزياء، كيمياء، أحياء' : 'Phys, Chem, Bio',
                          sci_math: isAR ? 'فيزياء، كيمياء، رياضة' : 'Phys, Chem, Math',
                          lit:      isAR ? 'تاريخ، جغرافيا، فلسفة' : 'History, Geo, Philosophy',
                        }[tr.id]}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <SubjectsStep subjects={subjects} list={subjectList} toggle={toggleSubject} />
        )}

        {step === 3 && (
          <TextbooksStep subjects={subjects} />
        )}

        <div className="flex items-center gap-3 mt-10">
          {step > 1 && <Btn kind="outline" onClick={() => setStep(step - 1)}>{t.cta.back}</Btn>}
          <div className="ms-auto" />
          {step < 3
            ? <Btn kind="primary" size="lg" onClick={() => setStep(step + 1)} disabled={step === 2 && subjects.length === 0}>
                {t.cta.next} {isAR ? '←' : '→'}
              </Btn>
            : <Btn kind="primary" size="lg" onClick={() => go('home')}>
                {t.cta.start} {isAR ? '←' : '→'}
              </Btn>}
        </div>
      </div>
    </div>
  );
}

function SubjectsStep({ subjects, list, toggle }) {
  const { isAR } = useApp();
  return (
    <div>
      <p className="text-[13px] text-slate-500 mb-4">
        {isAR ? 'اختار المواد اللي عاوز 5sosy يساعدك فيها' : 'Pick the subjects you want 5sosy to help with'}
      </p>
      <div className="flex flex-wrap gap-2.5">
        {list.map(id => {
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

function TextbooksStep({ subjects }) {
  const { isAR } = useApp();
  const [ingesting, setIngesting] = useState(false);
  const [done, setDone] = useState(false);

  const MOE = subjects.map(id => {
    const m = SUBJECT_META[id];
    const labels = {
      physics:   { ar: 'الفيزياء — الصف الثالث الثانوي ٢٠٢٥', en: 'Physics — G12 (2025)' },
      chemistry: { ar: 'الكيمياء — الصف الثالث الثانوي ٢٠٢٥', en: 'Chemistry — G12 (2025)' },
      biology:   { ar: 'الأحياء — الصف الثالث الثانوي ٢٠٢٥', en: 'Biology — G12 (2025)' },
      math:      { ar: 'الرياضيات البحتة — ٢٠٢٥', en: 'Pure Math — G12' },
      arabic:    { ar: 'النصوص والقراءة — ٢٠٢٥', en: 'Arabic Texts — G12' },
      english:   { ar: 'English for G12 — Hello!', en: 'English G12 — Hello!' },
      history:   { ar: 'التاريخ — ٢٠٢٥', en: 'History — G12' },
      geography: { ar: 'الجغرافيا — ٢٠٢٥', en: 'Geography — G12' },
      philosophy:{ ar: 'الفلسفة والمنطق — ٢٠٢٥', en: 'Philosophy — G12' },
      geology:   { ar: 'الجيولوجيا — ٢٠٢٥', en: 'Geology — G12' },
    }[id] || { ar: m.ar, en: m.en };
    return { id, label: isAR ? labels.ar : labels.en, glyph: m.glyph };
  });

  const [enabled, setEnabled] = useState(() => Object.fromEntries(MOE.map(b => [b.id, true])));
  const toggle = (id) => setEnabled(e => ({ ...e, [id]: !e[id] }));

  const ingestionLines = [
    { agent: 'IngestionAgent',      text: 'Connecting to MOE textbook source…', status: 'info' },
    { agent: 'IngestionAgent',      text: `Found ${MOE.length} textbooks across ${subjects.length} subjects.`, status: 'ok' },
    { agent: 'OCR',                 text: 'Decoding embedded Arabic typography (Naskh + math glyphs)…' },
    { agent: 'TopologyAgent',       text: 'Building chapter → section → concept graph.' },
    { agent: 'TopologyAgent',       text: 'Extracted 42 core theorems, 318 worked examples.' , status: 'ok' },
    { agent: 'EmbeddingService',    text: 'Embedding 4,206 chunks → Vertex AI (text-embedding-005).' },
    { agent: 'PedagogyAgent',       text: 'Linking misconception clusters from past student data.' },
    { agent: 'IngestionAgent',      text: 'Index ready. Knowledge base online ✓', status: 'ok' },
  ];

  return (
    <div className="space-y-6">
      <div className="border-2 border-dashed border-slate-300 rounded-xl bg-white px-6 py-8 text-center hover:border-sky-400 hover:bg-sky-50/40 transition">
        <div className="text-3xl mb-2">📥</div>
        <div className="font-bold text-slate-900">{isAR ? 'اسحب ملفات PDF هنا' : 'Drop PDF files here'}</div>
        <div className="text-[12.5px] text-slate-500 mt-1">
          {isAR ? 'أو اختار من كتب الوزارة المتاحة تحت' : 'or pick from the available MOE textbooks below'}
        </div>
        <Btn kind="outline" size="sm" className="mt-4">
          {isAR ? 'استعراض' : 'Browse files'}
        </Btn>
      </div>

      <div>
        <div className="text-[12.5px] font-bold text-slate-500 uppercase tracking-wider mb-3">
          {isAR ? 'كتب وزارة التربية والتعليم' : 'MOE textbooks'}
        </div>
        <div className="space-y-2">
          {MOE.map(b => (
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
          ? <AgentLog lines={ingestionLines} heading="ingestion.log" onDone={() => setDone(true)} />
          : <div className="terminal rounded-xl p-4 ltr opacity-60">
              <span className="dim">▸ </span><span className="lab">[IngestionAgent]</span> idle. press <span className="ok">▸ Run ingestion</span> to build the knowledge base.
            </div>}
      </div>
    </div>
  );
}

Object.assign(window, { Onboarding });


/* ━━━━━━━━━━━━━━━ home.jsx ━━━━━━━━━━━━━━━ */
/* home.jsx — dashboard / intent input / today's plan */

const HOME_PLAN = [
  { id: 1, subject: 'physics',   dur: 25, type: 'review',  arT: 'مراجعة قانون بويل (Boyle\'s Law)', enT: "Review Boyle's Law", arSub: 'الفصل ٤ — الغازات', enSub: 'Ch.4 — Gas Laws' },
  { id: 2, subject: 'physics',   dur: 15, type: 'quiz',    arT: 'اختبار سريع — قوانين الغازات',     enT: 'Quick check — Gas Laws', arSub: '٥ أسئلة',  enSub: '5 questions' },
  { id: 3, subject: 'chemistry', dur: 20, type: 'lesson',  arT: 'التحليل الكمي — الجزء الأول',      enT: 'Quantitative analysis — Part 1', arSub: 'فصل ٢',     enSub: 'Chapter 2' },
  { id: 4, subject: 'math',      dur: 30, type: 'practice',arT: 'تمارين تفاضل وتكامل',              enT: 'Calculus drills', arSub: 'سؤال ١٢ نهايات',   enSub: '12 problems · limits' },
  { id: 5, subject: 'arabic',    dur: 15, type: 'audio',   arT: 'ملخص صوتي — النصوص الأدبية',       enT: 'Audio summary — Arabic texts', arSub: 'بصوت خصوصي',  enSub: 'In 5sosy\'s voice' },
  { id: 6, subject: 'physics',   dur: 20, type: 'oral',    arT: 'تدريب شفهي — ترموديناميكا',        enT: 'Oral practice — Thermodynamics', arSub: 'محاكاة لجنة',  enSub: 'Examiner sim' },
];

const WEAK_TOPICS = [
  { id: 'gas-laws',     subject: 'physics',   arT: 'قوانين الغازات',         enT: 'Gas laws',           conf: 0.32 },
  { id: 'pv-nrt',       subject: 'physics',   arT: 'معادلة PV=nRT',          enT: 'PV = nRT',            conf: 0.28 },
  { id: 'titration',    subject: 'chemistry', arT: 'المعايرة الحمضية',       enT: 'Acid-base titration', conf: 0.45 },
  { id: 'derivatives',  subject: 'math',      arT: 'قواعد الاشتقاق',         enT: 'Derivative rules',    conf: 0.58 },
  { id: 'french-camp',  subject: 'history',   arT: 'الحملة الفرنسية',        enT: 'French campaign',     conf: 0.62 },
  { id: 'cell-resp',    subject: 'biology',   arT: 'التنفس الخلوي',          enT: 'Cellular respiration',conf: 0.71 },
];

const UPCOMING = [
  { id: 1, subject: 'physics',   arT: 'امتحان نصف الترم — فيزياء', enT: 'Mid-term — Physics', days: 2,  urgent: true },
  { id: 2, subject: 'chemistry', arT: 'كويز — كيمياء عضوية',       enT: 'Quiz — Organic chem', days: 5, urgent: false },
  { id: 3, subject: 'arabic',    arT: 'تسميع النصوص',              enT: 'Arabic recitation',   days: 9, urgent: false },
];

const ACTIVITY = [
  { agent: 'AssessmentAgent', arT: 'حدّث درجتك في قوانين الغازات → 32٪',           enT: 'Updated your gas-laws score → 32%', ago: '٢د', agoEn: '2m' , glyph: '📊' },
  { agent: 'PedagogyAgent',   arT: 'لقى مفهومين ضعفاء جدد في فصل الترموديناميكا', enT: 'Found 2 new weak concepts in Thermo ch.', ago: '٧د', agoEn: '7m', glyph: '🧠' },
  { agent: 'PlannerAgent',    arT: 'عدّل خطة النهاردة بناءً على أداء أمس',         enT: 'Tweaked today\'s plan from yesterday\'s perf', ago: '١س', agoEn: '1h', glyph: '🗓️' },
  { agent: 'IngestionAgent',  arT: 'فهرسة كتاب الكيمياء — تم',                     enT: 'Chemistry textbook indexed', ago: '٣س', agoEn: '3h', glyph: '📥', status: 'ok' },
];

function Home() {
  const { t, isAR, go, streak, xp, pulseStreak } = useApp();
  const [intent, setIntent] = useState('');
  const [parsing, setParsing] = useState(false);
  const inputRef = useRef(null);

  const submit = (txt) => {
    setIntent(txt);
    setParsing(true);
    setTimeout(() => { setParsing(false); go('session'); }, 2200);
  };

  return (
    <ChromeLayout>
      <div className="px-5 lg:px-10 py-6 lg:py-8 max-w-[1400px]">
        {/* Greeting */}
        <div className="flex items-end justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl lg:text-3xl font-extrabold text-slate-900">{t.home.greet}</h1>
            <p className="text-slate-500 mt-1 text-[14px]">{t.home.sub}</p>
          </div>
          <div className="hidden lg:flex items-center gap-3 text-[12px] text-slate-500">
            <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> {isAR ? '٥ وكلاء نشطين' : '5 agents online'}</span>
          </div>
        </div>

        {/* 3-col layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Center column */}
          <div className="lg:col-span-8 space-y-6 min-w-0">
            <IntentInput
              value={intent}
              setValue={setIntent}
              onSubmit={submit}
              parsing={parsing}
              ref={inputRef}
            />

            <TodayPlan />

            <WeakTopics />
          </div>

          {/* Right rail */}
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

/* ─────────────────────────────  Intent input  ───────────────────────────── */
const IntentInput = React.forwardRef(function IntentInput({ value, setValue, onSubmit, parsing }, ref) {
  const { t, isAR } = useApp();
  const parseLines = [
    { agent: 'Orchestrator', text: 'Received intent. tokenizing Egyptian Arabic…' },
    { agent: 'Orchestrator', text: 'Subject = Physics · Topic = Gas Laws · Urgency = 48h', status: 'ok' },
    { agent: 'PlannerAgent', text: 'Drafting 4-session plan, biasing toward PV=nRT…' },
    { agent: 'PedagogyAgent', text: 'Pulling 3 misconception drills from your weak list.', status: 'ok' },
    { agent: 'Orchestrator', text: 'Ready. Opening study session ▸', status: 'ok' },
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
          onChange={e => setValue(e.target.value)}
          placeholder={t.home.intentPh}
          className="w-full bg-transparent resize-none px-5 pt-6 pb-2 text-[16px] text-slate-900 placeholder:text-slate-400 focus:outline-none"
          dir={isAR ? 'rtl' : 'ltr'}
        />
        <div className="flex items-center gap-2 px-3 pb-3">
          <button className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100" title={isAR ? 'صوت' : 'Voice'}>🎙️</button>
          <button className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100" title={isAR ? 'مرفق' : 'Attach'}>📎</button>
          <div className="flex-1" />
          <span className="text-[11px] text-slate-400 hidden sm:inline">{isAR ? 'اضغط Enter للبدء' : 'Press Enter to start'}</span>
          <Btn kind="primary"
               disabled={!value.trim() || parsing}
               onClick={() => onSubmit(value || (isAR ? t.home.examples[0] : t.home.examples[0]))}>
            {parsing
              ? <><span className="inline-block w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" /> {isAR ? 'بحلّل…' : 'Parsing…'}</>
              : <>{isAR ? 'يلا بينا' : "Let's go"} <span className="ltr">→</span></>}
          </Btn>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mt-3">
        {t.home.examples.map((ex, i) => (
          <button key={i}
            onClick={() => { setValue(ex); }}
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

/* ─────────────────────────────  Today's plan timeline  ───────────────────────────── */
function TodayPlan() {
  const { isAR, t, go } = useApp();
  const [activeId, setActiveId] = useState(1);
  const totalMin = HOME_PLAN.reduce((s, b) => s + b.dur, 0);
  const doneMin = HOME_PLAN.filter(b => b.id < activeId).reduce((s,b) => s + b.dur, 0);
  const pct = (doneMin / totalMin) * 100;

  return (
    <Card className="overflow-hidden">
      <div className="px-5 pt-5 pb-3 flex items-center gap-3">
        <div>
          <div className="font-extrabold text-slate-900 text-[17px]">{t.home.plan}</div>
          <div className="text-[12px] text-slate-500 mt-0.5">{t.home.planSub}</div>
        </div>
        <div className="ms-auto text-end">
          <div className="text-[20px] font-extrabold text-slate-900 ltr">{Math.round(totalMin/60*10)/10}h</div>
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
          const typeGlyph = { review: '↻', quiz: '✓', lesson: '📖', practice: '✎', audio: '🎧', oral: '🎤' }[b.type];
          return (
            <li key={b.id} className="relative">
              {/* connector */}
              {idx !== HOME_PLAN.length - 1 && (
                <div className="absolute top-9 bottom-0 start-[26px] w-px bg-slate-200" />
              )}
              <button onClick={() => { setActiveId(b.id); }}
                className={`w-full flex items-start gap-3 p-2.5 rounded-lg text-start transition
                  ${isActive ? 'bg-sky-50' : 'hover:bg-slate-50'}`}>
                {/* timeline dot */}
                <div className="relative shrink-0 mt-0.5">
                  <div className={`w-6 h-6 rounded-full grid place-items-center font-bold text-[11px] ltr
                    ${isDone ? 'bg-emerald-500 text-white'
                     : isActive ? `${h.dot} text-white ring-4 ring-sky-100`
                     : 'bg-slate-200 text-slate-500'}`}>
                    {isDone ? '✓' : idx+1}
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <SubjectChip id={b.subject} size="sm" />
                    <span className="text-[10.5px] text-slate-400 ltr inline-flex items-center gap-1">
                      <span>{typeGlyph}</span>
                      <span className="capitalize">{b.type}</span>
                    </span>
                    <span className="ms-auto text-[11px] font-bold text-slate-500 ltr">{b.dur}m</span>
                  </div>
                  <div className={`font-semibold text-[14px] ${isActive ? 'text-slate-900' : 'text-slate-800'}`}>
                    {isAR ? b.arT : b.enT}
                  </div>
                  <div className="text-[11.5px] text-slate-500 mt-0.5">{isAR ? b.arSub : b.enSub}</div>
                </div>

                <button
                  onClick={(e) => { e.stopPropagation(); go(b.type === 'quiz' ? 'quiz' : b.type === 'oral' ? 'oral' : 'session'); }}
                  className={`shrink-0 w-9 h-9 rounded-full grid place-items-center transition
                    ${isActive ? 'bg-sky-600 text-white hover:bg-sky-700' : 'bg-white border border-slate-200 text-slate-600 hover:border-sky-400 hover:text-sky-600'}`}>
                  <span className="text-[12px] ltr">▶</span>
                </button>
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/* ─────────────────────────────  Weak topics scroller  ───────────────────────────── */
function WeakTopics() {
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
          {WEAK_TOPICS.map(w => {
            const m = SUBJECT_META[w.subject];
            return (
              <div key={w.id}
                className="shrink-0 w-[180px] bg-white border border-slate-200 rounded-xl p-4 card-lift cursor-pointer">
                <div className="flex items-start justify-between mb-2">
                  <SubjectChip id={w.subject} size="sm" />
                  <Ring value={w.conf} size={36} stroke={4} />
                </div>
                <div className="font-bold text-[14px] text-slate-900 mt-2 leading-snug">
                  {isAR ? w.arT : w.enT}
                </div>
                <div className="flex items-center justify-between mt-3 text-[11px]">
                  <span className="ltr text-slate-500">{Math.round(w.conf * 100)}% mastery</span>
                  <span className="text-sky-700 font-semibold">{isAR ? 'تمرّن' : 'Drill'} {isAR ? '←' : '→'}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

/* ─────────────────────────────  Right rail cards  ───────────────────────────── */
function StreakCard({ pulse }) {
  const { isAR, streak, xp, t } = useApp();
  const days = [-3,-2,-1,0,1,2,3];
  return (
    <Card className={`overflow-hidden relative ${pulse ? 'ring-2 ring-amber-400' : ''}`}>
      <Confetti show={pulse} />
      <div className="px-5 pt-5 pb-5 bg-gradient-to-br from-amber-50 via-white to-white">
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 rounded-2xl bg-amber-500 text-white grid place-items-center text-2xl shadow-md shadow-amber-200`}>🔥</div>
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
                : past   ? 'bg-amber-100 text-amber-700'
                : 'bg-slate-100 text-slate-400'}`}>
                {past || today ? '🔥' : ''}
                {today && <span className="absolute -top-1.5 start-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-amber-600" />}
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
        {UPCOMING.map(u => {
          const m = SUBJECT_META[u.subject];
          return (
            <div key={u.id} className={`flex items-center gap-3 p-2.5 rounded-lg
              ${u.urgent ? 'bg-rose-50' : 'hover:bg-slate-50'}`}>
              <div className={`w-9 h-9 rounded-lg grid place-items-center text-lg ${HUE[m.hue].bg}`}>{m.glyph}</div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-slate-900 truncate">
                  {isAR ? u.arT : u.enT}
                </div>
                <div className="text-[11px] text-slate-500">
                  {isAR ? `خلال ${u.days} أيام` : `In ${u.days} days`}
                </div>
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
      <button onClick={() => setOpen(o => !o)}
        className="w-full px-5 pt-5 pb-4 flex items-center gap-2 text-start">
        <span className="font-extrabold text-slate-900 text-[15px] flex items-center gap-2">
          <span className="relative">
            <span className="w-2 h-2 rounded-full bg-emerald-500 absolute -end-3 top-1 animate-pulse" />
            ⚙️
          </span>
          {t.home.activity}
        </span>
        <span className="ms-auto text-[11px] text-slate-400 ltr">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
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
      )}
      {!open && (
        <div className="px-5 pb-5 flex flex-wrap gap-1.5">
          {ACTIVITY.slice(0,2).map((a, i) => (
            <span key={i} className="inline-flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-full px-2 py-1 text-[10.5px] text-slate-600">
              <span>{a.glyph}</span><span>{isAR ? a.ago : a.agoEn}</span>
            </span>
          ))}
        </div>
      )}
    </Card>
  );
}

Object.assign(window, { Home });


/* ━━━━━━━━━━━━━━━ session.jsx ━━━━━━━━━━━━━━━ */
/* session.jsx — Smart lesson view */

function Session() {
  const { isAR, t, go } = useApp();
  const [progress, setProgress] = useState(0.35);
  const [explained, setExplained] = useState({}); // paragraph id -> egyptian-mode bool
  const [chatMsgs, setChatMsgs] = useState([
    { who: '5sosy', ar: 'أنا معاك. سألني أي حاجة عن قانون بويل.', en: "I'm here. Ask me anything about Boyle's Law." }
  ]);
  const [chatInput, setChatInput] = useState('');

  const toggleExplain = (id) => setExplained(e => ({ ...e, [id]: !e[id] }));

  const sendChat = () => {
    if (!chatInput.trim()) return;
    const user = chatInput;
    setChatMsgs(m => [...m, { who: 'me', ar: user, en: user }]);
    setChatInput('');
    setTimeout(() => {
      setChatMsgs(m => [...m, {
        who: '5sosy',
        ar: 'تمام، لما الحجم بيقل والحرارة ثابتة، الضغط بيزيد — ده اللي بيقوله قانون بويل.',
        en: "Right — when volume drops at constant temperature, pressure rises. That's Boyle's law."
      }]);
    }, 700);
  };

  return (
    <ChromeLayout>
      {/* Top bar */}
      <div className="border-b border-slate-200 bg-white px-5 lg:px-8 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => go('home')} className="text-slate-400 hover:text-slate-700 text-[18px]">{isAR ? '→' : '←'}</button>
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
              <div className="h-full bg-sky-500 bar-fill" style={{ width: `${progress*100}%` }} />
            </div>
            <div className="text-[10.5px] text-slate-400 mt-0.5 ltr text-end">{Math.round(progress*100)}%</div>
          </div>
          <Btn kind="outline" size="sm">⏸ {isAR ? 'إيقاف' : 'Pause'}</Btn>
        </div>
      </div>

      <div className="px-5 lg:px-8 py-6 grid lg:grid-cols-12 gap-6 max-w-[1400px]">
        {/* Lesson body */}
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

          <Paragraph id="p1"
            ar={`الغاز عبارة عن جزيئات بتتحرك بسرعة في كل الاتجاهات. كل ما الحيز اللي بتتحرك فيه يقل، كل ما الجزيئات بتصطدم بجوانب الإناء أكتر — وده اللي بنحس بيه على شكل ضغط أعلى. ده طبعًا بشرط الحرارة تفضل ثابتة.`}
            en={`A gas is a swarm of molecules moving in every direction. The smaller the space you trap them in, the more often they hit the container walls — and that's what we read as higher pressure. All of this is true only if temperature stays constant.`}
            egAr={`تخيّل عربية ملياااانة ركاب. كل ما العربية تصغر، الزحمة تزيد ⇒ الناس تخبط في الباب أكتر — ده الضغط! بس بشرط الجو يبقى ثابت.`}
            egEn={`Imagine a packed minibus — the smaller it gets, the more people slam against the doors. That bang-bang on the door? That's pressure. Hot or cold doesn't matter — temp is fixed.`}
            explained={!!explained.p1}
            onToggle={() => toggleExplain('p1')}
          />

          <div className="my-6">
            <FigurePlaceholder
              ar="رسم: غاز محبوس في مكبس عند ٣ أحجام مختلفة"
              en="Figure: gas trapped in a piston at 3 different volumes"
            />
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

          <Paragraph id="p2"
            ar={`القانون العام للغاز المثالي بيوسّع الفكرة دي ويربط الضغط P والحجم V وعدد المولات n والحرارة T مع بعض في معادلة واحدة جميلة:`}
            en={`The ideal-gas law extends this and ties pressure P, volume V, moles n, and temperature T together in one elegant equation:`}
            egAr={`في الكبير، فيه قانون اسمه قانون الغاز المثالي بيلم كل الحاجات دي مع بعض في معادلة واحدة:`}
            egEn={`Step up one level — the ideal-gas law bundles everything into one equation:`}
            explained={!!explained.p2}
            onToggle={() => toggleExplain('p2')}
          />

          <div className="eq text-2xl text-slate-900 text-center my-5 ltr">
            P · V = n · R · T
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
            <div className="text-2xl shrink-0">💡</div>
            <div className="text-[13.5px] text-amber-900">
              <div className="font-bold mb-1">{isAR ? 'فخ شائع' : 'Common pitfall'}</div>
              {isAR
                ? 'لما تستخرج T من PV=nRT لازم تستخدم كلفن (K) مش سيليزيوس. ده اللي وقعت فيه آخر اختبار — وكيل التقييم ملاحظها.'
                : 'When you isolate T from PV=nRT, you must use Kelvin (K), not Celsius. This is exactly where you slipped last test — the Assessment Agent flagged it.'}
            </div>
          </div>

          {/* Quick-check CTA */}
          <div className="mt-8 bg-slate-900 rounded-2xl p-6 flex items-center gap-4 text-white">
            <div className="w-14 h-14 rounded-2xl bg-sky-500/20 grid place-items-center text-3xl">🧠</div>
            <div className="flex-1">
              <div className="font-extrabold text-[17px]">{isAR ? 'جاهز لاختبار سريع؟' : 'Ready for a quick check?'}</div>
              <div className="text-slate-300 text-[13px]">{isAR ? '٣ أسئلة، أقل من دقيقتين' : '3 questions, under 2 minutes'}</div>
            </div>
            <Btn kind="primary" size="lg" onClick={() => go('quiz')}>
              {isAR ? 'يلا نختبر' : 'Take the check'} <span className="ltr">→</span>
            </Btn>
          </div>
        </div>

        {/* Right rail */}
        <div className="lg:col-span-4 space-y-5 min-w-0">
          <AudioSummary />
          <AskChat msgs={chatMsgs} input={chatInput} setInput={setChatInput} send={sendChat} />
          <KeyConceptsCard />
        </div>
      </div>
    </ChromeLayout>
  );
}

function Paragraph({ id, ar, en, egAr, egEn, explained, onToggle }) {
  const { isAR } = useApp();
  const body = explained ? (isAR ? egAr : egEn) : (isAR ? ar : en);
  return (
    <div className="relative group mb-4">
      <p className={`text-[15.5px] leading-[1.85] text-slate-700 ${explained ? 'bg-amber-50/60 border-s-2 border-amber-400 ps-4 py-1 rounded-e-md' : ''}`}
         style={{ textWrap: 'pretty' }}>
        {body}
      </p>
      <button onClick={onToggle}
        className={`mt-2 inline-flex items-center gap-1.5 text-[11px] font-bold rounded-full px-2.5 py-1 transition
          ${explained
            ? 'bg-amber-500 text-white'
            : 'bg-white text-amber-700 border border-amber-300 hover:bg-amber-50'}`}>
        <span>🇪🇬</span>
        <span>{explained
          ? (isAR ? 'رجّع الفصحى' : 'Show formal')
          : (isAR ? 'افهمها بالمصري' : 'Explain in Egyptian')}</span>
      </button>
    </div>
  );
}

function FigurePlaceholder({ ar, en }) {
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
        {/* 3 cylinders representing volumes */}
        {[ [80, 60, 100], [240, 90, 70], [400, 130, 40] ].map(([x,h,v], i) => (
          <g key={i}>
            <rect x={x} y={200-h-20} width="100" height={h} rx="4" fill="#fff" stroke="#94a3b8" strokeWidth="1.5" />
            <rect x={x} y={200-v-20} width="100" height="6" fill="#0284c7" />
            {/* gas dots */}
            {[...Array(10)].map((_, j) => (
              <circle key={j}
                cx={x + 10 + (j*9) % 80}
                cy={200-20 - 4 - (j*7) % (v-8)}
                r="2.5" fill="#0ea5e9" opacity=".7" />
            ))}
            <text x={x+50} y={200-5} fontFamily="JetBrains Mono" fontSize="10" fill="#64748b" textAnchor="middle">V{i+1}</text>
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
        <span className="font-extrabold text-slate-900 text-[14px]">
          🎧 {isAR ? 'ملخص صوتي' : 'Audio summary'}
        </span>
        <span className="ms-auto text-[10.5px] text-slate-400 ltr">2:18</span>
      </div>
      <div className="bg-slate-900 p-4 flex items-center gap-3">
        <button onClick={() => setPlaying(p => !p)}
          className="w-11 h-11 rounded-full bg-sky-500 hover:bg-sky-400 text-white grid place-items-center text-[14px] shadow-lg shadow-sky-900/40">
          <span className="ltr">{playing ? '❚❚' : '▶'}</span>
        </button>
        <div className="flex-1 flex items-end h-8 gap-[1px]">
          {Array.from({length: 32}).map((_, i) => (
            <span key={i}
              className="wave-bar"
              style={{
                animationDelay: `${(i*60) % 700}ms`,
                animationPlayState: playing ? 'running' : 'paused',
                height: playing ? undefined : `${6 + (i%8)*2}px`,
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

function AskChat({ msgs, input, setInput, send }) {
  const { isAR } = useApp();
  return (
    <Card>
      <div className="px-4 pt-4 pb-3 flex items-center gap-2">
        <span className="font-extrabold text-slate-900 text-[14px]">
          💬 {isAR ? 'اسأل خصوصي' : 'Ask 5sosy'}
        </span>
        <span className="ms-auto inline-flex items-center gap-1 text-[10.5px] font-semibold text-emerald-600">
          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
          {isAR ? 'متصل' : 'live'}
        </span>
      </div>
      <div className="px-4 pb-3 space-y-2 max-h-[180px] overflow-y-auto slim">
        {msgs.map((m, i) => {
          const me = m.who === 'me';
          return (
            <div key={i} className={`flex ${me ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-[13px] ${
                me ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-800'
              }`}>
                {isAR ? m.ar : m.en}
              </div>
            </div>
          );
        })}
      </div>
      <div className="px-3 pb-3 flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder={isAR ? 'اسأل أي حاجة...' : 'Ask anything…'}
          className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-sky-400" />
        <button onClick={send}
          className="w-9 h-9 rounded-lg bg-sky-600 hover:bg-sky-700 text-white grid place-items-center">
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
    { ar: 'استخراج T من PV=nRT',       en: 'Isolating T from PV=nRT',  mastery: .28 },
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
              <span className="ltr text-slate-400 text-[10.5px]">{Math.round(it.mastery*100)}%</span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full mt-1">
              <div className={`h-full rounded-full ${it.mastery > .7 ? 'bg-emerald-500' : it.mastery > .4 ? 'bg-amber-500' : 'bg-rose-500'}`}
                   style={{ width: `${it.mastery*100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

Object.assign(window, { Session });


/* ━━━━━━━━━━━━━━━ quiz.jsx ━━━━━━━━━━━━━━━ */
/* quiz.jsx — adaptive diagnostic quiz */

const QUIZ_QUESTIONS = [
  {
    id: 1, kind: 'mcq',
    ar: 'لو ضغط غاز ٢ atm وحجمه ٤ لتر، عند ثبات الحرارة، إيه حجمه لو الضغط بقى ٤ atm؟',
    en: 'A gas at 2 atm occupies 4 L. At constant T, what is its volume at 4 atm?',
    choices: [
      { id: 'a', ar: '٨ لتر',   en: '8 L'   },
      { id: 'b', ar: '٤ لتر',   en: '4 L'   },
      { id: 'c', ar: '٢ لتر',   en: '2 L'   },
      { id: 'd', ar: '١ لتر',   en: '1 L'   },
    ],
    answer: 'c',
    hintAr: 'P₁V₁ = P₂V₂', hintEn: 'P₁V₁ = P₂V₂'
  },
  {
    id: 2, kind: 'short',
    ar: 'لما الحرارة بتزيد عند ثبات الحجم، الضغط بـ ___ (زاد / قل / ثبت)',
    en: 'At constant volume, raising temperature causes pressure to ___ (rise / fall / stay)',
    placeholder: { ar: 'زاد / قل / ثبت', en: 'rise / fall / stay' },
    answer: ['rise', 'زاد', 'يزيد', 'increase', 'increases'],
    hintAr: 'فكر في قانون جاي-لوساك', hintEn: 'Think Gay-Lussac'
  },
  {
    id: 3, kind: 'order',
    ar: 'رتّب الخطوات لحساب T من PV=nRT لما المعطيات P و V و n معروفين',
    en: 'Order the steps to compute T from PV=nRT given P, V, n',
    items: [
      { id: 's1', ar: 'حدّد المعطيات: P, V, n, R', en: 'List knowns: P, V, n, R' },
      { id: 's2', ar: 'اقسم الطرفين على n·R', en: 'Divide both sides by n·R' },
      { id: 's3', ar: 'اكتب: T = (P·V) / (n·R)', en: 'Write: T = (P·V) / (n·R)' },
      { id: 's4', ar: 'حوّل الإجابة لكلفن إذا لزم', en: 'Convert answer to Kelvin if needed' },
    ],
    order: ['s1','s2','s3','s4']
  }
];

function Quiz() {
  const { isAR, t, go, bumpStreak } = useApp();
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState({});
  const [confidence, setConfidence] = useState({});
  const [showResult, setShowResult] = useState(false);

  const q = QUIZ_QUESTIONS[idx];
  const ans = answers[q.id];
  const conf = confidence[q.id] ?? 50;

  const setAns = (v) => setAnswers(a => ({ ...a, [q.id]: v }));
  const setConf = (v) => setConfidence(c => ({ ...c, [q.id]: v }));

  const submit = () => {
    if (idx < QUIZ_QUESTIONS.length - 1) {
      setIdx(idx + 1);
    } else {
      setShowResult(true);
    }
  };

  return (
    <ChromeLayout>
      <div className="border-b border-slate-200 bg-white px-5 lg:px-8 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => go('home')} className="text-slate-400 hover:text-slate-700 text-[18px]">{isAR ? '→' : '←'}</button>
        <div className="flex items-center gap-2 text-[12.5px] text-slate-500">
          <SubjectChip id="physics" size="sm" />
          <span className="text-slate-300">/</span>
          <span className="text-slate-900 font-semibold">{isAR ? 'اختبار سريع' : 'Quick check'}</span>
        </div>
        <div className="ms-auto flex items-center gap-3">
          <span className="text-[12px] text-slate-500 ltr font-mono">{idx+1} / {QUIZ_QUESTIONS.length}</span>
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
              <span className="text-[10.5px] font-bold text-slate-400 uppercase tracking-wider ltr">Question {idx+1}</span>
              <span className="text-[10.5px] font-bold bg-violet-50 text-violet-700 px-1.5 py-0.5 rounded uppercase">
                {q.kind === 'mcq' ? (isAR ? 'اختر' : 'MCQ')
                : q.kind === 'short' ? (isAR ? 'إجابة قصيرة' : 'Short')
                : (isAR ? 'ترتيب' : 'Order')}
              </span>
            </div>
            <Card className="p-7">
              <div className="text-[18px] lg:text-[20px] font-bold text-slate-900 leading-relaxed mb-6"
                   style={{ textWrap: 'pretty' }}>
                {isAR ? q.ar : q.en}
              </div>

              {q.kind === 'mcq' && (
                <div className="space-y-2">
                  {q.choices.map(c => {
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

              {q.kind === 'short' && (
                <div>
                  <input
                    value={ans || ''}
                    onChange={e => setAns(e.target.value)}
                    placeholder={isAR ? q.placeholder.ar : q.placeholder.en}
                    className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3.5 text-[15px] focus:outline-none focus:border-sky-500" />
                </div>
              )}

              {q.kind === 'order' && (
                <OrderedList question={q} answer={ans} setAnswer={setAns} />
              )}

              {/* confidence slider */}
              <div className="mt-7 pt-5 border-t border-slate-100">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[12.5px] font-bold text-slate-700">
                    {isAR ? 'ايه نسبة تأكدك؟' : 'How confident are you?'}
                  </span>
                  <span className="ms-auto ltr text-[13px] font-extrabold text-slate-900 tabular-nums">{conf}%</span>
                </div>
                <input type="range" min="0" max="100" value={conf}
                  onChange={e => setConf(Number(e.target.value))}
                  className="w-full accent-sky-600" />
                <div className="flex justify-between text-[10.5px] text-slate-400 mt-1 ltr">
                  <span>0 · {isAR ? 'مش متأكد' : 'no idea'}</span>
                  <span>100 · {isAR ? 'متأكد جدًا' : 'certain'}</span>
                </div>
              </div>
            </Card>

            <div className="flex justify-between mt-6">
              <Btn kind="ghost" onClick={() => idx > 0 ? setIdx(idx-1) : go('session')}>
                {isAR ? '→ السابق' : '← Prev'}
              </Btn>
              <Btn kind="primary" size="lg" disabled={!ans} onClick={submit}>
                {idx < QUIZ_QUESTIONS.length - 1
                  ? (isAR ? 'التالي' : 'Next')
                  : (isAR ? 'سلّم الإجابات' : 'Submit')}
                <span className="ltr">→</span>
              </Btn>
            </div>
          </>
        ) : (
          <QuizResult answers={answers} confidence={confidence} onContinue={() => { bumpStreak(60); go('oral'); }} />
        )}
      </div>
    </ChromeLayout>
  );
}

function OrderedList({ question, answer, setAnswer }) {
  const { isAR } = useApp();
  const order = answer || question.items.map(i => i.id);
  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const next = order.slice();
    [next[i], next[j]] = [next[j], next[i]];
    setAnswer(next);
  };
  const byId = Object.fromEntries(question.items.map(i => [i.id, i]));

  return (
    <div>
      <div className="text-[11.5px] text-slate-500 mb-3">
        {isAR ? 'استخدم الأسهم لترتيب الخطوات' : 'Use the arrows to order the steps'}
      </div>
      <div className="space-y-2">
        {order.map((id, i) => {
          const it = byId[id];
          return (
            <div key={id}
              className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-3 py-3">
              <div className="w-7 h-7 rounded-full bg-sky-100 text-sky-700 grid place-items-center font-bold text-[12px] ltr">
                {i+1}
              </div>
              <div className="flex-1 text-[14px] text-slate-800 font-medium">{isAR ? it.ar : it.en}</div>
              <div className="flex flex-col gap-0.5">
                <button onClick={() => move(i, -1)}
                  disabled={i===0}
                  className="w-7 h-5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:opacity-30 text-[10px] ltr">▲</button>
                <button onClick={() => move(i, 1)}
                  disabled={i===order.length-1}
                  className="w-7 h-5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:opacity-30 text-[10px] ltr">▼</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function QuizResult({ answers, confidence, onContinue }) {
  const { isAR, go } = useApp();
  const lines = [
    { agent: 'AssessmentAgent', text: 'Scoring 3 responses…', status: 'info' },
    { agent: 'AssessmentAgent', text: 'Q1 ✓ correct — high confidence (80%) matches answer.', status: 'ok' },
    { agent: 'AssessmentAgent', text: 'Q2 ✓ correct — phrasing within acceptable variants.', status: 'ok' },
    { agent: 'AssessmentAgent', text: 'Q3 ✗ partial — steps 2 and 3 swapped.', status: 'warn' },
    { agent: 'PedagogyAgent',   text: 'Mathematical failure in isolating T in PV=nRT.', status: 'warn' },
    { agent: 'PedagogyAgent',   text: 'Misconception: "divide before rearranging" pattern.', status: 'warn' },
    { agent: 'PlannerAgent',    text: 'Adding 12-min focused drill: isolate-variable practice.', status: 'ok' },
    { agent: 'PlannerAgent',    text: 'Queued for tomorrow 4:30pm slot. Done.', status: 'ok' },
  ];

  return (
    <div>
      <div className="text-center mb-6">
        <div className="inline-block w-20 h-20 rounded-full bg-emerald-500 text-white grid place-items-center text-4xl mb-3 shadow-lg shadow-emerald-200">
          ✓
        </div>
        <h1 className="text-2xl font-extrabold text-slate-900">
          {isAR ? 'تمام كده!' : 'Nice work!'}
        </h1>
        <p className="text-slate-500 mt-1 text-[14px]">
          {isAR ? 'حلّلنا إجاباتك — شوف اللي لقيناه:' : "We analyzed your answers — here's what we found:"}
        </p>
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
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{isAR ? 'XP' : 'XP'}</div>
            <div className="text-3xl font-extrabold text-amber-500 ltr mt-1">+60</div>
          </div>
        </div>
      </Card>

      <div className="mb-5">
        <div className="text-[12.5px] font-bold text-slate-500 uppercase tracking-wider mb-2 ltr">
          ▸ Assessment Agent
        </div>
        <AgentLog lines={lines} heading="assessment.log" speed={9} />
      </div>

      <Card className="p-5 bg-gradient-to-br from-sky-50 to-white border-sky-200 mb-6">
        <div className="text-[11px] font-bold text-sky-700 uppercase tracking-wider mb-2">
          {isAR ? 'الخطوة الجاية' : 'What to study next'}
        </div>
        <div className="font-extrabold text-slate-900 text-[18px] mb-1">
          {isAR ? 'تمرين على عزل المتغيرات في معادلات الغاز' : 'Isolating variables in gas equations'}
        </div>
        <div className="text-[13px] text-slate-600">
          {isAR ? 'تمرين موجّه ١٢ دقيقة + ٤ مسائل تطبيقية، بناءً على الخطأ في السؤال ٣.'
                : '12-min focused drill + 4 application problems, based on your Q3 slip.'}
        </div>
      </Card>

      <div className="flex gap-3">
        <Btn kind="outline" className="flex-1" onClick={() => go('home')}>{isAR ? 'الرئيسية' : 'Back home'}</Btn>
        <Btn kind="primary" size="lg" className="flex-[2]" onClick={onContinue}>
          {isAR ? 'يلا للامتحان الشفهي' : 'Try oral exam'} <span className="ltr">→</span>
        </Btn>
      </div>
    </div>
  );
}

Object.assign(window, { Quiz });


/* ━━━━━━━━━━━━━━━ oral.jsx ━━━━━━━━━━━━━━━ */
/* oral.jsx — Mock oral exam, dark mode, mic orb, live transcript */

const SCRIPT = [
  { who: 'examiner', delay: 900,  ar: 'صباح الخير يا يوسف. هنبدأ بسؤال بسيط — اشرحلي قانون بويل بكلامك.',
                                  en: "Good morning, Youssef. Let's start simple — explain Boyle's law in your own words." },
  { who: 'student',  delay: 2200, ar: 'حاضر. قانون بويل بيقول إنه عند ثبات الحرارة، حجم الغاز بيقل لما الضغط يزيد، والعكس صحيح. يعني الضغط والحجم بيتعكسوا.',
                                  en: "Sure. Boyle's law says that at constant temperature, gas volume drops when pressure rises, and vice versa. They're inversely related." },
  { who: 'examiner', delay: 1600, ar: 'تمام. ولو قلتلك P × V = ثابت، إيه شرط الثابت ده؟',
                                  en: "Good. And if I say P × V = constant, what's the condition for that constant?" },
  { who: 'student',  delay: 2400, ar: 'الشرط إن الحرارة تفضل ثابتة، وعدد المولات يفضل ثابت برضو. لما الاتنين ثوابت، حاصل الضرب بيكون مقدار ثابت.',
                                  en: "Temperature must stay constant, and the number of moles too. With both fixed, the product is a constant." },
  { who: 'examiner', delay: 1500, ar: 'برافو. خلينا نشوف PV=nRT — استخرجلي T لو عرفنا الباقي.',
                                  en: "Nice. Let's look at PV = nRT — solve for T given the rest." },
  { who: 'student',  delay: 2600, ar: 'هقسم الطرفين على n×R، يبقى T = PV على nR. وآخر خطوة، أتأكد إن الإجابة بالكلفن، مش بالسليزيوس.',
                                  en: "I divide both sides by n·R, so T = PV / (nR). And finally I make sure the answer is in Kelvin, not Celsius." },
  { who: 'examiner', delay: 1400, ar: 'ممتاز. سؤال أخير — ليه استخدمنا الكلفن أصلاً؟',
                                  en: "Excellent. Last one — why Kelvin in the first place?" },
];

const ROLE_LABEL = {
  examiner: { ar: 'الممتحن', en: 'Examiner' },
  student:  { ar: 'أنت',     en: 'You' },
};

function Oral() {
  const { isAR, go, bumpStreak } = useApp();
  const [stage, setStage] = useState('idle'); // idle | running | finished
  const [transcript, setTranscript] = useState([]);
  const [scores, setScores] = useState({ pronunciation: 0, confidence: 0, accuracy: 0, structure: 0 });
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef(null);

  // Drive transcript
  useEffect(() => {
    if (stage !== 'running') return;
    let cancelled = false;
    let i = 0;
    const next = () => {
      if (cancelled) return;
      if (i >= SCRIPT.length) {
        // Wait a bit then finish
        setTimeout(() => { if (!cancelled) setStage('finished'); }, 1400);
        return;
      }
      const line = SCRIPT[i++];
      setTimeout(() => {
        if (cancelled) return;
        setTranscript(t => [...t, line]);
        // bump scores when it's student turn
        if (line.who === 'student') {
          setScores(s => ({
            pronunciation: Math.min(0.92, s.pronunciation + 0.22 + Math.random()*0.1),
            confidence:    Math.min(0.88, s.confidence    + 0.18 + Math.random()*0.12),
            accuracy:      Math.min(0.95, s.accuracy      + 0.24 + Math.random()*0.06),
            structure:     Math.min(0.83, s.structure     + 0.20 + Math.random()*0.08),
          }));
        }
        next();
      }, line.delay);
    };
    next();
    return () => { cancelled = true; };
  }, [stage]);

  // Timer
  useEffect(() => {
    if (stage !== 'running') return;
    setElapsed(0);
    const start = Date.now();
    timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now()-start)/1000)), 1000);
    return () => clearInterval(timerRef.current);
  }, [stage]);

  const fmt = (s) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;

  // Body
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 relative overflow-hidden">
      {/* Ambient gradient */}
      <div className="absolute inset-0 pointer-events-none"
           style={{
             background: 'radial-gradient(80% 50% at 50% 50%, rgba(56,189,248,.12), transparent 70%), radial-gradient(60% 80% at 100% 0%, rgba(168,85,247,.08), transparent 60%)'
           }} />

      {/* Top bar */}
      <div className="relative px-5 lg:px-8 py-4 flex items-center gap-3 border-b border-slate-800/80">
        <button onClick={() => go('home')} className="text-slate-400 hover:text-slate-200 text-[18px]">
          {isAR ? '→' : '←'}
        </button>
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
        {/* Examiner card */}
        <div className="lg:col-span-3 space-y-4">
          <ExaminerCard />
          <SessionInfoCard />
        </div>

        {/* Center: orb + transcript */}
        <div className="lg:col-span-6 flex flex-col items-center">
          <div className="relative grid place-items-center my-4" style={{ width: 220, height: 220 }}>
            <span className="mic-ring" />
            <span className="mic-ring r2" />
            <span className="mic-ring r3" />
            <div className="mic-orb rounded-full grid place-items-center text-5xl"
                 style={{ width: 180, height: 180 }}>
              <span style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,.4))' }}>🎤</span>
            </div>
          </div>

          <div className="text-center mb-3">
            {stage === 'idle' && (
              <>
                <div className="text-[13px] uppercase tracking-wider text-sky-400 font-bold mb-2">
                  {isAR ? 'جاهز للبدء' : 'Ready to begin'}
                </div>
                <div className="text-slate-300 text-[14px] max-w-md mx-auto">
                  {isAR ? 'هتدخل لجنة محاكاة لمدة ٥ دقايق. خصوصي هيمتحنك صوتيًا، ويقيّم النطق والثقة والدقة.'
                        : "You'll enter a 5-minute simulated panel. 5sosy will examine you by voice and score pronunciation, confidence, and accuracy."}
                </div>
                <button onClick={() => setStage('running')}
                  className="mt-5 inline-flex items-center gap-2 bg-sky-500 hover:bg-sky-400 text-white font-bold px-6 py-3 rounded-xl shadow-lg shadow-sky-900/40 transition">
                  <span>{isAR ? 'ابدأ المحاكاة' : 'Start oral'}</span>
                  <span className="ltr">▶</span>
                </button>
              </>
            )}
            {stage === 'running' && (
              <div className="text-[12px] uppercase tracking-wider text-sky-400 font-bold">
                {isAR ? 'يستمع…' : 'Listening…'}
              </div>
            )}
            {stage === 'finished' && (
              <div className="text-[12px] uppercase tracking-wider text-emerald-400 font-bold">
                {isAR ? 'انتهى الامتحان' : 'Exam finished'}
              </div>
            )}
          </div>

          {/* Transcript */}
          <div className="w-full max-w-2xl">
            <TranscriptStream transcript={transcript} />
          </div>

          {/* Bottom controls */}
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
              <Btn kind="primary" size="lg" onClick={() => { bumpStreak(120); go('progress'); }}>
                {isAR ? 'شوف نتيجتك' : 'See your report'} <span className="ltr">→</span>
              </Btn>
            )}
          </div>
        </div>

        {/* Right: rubric */}
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
    { k: isAR ? 'المستوى' : 'Difficulty', v: isAR ? 'محاكاة وزارة'           : 'MOE-level' },
    { k: isAR ? 'اللهجة' : 'Accent',      v: isAR ? 'مصري'                    : 'Egyptian Arabic' },
    { k: isAR ? 'المدة'  : 'Length',      v: isAR ? '٥ دقائق'                  : '5 minutes' },
  ];
  return (
    <div className="bg-slate-900/70 backdrop-blur border border-slate-800 rounded-2xl p-4">
      <div className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500 mb-3 ltr">Session</div>
      <div className="space-y-2">
        {rows.map((r,i) => (
          <div key={i} className="flex items-center justify-between text-[12.5px]">
            <span className="text-slate-400">{r.k}</span>
            <span className="font-semibold text-slate-200">{r.v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TranscriptStream({ transcript }) {
  const { isAR } = useApp();
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [transcript]);

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
              ${isStudent ? 'bg-sky-600/30 border border-sky-500/40 text-slate-100'
                          : 'bg-slate-800 text-slate-200'}`}>
              <div className={`text-[10.5px] font-bold uppercase tracking-wider mb-1
                ${isStudent ? 'text-sky-300' : 'text-violet-300'}`}>
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

function RubricPanel({ scores, stage }) {
  const { isAR } = useApp();
  const items = [
    { key: 'pronunciation', ar: 'النطق',   en: 'Pronunciation', icon: '🗣️' },
    { key: 'confidence',    ar: 'الثقة',    en: 'Confidence',    icon: '💪' },
    { key: 'accuracy',      ar: 'الدقة',    en: 'Accuracy',      icon: '🎯' },
    { key: 'structure',     ar: 'البناء',   en: 'Structure',     icon: '🏗️' },
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
          {Math.round(total*100)}<span className="text-base text-slate-500">%</span>
        </div>
      </div>

      <div className="space-y-3.5">
        {items.map(it => {
          const v = scores[it.key];
          const pct = Math.round(v*100);
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

Object.assign(window, { Oral });


/* ━━━━━━━━━━━━━━━ progress.jsx ━━━━━━━━━━━━━━━ */
/* progress.jsx — heatmap calendar, mastery bars, concept graph, parent summary */

function Progress() {
  const { isAR, go } = useApp();
  return (
    <ChromeLayout>
      <div className="px-5 lg:px-10 py-6 lg:py-8 max-w-[1400px]">
        <div className="flex items-end justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl lg:text-3xl font-extrabold text-slate-900">
              {isAR ? 'تقدمك' : 'Your progress'}
            </h1>
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
    { k: isAR ? 'أيام متواصلة' : 'Day streak',   v: streak,       sub: '🔥',    accent: 'text-amber-600' },
    { k: isAR ? 'XP إجمالي'    : 'Total XP',     v: xp.toLocaleString(), sub: '✦', accent: 'text-sky-600' },
    { k: isAR ? 'ساعات مذاكرة' : 'Study hours',  v: 38,           sub: '⏱️',   accent: 'text-slate-900' },
    { k: isAR ? 'مفاهيم مُتقنة' : 'Concepts mastered', v: 47,      sub: '🧩',   accent: 'text-emerald-600' },
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
  // 7 rows (days of week) x 26 columns (~6 months) — GitHub-style
  const cols = 26;
  const data = useMemo(() => {
    const out = [];
    let seed = 1;
    for (let c = 0; c < cols; c++) {
      const week = [];
      for (let r = 0; r < 7; r++) {
        seed = (seed * 9301 + 49297) % 233280;
        const r0 = seed / 233280;
        // bias: more activity recently
        const recency = c / cols;
        let v = r0 * (0.55 + recency*0.4);
        // weekends a bit lower
        if (r === 5 || r === 6) v *= 0.65;
        let level = v > 0.85 ? 4 : v > 0.65 ? 3 : v > 0.45 ? 2 : v > 0.25 ? 1 : 0;
        if (c === cols - 1 && r === 3) level = 4; // today
        week.push(level);
      }
      out.push(week);
    }
    return out;
  }, []);
  const totalDays = data.flat().filter(v => v > 0).length;

  const monthsAr = ['ينا','فبر','مار','أبر','ماي','يون'];
  const monthsEn = ['Dec','Jan','Feb','Mar','Apr','May'];
  const months = isAR ? monthsAr : monthsEn;

  return (
    <Card className="p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="font-extrabold text-slate-900 text-[15px]">
          {isAR ? 'خريطة مذاكرتك' : 'Study heatmap'}
        </div>
        <div className="text-[12px] text-slate-500">
          {isAR ? `${totalDays} يوم نشط آخر ٦ شهور` : `${totalDays} active days in last 6 months`}
        </div>
        <div className="ms-auto flex items-center gap-1.5 text-[10.5px] text-slate-500 ltr">
          <span>less</span>
          {[0,1,2,3,4].map(l => <span key={l} className={`hm${l} w-3 h-3 rounded-sm`} />)}
          <span>more</span>
        </div>
      </div>

      <div className="overflow-x-auto slim ltr">
        <div className="flex gap-[3px] min-w-min">
          {data.map((week, c) => (
            <div key={c} className="flex flex-col gap-[3px]">
              {/* month label every 4 cols */}
              {c % 4 === 0 && (
                <div className="text-[9.5px] text-slate-400 h-3 -mt-3 -mb-0">
                  {months[Math.floor(c/4)] || ''}
                </div>
              )}
              {c % 4 !== 0 && <div className="h-0" />}
              {week.map((v, r) => (
                <div key={r}
                     title={`level ${v}`}
                     className={`hm${v} w-3 h-3 rounded-sm hover:ring-2 hover:ring-sky-400 transition cursor-pointer`} />
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
  // Manually positioned nodes; status: mastered/progress/weak
  const nodes = [
    { id: 'pv',     x:  90, y:  60, ar: 'P·V=k',       en: 'P·V=k',         status: 'mastered' },
    { id: 'boyle',  x: 230, y:  60, ar: 'بويل',         en: 'Boyle',         status: 'mastered' },
    { id: 'charles',x: 230, y: 180, ar: 'شارل',         en: 'Charles',       status: 'progress' },
    { id: 'gay',    x: 230, y: 300, ar: 'جاي-لوساك',    en: 'Gay-Lussac',    status: 'progress' },
    { id: 'ideal',  x: 410, y: 180, ar: 'PV=nRT',      en: 'PV=nRT',        status: 'weak' },
    { id: 'kelvin', x: 580, y:  80, ar: 'كلفن',         en: 'Kelvin scale',  status: 'mastered' },
    { id: 'moles',  x: 580, y: 180, ar: 'المولات n',    en: 'Moles n',       status: 'progress' },
    { id: 'isolate',x: 580, y: 300, ar: 'عزل المتغير T',en: 'Isolate T',     status: 'weak' },
    { id: 'thermo', x: 750, y: 180, ar: 'ترموديناميكا', en: 'Thermo',        status: 'weak' },
  ];
  const edges = [
    ['pv','boyle'],['boyle','ideal'],['charles','ideal'],['gay','ideal'],
    ['ideal','kelvin'],['ideal','moles'],['ideal','isolate'],['isolate','thermo'],
    ['kelvin','thermo'],['moles','thermo'],
  ];
  const COLOR = { mastered: '#0284c7', progress: '#f59e0b', weak: '#64748b' };
  const FILL  = { mastered: '#e0f2fe', progress: '#fef3c7', weak: '#e2e8f0' };

  const byId = Object.fromEntries(nodes.map(n => [n.id, n]));

  return (
    <Card className="p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="font-extrabold text-slate-900 text-[15px]">
          {isAR ? 'خريطة المفاهيم — فيزياء' : 'Concept graph — Physics'}
        </div>
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
          {edges.map(([a,b], i) => {
            const A = byId[a], B = byId[b];
            return (
              <line key={i} x1={A.x} y1={A.y} x2={B.x} y2={B.y}
                    stroke="#cbd5e1" strokeWidth="1.5" markerEnd="url(#arrow)" />
            );
          })}
          {nodes.map(n => (
            <g key={n.id}>
              <circle cx={n.x} cy={n.y} r="34"
                      fill={FILL[n.status]} stroke={COLOR[n.status]} strokeWidth="2" />
              <text x={n.x} y={n.y+4} textAnchor="middle"
                    fontFamily={(/[\u0600-\u06FF]/).test(n.ar) ? 'Cairo' : 'Inter'}
                    fontWeight="700" fontSize="11" fill="#0f172a">
                {(/[\u0600-\u06FF]/).test(n.ar) && false ? n.en : n.en}
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
  const subjects = [
    { id: 'physics',   v: 0.72 },
    { id: 'chemistry', v: 0.61 },
    { id: 'math',      v: 0.83 },
    { id: 'biology',   v: 0.45 },
    { id: 'arabic',    v: 0.68 },
  ];
  return (
    <Card className="p-5">
      <div className="font-extrabold text-slate-900 text-[15px] mb-4">
        {isAR ? 'إتقان المواد' : 'Per-subject mastery'}
      </div>
      <div className="space-y-3.5">
        {subjects.map(s => {
          const m = SUBJECT_META[s.id];
          const pct = Math.round(s.v*100);
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
          <div className="font-extrabold text-slate-900 text-[15px]">
            {isAR ? 'ملخص ولي الأمر' : 'Parent summary'}
          </div>
          <div className="text-[12.5px] text-slate-600 mt-0.5">
            {isAR ? 'تقرير PDF لأسبوع كامل، جاهز للإرسال.'
                  : 'Weekly PDF report, ready to share.'}
          </div>
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
      <Btn kind="amber" className="w-full mt-4">
        📥 {isAR ? 'تحميل PDF' : 'Download PDF'}
      </Btn>
    </Card>
  );
}

function BadgesCard() {
  const { isAR } = useApp();
  const badges = [
    { icon: '🔥', ar: 'سلسلة أسبوع', en: 'Week streak', earned: true },
    { icon: '🧠', ar: '٥٠ سؤال',     en: '50 questions', earned: true },
    { icon: '🎤', ar: 'شفهي أول',     en: 'First oral',   earned: true },
    { icon: '⚡',  ar: 'حلّ سريع',    en: 'Speed solver', earned: false },
    { icon: '🏆', ar: 'إتقان فصل',    en: 'Chapter mastery', earned: false },
    { icon: '🌙', ar: 'بومة ليل',     en: 'Night owl',    earned: false },
  ];
  return (
    <Card className="p-5">
      <div className="font-extrabold text-slate-900 text-[15px] mb-4">
        {isAR ? 'شاراتك' : 'Badges'}
      </div>
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

Object.assign(window, { Progress });


/* ━━━━━━━━━━━━━━━ settings.jsx ━━━━━━━━━━━━━━━ */
/* settings.jsx — language, TTS accent, notifications, textbooks, privacy */

function Settings() {
  const { isAR, lang, setLang } = useApp();
  const [accent, setAccent] = useState('eg');
  const [notif, setNotif] = useState({ daily: true, weekly: true, weak: true, exam: true });
  const [reIngest, setReIngest] = useState(false);

  return (
    <ChromeLayout>
      <div className="px-5 lg:px-10 py-6 lg:py-8 max-w-3xl">
        <h1 className="text-2xl lg:text-3xl font-extrabold text-slate-900">
          {isAR ? 'الإعدادات' : 'Settings'}
        </h1>
        <p className="text-slate-500 mt-1 text-[14px] mb-8">
          {isAR ? 'فصّل خصوصي على ذوقك.' : 'Tailor 5sosy to how you study.'}
        </p>

        <SettingSection title={isAR ? 'اللغة والاتجاه' : 'Language & direction'} icon="🌐">
          <Row label={isAR ? 'لغة الواجهة' : 'Interface language'}>
            <Segmented options={[
              { id: 'ar', label: 'العربية' },
              { id: 'en', label: 'English' },
            ]} value={lang} onChange={setLang} />
          </Row>
          <Row label={isAR ? 'لهجة TTS' : 'TTS accent'} sub={isAR ? 'الصوت اللي 5sosy بيشرح بيه' : "Voice 5sosy uses to read lessons"}>
            <Segmented options={[
              { id: 'eg',  label: isAR ? 'مصري'  : 'Egyptian', glyph: '🇪🇬' },
              { id: 'msa', label: isAR ? 'فصحى' : 'MSA',       glyph: 'ع' },
            ]} value={accent} onChange={setAccent} />
          </Row>
        </SettingSection>

        <SettingSection title={isAR ? 'التنبيهات' : 'Notifications'} icon="🔔">
          <Toggle label={isAR ? 'تذكير المذاكرة اليومي' : 'Daily study reminder'}
                  sub={isAR ? '٤:٠٠م كل يوم'              : 'Every day at 4:00pm'}
                  value={notif.daily} onChange={v => setNotif(n => ({...n, daily: v}))} />
          <Toggle label={isAR ? 'تقرير أسبوعي' : 'Weekly report'}
                  sub={isAR ? 'كل سبت ٩:٠٠ص'  : 'Saturdays at 9:00am'}
                  value={notif.weekly} onChange={v => setNotif(n => ({...n, weekly: v}))} />
          <Toggle label={isAR ? 'تنبيهي لمفهوم ضعيف' : 'Weak-concept alert'}
                  sub={isAR ? 'لما الوكيل البيداغوجي يلاقي ضعف' : 'When pedagogy agent flags a slip'}
                  value={notif.weak} onChange={v => setNotif(n => ({...n, weak: v}))} />
          <Toggle label={isAR ? 'عد تنازلي للامتحانات' : 'Exam countdown'}
                  sub={isAR ? 'تنبيهات قبل الامتحانات' : 'Heads-up before exams'}
                  value={notif.exam} onChange={v => setNotif(n => ({...n, exam: v}))} />
        </SettingSection>

        <SettingSection title={isAR ? 'الكتب المربوطة' : 'Connected textbooks'} icon="📚">
          <div className="space-y-2">
            {[
              { id: 'physics',   ar: 'الفيزياء — الصف الثالث الثانوي ٢٠٢٥', en: 'Physics — G12 (2025)',   indexed: true, when: isAR ? 'منذ ١٢ يوم' : '12 days ago' },
              { id: 'chemistry', ar: 'الكيمياء — الصف الثالث الثانوي ٢٠٢٥', en: 'Chemistry — G12 (2025)', indexed: true, when: isAR ? 'منذ ٨ أيام' : '8 days ago' },
              { id: 'math',      ar: 'الرياضيات البحتة — ٢٠٢٥',               en: 'Pure Math — G12',         indexed: false, when: isAR ? 'لم تتم الفهرسة' : 'not yet indexed' },
            ].map(b => {
              const m = SUBJECT_META[b.id];
              return (
                <div key={b.id} className="flex items-center gap-3 px-3 py-3 bg-slate-50 rounded-lg">
                  <div className={`w-9 h-9 rounded-lg grid place-items-center text-xl ${HUE[m.hue].bg}`}>{m.glyph}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-slate-900 truncate">{isAR ? b.ar : b.en}</div>
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
          <Btn kind="outline" className="mt-3 w-full">
            ＋ {isAR ? 'إضافة كتاب' : 'Add textbook'}
          </Btn>

          {reIngest && (
            <div className="mt-4">
              <AgentLog
                heading="ingestion.log · re-run"
                speed={9}
                lines={[
                  { agent: 'IngestionAgent', text: 'Re-reading math.pdf from MOE source…', status: 'info' },
                  { agent: 'TopologyAgent',  text: 'Refreshing chapter graph (24 chapters).' },
                  { agent: 'IngestionAgent', text: 'Index updated ✓', status: 'ok' },
                ]} />
            </div>
          )}
          <button onClick={() => setReIngest(true)} className="mt-3 text-[12px] font-semibold text-slate-500 hover:text-slate-800">
            {isAR ? '▸ إعادة تشغيل وكيل الاستيعاب لكل الكتب' : '▸ Re-run ingestion for all books'}
          </button>
        </SettingSection>

        <SettingSection title={isAR ? 'البيانات والخصوصية' : 'Data & privacy'} icon="🔒">
          <Row label={isAR ? 'حفظ سجل المحادثات' : 'Save chat history'}
               sub={isAR ? '٣٠ يوم على جهازك' : 'Stored 30 days on this device'}>
            <Toggle inline value={true} onChange={() => {}} />
          </Row>
          <Row label={isAR ? 'مشاركة بيانات مجهولة لتحسين الوكلاء' : 'Share anonymous data to improve agents'}
               sub={isAR ? 'محظور أي معرّف شخصي' : 'No personal identifiers ever shared'}>
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

function SettingSection({ title, icon, children }) {
  return (
    <div className="mb-7">
      <h2 className="text-[13px] font-extrabold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
        <span className="text-base">{icon}</span>{title}
      </h2>
      <Card className="p-4 space-y-3">
        {children}
      </Card>
    </div>
  );
}

function Row({ label, sub, children }) {
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

function Toggle({ label, sub, value, onChange, inline }) {
  const btn = (
    <button onClick={() => onChange(!value)}
      className={`relative w-11 h-6 rounded-full transition shrink-0 ${value ? 'bg-sky-600' : 'bg-slate-300'}`}>
      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition
        ${value ? 'start-[22px]' : 'start-0.5'}`} />
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

function Segmented({ options, value, onChange }) {
  return (
    <div className="inline-flex bg-slate-100 rounded-lg p-1">
      {options.map(o => {
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

Object.assign(window, { Settings });


/* ━━━━━━━━━━━━━━━ app.jsx ━━━━━━━━━━━━━━━ */
/* app.jsx — root router */

function App() {
  const { route } = useApp();
  let Screen;
  switch (route) {
    case 'onboarding': Screen = Onboarding; break;
    case 'home':       Screen = Home; break;
    case 'session':    Screen = Session; break;
    case 'quiz':       Screen = Quiz; break;
    case 'oral':       Screen = Oral; break;
    case 'progress':   Screen = Progress; break;
    case 'settings':   Screen = Settings; break;
    default:           Screen = Onboarding;
  }
  return <Screen />;
}

function Root() {
  return (
    <AppProvider>
      <App />
    </AppProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<Root />);

