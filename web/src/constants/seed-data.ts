import type { ActivityItem, Book, PlanBlock, SubjectProgress, UpcomingExam, WeakTopic, WeekPlanDay } from '@/lib/types';

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

export const BOOKS: Book[] = [
  {
    id: 'phy-g12-moe',
    subject: 'physics',
    arT: 'الفيزياء — الصف الثالث الثانوي',
    enT: 'Physics — Grade 12',
    arSub: 'وزارة التربية والتعليم · ٢٠٢٥',
    enSub: 'Ministry of Education · 2025',
    publisher: 'MOE Egypt',
    year: 2025,
    chapters: 7,
    pages: 312,
    status: 'indexed',
    mastery: 0.46,
    lastAccessedAr: 'من ساعة',
    lastAccessedEn: '1h ago',
    cover: 'sky'
  },
  {
    id: 'phy-amer-explained',
    subject: 'physics',
    arT: 'الأمير في شرح الفيزياء',
    enT: 'Al-Amir — Physics Workbook',
    arSub: 'كتاب خارجي · مسائل محلولة',
    enSub: 'External · solved problems',
    publisher: 'Al-Amir',
    year: 2024,
    chapters: 9,
    pages: 480,
    status: 'indexed',
    mastery: 0.58,
    lastAccessedAr: 'أمس',
    lastAccessedEn: 'yesterday',
    cover: 'sky'
  },
  {
    id: 'chem-g12-moe',
    subject: 'chemistry',
    arT: 'الكيمياء — الصف الثالث الثانوي',
    enT: 'Chemistry — Grade 12',
    arSub: 'وزارة التربية والتعليم · ٢٠٢٥',
    enSub: 'Ministry of Education · 2025',
    publisher: 'MOE Egypt',
    year: 2025,
    chapters: 6,
    pages: 268,
    status: 'indexed',
    mastery: 0.61,
    lastAccessedAr: 'من ٣ أيام',
    lastAccessedEn: '3d ago',
    cover: 'violet'
  },
  {
    id: 'chem-elmoasser',
    subject: 'chemistry',
    arT: 'المُعاصر في الكيمياء',
    enT: 'El-Moasser — Chemistry',
    arSub: 'كتاب خارجي · أسئلة وزارية',
    enSub: 'External · ministerial Qs',
    publisher: 'El-Moasser',
    year: 2024,
    chapters: 8,
    pages: 392,
    status: 'processing',
    mastery: 0.0,
    lastAccessedAr: 'لسه ما اتفتحش',
    lastAccessedEn: 'not opened yet',
    cover: 'violet'
  },
  {
    id: 'bio-g12-moe',
    subject: 'biology',
    arT: 'الأحياء — الصف الثالث الثانوي',
    enT: 'Biology — Grade 12',
    arSub: 'وزارة التربية والتعليم · ٢٠٢٥',
    enSub: 'Ministry of Education · 2025',
    publisher: 'MOE Egypt',
    year: 2025,
    chapters: 5,
    pages: 244,
    status: 'indexed',
    mastery: 0.71,
    lastAccessedAr: 'أمس',
    lastAccessedEn: 'yesterday',
    cover: 'emerald'
  },
  {
    id: 'math-calc-g12-moe',
    subject: 'math',
    arT: 'التفاضل والتكامل — الصف الثالث الثانوي',
    enT: 'Calculus — Grade 12',
    arSub: 'وزارة التربية والتعليم · ٢٠٢٥',
    enSub: 'Ministry of Education · 2025',
    publisher: 'MOE Egypt',
    year: 2025,
    chapters: 6,
    pages: 220,
    status: 'indexed',
    mastery: 0.54,
    lastAccessedAr: 'من ٤ ساعات',
    lastAccessedEn: '4h ago',
    cover: 'cyan'
  },
  {
    id: 'math-algebra-g12-moe',
    subject: 'math',
    arT: 'الجبر والهندسة الفراغية',
    enT: 'Algebra & Solid Geometry',
    arSub: 'وزارة التربية والتعليم · ٢٠٢٥',
    enSub: 'Ministry of Education · 2025',
    publisher: 'MOE Egypt',
    year: 2025,
    chapters: 5,
    pages: 196,
    status: 'indexed',
    mastery: 0.49,
    lastAccessedAr: 'من يومين',
    lastAccessedEn: '2d ago',
    cover: 'cyan'
  },
  {
    id: 'ar-g12-moe',
    subject: 'arabic',
    arT: 'اللغة العربية — الصف الثالث الثانوي',
    enT: 'Arabic — Grade 12',
    arSub: 'وزارة التربية والتعليم · ٢٠٢٥',
    enSub: 'Ministry of Education · 2025',
    publisher: 'MOE Egypt',
    year: 2025,
    chapters: 4,
    pages: 188,
    status: 'indexed',
    mastery: 0.78,
    lastAccessedAr: 'من ٦ ساعات',
    lastAccessedEn: '6h ago',
    cover: 'amber'
  },
  {
    id: 'history-g12-moe',
    subject: 'history',
    arT: 'التاريخ — الصف الثالث الثانوي',
    enT: 'History — Grade 12',
    arSub: 'وزارة التربية والتعليم · ٢٠٢٥',
    enSub: 'Ministry of Education · 2025',
    publisher: 'MOE Egypt',
    year: 2025,
    chapters: 6,
    pages: 232,
    status: 'indexed',
    mastery: 0.62,
    lastAccessedAr: 'من ٣ أيام',
    lastAccessedEn: '3d ago',
    cover: 'rose'
  },
  {
    id: 'en-g12-moe',
    subject: 'english',
    arT: 'اللغة الإنجليزية — الصف الثالث الثانوي',
    enT: 'English — Grade 12',
    arSub: 'وزارة التربية والتعليم · ٢٠٢٥',
    enSub: 'Ministry of Education · 2025',
    publisher: 'MOE Egypt',
    year: 2025,
    chapters: 5,
    pages: 204,
    status: 'indexed',
    mastery: 0.69,
    lastAccessedAr: 'أمس',
    lastAccessedEn: 'yesterday',
    cover: 'indigo'
  },
  {
    id: 'geo-g12-moe',
    subject: 'geography',
    arT: 'الجغرافيا — الصف الثالث الثانوي',
    enT: 'Geography — Grade 12',
    arSub: 'وزارة التربية والتعليم · ٢٠٢٥',
    enSub: 'Ministry of Education · 2025',
    publisher: 'MOE Egypt',
    year: 2025,
    chapters: 5,
    pages: 218,
    status: 'queued',
    mastery: 0.0,
    lastAccessedAr: 'في الانتظار',
    lastAccessedEn: 'queued',
    cover: 'teal'
  },
  {
    id: 'phil-g12-moe',
    subject: 'philosophy',
    arT: 'الفلسفة والمنطق — الصف الثالث الثانوي',
    enT: 'Philosophy & Logic — Grade 12',
    arSub: 'وزارة التربية والتعليم · ٢٠٢٥',
    enSub: 'Ministry of Education · 2025',
    publisher: 'MOE Egypt',
    year: 2025,
    chapters: 4,
    pages: 176,
    status: 'indexed',
    mastery: 0.55,
    lastAccessedAr: 'من ٥ أيام',
    lastAccessedEn: '5d ago',
    cover: 'fuchsia'
  }
];

