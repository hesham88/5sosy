import type { ActivityItem, PlanBlock, UpcomingExam, WeakTopic } from '@/lib/types';

export const HOME_PLAN: PlanBlock[] = [
  { id: 1, subject: 'physics',   dur: 25, type: 'review',  arT: 'مراجعة قانون بويل', enT: "Review Boyle's Law", arSub: 'الفصل ٤ — الغازات', enSub: 'Ch.4 — Gas Laws' },
  { id: 2, subject: 'physics',   dur: 15, type: 'quiz',    arT: 'اختبار سريع — قوانين الغازات', enT: 'Quick check — Gas Laws', arSub: '٥ أسئلة', enSub: '5 questions' },
  { id: 3, subject: 'chemistry', dur: 20, type: 'lesson',  arT: 'التحليل الكمي — الجزء الأول', enT: 'Quantitative analysis — Part 1', arSub: 'فصل ٢', enSub: 'Chapter 2' },
  { id: 4, subject: 'math',      dur: 30, type: 'practice', arT: 'تمارين تفاضل وتكامل', enT: 'Calculus drills', arSub: 'سؤال ١٢ نهايات', enSub: '12 problems · limits' },
  { id: 5, subject: 'arabic',    dur: 15, type: 'audio',   arT: 'ملخص صوتي — النصوص الأدبية', enT: 'Audio summary — Arabic texts', arSub: 'بصوت خصوصي', enSub: "In 5sosy's voice" },
  { id: 6, subject: 'physics',   dur: 20, type: 'oral',    arT: 'تدريب شفهي — ترموديناميكا', enT: 'Oral practice — Thermodynamics', arSub: 'محاكاة لجنة', enSub: 'Examiner sim' }
];

export const WEAK_TOPICS: WeakTopic[] = [
  { id: 'gas-laws',    subject: 'physics',   arT: 'قوانين الغازات',  enT: 'Gas laws',            conf: 0.32 },
  { id: 'pv-nrt',      subject: 'physics',   arT: 'معادلة PV=nRT',   enT: 'PV = nRT',            conf: 0.28 },
  { id: 'titration',   subject: 'chemistry', arT: 'المعايرة الحمضية', enT: 'Acid-base titration', conf: 0.45 },
  { id: 'derivatives', subject: 'math',      arT: 'قواعد الاشتقاق',   enT: 'Derivative rules',    conf: 0.58 },
  { id: 'french-camp', subject: 'history',   arT: 'الحملة الفرنسية',  enT: 'French campaign',     conf: 0.62 },
  { id: 'cell-resp',   subject: 'biology',   arT: 'التنفس الخلوي',    enT: 'Cellular respiration', conf: 0.71 }
];

export const UPCOMING: UpcomingExam[] = [
  { id: 1, subject: 'physics',   arT: 'امتحان نصف الترم — فيزياء', enT: 'Mid-term — Physics', days: 2, urgent: true },
  { id: 2, subject: 'chemistry', arT: 'كويز — كيمياء عضوية',         enT: 'Quiz — Organic chem', days: 5, urgent: false },
  { id: 3, subject: 'arabic',    arT: 'تسميع النصوص',                 enT: 'Arabic recitation',   days: 9, urgent: false }
];

export const ACTIVITY: ActivityItem[] = [
  { agent: 'AssessmentAgent', arT: 'حدّث درجتك في قوانين الغازات → 32٪',            enT: 'Updated your gas-laws score → 32%', ago: '٢د', agoEn: '2m', glyph: '📊' },
  { agent: 'PedagogyAgent',   arT: 'لقى مفهومين ضعفاء جدد في فصل الترموديناميكا', enT: 'Found 2 new weak concepts in Thermo ch.', ago: '٧د', agoEn: '7m', glyph: '🧠' },
  { agent: 'PlannerAgent',    arT: 'عدّل خطة النهاردة بناءً على أداء أمس',           enT: "Tweaked today's plan from yesterday's perf", ago: '١س', agoEn: '1h', glyph: '🗓️' },
  { agent: 'IngestionAgent',  arT: 'فهرسة كتاب الكيمياء — تم',                       enT: 'Chemistry textbook indexed', ago: '٣س', agoEn: '3h', glyph: '📥', status: 'ok' }
];

