const dict = {
  appName: '5sosy',
  appSub: 'خصوصيك الذكي',
  nav: {
    home: 'الرئيسية', subjects: 'المواد', books: 'كتبي', plan: 'خطة اليوم',
    practice: 'تمرين', oral: 'شفهي', progress: 'تقدمك', settings: 'الإعدادات',
    profile: 'الملف الشخصي', signOut: 'تسجيل خروج', menu: 'القائمة', close: 'إغلاق'
  },
  cta: { start: 'ابدأ الآن', next: 'التالي', back: 'رجوع', save: 'حفظ', finish: 'إنهاء', skip: 'تخطّي', signIn: 'تسجيل دخول', signUp: 'إنشاء حساب' },
  auth: {
    title: 'أهلاً بيك في خصوصي',
    sub: 'سجّل دخول علشان تكمّل خطتك ومذاكرتك.',
    google: 'متابعة بحساب جوجل',
    anon: 'دخول كضيف',
    email: 'البريد الإلكتروني',
    password: 'كلمة السر',
    or: 'أو'
  },
  home: {
    greet: 'أهلاً بيك 👋',
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
  subjects: {
    title: 'موادك',
    sub: 'كل مادة فيها كتبك وفصولك ومفاهيمك الضعيفة',
    mastery: 'الإتقان',
    chapters: 'فصول',
    chaptersDone: 'فصل خلصت',
    books: 'كتب',
    weak: 'مفاهيم ضعيفة',
    week: 'دقيقة الأسبوع',
    last: 'آخر موضوع',
    drill: 'تمرّن',
    openBooks: 'افتح الكتب',
    takeQuiz: 'اختبر نفسك',
    allSubjects: 'كل المواد',
    onlyTrack: 'مسار الدراسة بس',
    none: 'مفيش مواد بعد. ابدأ من الإعداد.'
  },
  plan: {
    title: 'خطتك الأسبوعية',
    sub: 'مولّدة بواسطة المنسّق، بتتعدّل مع تقدمك',
    today: 'النهاردة',
    blocks: 'جلسات',
    total: 'إجمالي',
    done: 'مكتمل',
    remaining: 'متبقي',
    regenerate: 'إعادة توليد الخطة',
    regenerating: 'بتولّد...',
    empty: 'مفيش جلسات في اليوم ده',
    addBlock: 'ضيف جلسة',
    daySummary: 'ملخص اليوم',
    minutes: 'دقيقة',
    sessions: 'جلسة'
  },
  books: {
    title: 'كتبك المتصلة',
    sub: 'منهج وزارة التربية والتعليم وكتبك الخارجية — مفهرسة بـ Vertex AI',
    indexed: 'مفهرس',
    processing: 'بيتعالج',
    queued: 'في الانتظار',
    chapters: 'فصول',
    pages: 'صفحة',
    publisher: 'الناشر',
    year: 'سنة',
    lastOpened: 'آخر مرة',
    selected: 'كتاب محدّد',
    selectedPlural: 'كتب محدّدة',
    selectAll: 'اختار الكل',
    clear: 'مسح',
    selectToBegin: 'اختار كتاب أو أكتر علشان نبدأ',
    action: {
      chat: 'دردشة',
      summarize: 'ملخّص',
      explain: 'اشرحلي بالمصري',
      audio: 'ملخص صوتي',
      quiz: 'كويز',
      questions: 'أسئلة مقترحة'
    },
    actionSub: {
      chat: 'اسأل عن أي حاجة في الكتب دي',
      summarize: 'ملخص مركّز للفصول الأساسية',
      explain: 'شرح بالعامية المصرية',
      audio: 'تشغيل ملخص صوتي',
      quiz: 'كويز ٥ أسئلة',
      questions: 'أسئلة الوزارة المتكررة'
    },
    chatPh: 'اسأل عن الكتب المختارة...',
    addBook: 'اربط كتاب جديد',
    filterAll: 'كل الكتب',
    filterIndexed: 'المفهرسة بس',
    workingOn: 'وكيل التعليم بيشتغل',
    resultReady: 'الناتج جاهز',
    panelHint: 'الناتج من ٥ وكلاء — Pedagogy + Ingestion + Assessment + AV + Orchestrator',
    goToQuiz: 'ابدأ الكويز'
  }
} as const;

export default dict;