export const SUBJECT_PROGRESS: SubjectProgress[] = [
  { subject: 'physics',    mastery: 0.46, chaptersDone: 3, chaptersTotal: 7, books: 2, weakTopics: 4, minutesThisWeek: 184, lastTopicAr: 'قانون بويل',            lastTopicEn: "Boyle's Law" },
  { subject: 'chemistry',  mastery: 0.55, chaptersDone: 3, chaptersTotal: 6, books: 2, weakTopics: 2, minutesThisWeek: 142, lastTopicAr: 'المعايرة الحمضية',     lastTopicEn: 'Acid-base titration' },
  { subject: 'biology',    mastery: 0.71, chaptersDone: 4, chaptersTotal: 5, books: 1, weakTopics: 1, minutesThisWeek: 96,  lastTopicAr: 'التنفس الخلوي',         lastTopicEn: 'Cellular respiration' },
  { subject: 'math',       mastery: 0.51, chaptersDone: 5, chaptersTotal: 11, books: 2, weakTopics: 3, minutesThisWeek: 220, lastTopicAr: 'قواعد الاشتقاق',         lastTopicEn: 'Derivative rules' },
  { subject: 'arabic',     mastery: 0.78, chaptersDone: 3, chaptersTotal: 4, books: 1, weakTopics: 1, minutesThisWeek: 64,  lastTopicAr: 'النصوص الأدبية',         lastTopicEn: 'Literary texts' },
  { subject: 'english',    mastery: 0.69, chaptersDone: 3, chaptersTotal: 5, books: 1, weakTopics: 1, minutesThisWeek: 58,  lastTopicAr: 'القواعد',                lastTopicEn: 'Grammar' },
  { subject: 'history',    mastery: 0.62, chaptersDone: 3, chaptersTotal: 6, books: 1, weakTopics: 2, minutesThisWeek: 72,  lastTopicAr: 'الحملة الفرنسية',         lastTopicEn: 'French campaign' },
  { subject: 'geography',  mastery: 0.40, chaptersDone: 2, chaptersTotal: 5, books: 1, weakTopics: 2, minutesThisWeek: 30,  lastTopicAr: 'الموارد المائية',         lastTopicEn: 'Water resources' },
  { subject: 'philosophy', mastery: 0.55, chaptersDone: 2, chaptersTotal: 4, books: 1, weakTopics: 1, minutesThisWeek: 44,  lastTopicAr: 'المنطق الصوري',           lastTopicEn: 'Formal logic' }
];