export const QUIZ_QUESTIONS = [
  {
    id: 1, kind: 'mcq' as const,
    ar: 'لو ضغط غاز ٢ atm وحجمه ٤ لتر، عند ثبات الحرارة، إيه حجمه لو الضغط بقى ٤ atm؟',
    en: 'A gas at 2 atm occupies 4 L. At constant T, what is its volume at 4 atm?',
    choices: [
      { id: 'a', ar: '٨ لتر', en: '8 L' },
      { id: 'b', ar: '٤ لتر', en: '4 L' },
      { id: 'c', ar: '٢ لتر', en: '2 L' },
      { id: 'd', ar: '١ لتر', en: '1 L' }
    ],
    answer: 'c'
  },
  {
    id: 2, kind: 'short' as const,
    ar: 'لما الحرارة بتزيد عند ثبات الحجم، الضغط بـ ___ (زاد / قل / ثبت)',
    en: 'At constant volume, raising temperature causes pressure to ___ (rise / fall / stay)',
    placeholder: { ar: 'زاد / قل / ثبت', en: 'rise / fall / stay' },
    answer: ['rise', 'زاد', 'يزيد', 'increase', 'increases']
  },
  {
    id: 3, kind: 'order' as const,
    ar: 'رتّب الخطوات لحساب T من PV=nRT لما المعطيات P و V و n معروفين',
    en: 'Order the steps to compute T from PV=nRT given P, V, n',
    items: [
      { id: 's1', ar: 'حدّد المعطيات: P, V, n, R', en: 'List knowns: P, V, n, R' },
      { id: 's2', ar: 'اقسم الطرفين على n·R', en: 'Divide both sides by n·R' },
      { id: 's3', ar: 'اكتب: T = (P·V) / (n·R)', en: 'Write: T = (P·V) / (n·R)' },
      { id: 's4', ar: 'حوّل الإجابة لكلفن إذا لزم', en: 'Convert answer to Kelvin if needed' }
    ],
    order: ['s1', 's2', 's3', 's4']
  }
];

export const ORAL_SCRIPT = [
  { who: 'examiner' as const, delay: 900,  ar: 'صباح الخير يا يوسف. هنبدأ بسؤال بسيط — اشرحلي قانون بويل بكلامك.', en: "Good morning, Youssef. Let's start simple — explain Boyle's law in your own words." },
  { who: 'student'  as const, delay: 2200, ar: 'حاضر. قانون بويل بيقول إنه عند ثبات الحرارة، حجم الغاز بيقل لما الضغط يزيد، والعكس صحيح.', en: "Sure. Boyle's law says that at constant temperature, gas volume drops when pressure rises, and vice versa." },
  { who: 'examiner' as const, delay: 1600, ar: 'تمام. ولو قلتلك P × V = ثابت، إيه شرط الثابت ده؟', en: "Good. And if I say P × V = constant, what's the condition?" },
  { who: 'student'  as const, delay: 2400, ar: 'الشرط إن الحرارة تفضل ثابتة، وعدد المولات يفضل ثابت برضو.', en: 'Temperature must stay constant, and the number of moles too.' },
  { who: 'examiner' as const, delay: 1500, ar: 'برافو. خلينا نشوف PV=nRT — استخرجلي T لو عرفنا الباقي.', en: "Nice. From PV=nRT, isolate T." },
  { who: 'student'  as const, delay: 2600, ar: 'هقسم الطرفين على n×R، يبقى T = PV على nR. وآخر خطوة، أتأكد إن الإجابة بالكلفن.', en: 'Divide both sides by n·R, so T = PV / (nR). Then make sure the answer is in Kelvin.' },
  { who: 'examiner' as const, delay: 1400, ar: 'ممتاز. سؤال أخير — ليه استخدمنا الكلفن أصلاً؟', en: 'Excellent. Last one — why Kelvin?' }
];
