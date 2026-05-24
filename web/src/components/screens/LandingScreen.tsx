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
  cx: number;
  cy: number;
};

export default function LandingScreen() {
  const { isAR, t, locale } = useApp();
  const { signInWithGoogle, signInAsGuest, user } = useAuth();
  const router = useRouter();

  // Authentication State
  const [busy, setBusy] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [scrolledPastHero, setScrolledPastHero] = useState(false);

  // Contact Us Form State
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactMessage, setContactMessage] = useState('');
  const [contactSubmitting, setContactSubmitting] = useState(false);
  const [contactSubmitted, setContactSubmitted] = useState(false);

  const [hoveredAgent, setHoveredAgent] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'stack' | 'capabilities' | 'gamification'>('capabilities');

  // Track scrolling to move buttons to header
  useEffect(() => {
    const handleScroll = () => {
      const heroButtons = document.getElementById('hero-auth-buttons');
      if (heroButtons) {
        const rect = heroButtons.getBoundingClientRect();
        // If the bottom of the hero buttons container has scrolled off-screen
        setScrolledPastHero(rect.bottom < 0);
      }
    };
    window.addEventListener('scroll', handleScroll);
    // Initial check
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Auth helper
  const handleAuth = (type: 'google' | 'guest') => async () => {
    setBusy(type);
    setAuthError(null);
    try {
      if (type === 'google') {
        await signInWithGoogle();
      } else {
        await signInAsGuest();
      }
      router.push(`/${locale}/home`);
    } catch (err: any) {
      console.error('Auth action error:', err);
      const code = err?.code ?? '';
      if (code === 'auth/popup-closed-by-user') {
        setAuthError(isAR ? 'اتقفلت نافذة تسجيل الدخول.' : 'Sign-in window was closed.');
      } else if (code === 'auth/operation-not-allowed') {
        setAuthError(isAR ? 'تسجيل دخول الضيف غير مفعّل.' : 'Guest sign-in is not enabled.');
      } else {
        setAuthError(err?.message || 'Authentication failed.');
      }
    } finally {
      setBusy(null);
    }
  };

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactName.trim() || !contactEmail.trim() || !contactMessage.trim()) return;
    setContactSubmitting(true);
    try {
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: contactName.trim(),
          email: contactEmail.trim(),
          message: contactMessage.trim()
        })
      });
      if (res.ok) {
        setContactSubmitted(true);
        setContactName('');
        setContactEmail('');
        setContactMessage('');
      } else {
        throw new Error('Failed to save message');
      }
    } catch (err) {
      console.error('Contact submission error:', err);
    } finally {
      setContactSubmitting(false);
    }
  };

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
    <div className="min-h-screen relative overflow-hidden bg-mesh text-slate-100 font-sans scroll-smooth">
      
      {/* Dynamic Background Glowing Blobs */}
      <div className="absolute top-[-10%] start-[-10%] w-[450px] h-[450px] rounded-full bg-pink-600/15 blur-[120px] animate-blob-slow pointer-events-none" />
      <div className="absolute top-[20%] end-[-15%] w-[500px] h-[500px] rounded-full bg-indigo-600/20 blur-[140px] animate-blob-slower pointer-events-none" />
      <div className="absolute bottom-[-10%] start-[20%] w-[400px] h-[400px] rounded-full bg-emerald-500/15 blur-[130px] animate-blob-slow pointer-events-none" />
      <div className="absolute bottom-[30%] end-[10%] w-[380px] h-[380px] rounded-full bg-orange-500/12 blur-[110px] animate-blob-slower pointer-events-none" />

      {/* Grid Overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />

      {/* Locked/Fixed Top Glassmorphic Navigation */}
      <header className="fixed top-0 inset-x-0 z-50 px-4 py-3 transition-all duration-300">
        <div className="mx-auto max-w-[1400px] glass-panel rounded-2xl px-6 py-3 flex items-center justify-between shadow-2xl">
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

          {/* Quick Navigation Links */}
          <nav className="hidden lg:flex items-center gap-6 text-[13px] font-bold text-slate-400">
            <a href="#hero" className="hover:text-slate-155 transition">{isAR ? 'الرئيسية' : 'Home'}</a>
            <a href="#visualizer" className="hover:text-slate-155 transition">{isAR ? 'شبكة الأذكياء' : 'Agent Swarm'}</a>
            <a href="#capabilities" className="hover:text-slate-155 transition">{isAR ? 'القدرات' : 'Capabilities'}</a>
            <a href="#stack" className="hover:text-slate-155 transition">{isAR ? 'التقنيات' : 'Tech Stack'}</a>
            <a href="#contact" className="hover:text-slate-155 transition">{isAR ? 'اتصل بنا' : 'Contact'}</a>
          </nav>

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
            ) : scrolledPastHero ? (
              // Floating Header Sign In elements when user scrolls past Hero buttons
              <div className="flex items-center gap-2 animate-[fadeIn_0.3s_ease]">
                <button
                  onClick={handleAuth('google')}
                  disabled={busy !== null}
                  className="bg-white hover:bg-slate-100 text-slate-900 border border-slate-200 font-bold text-[11.5px] px-3 py-2 rounded-xl transition flex items-center gap-1.5 shadow-md shadow-slate-950/20"
                  title={isAR ? 'تسجيل دخول بجوجل' : 'Sign in with Google'}
                >
                  {busy === 'google' ? (
                    <span className="w-3.5 h-3.5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <span>🟦</span>
                  )}
                  <span className="hidden md:inline">{isAR ? 'جوجل' : 'Google'}</span>
                </button>
                
                <button
                  onClick={handleAuth('guest')}
                  disabled={busy !== null}
                  className="bg-pink-600/90 hover:bg-pink-600 text-white font-bold text-[11.5px] px-3 py-2 rounded-xl transition flex items-center gap-1.5 shadow-md shadow-pink-500/20"
                  title={isAR ? 'الدخول كزائر' : 'Sign in as Guest'}
                >
                  {busy === 'guest' ? (
                    <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  ) : (
                    <span>👤</span>
                  )}
                  <span className="hidden md:inline">{isAR ? 'زائر' : 'Guest'}</span>
                </button>
              </div>
            ) : (
              <a
                href="#hero-auth-buttons"
                className="relative group overflow-hidden bg-gradient-to-r from-pink-600 to-indigo-600 hover:from-pink-500 hover:to-indigo-500 text-white font-bold text-[13px] px-4 py-2 rounded-xl transition shadow-lg shadow-pink-500/10 flex items-center gap-1"
              >
                <span className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition" />
                <span>{isAR ? 'ابدأ الآن' : 'Get Started'}</span>
                <span className="rtl:rotate-180">➔</span>
              </a>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section id="hero" className="relative z-10 max-w-[1400px] mx-auto px-6 pt-32 pb-16 flex flex-col items-center text-center">
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

        {/* Hero Auth Buttons (google or anonymous sign-in) */}
        <div id="hero-auth-buttons" className="flex flex-wrap justify-center gap-4 mt-8 min-h-[50px]">
          {user ? (
            <button
              onClick={() => router.push(`/${locale}/home`)}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-[14.5px] px-8 py-3.5 rounded-2xl transition duration-300 shadow-lg shadow-indigo-500/30 flex items-center gap-2"
            >
              <span>{isAR ? 'الدخول للوحة التحكم' : 'Go to Dashboard'}</span>
              <span className="rtl:rotate-180">➔</span>
            </button>
          ) : (
            <>
              <button
                onClick={handleAuth('google')}
                disabled={busy !== null}
                className="bg-white hover:bg-slate-100 text-slate-900 border border-slate-200 font-extrabold text-[14px] px-6 py-3.5 rounded-2xl transition duration-300 flex items-center gap-2 shadow-lg shadow-slate-900/10"
              >
                {busy === 'google' ? (
                  <span className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <span>🟦</span>
                )}
                <span>{isAR ? 'تسجيل دخول بجوجل' : 'Sign in with Google'}</span>
              </button>
              
              <button
                onClick={handleAuth('guest')}
                disabled={busy !== null}
                className="glass-panel glass-glow-magenta hover:bg-slate-900 border-pink-500/20 text-white font-extrabold text-[14px] px-6 py-3.5 rounded-2xl transition duration-300 flex items-center gap-2"
              >
                {busy === 'guest' ? (
                  <span className="w-4 h-4 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <span>👤</span>
                )}
                <span>{isAR ? 'الدخول كزائر (بدون حساب)' : 'Sign in as Guest'}</span>
              </button>
            </>
          )}
        </div>

        {/* Display authentication errors */}
        {authError && (
          <div className="mt-4 text-[13px] text-rose-500 border border-rose-500/20 bg-rose-500/10 rounded-xl px-4 py-2 text-center max-w-md mx-auto animate-pulse">
            {authError}
          </div>
        )}

        <div className="flex justify-center gap-6 mt-8 text-[12px] text-slate-400 select-none">
          <span>✓ {isAR ? 'لا يحتاج لتثبيت' : 'No installation required'}</span>
          <span>✓ {isAR ? 'مبني على كتب الوزارة' : 'MOE Grounded'}</span>
          <span>✓ {isAR ? 'مجاني بالكامل' : '100% Free'}</span>
        </div>
      </section>

      {/* Visualizer Section */}
      <section id="visualizer" className="relative z-10 max-w-[1400px] mx-auto px-6 py-8 text-center border-t border-white/5">
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

      {/* Tabs Menu Section */}
      <section id="capabilities" className="relative z-10 max-w-[1400px] mx-auto px-6 py-6 border-t border-white/5">
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
          <div id="stack" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 animate-[fadeIn_0.5s_ease]">
            
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

      {/* Contact Us Section */}
      <section id="contact" className="relative z-10 max-w-[1400px] mx-auto px-6 py-20 border-t border-white/5">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            {isAR ? 'اتصل بنا' : 'Contact Us'}
          </h2>
          <p className="text-[14px] text-slate-400 max-w-xl mx-auto mt-2">
            {isAR 
              ? 'هل لديك استفسار أو اقتراح لتحسين المنصة؟ تواصل معنا وسنرد عليك في أقرب وقت.' 
              : 'Have any questions, inquiries, or feedback? Send us a message and our team will get back to you shortly.'}
          </p>
        </div>

        <div className="max-w-lg mx-auto">
          <div className="glass-panel rounded-3xl p-8 border border-white/10 shadow-2xl relative overflow-hidden">
            {/* Form decorative background glow */}
            <div className="absolute top-[-30%] end-[-30%] w-60 h-60 rounded-full bg-pink-500/10 blur-[80px] pointer-events-none" />
            
            {contactSubmitted ? (
              <div className="text-center py-8 animate-[fadeIn_0.5s_ease]">
                <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-full text-3xl grid place-items-center mx-auto mb-4 animate-bounce">
                  ✓
                </div>
                <h3 className="text-[18px] font-extrabold text-white mb-2">
                  {isAR ? 'تم الإرسال بنجاح!' : 'Message Sent Successfully!'}
                </h3>
                <p className="text-[13px] text-slate-450 leading-relaxed mb-6">
                  {isAR 
                    ? 'نشكرك على اهتمامك بـ 5sosy. تم استلام رسالتك وسيتواصل فريقنا معك قريباً.' 
                    : 'Thank you for reaching out to 5sosy. Your message has been received and we will contact you shortly.'}
                </p>
                <button
                  onClick={() => setContactSubmitted(false)}
                  className="bg-white/5 hover:bg-white/10 text-white border border-white/10 text-[13px] font-semibold px-6 py-2 rounded-xl transition"
                >
                  {isAR ? 'إرسال رسالة أخرى' : 'Send Another Message'}
                </button>
              </div>
            ) : (
              <form onSubmit={handleContactSubmit} className="space-y-4">
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-450 block mb-1.5">
                    {isAR ? 'الاسم بالكامل' : 'Full Name'}
                  </label>
                  <input
                    type="text"
                    required
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    placeholder={isAR ? 'أدخل اسمك الكريم...' : 'Enter your name...'}
                    className="w-full bg-slate-950/40 border border-white/10 rounded-xl px-4 py-3 text-[13px] text-white focus:outline-none focus:border-pink-500/50 focus:ring-1 focus:ring-pink-500/50 transition"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-450 block mb-1.5">
                    {isAR ? 'البريد الإلكتروني' : 'Email Address'}
                  </label>
                  <input
                    type="email"
                    required
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    placeholder={isAR ? 'name@example.com' : 'name@example.com'}
                    className="w-full bg-slate-950/40 border border-white/10 rounded-xl px-4 py-3 text-[13px] text-white focus:outline-none focus:border-pink-500/50 focus:ring-1 focus:ring-pink-500/50 transition"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-450 block mb-1.5">
                    {isAR ? 'الرسالة' : 'Your Message'}
                  </label>
                  <textarea
                    required
                    rows={4}
                    value={contactMessage}
                    onChange={(e) => setContactMessage(e.target.value)}
                    placeholder={isAR ? 'اكتب استفسارك أو تعليقك هنا...' : 'Write your message here...'}
                    className="w-full bg-slate-950/40 border border-white/10 rounded-xl px-4 py-3 text-[13px] text-white focus:outline-none focus:border-pink-500/50 focus:ring-1 focus:ring-pink-500/50 transition resize-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={contactSubmitting}
                  className="w-full relative group overflow-hidden bg-gradient-to-r from-pink-600 to-indigo-600 hover:from-pink-500 hover:to-indigo-500 text-white font-bold text-[13.5px] py-3 rounded-xl transition shadow-lg shadow-pink-500/10 flex items-center justify-center gap-2"
                >
                  <span className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition" />
                  {contactSubmitting ? (
                    <>
                      <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      <span>{isAR ? 'جاري الإرسال...' : 'Sending...'}</span>
                    </>
                  ) : (
                    <span>{isAR ? 'إرسال الرسالة ✉️' : 'Send Message ✉️'}</span>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
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