export const WEEK_PLAN: WeekPlanDay[] = [
  {
    dayKey: 'sat', arLabel: 'السبت', enLabel: 'Sat', date: 16,
    blocks: [
      { id: 11, subject: 'physics',   dur: 30, type: 'review',  arT: 'مراجعة الفصل الثالث',          enT: 'Review Ch.3',                  arSub: 'الحركة الدورانية', enSub: 'Rotational motion' },
      { id: 12, subject: 'arabic',    dur: 20, type: 'audio',   arT: 'ملخص صوتي — البلاغة',          enT: 'Audio — Rhetoric',             arSub: 'بصوت خصوصي',       enSub: "In 5sosy's voice" }
    ]
  },
  {
    dayKey: 'sun', arLabel: 'الأحد', enLabel: 'Sun', date: 17,
    blocks: [
      { id: 21, subject: 'chemistry', dur: 35, type: 'lesson',  arT: 'كيمياء عضوية — ج٢',           enT: 'Organic chem — Part 2',        arSub: 'فصل ٣',            enSub: 'Chapter 3' },
      { id: 22, subject: 'math',      dur: 25, type: 'practice', arT: 'تمارين تفاضل',                enT: 'Differentiation drills',       arSub: '١٢ سؤال',          enSub: '12 problems' }
    ]
  },
  {
    dayKey: 'mon', arLabel: 'الإثنين', enLabel: 'Mon', date: 18, isToday: true,
    blocks: HOME_PLAN
  },
  {
    dayKey: 'tue', arLabel: 'الثلاثاء', enLabel: 'Tue', date: 19,
    blocks: [
      { id: 31, subject: 'biology',   dur: 30, type: 'lesson',  arT: 'التنفس الخلوي',               enT: 'Cellular respiration',         arSub: 'فصل ٥',            enSub: 'Chapter 5' },
      { id: 32, subject: 'biology',   dur: 15, type: 'quiz',    arT: 'كويز سريع',                   enT: 'Quick quiz',                   arSub: '٥ أسئلة',          enSub: '5 questions' },
      { id: 33, subject: 'history',   dur: 25, type: 'review',  arT: 'الحملة الفرنسية',              enT: 'French campaign',              arSub: 'فصل ٢',            enSub: 'Chapter 2' }
    ]
  },
  {
    dayKey: 'wed', arLabel: 'الأربعاء', enLabel: 'Wed', date: 20,
    blocks: [
      { id: 41, subject: 'english',   dur: 20, type: 'practice', arT: 'تمارين قواعد',                enT: 'Grammar drills',               arSub: 'الأزمنة',          enSub: 'Tenses' },
      { id: 42, subject: 'philosophy',dur: 20, type: 'lesson',  arT: 'المنطق الصوري',                enT: 'Formal logic',                 arSub: 'مدخل',             enSub: 'Intro' }
    ]
  },
  {
    dayKey: 'thu', arLabel: 'الخميس', enLabel: 'Thu', date: 21,
    blocks: [
      { id: 51, subject: 'physics',   dur: 35, type: 'practice', arT: 'مسائل ترموديناميكا',           enT: 'Thermo problems',              arSub: 'بنك أسئلة',        enSub: 'Question bank' },
      { id: 52, subject: 'physics',   dur: 25, type: 'oral',    arT: 'محاكاة لجنة شفهي',             enT: 'Oral examiner sim',            arSub: 'ترموديناميكا',     enSub: 'Thermo' }
    ]
  },
  {
    dayKey: 'fri', arLabel: 'الجمعة', enLabel: 'Fri', date: 22,
    blocks: [
      { id: 61, subject: 'chemistry', dur: 25, type: 'review',  arT: 'مراجعة شاملة',                 enT: 'Comprehensive review',         arSub: 'فصول ١-٣',         enSub: 'Ch.1–3' }
    ]
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
