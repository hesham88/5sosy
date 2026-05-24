const dict = {
  appName: '5sosy',
  appSub: '你的 AI 导师',
  nav: {
    home: '首页', subjects: '学科', books: '书籍', plan: '计划',
    practice: '练习', oral: '口语', progress: '进度', settings: '设置',
    profile: '个人资料', signOut: '退出登录', menu: '菜单', close: '关闭'
  },
  cta: { start: '开始', next: '下一步', back: '返回', save: '保存', finish: '完成', skip: '跳过', signIn: '登录', signUp: '注册' },
  auth: {
    title: '欢迎使用 5sosy',
    sub: '登录以继续你的计划和学习连续天数。',
    google: '使用 Google 继续',
    anon: '以访客身份继续',
    email: '电子邮箱',
    password: '密码',
    or: '或'
  },
  home: {
    greet: '欢迎回来 👋',
    sub: '今天我们学什么？',
    intentPh: '告诉我今天你需要学习什么…',
    examples: [
      '48 小时后有物理考试',
      '我不太懂气体定律',
      '复习历史第二章',
      '化学 — 定量分析'
    ],
    plan: '今天的计划',
    planSub: '规划器根据你的目标生成',
    weak: '需要复习的概念',
    streak: '连续学习',
    streakDay: '天连续',
    xp: '经验',
    next: '即将到来的考试',
    activity: '5sosy 动态'
  },
  subjects: {
    title: '你的学科',
    sub: '每门学科汇集了你的书籍、章节和薄弱概念',
    mastery: '掌握度',
    chapters: '章节',
    chaptersDone: '章已完成',
    books: '书籍',
    weak: '薄弱主题',
    week: '本周分钟',
    last: '最近主题',
    drill: '练习',
    openBooks: '打开书籍',
    takeQuiz: '开始测验',
    allSubjects: '所有学科',
    onlyTrack: '仅我的方向',
    none: '还没有学科 — 请先完成入门设置。'
  },
  plan: {
    title: '你的每周计划',
    sub: '由规划器生成 — 会随你的进度自适应',
    today: '今天',
    blocks: '节',
    total: '总计',
    done: '已完成',
    remaining: '剩余',
    regenerate: '重新生成计划',
    regenerating: '生成中…',
    empty: '这一天没有学习节',
    addBlock: '添加学习节',
    daySummary: '当日总结',
    minutes: '分钟',
    sessions: '节'
  },
  books: {
    title: '你已连接的书籍',
    sub: '埃及教育部课程 + 你的外部书籍 — 已在 Vertex AI 索引',
    indexed: '已索引',
    processing: '处理中',
    queued: '排队中',
    chapters: '章',
    pages: '页',
    publisher: '出版社',
    year: '年份',
    lastOpened: '上次打开',
    selected: '本书已选',
    selectedPlural: '本书已选',
    selectAll: '全选',
    clear: '清除',
    selectToBegin: '选择一本或多本书以开始',
    action: {
      chat: '聊天',
      summarize: '总结',
      explain: '用埃及方言解释',
      audio: '音频总结',
      quiz: '测验',
      questions: '推荐问题'
    },
    actionSub: {
      chat: '关于这些书随便问',
      summarize: '核心章节的精炼总结',
      explain: '用埃及口语阿拉伯语解释',
      audio: '播放音频讲解',
      quiz: '5 题快速检测',
      questions: '考试中最常见的部委题'
    },
    chatPh: '关于所选书籍随便问…',
    addBook: '连接新书',
    filterAll: '所有书籍',
    filterIndexed: '仅已索引',
    workingOn: '教学代理正在处理',
    resultReady: '结果已就绪',
    panelHint: '由 5 个代理协同 — 教学 + 摄取 + 评估 + 视听 + 协调',
    goToQuiz: '开始测验'
  }
} as const;

export default dict;
