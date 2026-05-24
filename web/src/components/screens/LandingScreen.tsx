'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApp } from '../shared/Providers';
import { Logo } from '../shared/atoms';
import { LanguageSwitcher } from '../shared/LanguageSwitcher';
import { useAuth } from '@/lib/firebase/auth-context';
import { useProfile } from '@/lib/firebase/use-profile';

type AgentInfo = {
  id: string;
  nameEN: string;
  nameAR: string;
  icon: string;
  color: string;
  glowClass: string;
  descEN: string;
  descAR: string;
  skillsEN: string[];
  skillsAR: string[];
  flowEN: string;
  flowAR: string;
  x: number;
  y: number;
  cx: number; // curve anchor control x
  cy: number; // curve anchor control y
};

export default function LandingScreen() {
  const { isAR, t, locale } = useApp();
  const { user } = useAuth();
  const { profile } = useProfile();
  const router = useRouter();

  const [hoveredAgent, setHoveredAgent] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'stack' | 'capabilities' | 'gamification'>('capabilities');

  // Agent Swarm Configuration
  const agents: AgentInfo[] = [
    {
      id: 'orchestrator',
      nameEN: 'Orchestrator Agent',
      nameAR: 'المنسق العام (المرسل)',
      icon: '🦉',
      color: '#4D00FF',
      glowClass: 'glass-glow-indigo border-indigo-500/30',
      descEN: 'The central supervisor. Classifies student intents (Egyptian Arabic & English), routes requests to specialized agents, and manages dialog context.',
      descAR: 'العقل المدبر للمنظومة. يحلل نية الطالب بالعامية المصرية أو الفصحى، ويوجه المهام للوكلاء المتخصصين مع الحفاظ على سياق الحوار.',
      skillsEN: ['Intent Analysis', 'Context Management', 'Sub-Agent Routing', 'Safety Guardrails'],
      skillsAR: ['تحليل النية', 'إدارة سياق الحوار', 'توجيه الوكلاء الفرعيين', 'حواجز الحماية والأمان'],
      flowEN: 'Student Prompt → Intent Classification → Sub-Agent Delegation → Final Synthesis',
      flowAR: 'سؤال الطالب ← تصنيف النية ← توجيه الوكيل المتخصص ← تجميع الرد النهائي',
      x: 300,
      y: 230,
      cx: 300,
      cy: 230
    },
    {
      id: 'askme',
      nameEN: 'AskMe Agent',
      nameAR: 'وكيل البحث المعرفي (AskMe)',
      icon: '📖',
      color: '#E1007E',
      glowClass: 'glass-glow-magenta border-pink-500/30',
      descEN: 'Retrieval specialist. Performs hybrid semantic vector search and exact keyword queries over 34,796 indexed textbooks pages, returning exact source page citations.',
      descAR: 'مستكشف المناهج والكتب. ينفذ بحثًا دلاليًا بالمتجهات أو الكلمات الدقيقة في 34,796 صفحة من الكتب المدرسية والوزارية مستخرجًا المصادر بدقة.',
      skillsEN: ['MongoDB Vector Search', 'Exact Regex Search', 'Grounded Citations', 'OCR/Vision Ingestion'],
      skillsAR: ['بحث المتجهات بـ MongoDB', 'البحث المطابق الدقيق', 'توثيق المصادر والصفحات', 'قراءة الصور والمستندات بـ OCR'],
      flowEN: 'Search Query → Embed generation → Vector Match (MongoDB) → Source Extraction',
      flowAR: 'استعلام البحث ← توليد المتجهات ← تطابق المتجهات في قاعدة البيانات ← استخراج الفقرات والمصدر',
      x: 500,
      y: 230,
      cx: 400,
      cy: 200
    },
    {
      id: 'pedagogy',
      nameEN: 'Pedagogy & Planner Agent',
      nameAR: 'المخطط البيداغوجي والتعليمي',
      icon: '🗓️',
      color: '#FFA07A',
      glowClass: 'glass-glow-coral border-orange-500/30',
      descEN: 'Study scheduler. Dynamically assesses student weak areas, constructs customizable study calendars, and designs customized learning plans.',
      descAR: 'مهندس الخطة الدراسية. يحلل نقاط الضعف المسجلة، ويبني جداول مخصصة للتحصيل والتدريب مع تعديل ريتم المذاكرة بمرونة.',
      skillsEN: ['Study Path Generation', 'Misconception Detection', 'Calendar Scheduling', 'Spaced Repetition Planner'],
      skillsAR: ['توليد مسار المذاكرة', 'كشف الفجوات المفاهيمية', 'جدولة خطة التحصيل', 'خوارزمية التكرار المتباعد'],
      flowEN: 'Weak Topic Log → Masteries Calculation → Dynamic Lesson Generation → Plan Update',
      flowAR: 'سجل الفجوات ← حساب نسب الإتقان ← توليد الدرس والجدول اليومي ← تحديث الخطة المتبعة',
      x: 100,
      y: 230,
      cx: 200,
      cy: 260
    },
    {
      id: 'assessment',
      nameEN: 'Assessment Agent',
      nameAR: 'وكيل التقييم والامتحانات',
      icon: '📝',
      color: '#38EF7D',
      glowClass: 'glass-glow-mint border-emerald-500/30',
      descEN: 'Examiner. Creates and evaluates interactive quizzes, mock timed exams, and generates adaptive questions based on active curricula.',
      descAR: 'صانع الاختبارات والمراجعات. يولد أسئلة تفاعلية فورية وامتحانات تجريبية بوقت محدد متدرجة الصعوبة لقياس الفهم الحقيقي.',
      skillsEN: ['Interactive Quiz Generation', 'Timed Mock Exams', 'Granular Score Evaluation', 'Adaptive Difficulty Scaling'],
      skillsAR: ['توليد الاختبارات التفاعلية', 'الامتحانات التجريبية الموقوتة', 'تقييم درجات الأسئلة', 'تدرج الصعوبة حسب الإتقان'],
      flowEN: 'Subject Scope → Question Synthesis → Timed Exam → Score & Evaluation feedback',
      flowAR: 'نطاق المنهج ← صياغة الأسئلة ← الامتحان الموقوت ← استخراج النتيجة وتقرير التقييم',
      x: 430,
      y: 390,
      cx: 360,
      cy: 310
    },
    {
      id: 'multimodal',
      nameEN: 'AV & Multimodal Agent',
      nameAR: 'الوكيل السمعي البصري والتفاعلي',
      icon: '🎤',
      color: '#00F2FE',
      glowClass: 'glass-glow-mint border-cyan-500/30',
      descEN: 'Media synthesizer. Handles speech/oral learning drills, text-to-speech rendering, visual presentation slides, and processes live student camera math uploads.',
      descAR: 'وكيل الوسائط المتعددة والتحدث. يدعم التدريب الشفهي المتبادل، تحويل النص لصوت، إنتاج شرائح الشرح، وقراءة صور الكاميرا للمسائل الرياضية.',
      skillsEN: ['Oral Voice Exercises', 'Presentation Slides Generator', 'Gemini Multi-Modal Vision', 'Audio Explanation Synthesizer'],
      skillsAR: ['التدريبات الشفهية التفاعلية', 'توليد شرائح الشرح', 'قراءة صور الكاميرا بـ Gemini', 'توليد المقاطع الصوتية التفسيرية'],
      flowEN: 'Camera Math/Voice Input → Gemini Multimodal OCR → Dynamic Explainer Audio + Slide Deck',
      flowAR: 'صورة المسألة/تسجيل صوتي ← المعالجة البصرية لـ Gemini ← توليد صوت الشرح + شرائح بصرية',
      x: 170,
      y: 390,
      cx: 240,
      cy: 310
    },
    {
      id: 'feedback',
      nameEN: 'Feedback & Evaluation Agent',
      nameAR: 'وكيل التقييم العكسي والتقارير',
      icon: '📈',
      color: '#E1007E',
      glowClass: 'glass-glow-magenta border-pink-500/30',
      descEN: 'Performance assessor. Analyzes metrics, builds parent summaries, and hosts a feedback loop to refine agent prompts based on student performance.',
      descAR: 'مقيم الفهم وأداء المنظومة. يحلل تقارير التقدم، ويبسطها لأولياء الأمور، ويدير حلقة تقييم لتحسين أداء المعلم الذكي باستمرار.',
      skillsEN: ['Parent Analytics Dashboard', 'Prompt Self-Refinement', 'Detailed Study Reports', 'Community Forums Sync'],
      skillsAR: ['لوحة تحكم أولياء الأمور', 'التعديل والتحسين الذاتي', 'تقارير الأداء المفصلة', 'مزامنة مجتمعات المذاكرة'],
      flowEN: 'Student Activity Logs → MongoDB Aggregation → Performance Report → Agent Refinement',
      flowAR: 'نشاط الطالب والامتحانات ← تجميع الإحصائيات (MongoDB) ← تقرير أداء متكامل ← تهيئة أداء الوكلاء',
      x: 200,
      y: 70,
      cx: 250,
      cy: 150
    },
    {
      id: 'research',
      nameEN: 'Research & Search Agent',
      nameAR: 'وكيل البحث الخارجي والمعرفة',
      icon: '🔍',
      color: '#FFA07A',
      glowClass: 'glass-glow-coral border-orange-500/30',
      descEN: 'External search coordinator. Pulls academic research papers, reference books, and scientific context outside the textbook to supplement student questions.',
      descAR: 'منقب المعرفة الخارجية. يبحث في الأبحاث والموسوعات العلمية وسياقات التعلم الإضافية لإثراء إجابات الطالب وربطها بالواقع.',
      skillsEN: ['arXiv Paper Search', 'PubMed Literature Fetching', 'Wikipedia Context Mapping', 'Scientific Citation Indexing'],
      skillsAR: ['البحث في مقالات arXiv', 'استدعاء مراجع PubMed', 'رسم سياقات Wikipedia', 'فهرسة المراجع العلمية'],
      flowEN: 'Unresolved Concept → External API Search → Content Filtering → Grounded References',
      flowAR: 'مفهوم غامض ← استعلام محركات المعرفة والبحوث ← تنقيح المحتوى الأكاديمي ← توثيق المرجع',
      x: 400,
      y: 70,
      cx: 350,
      cy: 150
    }
  ];

  const selectedAgent = agents.find(a => a.id === (hoveredAgent || 'orchestrator')) || agents[0];

  return (
    <div className="min-h-screen relative overflow-hidden bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-950 via-indigo-950 to-slate-950 text-slate-100 font-sans">
      
      {/* Dynamic Background Glowing Blobs */}
      <div className="absolute top-[-10%] start-[-10%] w-[450px] h-[450px] rounded-full bg-pink-600/10 blur-[120px] animate-blob-slow pointer-events-none" />
      <div className="absolute top-[20%] end-[-15%] w-[500px] h-[500px] rounded-full bg-indigo-600/15 blur-[140px] animate-blob-slower pointer-events-none" />
      <div className="absolute bottom-[-10%] start-[20%] w-[400px] h-[400px] rounded-full bg-emerald-500/10 blur-[130px] animate-blob-slow pointer-events-none" />
      <div className="absolute bottom-[30%] end-[10%] w-[380px] h-[380px] rounded-full bg-orange-500/8 blur-[110px] animate-blob-slower pointer-events-none" />

      {/* Grid Overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />

      {/* Top Glassmorphic Navigation */}
      <header className="relative z-10 mx-auto max-w-[1400px] px-6 py-4">
        <div className="glass-panel rounded-2xl px-6 py-3 flex items-center justify-between shadow-2xl">
          <div className="flex items-center gap-3">
            <Logo size={36} />
            <div className="hidden sm:block">
              <span className="font-extrabold text-[18px] tracking-wide bg-gradient-to-r from-pink-500 via-indigo-400 to-emerald-400 bg-clip-text text-transparent">
                5sosy
              </span>
              <span className="text-[11px] text-slate-400 block -mt-1 font-semibold">
                {isAR ? 'المساعد الدراسي الذكي' : 'Autonomous AI Study Swarm'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <LanguageSwitcher variant="dropdown" />
            
            {user ? (
              <button
                onClick={() => router.push(`/${locale}/home`)}
                className="bg-indigo-600/80 hover:bg-indigo-600 text-white font-bold text-[13px] px-4 py-2 rounded-xl transition shadow-lg shadow-indigo-500/20 flex items-center gap-1"
              >
                <span>{isAR ? 'لوحة التحكم' : 'Dashboard'}</span>
                <span className="rtl:rotate-180">➔</span>
              </button>
            ) : (
              <button
                onClick={() => router.push(`/${locale}/sign-in`)}
                className="relative group overflow-hidden bg-gradient-to-r from-pink-600 to-indigo-600 hover:from-pink-500 hover:to-indigo-500 text-white font-bold text-[13px] px-4 py-2 rounded-xl transition shadow-lg shadow-pink-500/10 flex items-center gap-1"
              >
                <span className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition" />
                <span>{isAR ? 'ابدأ المذاكرة مجاناً' : 'Join Platform'}</span>
                <span className="rtl:rotate-180">➔</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative z-10 max-w-[1400px] mx-auto px-6 pt-12 pb-16 flex flex-col items-center text-center">
        <span className="inline-flex items-center gap-1.5 bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 font-extrabold text-[11px] uppercase tracking-widest px-3 py-1 rounded-full mb-6 text-glow-indigo">
          <span>✦</span>
          <span>{isAR ? 'سرب أذكياء ثنائي اللغة للثانوية العامة' : 'AUTONOMOUS BILINGUAL AGENT SWARM'}</span>
        </span>
        
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-[1.15] text-slate-100 max-w-4xl tracking-tight">
          {isAR ? (
            <>
              ديمقراطية التعليم للثانوية العامة عبر{' '}
              <span className="bg-gradient-to-r from-pink-500 via-indigo-400 to-emerald-400 bg-clip-text text-transparent text-glow-magenta">
                سرب أذكياء مخصص
              </span>
            </>
          ) : (
            <>
              Democratizing Education through an{' '}
              <span className="bg-gradient-to-r from-pink-500 via-indigo-400 to-emerald-400 bg-clip-text text-transparent text-glow-magenta">
                Autonomous AI Swarm
              </span>
            </>
          )}
        </h1>

        <p className="text-slate-400 text-md sm:text-lg max-w-3xl mt-6 leading-relaxed">
          {isAR ? (
            'نضع سربًا كاملًا من المعلمين والوكلاء الأذكياء في جيب كل طالب مجانًا. خطط دراسية متكيفة، شرح دلالي دقيق للكتب المدرسية مدعوم بالذكاء الاصطناعي وبنية MongoDB التوسعية، متكامل مع غرف نقاش مجتمعية مخصصة.'
          ) : (
            'Putting a world-class swarm of specialized AI tutors in every student\'s pocket. Powered by Gemini 3.1 Flash-Lite, structured on a high-performance MongoDB Atlas vector store, utilizing exact & semantic search, and designed to unlock accessible Thanaweya Amma success.'
          )}
        </p>

        <div className="flex flex-wrap justify-center gap-4 mt-8">
          <button
            onClick={() => router.push(user ? `/${locale}/home` : `/${locale}/sign-in`)}
            className="glass-panel glass-glow-magenta hover:bg-slate-900 border-pink-500/20 text-white font-extrabold text-[14px] px-8 py-3.5 rounded-2xl transition duration-300"
          >
            {isAR ? 'تحدث مع أول وكيل 🦉' : 'Start Learning Free 🦉'}
          </button>
          <a
            href="#visualizer"
            className="glass-panel hover:bg-slate-900 border-slate-700/50 text-slate-300 hover:text-white font-bold text-[14px] px-8 py-3.5 rounded-2xl transition duration-300 flex items-center gap-2"
          >
            <span>{isAR ? 'شاهد خريطة التفاعل' : 'See Agent Workflows'}</span>
            <span>↓</span>
          </a>
        </div>
      </section>

      {/* Visualizer Header */}
      <section id="visualizer" className="relative z-10 max-w-[1400px] mx-auto px-6 py-4 text-center">
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
          {isAR ? 'تفاعل السرب الذكي والمهارات التبادلية' : 'The Autonomous Swarm & Inter-Agent Workflows'}
        </h2>
        <p className="text-[14px] text-slate-400 max-w-xl mx-auto mt-2">
          {isAR ? 'حرك مؤشر الفأرة فوق أي وكيل ذكي لعرض مهامه، وتدفق البيانات، والمهارات المتاحة.' : 'Hover over any specialized agent node to inspect its operational focus, live dataset workflows, and registered skills.'}
        </p>
      </section>

      {/* Swarm Interactive Flow Area */}
      <section className="relative z-10 max-w-[1400px] mx-auto px-6 pb-20 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        
        {/* Swarm Map (SVG Diagram) */}
        <div className="lg:col-span-7 flex justify-center">
          <div className="relative w-full max-w-[600px] aspect-[6/5] bg-slate-900/40 backdrop-blur-md rounded-3xl border border-slate-800/80 p-4 shadow-2xl overflow-hidden">
            <svg viewBox="0 0 600 500" className="w-full h-full">
              
              {/* Defs for gradients & shadow filters */}
              <defs>
                <linearGradient id="grad-magenta" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#FF1E95" stopOpacity="0.8" />
                  <stop offset="100%" stopColor="#4D00FF" stopOpacity="0.2" />
                </linearGradient>
                <linearGradient id="grad-mint" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#38EF7D" stopOpacity="0.8" />
                  <stop offset="100%" stopColor="#00F2FE" stopOpacity="0.2" />
                </linearGradient>
                <linearGradient id="grad-coral" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#FFA07A" stopOpacity="0.8" />
                  <stop offset="100%" stopColor="#E1007E" stopOpacity="0.2" />
                </linearGradient>

                <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="6" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
              </defs>

              {/* Relationship Connecting Arrows / Flow Lines */}
              {agents.map((agent) => {
                if (agent.id === 'orchestrator') return null;
                const isHovered = hoveredAgent === agent.id;
                const pathId = `path-${agent.id}`;
                // Draw curve from center Orchestrator to the outer agent node
                const d = `M 300 230 Q ${agent.cx} ${agent.cy} ${agent.x} ${agent.y}`;
                return (
                  <g key={`flow-${agent.id}`}>
                    <path
                      id={pathId}
                      d={d}
                      fill="none"
                      stroke={agent.color}
                      strokeWidth={isHovered ? 3.5 : 1.5}
                      className={`flow-line transition-all duration-300 ${isHovered ? 'opacity-100' : 'opacity-40'}`}
                      style={{ filter: isHovered ? 'url(#glow)' : '' }}
                    />
                    
                    {/* Glowing animated dots riding on paths */}
                    <circle r={isHovered ? 5.5 : 3.5} fill={agent.color} className="glow-dot">
                      <animateMotion dur={isHovered ? '2.5s' : '5s'} repeatCount="indefinite" path={d} />
                    </circle>
                  </g>
                );
              })}

              {/* Nodes */}
              {agents.map((agent) => {
                const isOrchestrator = agent.id === 'orchestrator';
                const isHovered = hoveredAgent === agent.id;
                const isAnyHovered = hoveredAgent !== null;
                const opacityClass = isOrchestrator || isHovered || !isAnyHovered ? 'opacity-100 scale-105' : 'opacity-60 scale-95';

                return (
                  <g
                    key={agent.id}
                    onMouseEnter={() => setHoveredAgent(agent.id)}
                    onMouseLeave={() => setHoveredAgent(null)}
                    className={`cursor-pointer transition-all duration-300 origin-center ${opacityClass}`}
                    transform={`translate(${agent.x}, ${agent.y})`}
                  >
                    {/* Glowing outer shadow ring */}
                    <circle
                      r={isOrchestrator ? 36 : 28}
                      fill="rgba(15, 23, 42, 0.9)"
                      stroke={agent.color}
                      strokeWidth={isHovered || isOrchestrator ? 3 : 1.5}
                      className="transition-all duration-300"
                      style={{ filter: isHovered || isOrchestrator ? 'url(#glow)' : '' }}
                    />
                    
                    {/* Dynamic colored accent inside ring */}
                    <circle
                      r={isOrchestrator ? 32 : 24}
                      fill={agent.color}
                      fillOpacity={isHovered || isOrchestrator ? 0.12 : 0.04}
                      className="transition-all duration-300"
                    />

                    {/* Emoji Symbol inside node */}
                    <text
                      textAnchor="middle"
                      dy=".3em"
                      fontSize={isOrchestrator ? '22px' : '17px'}
                      className="select-none pointer-events-none"
                    >
                      {agent.icon}
                    </text>

                    {/* Tiny text tag underneath the agent */}
                    <text
                      textAnchor="middle"
                      y={isOrchestrator ? 52 : 44}
                      fill="#e2e8f0"
                      fontSize="9.5px"
                      fontWeight="bold"
                      className="select-none pointer-events-none uppercase tracking-wider bg-slate-950 px-1 py-0.5 rounded"
                    >
                      {isAR ? agent.nameAR.split(' ')[0] : agent.nameEN.split(' ')[0]}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        {/* Dynamic Detail Card panel */}
        <div className="lg:col-span-5 flex flex-col justify-center">
          <div className={`glass-panel rounded-3xl p-6 shadow-2xl transition-all duration-500 border ${selectedAgent.glowClass}`}>
            
            {/* Header info */}
            <div className="flex items-center gap-3.5 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 text-2xl grid place-items-center">
                {selectedAgent.icon}
              </div>
              <div>
                <span className="text-[10px] uppercase font-extrabold tracking-wider bg-white/10 px-2 py-0.5 rounded text-indigo-300 select-none">
                  {isAR ? 'معلم ذكي نشط' : 'ACTIVE SPECIALIST'}
                </span>
                <h3 className="font-extrabold text-[18px] text-white leading-tight mt-0.5">
                  {isAR ? selectedAgent.nameAR : selectedAgent.nameEN}
                </h3>
              </div>
            </div>

            {/* Description */}
            <p className="text-[13.5px] text-slate-300 leading-relaxed min-h-[75px]">
              {isAR ? selectedAgent.descAR : selectedAgent.descEN}
            </p>

            {/* Workflow section */}
            <div className="mt-4 pt-4 border-t border-white/5">
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-450 block mb-1.5">
                {isAR ? 'تدفق العمليات التبادلية' : 'Bilingual Data Flow Workflow'}
              </span>
              <div className="text-[12px] bg-slate-950/50 rounded-xl px-4 py-2 border border-white/5 ltr text-start italic text-slate-400 font-mono">
                {isAR ? selectedAgent.flowAR : selectedAgent.flowEN}
              </div>
            </div>

            {/* Skills tags list */}
            <div className="mt-4 pt-4 border-t border-white/5">
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-450 block mb-2">
                {isAR ? 'المهارات المسجلة والـ MCPs' : 'Swarm Skills & Exposed MCPs'}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {(isAR ? selectedAgent.skillsAR : selectedAgent.skillsEN).map((skill, idx) => (
                  <span
                    key={idx}
                    className="text-[11.5px] font-semibold bg-white/5 hover:bg-white/10 border border-white/10 rounded-full px-3 py-1 text-slate-300 transition select-none"
                  >
                    ✦ {skill}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Tabs Menu section */}
      <section className="relative z-10 max-w-[1400px] mx-auto px-6 py-6 border-t border-white/5">
        <div className="flex justify-center gap-2 md:gap-4 select-none mb-12">
          {[
            { id: 'capabilities', labelEN: 'System Capabilities', labelAR: 'قدرات المنظومة' },
            { id: 'stack', labelEN: 'Architecture Stack', labelAR: 'البنية البرمجية' },
            { id: 'gamification', labelEN: 'Streaks & Communities', labelAR: 'التحفيز والمجتمع' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`text-[12.5px] font-extrabold px-5 py-2.5 rounded-full transition-all duration-300
                ${activeTab === tab.id
                  ? 'bg-gradient-to-r from-pink-600 to-indigo-600 text-white shadow-lg shadow-pink-500/20'
                  : 'bg-white/5 hover:bg-white/10 text-slate-400 border border-white/5'}`}
            >
              {isAR ? tab.labelAR : tab.labelEN}
            </button>
          ))}
        </div>

        {/* Tab contents (System capabilities) */}
        {activeTab === 'capabilities' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-[fadeIn_0.5s_ease]">
            
            <div className="glass-panel rounded-3xl p-6 border border-white/5 hover:border-pink-500/20 transition-all duration-300">
              <div className="w-10 h-10 rounded-xl bg-pink-600/10 border border-pink-500/20 grid place-items-center text-lg mb-4">🧠</div>
              <h4 className="font-extrabold text-[16px] text-slate-100">{isAR ? 'محرك بحث دلالي ودقيق هجين' : 'Hybrid Semantic & Exact Search'}</h4>
              <p className="text-[13px] text-slate-450 leading-relaxed mt-2">
                {isAR ? 'تكامل تام مع MongoDB Atlas لإجراء بحث المتجهات (3072 بعداً) بالإضافة لمطابقة الكلمات والرموز المحددة بدقة متناهية.' : 'Powered by MongoDB Atlas vector search with a Python fallback, querying 34,796 documents instantaneously with precise token matching.'}
              </p>
            </div>

            <div className="glass-panel rounded-3xl p-6 border border-white/5 hover:border-indigo-500/20 transition-all duration-300">
              <div className="w-10 h-10 rounded-xl bg-indigo-600/10 border border-indigo-500/20 grid place-items-center text-lg mb-4">⚖️</div>
              <h4 className="font-extrabold text-[16px] text-slate-100">{isAR ? 'توثيق وتأصيل المصادر المدرسية' : 'Grounded Page-Level Citations'}</h4>
              <p className="text-[13px] text-slate-450 leading-relaxed mt-2">
                {isAR ? 'يمنع المعلم الذكي الهلوسة العلمية عبر تقييد إجاباته تماماً بكتب الوزارة المدرجة مع تقديم أرقام الصفحات وروابط الأبواب.' : 'Limits LLM hallucinations by restricting tutoring to verified textbooks, explicitly referencing page numbers and textbook titles.'}
              </p>
            </div>

            <div className="glass-panel rounded-3xl p-6 border border-white/5 hover:border-emerald-500/20 transition-all duration-300">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 grid place-items-center text-lg mb-4">🎯</div>
              <h4 className="font-extrabold text-[16px] text-slate-100">{isAR ? 'تخصيص الخطة وتحديد الضعف' : 'Personalization & Weakness Detection'}</h4>
              <p className="text-[13px] text-slate-450 leading-relaxed mt-2">
                {isAR ? 'سجل تفاعلي مفصل يحسب مدى إتقان المذاكرة في الفصول المختلفة ويقترح تدريبات بيداغوجية مخصصة للمفاهيم المتعثرة.' : 'Calculates and logs topic masteries dynamically. Triggers tailored pedagogical drilling cards for concepts below mastery thresholds.'}
              </p>
            </div>

            <div className="glass-panel rounded-3xl p-6 border border-white/5 hover:border-orange-500/20 transition-all duration-300">
              <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 grid place-items-center text-lg mb-4">🎛️</div>
              <h4 className="font-extrabold text-[16px] text-slate-100">{isAR ? 'حواجز حماية وأمان (Guardrails)' : 'Active Safety Guardrails'}</h4>
              <p className="text-[13px] text-slate-450 leading-relaxed mt-2">
                {isAR ? 'وكيل حماية مدمج يراقب سلامة المدخلات والتفاعلات لضمان إرشاد تعليمي آمن وملائم للبيئة المدرسية وثقافة الطلاب.' : 'Dedicated Safety Agent verifies inputs/outputs to prevent prompt injection and guarantee an age-appropriate study environment.'}
              </p>
            </div>

            <div className="glass-panel rounded-3xl p-6 border border-white/5 hover:border-pink-500/20 transition-all duration-300">
              <div className="w-10 h-10 rounded-xl bg-pink-600/10 border border-pink-500/20 grid place-items-center text-lg mb-4">📷</div>
              <h4 className="font-extrabold text-[16px] text-slate-100">{isAR ? 'تفاعل فوري بكاميرا الهاتف' : 'Live Camera Math OCR'}</h4>
              <p className="text-[13px] text-slate-450 leading-relaxed mt-2">
                {isAR ? 'يدعم التقاط صور المسائل الرياضية أو الفيزياء بخط اليد وتحليلها فورياً واستدعاء الفصول المدرسية المفسرة لها.' : 'Students snap photos of handwritten or printed science problems for instant ADK translation and textbook parsing.'}
              </p>
            </div>

            <div className="glass-panel rounded-3xl p-6 border border-white/5 hover:border-indigo-500/20 transition-all duration-300">
              <div className="w-10 h-10 rounded-xl bg-indigo-600/10 border border-indigo-500/20 grid place-items-center text-lg mb-4">🌐</div>
              <h4 className="font-extrabold text-[16px] text-slate-100">{isAR ? 'جاهز للتوسع لأي منهج دراسي' : 'Scalable Curriculum Core'}</h4>
              <p className="text-[13px] text-slate-450 leading-relaxed mt-2">
                {isAR ? 'هيكلية قاعدة بيانات مرنة تدعم فهرسة واستيعاب مئات المناهج والكتب والمكتبات الإضافية بمجرد إرفاقها بملفات الـ PDF.' : 'Engineered to index and categorize external libraries, new curricula, or regional examination boards globally via automated ingestion.'}
              </p>
            </div>

          </div>
        )}

        {/* Tab contents (Tech stack) */}
        {activeTab === 'stack' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 animate-[fadeIn_0.5s_ease]">
            
            <div className="glass-panel rounded-3xl p-6 border border-white/5">
              <span className="text-[10px] uppercase font-extrabold text-pink-400">Frontend Stack</span>
              <h4 className="font-extrabold text-[18px] text-white mt-1">Next.js 15 App Router</h4>
              <p className="text-[12.5px] text-slate-400 mt-2 leading-relaxed">
                {isAR ? 'واجهات مبنية بـ React 19، مضافة لتصميم Tailwind CSS متوافق كلياً مع RTL واللغة العربية بشكل بيداغوجي سلس.' : 'Built using Next.js 15 App Router with full RTL logical spacing support and client-side session-scoped caches.'}
              </p>
              <div className="mt-4 flex flex-wrap gap-1 text-[11px] text-slate-350">
                <span className="bg-white/5 px-2 py-0.5 rounded">TailwindCSS</span>
                <span className="bg-white/5 px-2 py-0.5 rounded">TypeScript</span>
                <span className="bg-white/5 px-2 py-0.5 rounded">CSS Logical</span>
              </div>
            </div>

            <div className="glass-panel rounded-3xl p-6 border border-white/5">
              <span className="text-[10px] uppercase font-extrabold text-indigo-400">Agent Backend</span>
              <h4 className="font-extrabold text-[18px] text-white mt-1">Google ADK Swarms</h4>
              <p className="text-[12.5px] text-slate-400 mt-2 leading-relaxed">
                {isAR ? 'سرب متكامل يعمل بـ FastAPI و ADK على بيئة Cloud Run، يوجه بمرونة المهام الحركية والمقاطع الصوتية.' : 'Uvicorn FastAPI server orchestrating Gemini 3.1 Flash-Lite agents. Highly decoupled routing over a custom session service.'}
              </p>
              <div className="mt-4 flex flex-wrap gap-1 text-[11px] text-slate-350">
                <span className="bg-white/5 px-2 py-0.5 rounded">FastAPI</span>
                <span className="bg-white/5 px-2 py-0.5 rounded">Google ADK</span>
                <span className="bg-white/5 px-2 py-0.5 rounded">Cloud Run</span>
              </div>
            </div>

            <div className="glass-panel rounded-3xl p-6 border border-white/5">
              <span className="text-[10px] uppercase font-extrabold text-emerald-400">Hybrid Databases</span>
              <h4 className="font-extrabold text-[18px] text-white mt-1">MongoDB + Firestore</h4>
              <p className="text-[12.5px] text-slate-400 mt-2 leading-relaxed">
                {isAR ? 'تخزين هجين؛ للبحث الفهرسي والذكاء الرياضي بـ MongoDB Atlas، ولمزامنة بيانات الشاشات والنشاط بـ Firestore.' : 'MongoDB Atlas core handles heavy float embedding arrays (3072d), synced in real-time with Cloud Firestore UI documents.'}
              </p>
              <div className="mt-4 flex flex-wrap gap-1 text-[11px] text-slate-350">
                <span className="bg-white/5 px-2 py-0.5 rounded">MongoDB Atlas</span>
                <span className="bg-white/5 px-2 py-0.5 rounded">Firestore Client</span>
                <span className="bg-white/5 px-2 py-0.5 rounded">Storage API</span>
              </div>
            </div>

            <div className="glass-panel rounded-3xl p-6 border border-white/5">
              <span className="text-[10px] uppercase font-extrabold text-orange-400">Orchestrator Core</span>
              <h4 className="font-extrabold text-[18px] text-white mt-1">Gemini 3.1 Flash-Lite</h4>
              <p className="text-[12.5px] text-slate-400 mt-2 leading-relaxed">
                {isAR ? 'النموذج الذكي الافتراضي. يعالج نصوص الأسئلة، يقرأ المستندات المرفقة، ويقوم بتوليد المناهج والشروح التعليمية ببراعة.' : 'Our default swarm engine. Powers multi-modal OCR, conversational translation, and dynamically synthesizes grounding contexts.'}
              </p>
              <div className="mt-4 flex flex-wrap gap-1 text-[11px] text-slate-350">
                <span className="bg-white/5 px-2 py-0.5 rounded">Gemini LLM</span>
                <span className="bg-white/5 px-2 py-0.5 rounded">Notion MCP</span>
                <span className="bg-white/5 px-2 py-0.5 rounded">MongoDB MCP</span>
              </div>
            </div>

          </div>
        )}

        {/* Tab contents (Gamification & communities) */}
        {activeTab === 'gamification' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-[fadeIn_0.5s_ease]">
            
            <div className="glass-panel rounded-3xl p-6 border border-white/5">
              <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 grid place-items-center text-lg mb-4">🔥</div>
              <h4 className="font-extrabold text-[16px] text-slate-100">{isAR ? 'عداد الأيام الحماسي (Streaks)' : 'Motivational Daily Streaks'}</h4>
              <p className="text-[13px] text-slate-450 leading-relaxed mt-2">
                {isAR ? 'تتبع فوري وممتع للنشاط اليومي. استمرار المذاكرة يومياً يشعل حماس الطالب ويدفعه للتحصيل المستمر.' : 'Logs and visualizes daily login activity. Continuous study streaks award custom badges and multiply XP gains.'}
              </p>
            </div>

            <div className="glass-panel rounded-3xl p-6 border border-white/5">
              <div className="w-10 h-10 rounded-xl bg-pink-600/10 border border-pink-500/20 grid place-items-center text-lg mb-4">👥</div>
              <h4 className="font-extrabold text-[16px] text-slate-100">{isAR ? 'مجتمعات الطلاب وأولياء الأمور' : 'Multilateral Communities'}</h4>
              <p className="text-[13px] text-slate-450 leading-relaxed mt-2">
                {isAR ? 'منصة اجتماعية مدمجة تسمح للطلاب بمشاركة إنجازاتهم، ولمدرسي المادة بوضع مراجعاتهم، ولأولياء الأمور بمتابعة الأداء.' : 'Bridges communication gap by building focused forums for students to compare plans, teachers to edit questions, and parents to receive metrics.'}
              </p>
            </div>

            <div className="glass-panel rounded-3xl p-6 border border-white/5">
              <div className="w-10 h-10 rounded-xl bg-indigo-600/10 border border-indigo-500/20 grid place-items-center text-lg mb-4">📱</div>
              <h4 className="font-extrabold text-[16px] text-slate-100">{isAR ? 'مستقبلياً: تطبيق الموبايل دون إنترنت' : 'Future Roadmap: Offline Mobile App'}</h4>
              <p className="text-[13px] text-slate-450 leading-relaxed mt-2">
                {isAR ? 'نخطط لإطلاق نسخة موبايل في المراحل القادمة تدعم كاش المذاكرة المحلي، لتمكين الطلاب من قراءة المنهج دون استهلاك للإنترنت.' : 'Planned support for offline localized compilation. Students will soon study and review cached pages without data connectivity.'}
              </p>
            </div>

          </div>
        )}
      </section>

      {/* Footer Area */}
      <footer className="relative z-10 max-w-[1400px] mx-auto px-6 py-12 border-t border-white/5 text-center text-slate-500 text-[12px]">
        <p className="mb-2">
          {isAR ? '5sosy — مساعد دراسي ذكي وثورة بيداغوجية لطلاب مصر.' : '5sosy — A revolutionary educational swarm for Thanaweya Amma.'}
        </p>
        <p className="opacity-70">
          © 2026 5sosy. {isAR ? 'جميع الحقوق محفوظة. تم التطوير لصالح تحدي وكلاء الذكاء الاصطناعي.' : 'All Rights Reserved. Developed for the Google for Startups AI Agents Challenge.'}
        </p>
      </footer>

    </div>
  );
}
