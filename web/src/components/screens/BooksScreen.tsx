'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { getFirebase } from '@/lib/firebase/client';
import { useAuth } from '@/lib/firebase/auth-context';
import { ChromeLayout } from '../shared/Chrome';
import { useApp } from '../shared/Providers';
import { AgentLog, Btn, Card, Ring, SubjectChip, type AgentLogLine } from '../shared/atoms';
import { SUBJECT_META, HUE, type HueId } from '@/constants/subjects';
import { callAgent, type AgentName } from '@/lib/agents';
import type { Book, SubjectId, IngestionStatus } from '@/lib/types';

type ActionKey = 'chat' | 'summarize' | 'explain' | 'audio' | 'quiz' | 'questions';

const ACTION_META: Record<ActionKey, { glyph: string; agent: AgentName; mode: string }> = {
  chat:      { glyph: '💬', agent: 'orchestrator', mode: 'chat' },
  summarize: { glyph: '📝', agent: 'pedagogy',     mode: 'summary' },
  explain:   { glyph: '🇪🇬', agent: 'pedagogy',     mode: 'egyptian' },
  audio:     { glyph: '🎧', agent: 'av',           mode: 'narrate' },
  quiz:      { glyph: '✓',  agent: 'assessment',   mode: 'generate' },
  questions: { glyph: '❓', agent: 'pedagogy',     mode: 'common_qs' }
};

export default function BooksScreen() {
  const { isAR, t, locale } = useApp();
  const { user } = useAuth();
  const router = useRouter();
  const search = useSearchParams();
  const subjectFromUrl = search.get('subject') as SubjectId | null;

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [subjectFilter, setSubjectFilter] = useState<SubjectId | 'all'>(subjectFromUrl ?? 'all');
  const [activeTab, setActiveTab] = useState<'official' | 'added'>('official');
  const [gradeFilter, setGradeFilter] = useState<string | 'all'>('all');

  const [chatInput, setChatInput] = useState('');
  const [chatMsgs, setChatMsgs] = useState<{ who: 'me' | '5sosy'; ar: string; en: string }[]>([]);
  const [action, setAction] = useState<ActionKey | null>(null);
  const [actionLog, setActionLog] = useState<AgentLogLine[] | null>(null);
  const [actionPayload, setActionPayload] = useState<Record<string, unknown> | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const [syncStatus, setSyncStatus] = useState<IngestionStatus | null>(null);
  const [dbBooks, setDbBooks] = useState<Book[]>([]);
  const [booksLoading, setBooksLoading] = useState(true);
  const [syncStarting, setSyncStarting] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);

  // Upload state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [newBookMeta, setNewBookMeta] = useState({
    title: '',
    subject: 'physics' as SubjectId,
    grade: 'G10',
    term: 'Term 1',
    language: 'ar',
    year: 2026
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const { db } = getFirebase();
      const statusDoc = doc(db, 'ingestion', 'status');
      const unsubStatus = onSnapshot(
        statusDoc,
        (snapshot) => {
          if (snapshot.exists()) {
            setSyncStatus(snapshot.data() as IngestionStatus);
          } else {
            setSyncStatus(null);
          }
        },
        (err) => console.error('ingestion/status listener failed:', err)
      );

      const booksCol = collection(db, 'books');
      const unsubBooks = onSnapshot(
        booksCol,
        (snapshot) => {
          const list: Book[] = [];
          snapshot.forEach((d) => {
            const data = d.data();
            list.push({
              id: d.id,
              subject: (data.subject as SubjectId) || 'physics',
              arT: data.title || data.subject,
              enT: data.title || data.subject,
              arSub: `${data.stage || ''} - ${data.grade || ''} (${data.term || ''})`,
              enSub: `${data.stage || ''} - ${data.grade || ''} (${data.term || ''})`,
              publisher: data.distributor || data.author || 'MOE',
              year: data.year || 2026,
              chapters: data.chapters || 0,
              pages: data.pages || 0,
              status: data.status || 'indexed',
              mastery: 0,
              cover: '',
              type: data.type || 'Student Book',
              _createdAtMs:
                typeof data.createdAt?.toMillis === 'function' ? data.createdAt.toMillis() : 0,
            } as Book & { _createdAtMs: number });
          });
          // Newest first; books without createdAt land last in deterministic title order.
          list.sort((a, b) => {
            const aMs = (a as Book & { _createdAtMs?: number })._createdAtMs ?? 0;
            const bMs = (b as Book & { _createdAtMs?: number })._createdAtMs ?? 0;
            if (aMs !== bMs) return bMs - aMs;
            return a.arT.localeCompare(b.arT);
          });
          setDbBooks(list);
          setBooksLoading(false);
        },
        (err) => {
          console.error('books listener failed:', err);
          setBooksLoading(false);
        }
      );

      return () => {
        unsubStatus();
        unsubBooks();
      };
    } catch (e) {
      console.error('Firebase snapshot initialization error:', e);
      setBooksLoading(false);
    }
  }, []);

  // Re-evaluate heartbeat staleness every 10s for the liveness banner.
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 10_000);
    return () => clearInterval(id);
  }, []);

  const triggerSyncCommand = async (command: 'start' | 'pause' | 'resume' | 'reset' | 'kill') => {
    if (command === 'start') setSyncStarting(true);
    try {
      const res = await fetch('/api/agents/ingestion', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ command }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        console.error('Failed to trigger sync command:', command, errBody);
      }
    } catch (err) {
      console.error('Error triggering sync command:', err);
    } finally {
      // Keep the "starting" pill up briefly so the user sees feedback even if
      // the eager-seed Firestore write arrives within ~100ms.
      if (command === 'start') setTimeout(() => setSyncStarting(false), 1500);
    }
  };

  // Liveness staleness — true when the Job has stopped heartbeating for >90s.
  const heartbeatMs = (() => {
    const v = syncStatus?.lastHeartbeatAt as { toMillis?: () => number } | undefined | null;
    return v && typeof v.toMillis === 'function' ? v.toMillis() : 0;
  })();
  const syncIsStale =
    syncStatus?.status === 'running' && heartbeatMs > 0 && nowTick - heartbeatMs > 90_000;

  const executionShortId = syncStatus?.executionName?.split('/').pop() || '';
  const executionLogsUrl = executionShortId
    ? `https://console.cloud.google.com/run/jobs/executions/details/us-east4/${executionShortId}/logs?project=khsosy`
    : '';

  useEffect(() => { if (subjectFromUrl) setSubjectFilter(subjectFromUrl); }, [subjectFromUrl]);

  // Separate official and added books
  const officialBooks = useMemo(() => dbBooks.filter(b => b.type !== 'Added Book'), [dbBooks]);
  const addedBooks = useMemo(() => dbBooks.filter(b => b.type === 'Added Book'), [dbBooks]);

  const activeBooks = activeTab === 'official' ? officialBooks : addedBooks;

  // Grades list for selector
  const availableGrades = useMemo(() => {
    const grades = new Set<string>();
    officialBooks.forEach(b => {
      // Extract grade code (e.g. G10, G11, G12) from sub if stored, or we can use sub fields
      const match = b.arSub.match(/G\d+/i) || b.enSub.match(/G\d+/i) || b.arSub.match(/الصف\s+(\S+)/);
      if (match) grades.add(match[0].trim());
      else if (b.arSub.includes('10') || b.enSub.includes('10')) grades.add('G10');
      else if (b.arSub.includes('11') || b.enSub.includes('11')) grades.add('G11');
      else if (b.arSub.includes('12') || b.enSub.includes('12')) grades.add('G12');
    });
    return Array.from(grades).sort();
  }, [officialBooks]);

  const filtered = useMemo(() => activeBooks.filter((b) => {
    const matchSubject = subjectFilter === 'all' || b.subject === subjectFilter;
    const matchGrade = gradeFilter === 'all' || b.arSub.toLowerCase().includes(gradeFilter.toLowerCase()) || b.enSub.toLowerCase().includes(gradeFilter.toLowerCase());
    return matchSubject && matchGrade;
  }), [activeBooks, subjectFilter, gradeFilter]);

  const selectedBooks = useMemo(() => dbBooks.filter((b) => selected.has(b.id)), [dbBooks, selected]);
  const count = selectedBooks.length;

  const toggle = (id: string, status: Book['status']) => {
    if (status !== 'indexed') return;
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllIndexed = () => setSelected(new Set(filtered.filter((b) => b.status === 'indexed').map((b) => b.id)));
  const clearAll = () => setSelected(new Set());

  const runAction = async (key: ActionKey) => {
    if (count === 0) return;
    setAction(key);
    setActionLoading(true);
    setActionPayload(null);
    setActionLog(buildLog(key, selectedBooks, isAR));
    const meta = ACTION_META[key];
    const res = await callAgent(meta.agent, {
      mode: meta.mode,
      bookIds: [...selected],
      subjects: [...new Set(selectedBooks.map((b) => b.subject))],
      locale
    }).catch(() => null);
    setActionPayload((res?.result as Record<string, unknown>) ?? {});
    setTimeout(() => setActionLoading(false), 2200);
  };

  const sendChat = async () => {
    if (!chatInput.trim() || count === 0) return;
    const user = chatInput;
    setChatMsgs((m) => [...m, { who: 'me', ar: user, en: user }]);
    setChatInput('');
    void callAgent('orchestrator', { mode: 'chat', bookIds: [...selected], message: user, locale }).catch(() => undefined);
    setTimeout(() => {
      const titles = selectedBooks.map((b) => (isAR ? b.arT : b.enT)).join(' + ');
      setChatMsgs((m) => [...m, {
        who: '5sosy',
        ar: `طيب، من خلال ${titles}: السؤال بتاعك بيقع في الفصل اللي بيتكلم عن المفهوم ده. تحب أبدأ بشرح مختصر ولا أديك مثال محلول؟`,
        en: `From ${titles}: your question lands in the chapter that covers this concept. Want a short explanation first, or a worked example?`
      }]);
    }, 900);
  };

  const [showSyncDashboard, setShowSyncDashboard] = useState(false);

  useEffect(() => {
    if (syncStatus?.status === 'running' || syncStatus?.status === 'paused') {
      setShowSyncDashboard(true);
    }
  }, [syncStatus?.status]);

  // Vector Search handler
  const handleVectorSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearchLoading(true);
    setShowSearchModal(true);
    try {
      const res = await fetch('/api/books/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: searchQuery, limit: 12 })
      });
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.results || []);
      } else {
        console.error('Vector search failed');
      }
    } catch (err) {
      console.error('Error during vector search:', err);
    } finally {
      setSearchLoading(false);
    }
  };

  // Upload book handler
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setUploadFile(file);
      setNewBookMeta(prev => ({
        ...prev,
        title: file.name.replace(/\.[^/.]+$/, "") // Strip extension
      }));
    }
  };

  const handleUploadAndParse = async () => {
    if (!uploadFile) return;
    if (!user) {
      setUploadError(isAR ? 'يجب تسجيل الدخول لرفع الملفات.' : 'You must be logged in to upload files.');
      return;
    }
    setUploadProgress(0);
    setUploadError(null);

    const { storage } = getFirebase();
    const cleanTitle = newBookMeta.title.replace(/\s+/g, '-').toLowerCase();
    const bookId = `${cleanTitle}-${newBookMeta.language}-${newBookMeta.year}`;
    const storagePath = `users/${user.uid}/uploads/${bookId}/${uploadFile.name}`;
    const storageRef = ref(storage, storagePath);

    try {
      const uploadTask = uploadBytesResumable(storageRef, uploadFile);

      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setUploadProgress(Math.round(progress));
        },
        (error) => {
          console.error('Upload failed:', error);
          setUploadError(error.message);
          setUploadProgress(null);
        },
        () => {
          // Wrap the async completion logic so a thrown promise can't strand
          // the UI at 100%. Without this, getDownloadURL or the fetch
          // rejecting would leave uploadProgress=100 forever.
          (async () => {
            try {
              await getDownloadURL(uploadTask.snapshot.ref);
              const gcsUri = `gs://${storage.app.options.storageBucket}/${storagePath}`;

              const res = await fetch('/api/books/parse-added', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                  bookId,
                  title: newBookMeta.title,
                  gcsUri,
                  stage: 'Secondary',
                  grade: newBookMeta.grade,
                  term: newBookMeta.term,
                  subject: newBookMeta.subject,
                  type: 'Added Book',
                  language: newBookMeta.language,
                  year: newBookMeta.year,
                }),
              });

              if (res.ok) {
                setUploadFile(null);
                setUploadProgress(null);
              } else {
                const data = await res.json().catch(() => ({}));
                setUploadError(
                  data.error ||
                    (isAR ? 'فشل بدء المعالجة في الخادم.' : 'Parsing initiation failed.')
                );
                setUploadProgress(null);
              }
            } catch (err) {
              console.error('Post-upload step failed:', err);
              setUploadError(
                err instanceof Error
                  ? err.message
                  : isAR
                  ? 'تعذّر الاتصال بخدمة المعالجة.'
                  : 'Could not reach the parsing service.'
              );
              setUploadProgress(null);
            }
          })();
        }
      );
    } catch (err: unknown) {
      console.error('Error starting upload:', err);
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
      setUploadProgress(null);
    }
  };

  const handleDeleteBook = async (bookId: string) => {
    if (!confirm(isAR ? 'هل تريد حذف هذا الكتاب فعلاً؟' : 'Are you sure you want to delete this book?')) {
      return;
    }
    if (!user) {
      alert(isAR ? 'سجّل الدخول لحذف الكتاب.' : 'Sign in to delete this book.');
      return;
    }
    try {
      const idToken = await user.getIdToken();
      const res = await fetch('/api/books/delete', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ bookId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error('Delete failed:', data);
        alert(
          (isAR ? 'تعذّر حذف الكتاب: ' : 'Failed to delete: ') + (data.error || res.statusText)
        );
      }
    } catch (err) {
      console.error('Failed to delete book:', err);
    }
  };

  return (
    <ChromeLayout>
      <div className="px-5 lg:px-10 py-6 lg:py-8 max-w-[1400px]">
        {/* Dynamic Vector Search Bar */}
        <div className="mb-8 relative max-w-2xl mx-auto">
          <div className="relative flex items-center rounded-2xl bg-white/70 backdrop-blur-md border border-slate-200/80 shadow-md p-1.5 focus-within:border-sky-500 focus-within:ring-2 focus-within:ring-sky-200/60 transition duration-300">
            <span className="text-xl px-3 text-slate-400">🔍</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleVectorSearch()}
              placeholder={isAR ? 'ابحثSemantically في صفحات الكتب (مثال: قوانين الحركة الحرارية)...' : 'Semantic search inside book pages (e.g. thermodynamics)...'}
              className="flex-1 bg-transparent border-none text-[14px] text-slate-800 focus:outline-none py-2"
            />
            <button
              onClick={handleVectorSearch}
              className="bg-sky-600 hover:bg-sky-700 text-white font-extrabold text-[12.5px] px-5 py-2 rounded-xl transition shadow-sm"
            >
              {isAR ? 'بحث ذكي' : 'Search'}
            </button>
          </div>
        </div>

        <div className="flex items-end justify-between gap-4 mb-6 flex-wrap">
          <div>
            <h1 className="text-2xl lg:text-3xl font-extrabold text-slate-900">{t.books.title}</h1>
            <p className="text-slate-500 mt-1 text-[14px]">{t.books.sub}</p>
          </div>
          <Btn kind="outline" size="sm" onClick={() => setShowSyncDashboard((prev) => !prev)}>
            🔄 {isAR ? 'لوحة المزامنة' : 'Sync Console'}
          </Btn>
        </div>

        {/* Ingestion Sync Control Center */}
        {showSyncDashboard && (
          <Card className="mb-6 p-5 border border-slate-200 bg-slate-50/50">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4 mb-4">
              <div>
                <h2 className="text-[16px] font-extrabold text-slate-900 flex items-center gap-2">
                  <span>🔄</span> {isAR ? 'مستودع الكتب الإلكترونية للوزارة' : 'MOE Digital Textbook Repository'}
                </h2>
                <p className="text-[12px] text-slate-500 mt-0.5">
                  {isAR ? 'تنزيل ومزامنة المقررات الرسمية من موقع الوزارة وهيكلتها بالذكاء الاصطناعي' : 'Sync, store, and AI-parse national curriculum textbooks'}
                </p>
              </div>
              
              <div className="flex items-center gap-2 flex-wrap">
                {syncStatus?.status === 'running' && (
                  <button
                    onClick={() => triggerSyncCommand('pause')}
                    className="px-3.5 py-1.5 rounded-lg text-[12.5px] font-bold bg-amber-500 hover:bg-amber-600 text-white transition flex items-center gap-1.5 shadow-sm"
                  >
                    <span>⏸</span> {isAR ? 'إيقاف مؤقت' : 'Pause'}
                  </button>
                )}
                {syncStatus?.status === 'paused' && (
                  <button
                    onClick={() => triggerSyncCommand('resume')}
                    className="px-3.5 py-1.5 rounded-lg text-[12.5px] font-bold bg-sky-600 hover:bg-sky-700 text-white transition flex items-center gap-1.5 shadow-sm"
                  >
                    <span>▶</span> {isAR ? 'استئناف' : 'Resume'}
                  </button>
                )}
                {(syncStatus?.status === 'idle' || syncStatus?.status === 'completed' || syncStatus?.status === 'error' || !syncStatus) && (
                  <button
                    onClick={() => triggerSyncCommand('start')}
                    disabled={syncStarting}
                    className="px-3.5 py-1.5 rounded-lg text-[12.5px] font-bold bg-slate-900 hover:bg-slate-800 text-white transition flex items-center gap-1.5 shadow-sm disabled:opacity-60"
                  >
                    {syncStarting ? (
                      <>
                        <span className="animate-spin">⚙️</span> {isAR ? 'جاري البدء…' : 'Starting…'}
                      </>
                    ) : (
                      <>
                        <span>🚀</span> {isAR ? 'بدء المزامنة' : 'Start Sync'}
                      </>
                    )}
                  </button>
                )}

                {syncStatus?.status === 'running' && (
                  <button
                    onClick={() => {
                      if (confirm(isAR ? 'هل تريد إيقاف المزامنة فوراً؟ الكتب المضافة حتى الآن ستبقى.' : 'Kill the running sync immediately? Books indexed so far are kept.')) {
                        triggerSyncCommand('kill');
                      }
                    }}
                    className="px-3.5 py-1.5 rounded-lg text-[12.5px] font-bold bg-rose-600 hover:bg-rose-700 text-white transition flex items-center gap-1.5 shadow-sm"
                  >
                    <span>⛔</span> {isAR ? 'إنهاء فوري' : 'Kill Job'}
                  </button>
                )}

                {syncStatus?.status !== 'running' && (
                  <button
                    onClick={() => {
                      if (confirm(isAR ? 'هل أنت متأكد من إعادة ضبط مستودع الكتب؟ سيتم حذف جميع المزامنات السابقة.' : 'Are you sure you want to reset the repository? This will clear all synced textbooks.')) {
                        triggerSyncCommand('reset');
                      }
                    }}
                    className="px-3.5 py-1.5 rounded-lg text-[12.5px] font-bold border border-rose-200 text-rose-600 hover:bg-rose-50 transition"
                  >
                    {isAR ? 'إعادة ضبط' : 'Reset'}
                  </button>
                )}
              </div>
            </div>

            {/* Execution metadata + Cloud Logging deep-link */}
            {(executionShortId || syncStatus?.status === 'running') && (
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 mb-3 ltr">
                {executionShortId && (
                  <>
                    <span className="font-mono bg-slate-100 px-2 py-0.5 rounded">
                      exec: {executionShortId.slice(0, 18)}
                    </span>
                    {executionLogsUrl && (
                      <a
                        href={executionLogsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sky-600 hover:text-sky-700 hover:underline"
                      >
                        ↗ Cloud Logging
                      </a>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Liveness warning — Job hasn't heartbeated for >90s */}
            {syncIsStale && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-[13px] text-amber-900 mb-4 flex items-start gap-2">
                <span className="text-lg leading-none">⚠️</span>
                <div className="flex-1">
                  <div className="font-bold">
                    {isAR ? 'لم تستلم نبضات حياة من المزامنة منذ أكثر من ٩٠ ثانية.' : "Sync hasn't checked in for over 90s."}
                  </div>
                  <div className="text-[12px] text-amber-700 mt-0.5">
                    {isAR
                      ? 'قد تكون المهمة قد توقفت. جرّب "إنهاء فوري" ثم "بدء المزامنة" من جديد، أو افحص سجلات Cloud Run.'
                      : 'The Job container may have died. Try Kill Job → Start Sync, or open Cloud Logging to inspect.'}
                  </div>
                </div>
              </div>
            )}

            {/* Error banner — Job exited or failed to launch */}
            {syncStatus?.status === 'error' && syncStatus.errorMessage && (
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-[13px] text-rose-900 mb-4 flex items-start gap-2">
                <span className="text-lg leading-none">❌</span>
                <div className="flex-1">
                  <div className="font-bold">
                    {isAR ? 'فشلت المزامنة.' : 'Sync failed.'}
                  </div>
                  <div className="text-[12px] text-rose-700 mt-0.5 font-mono break-all">
                    {syncStatus.errorMessage}
                  </div>
                </div>
              </div>
            )}

            {!syncStatus && syncStarting && (
              <div className="bg-sky-50 border border-sky-100 rounded-xl p-3 text-[13px] font-semibold text-sky-800 flex items-center gap-2">
                <span className="animate-spin text-lg">⚙️</span>
                <span>{isAR ? 'جاري بدء مهمة المزامنة في Cloud Run…' : 'Launching sync job on Cloud Run…'}</span>
              </div>
            )}

            {syncStatus && syncStatus.status !== 'idle' && (
              <div className="space-y-4">
                {/* Progress & State */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                  <div className="md:col-span-3">
                    <div className="flex items-center gap-2">
                      <span className={`inline-block w-2.5 h-2.5 rounded-full ${
                        syncStatus.status === 'running' ? 'bg-emerald-500 animate-pulse' :
                        syncStatus.status === 'paused' ? 'bg-amber-500' :
                        syncStatus.status === 'completed' ? 'bg-sky-500' : 'bg-rose-500'
                      }`} />
                      <span className="font-extrabold text-[13.5px] uppercase tracking-wider text-slate-700">
                        {syncStatus.status === 'running' ? (isAR ? 'جاري المزامنة' : 'Syncing') :
                         syncStatus.status === 'paused' ? (isAR ? 'موقوف مؤقتاً' : 'Paused') :
                         syncStatus.status === 'completed' ? (isAR ? 'اكتمل بنجاح' : 'Completed') :
                         (isAR ? 'خطأ' : 'Error')}
                      </span>
                    </div>
                    <p className="text-[12px] text-slate-500 mt-1">
                      {isAR ? `تم تحميل ${syncStatus.downloadedBooks} من أصل ${syncStatus.totalBooks}` : `Synced ${syncStatus.downloadedBooks} of ${syncStatus.totalBooks}`}
                    </p>
                  </div>
                  
                  <div className="md:col-span-6">
                    <div className="relative w-full h-3.5 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          syncStatus.status === 'running' ? 'bg-sky-600' :
                          syncStatus.status === 'paused' ? 'bg-amber-400' : 'bg-emerald-500'
                        }`}
                        style={{ width: `${syncStatus.percentage}%` }}
                      />
                    </div>
                    <div className="flex justify-between items-center text-[11px] text-slate-400 mt-1">
                      <span>{syncStatus.percentage}%</span>
                      {syncStatus.activeBookTitle && (
                        <span className="truncate max-w-[80%] font-semibold text-slate-600">
                          {isAR ? 'جاري معالجة: ' : 'Active: '} {syncStatus.activeBookTitle}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="md:col-span-3 text-end text-[12px] space-y-1">
                    <span className="font-bold text-slate-700 block">{syncStatus.percentage}%</span>
                    {syncStatus.totalPagesProcessed && (
                      <span className="text-[10.5px] text-sky-600 font-semibold block">
                        {isAR ? `تمت معالجة ${syncStatus.totalPagesProcessed} صفحة` : `Processed ${syncStatus.totalPagesProcessed} pages`}
                      </span>
                    )}
                  </div>
                </div>

                {/* Progress Message Banner */}
                {syncStatus.progressMessage && (
                  <div className="bg-sky-50 border border-sky-100 rounded-xl p-3 text-[13px] font-semibold text-sky-800 flex items-center gap-2">
                    <span className="animate-spin text-lg">⚙️</span>
                    <span>{syncStatus.progressMessage}</span>
                  </div>
                )}

                {/* Real-time Logs Terminal & Queue */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                  {/* Terminal logs */}
                  <div className="lg:col-span-7 bg-slate-900 rounded-xl p-3.5 text-white">
                    <div className="text-[10px] text-slate-400 mb-2 uppercase font-mono tracking-wider border-b border-slate-800 pb-1.5">
                      Console log output
                    </div>
                    <div className="max-h-[160px] overflow-y-auto font-mono text-[11.5px] space-y-1 slim">
                      {syncStatus.logs && syncStatus.logs.map((log, idx) => {
                        const statusColor = log.status === 'error' ? 'text-rose-400' :
                                            log.status === 'warn' ? 'text-amber-400' :
                                            log.status === 'ok' ? 'text-emerald-400' :
                                            'text-sky-300';
                        return (
                          <div key={idx} className="flex gap-2">
                            <span className="text-slate-500">[{log.timestamp ? log.timestamp.slice(11,19) : ''}]</span>
                            <span className={statusColor}>&lt;{log.agent}&gt;</span>
                            <span className="text-slate-200">{log.text}</span>
                          </div>
                        );
                      })}
                      {(!syncStatus.logs || syncStatus.logs.length === 0) && (
                        <div className="text-slate-500 italic py-2">{isAR ? 'لا يوجد سجلات حتى الآن' : 'No logs generated yet.'}</div>
                      )}
                    </div>
                  </div>
                  
                  {/* Queue panel */}
                  <div className="lg:col-span-5 bg-white border border-slate-100 rounded-xl p-3">
                    <div className="text-[11px] font-extrabold text-slate-600 uppercase tracking-wider mb-2">
                      {isAR ? 'تتبع قائمة المزامنة' : 'Sync Activity Feed'}
                    </div>
                    <div className="max-h-[160px] overflow-y-auto space-y-1.5 slim">
                      {syncStatus.booksList && Object.values(syncStatus.booksList).slice(0, 10).map((b: any) => {
                        const badgeCls = b.status === 'completed' ? 'bg-emerald-50 text-emerald-700' :
                                         b.status === 'failed' ? 'bg-rose-50 text-rose-700' :
                                         b.status === 'downloading' || b.status === 'parsing' ? 'bg-sky-50 text-sky-700 animate-pulse' :
                                         'bg-slate-50 text-slate-600';
                        return (
                          <div key={b.id} className="flex items-center justify-between text-[11px] border-b border-slate-50 pb-1.5">
                            <span className="font-semibold text-slate-700 truncate max-w-[65%]" title={b.title}>
                              {b.title} ({b.grade})
                            </span>
                            <span className={`px-2 py-0.5 rounded text-[9.5px] font-bold ${badgeCls}`}>
                              {b.status}
                            </span>
                          </div>
                        );
                      })}
                      {(!syncStatus.booksList || Object.keys(syncStatus.booksList).length === 0) && (
                        <div className="text-slate-400 italic text-[11px] py-4 text-center">
                          {isAR ? 'جاري تجهيز قائمة الكتب...' : 'Preparing textbook list...'}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </Card>
        )}

        {/* Tab Selector */}
        <div className="flex border-b border-slate-200 mb-6">
          <button
            onClick={() => { setActiveTab('official'); setGradeFilter('all'); }}
            className={`px-6 py-3 font-extrabold text-[15px] border-b-2 transition ${
              activeTab === 'official'
                ? 'border-sky-600 text-sky-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            📚 {isAR ? 'الكتب الدراسية الرسمية' : 'Official Ministry Books'}
          </button>
          <button
            onClick={() => { setActiveTab('added'); setGradeFilter('all'); }}
            className={`px-6 py-3 font-extrabold text-[15px] border-b-2 transition ${
              activeTab === 'added'
                ? 'border-sky-600 text-sky-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            📂 {isAR ? 'المصادر والكتب المضافة' : 'Added Books / Resources'}
          </button>
        </div>

        {/* Filters Panel */}
        <div className="flex flex-wrap items-center gap-2 mb-5 bg-white border border-slate-200/60 p-3 rounded-2xl shadow-sm">
          {/* Grade Filter for Official Books */}
          {activeTab === 'official' && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[12px] font-bold text-slate-400 px-2 uppercase">{isAR ? 'السنة الدراسية:' : 'Grade/Year:'}</span>
              <FilterPill active={gradeFilter === 'all'} onClick={() => setGradeFilter('all')}>
                {t.books.filterAll}
              </FilterPill>
              {availableGrades.map((g) => (
                <FilterPill key={g} active={gradeFilter === g} onClick={() => setGradeFilter(g)}>
                  {g}
                </FilterPill>
              ))}
              <div className="w-px h-6 bg-slate-200 mx-2" />
            </div>
          )}

          {/* Subject Filter */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[12px] font-bold text-slate-400 px-2 uppercase">{isAR ? 'المادة:' : 'Subject:'}</span>
            <FilterPill active={subjectFilter === 'all'} onClick={() => setSubjectFilter('all')}>
              {t.books.filterAll}
            </FilterPill>
            {Object.keys(SUBJECT_META).map((s) => {
              const meta = SUBJECT_META[s as SubjectId];
              const h = HUE[meta.hue];
              return (
                <button
                  key={s}
                  onClick={() => setSubjectFilter(s as SubjectId)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold border transition
                    ${subjectFilter === s ? `${h.dot} text-white border-transparent` : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300'}`}
                >
                  <span>{meta.glyph}</span>
                  <span>{isAR ? meta.ar : meta.en}</span>
                </button>
              );
            })}
          </div>

          <div className="ms-auto flex items-center gap-2 text-[12px]">
            {count > 0 && (
              <>
                <span className="font-bold text-sky-700">
                  {count} {count === 1 ? t.books.selected : t.books.selectedPlural}
                </span>
                <button onClick={clearAll} className="text-slate-500 hover:text-rose-600 font-semibold">
                  {t.books.clear}
                </button>
              </>
            )}
            {count === 0 && (
              <button onClick={selectAllIndexed} className="text-slate-500 hover:text-sky-700 font-semibold">
                {t.books.selectAll}
              </button>
            )}
          </div>
        </div>

        {/* Book Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 lg:gap-5">
          {/* Uploader Card inside Added Books Tab */}
          {activeTab === 'added' && (
            <div className="rounded-2xl border-2 border-dashed border-slate-200 p-6 flex flex-col items-center justify-center text-center bg-slate-50/50 hover:bg-slate-50 transition duration-300">
              <input
                type="file"
                accept="application/pdf"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
              />
              {!uploadFile ? (
                <div className="flex flex-col items-center">
                  <span className="text-4xl mb-2">📁</span>
                  <h3 className="font-extrabold text-[14.5px] text-slate-800">{isAR ? 'أضف كتاب دراسي جديد' : 'Upload custom textbook'}</h3>
                  <p className="text-[12px] text-slate-500 mt-1 max-w-[200px]">
                    {isAR ? 'اسحب ملف PDF أو اضغط للتصفح' : 'Upload custom school textbook to parse'}
                  </p>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-4 bg-sky-600 hover:bg-sky-700 text-white font-extrabold text-[12px] px-4 py-2 rounded-xl transition shadow-sm"
                  >
                    {isAR ? 'تصفح الملفات' : 'Choose File'}
                  </button>
                </div>
              ) : (
                <div className="w-full text-start space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">📄</span>
                    <span className="font-semibold text-[13px] text-slate-700 truncate flex-1">{uploadFile.name}</span>
                  </div>
                  
                  {uploadProgress === null ? (
                    <div className="space-y-2">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-500 mb-1">{isAR ? 'العنوان:' : 'Title:'}</label>
                        <input
                          type="text"
                          value={newBookMeta.title}
                          onChange={(e) => setNewBookMeta(prev => ({ ...prev, title: e.target.value }))}
                          className="w-full text-[12px] border border-slate-200 rounded-lg p-2 focus:outline-none focus:border-sky-500"
                        />
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-500 mb-1">{isAR ? 'المادة:' : 'Subject:'}</label>
                          <select
                            value={newBookMeta.subject}
                            onChange={(e) => setNewBookMeta(prev => ({ ...prev, subject: e.target.value as SubjectId }))}
                            className="w-full text-[12px] border border-slate-200 rounded-lg p-2 focus:outline-none"
                          >
                            {Object.keys(SUBJECT_META).map(s => (
                              <option key={s} value={s}>{isAR ? SUBJECT_META[s as SubjectId].ar : SUBJECT_META[s as SubjectId].en}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-500 mb-1">{isAR ? 'الصف:' : 'Grade:'}</label>
                          <select
                            value={newBookMeta.grade}
                            onChange={(e) => setNewBookMeta(prev => ({ ...prev, grade: e.target.value }))}
                            className="w-full text-[12px] border border-slate-200 rounded-lg p-2 focus:outline-none"
                          >
                            <option value="G10">Grade 10</option>
                            <option value="G11">Grade 11</option>
                            <option value="G12">Grade 12</option>
                          </select>
                        </div>
                      </div>

                      <div className="flex gap-2 pt-2 justify-end">
                        <button
                          onClick={() => setUploadFile(null)}
                          className="text-[12px] font-bold text-slate-500 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 transition"
                        >
                          {isAR ? 'إلغاء' : 'Cancel'}
                        </button>
                        <button
                          onClick={handleUploadAndParse}
                          className="bg-sky-600 hover:bg-sky-700 text-white text-[12px] font-bold px-4 py-1.5 rounded-lg transition"
                        >
                          {isAR ? 'رفع ومعالجة' : 'Upload & Parse'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                        <div className="bg-sky-600 h-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                      </div>
                      <div className="flex justify-between text-[11px] text-slate-500">
                        <span>{isAR ? 'جاري الرفع للذكاء الاصطناعي...' : 'Uploading to AI storage...'}</span>
                        <span>{uploadProgress}%</span>
                      </div>
                    </div>
                  )}

                  {uploadError && (
                    <div className="text-[11px] text-rose-600 bg-rose-50 p-2 rounded-lg mt-2">
                      ⚠️ {uploadError}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {filtered.map((b) => (
            <div key={b.id} className="relative group">
              <BookCard
                book={b}
                selected={selected.has(b.id)}
                onToggle={() => toggle(b.id, b.status)}
                onViewDetails={() => router.push(`/${locale}/books/${b.id}`)}
              />
              {activeTab === 'added' && (
                <button
                  onClick={() => handleDeleteBook(b.id)}
                  className="absolute top-2 left-2 z-10 w-7 h-7 rounded-full bg-rose-50 border border-rose-200 text-rose-600 hover:bg-rose-500 hover:text-white transition grid place-items-center opacity-0 group-hover:opacity-100 shadow-sm"
                  title={isAR ? 'حذف هذا الكتاب' : 'Delete this book'}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Empty State */}
        {filtered.length === 0 && (
          <Card className="p-8 text-center text-slate-500 mt-6">
            {booksLoading
              ? isAR
                ? 'جاري تحميل الكتب من قاعدة البيانات…'
                : 'Loading books from Firestore…'
              : activeTab === 'added'
              ? isAR
                ? 'لم ترفع أي كتاب بعد. استخدم البطاقة أعلاه لرفع PDF خاص بك.'
                : 'No custom books yet. Use the card above to upload a PDF.'
              : dbBooks.length === 0
              ? isAR
                ? 'مستودع الكتب فارغ. افتح لوحة المزامنة ثم اضغط "بدء المزامنة" لتنزيل كتب الوزارة.'
                : 'The book repository is empty. Open the Sync Console and press "Start Sync" to download MOE textbooks.'
              : isAR
              ? 'لا يوجد كتب تطابق هذا الفلتر.'
              : 'No books match this filter.'}
          </Card>
        )}

        {/* Result Panel */}
        {action && (
          <div className="mt-6">
            <ResultPanel
              actionKey={action}
              books={selectedBooks}
              log={actionLog}
              loading={actionLoading}
              payload={actionPayload}
              onClose={() => { setAction(null); setActionLog(null); setActionPayload(null); }}
              onGoToQuiz={() => router.push(`/${locale}/quiz`)}
              chatMsgs={chatMsgs}
              chatInput={chatInput}
              setChatInput={setChatInput}
              sendChat={sendChat}
            />
          </div>
        )}
      </div>

      {/* Glassmorphic Search Results Modal */}
      {showSearchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
          <div className="relative w-full max-w-4xl bg-white/90 backdrop-blur-lg border border-slate-200/80 rounded-3xl shadow-2xl p-6 overflow-hidden flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
              <div>
                <h3 className="text-[17px] font-extrabold text-slate-900 flex items-center gap-2">
                  <span>🧠</span> {isAR ? 'نتائج البحث الدلالي (AI Vector Search)' : 'AI Semantic Search Results'}
                </h3>
                <p className="text-[12px] text-slate-500 mt-0.5">
                  {isAR ? `نتائج البحث عن: "${searchQuery}"` : `Matches for: "${searchQuery}"`}
                </p>
              </div>
              <button
                onClick={() => setShowSearchModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 transition grid place-items-center font-bold"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 pr-1 slim">
              {searchLoading ? (
                <div className="space-y-4 py-12">
                  <div className="flex justify-center"><div className="w-8 h-8 border-4 border-sky-600 border-t-transparent rounded-full animate-spin"></div></div>
                  <p className="text-center text-slate-500 text-[13px]">{isAR ? 'جاري تحليل وفحص محتوى الكتب بالذكاء الاصطناعي...' : 'AI is processing similarity rankings across all pages...'}</p>
                </div>
              ) : searchResults.length === 0 ? (
                <div className="text-center py-12 text-slate-400 italic">
                  {isAR ? 'لم يتم العثور على صفحات مطابقة للبحث' : 'No matching pages found in any textbook.'}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {searchResults.map((res: any, idx: number) => (
                    <div
                      key={idx}
                      onClick={() => {
                        setShowSearchModal(false);
                        router.push(`/${locale}/books/${res.bookId}?page=${res.pageNumber}`);
                      }}
                      className="border border-slate-100 hover:border-sky-300 hover:shadow-md rounded-2xl p-4 bg-white/70 hover:bg-white transition cursor-pointer card-lift"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-extrabold text-[13.5px] text-slate-950 truncate max-w-[70%]">{res.bookTitle}</span>
                        <span className="text-[11px] bg-sky-50 text-sky-700 font-bold px-2 py-0.5 rounded-lg">
                          Score: {Math.round(res.score * 100)}%
                        </span>
                      </div>
                      
                      <div className="text-[12px] text-slate-600 line-clamp-3 mb-3 rtl leading-relaxed">
                        {res.text}
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span>{res.grade} · {res.subject}</span>
                        <span className="font-bold text-sky-600">{isAR ? `صفحة ${res.pageNumber}` : `Page ${res.pageNumber}`} ➔</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Sticky action bar */}
      <div className={`sticky bottom-0 left-0 right-0 z-20 transition-transform ${count > 0 ? 'translate-y-0' : 'translate-y-full'}`}>
        <div className="bg-white border-t border-slate-200 shadow-lg">
          <div className="max-w-[1400px] mx-auto px-4 lg:px-10 py-3 flex items-center gap-2 overflow-x-auto slim">
            <div className="hidden sm:block text-[12px] text-slate-500 me-2 shrink-0">
              {count} {count === 1 ? t.books.selected : t.books.selectedPlural}
            </div>
            {(Object.keys(ACTION_META) as ActionKey[]).map((key) => (
              <ActionButton
                key={key}
                glyph={ACTION_META[key].glyph}
                label={t.books.action[key]}
                sub={t.books.actionSub[key]}
                active={action === key}
                onClick={() => runAction(key)}
              />
            ))}
          </div>
        </div>
      </div>
    </ChromeLayout>
  );
}

function FilterPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold border transition
        ${active ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
    >
      {children}
    </button>
  );
}

function BookCard({ book, selected, onToggle, onViewDetails }: { book: Book; selected: boolean; onToggle: () => void; onViewDetails: () => void }) {
  const { isAR, t } = useApp();
  const meta = SUBJECT_META[book.subject] || { glyph: '📚', hue: 'stone', ar: book.subject, en: book.subject };
  const h = HUE[meta.hue as HueId] || HUE.stone;
  const isLocked = book.status !== 'indexed';

  return (
    <div
      className={`relative text-start group rounded-2xl border bg-white overflow-hidden transition-all
        ${selected ? 'border-sky-500 ring-2 ring-sky-200 shadow-md' : 'border-slate-200 hover:border-slate-300 hover:shadow-sm'}
        ${isLocked ? 'opacity-75' : 'card-lift'}`}
    >
      {/* Clickable cover to view book details */}
      <div
        onClick={() => { if (!isLocked) onViewDetails(); }}
        className={`relative aspect-[5/3] ${h.bg} grid place-items-center ${isLocked ? 'cursor-not-allowed' : 'cursor-pointer'}`}
        style={{ background: gradientFor(meta.hue as HueId) }}
      >
        <div className="text-6xl drop-shadow-sm">{meta.glyph}</div>
        <div className="absolute top-3 start-3">
          <StatusBadge status={book.status} />
        </div>
        <div className="absolute bottom-3 end-3">
          <Ring value={book.mastery} size={36} stroke={4} />
        </div>
      </div>

      <div className="p-4">
        {/* Toggle selection checkbox */}
        {!isLocked && (
          <button
            onClick={onToggle}
            className="absolute top-3.5 right-3.5 z-10 w-7 h-7 rounded-full grid place-items-center border-2 transition bg-white/95 border-slate-200 hover:border-sky-500 shadow-sm"
          >
            <div className={`w-4 h-4 rounded-full ${selected ? 'bg-sky-600' : 'bg-transparent'} transition`} />
          </button>
        )}

        <SubjectChip id={book.subject} size="sm" />
        <div
          onClick={() => { if (!isLocked) onViewDetails(); }}
          className={`font-extrabold text-slate-900 text-[14.5px] mt-2 leading-snug line-clamp-2 ${isLocked ? '' : 'hover:text-sky-600 cursor-pointer transition'}`}
        >
          {isAR ? book.arT : book.enT}
        </div>
        <div className="text-[11.5px] text-slate-500 mt-1 line-clamp-1">{isAR ? book.arSub : book.enSub}</div>
        <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-3 ltr">
          <span>{book.chapters} {t.books.chapters}</span>
          <span>·</span>
          <span>{book.pages} {t.books.pages}</span>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: Book['status'] }) {
  const { t } = useApp();
  const cls = status === 'indexed' ? 'bg-emerald-500 text-white'
            : status === 'processing' ? 'bg-amber-500 text-white animate-pulse'
            : 'bg-slate-400 text-white';
  const label = status === 'indexed' ? t.books.indexed
              : status === 'processing' ? t.books.processing
              : t.books.queued;
  const glyph = status === 'indexed' ? '✓' : status === 'processing' ? '⟳' : '⏳';
  return (
    <span className={`inline-flex items-center gap-1 ${cls} rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide`}>
      <span className="ltr">{glyph}</span><span>{label}</span>
    </span>
  );
}

function ActionButton({ glyph, label, sub, active, onClick }: {
  glyph: string; label: string; sub: string; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={sub}
      className={`shrink-0 flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] font-semibold transition border
        ${active ? 'bg-sky-600 text-white border-sky-600 shadow-sm' : 'bg-white border-slate-200 text-slate-700 hover:border-sky-400 hover:text-sky-700'}`}
    >
      <span className="text-[16px] leading-none">{glyph}</span>
      <span>{label}</span>
    </button>
  );
}

function ResultPanel({
  actionKey, books, log, loading, payload, onClose, onGoToQuiz,
  chatMsgs, chatInput, setChatInput, sendChat
}: {
  actionKey: ActionKey;
  books: Book[];
  log: AgentLogLine[] | null;
  loading: boolean;
  payload: Record<string, unknown> | null;
  onClose: () => void;
  onGoToQuiz: () => void;
  chatMsgs: { who: 'me' | '5sosy'; ar: string; en: string }[];
  chatInput: string;
  setChatInput: (v: string) => void;
  sendChat: () => void;
}) {
  const { isAR, t } = useApp();
  const meta = ACTION_META[actionKey];
  const titles = books.map((b) => (isAR ? b.arT : b.enT));

  return (
    <Card className="overflow-hidden">
      <div className="px-5 pt-5 pb-3 flex items-center gap-3 border-b border-slate-100">
        <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-700 grid place-items-center text-xl">{meta.glyph}</div>
        <div className="flex-1 min-w-0">
          <div className="font-extrabold text-slate-900 text-[15px]">{t.books.action[actionKey]}</div>
          <div className="text-[12px] text-slate-500 truncate">
            {books.length === 1 ? titles[0] : `${books.length} ${isAR ? 'كتب' : 'books'} · ${titles.slice(0, 2).join(' + ')}${books.length > 2 ? '…' : ''}`}
          </div>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-[18px] px-2">✕</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12">
        <div className="lg:col-span-7 p-5 border-e border-slate-100 min-w-0">
          {actionKey === 'chat' ? (
            <ChatPanel msgs={chatMsgs} input={chatInput} setInput={setChatInput} send={sendChat} />
          ) : (
            <ActionResult actionKey={actionKey} loading={loading} payload={payload} books={books} onGoToQuiz={onGoToQuiz} />
          )}
        </div>
        <div className="lg:col-span-5 bg-slate-50 p-4 min-w-0">
          <div className="text-[11px] text-slate-500 mb-2 ltr">{t.books.panelHint}</div>
          {log && <AgentLog lines={log} heading={`${meta.agent}.log`} speed={11} />}
        </div>
      </div>
    </Card>
  );
}

function ActionResult({
  actionKey, loading, payload, books, onGoToQuiz
}: {
  actionKey: Exclude<ActionKey, 'chat'>;
  loading: boolean;
  payload: Record<string, unknown> | null;
  books: Book[];
  onGoToQuiz: () => void;
}) {
  const { isAR, t } = useApp();

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-3 rounded bg-slate-200 animate-pulse" />
        <div className="h-3 rounded bg-slate-200 animate-pulse w-[85%]" />
        <div className="h-3 rounded bg-slate-200 animate-pulse w-[70%]" />
        <div className="text-[11px] text-slate-500 mt-3">{t.books.workingOn}…</div>
      </div>
    );
  }

  if (actionKey === 'summarize') {
    return (
      <div>
        <div className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-[10.5px] font-bold px-2 py-0.5 rounded uppercase mb-3">
          ✓ {t.books.resultReady}
        </div>
        <p className="text-[14.5px] leading-[1.85] text-slate-700">
          {isAR
            ? `الكتب اللي اخترتها بتغطّي ${books.length} موضوع رئيسي. أهم المفاهيم: قوانين الغازات (بويل، شارل، PV=nRT)، التحويلات الحرارية، والعلاقات بين الضغط والحجم والحرارة. الفصل الثالث بيركّز على التطبيقات العملية، والفصل الرابع بيوسّع للسوائل.`
            : `Your selection covers ${books.length} core topic${books.length > 1 ? 's' : ''}. The key concepts: gas laws (Boyle's, Charles', PV=nRT), thermal transformations, and the relationships between P, V, T. Chapter 3 focuses on practical applications; Chapter 4 extends to fluids.`}
        </p>
        <ul className="mt-4 space-y-2 text-[13px] text-slate-700">
          <li className="flex gap-2"><span className="text-sky-600">▸</span><span>{isAR ? 'مفهوم: العلاقة العكسية بين P و V عند ثبات الحرارة' : 'Concept: inverse P–V relationship at constant T'}</span></li>
          <li className="flex gap-2"><span className="text-sky-600">▸</span><span>{isAR ? 'صيغة: P₁V₁ = P₂V₂' : 'Formula: P₁V₁ = P₂V₂'}</span></li>
          <li className="flex gap-2"><span className="text-sky-600">▸</span><span>{isAR ? 'فخ: التحويل من سيليزيوس لكلفن قبل الحساب' : 'Pitfall: convert °C → K before computing'}</span></li>
        </ul>
      </div>
    );
  }

  if (actionKey === 'explain') {
    return (
      <div>
        <div className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 text-[10.5px] font-bold px-2 py-0.5 rounded uppercase mb-3">
          🇪🇬 {isAR ? 'بالمصري' : 'Egyptian colloquial'}
        </div>
        <p className="text-[14.5px] leading-[1.95] text-slate-800 bg-amber-50/60 border-s-2 border-amber-400 ps-4 py-2 rounded-e-md">
          {isAR
            ? 'تخيل عربية ميكروباص ملياااانة ركاب. لما العربية تكون كبيرة، الناس مرتاحة، الضغط على الباب قليل. بس لما العربية تصغر فجأة، الناس هتزحم وهتخبط في الباب أكتر — ده اللي بنسميه ضغط أعلى. والقانون يقولك: لو ضربت الضغط في الحجم، الإجابة هي هي قبل وبعد، طول ما الحرارة مش متغيرة. كده فهمتها يا نجم؟'
            : "Picture a packed microbus. When it's roomy, people are chill — low pressure on the doors. Suddenly squeeze them into half the space and they bang on the doors way more. That's higher pressure. The law says: multiply pressure × volume and you get the same number before and after, as long as the temperature didn't change. Got it, champ?"}
        </p>
      </div>
    );
  }

  if (actionKey === 'audio') {
    return <AudioBlock />;
  }

  if (actionKey === 'quiz') {
    return (
      <div>
        <div className="inline-flex items-center gap-1 bg-violet-50 text-violet-700 text-[10.5px] font-bold px-2 py-0.5 rounded uppercase mb-3">
          ✓ {t.books.resultReady} · 5Q
        </div>
        <p className="text-[14.5px] text-slate-700 mb-4">
          {isAR
            ? 'حضّرت لك كويز ٥ أسئلة من الكتب اللي اخترتها. متوسط الصعوبة: متوسط. وقت متوقع: دقيقتين.'
            : "I built a 5-question quiz from your selection. Difficulty: medium. Expected time: ~2 minutes."}
        </p>
        <Btn kind="primary" onClick={onGoToQuiz}>
          ✓ {t.books.goToQuiz} <span className="ltr">→</span>
        </Btn>
      </div>
    );
  }

  if (actionKey === 'questions') {
    const items = isAR
      ? ['اشتق T من المعادلة PV=nRT — الخطوات والوحدات', 'لو ضغط غاز ٢ atm وحجمه ٤ لتر، احسب الحجم عند ٤ atm', 'علاقة بويل وعلاقة شارل — فرّق بينهم بمثال', 'ليه بنحول لكلفن قبل الحساب؟', 'استنتج العلاقة بين الكثافة وضغط الغاز']
      : ['Derive T from PV=nRT — show steps and units', 'A gas at 2 atm occupies 4 L. Find V at 4 atm', "Boyle's vs Charles' — distinguish with an example", 'Why must T be in Kelvin before calculating?', 'Relate gas density to pressure'];
    return (
      <div>
        <div className="inline-flex items-center gap-1 bg-rose-50 text-rose-700 text-[10.5px] font-bold px-2 py-0.5 rounded uppercase mb-3">
          ❓ {isAR ? 'أسئلة وزارية متكررة' : 'Frequent ministerial Qs'}
        </div>
        <ol className="space-y-2 text-[14px] text-slate-700">
          {items.map((q, i) => (
            <li key={i} className="flex gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-rose-100 text-rose-700 grid place-items-center text-[11px] font-bold ltr">{i + 1}</span>
              <span className="flex-1">{q}</span>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  return null;
}

function AudioBlock() {
  const { isAR } = useApp();
  const [playing, setPlaying] = useState(false);
  return (
    <div>
      <div className="inline-flex items-center gap-1 bg-sky-50 text-sky-700 text-[10.5px] font-bold px-2 py-0.5 rounded uppercase mb-3">
        🎧 EG-AR voice
      </div>
      <div className="bg-slate-900 rounded-xl p-4 flex items-center gap-3">
        <button onClick={() => setPlaying((p) => !p)}
          className="w-12 h-12 rounded-full bg-sky-500 hover:bg-sky-400 text-white grid place-items-center text-[14px] shadow-lg shadow-sky-900/40">
          <span className="ltr">{playing ? '❚❚' : '▶'}</span>
        </button>
        <div className="flex-1 flex items-end h-10 gap-[1.5px]">
          {Array.from({ length: 36 }).map((_, i) => (
            <span key={i} className="wave-bar"
              style={{
                animationDelay: `${(i * 60) % 700}ms`,
                animationPlayState: playing ? 'running' : 'paused',
                height: playing ? undefined : `${6 + (i % 8) * 2}px`,
                background: i > 20 ? '#0ea5e9' : '#38bdf8'
              }} />
          ))}
        </div>
        <span className="text-slate-300 text-[12px] ltr">2:18</span>
      </div>
      <p className="text-[13px] text-slate-600 mt-3 leading-relaxed">
        {isAR
          ? 'الملخص الصوتي ده مولّد بواسطة AV agent، بصوت عربي مصري ودود. بيغطي الفصلين الأساسيين في الكتب اللي اخترتها.'
          : 'Audio summary generated by the AV agent in a warm Egyptian-Arabic voice. Covers the two core chapters across your selection.'}
      </p>
    </div>
  );
}

function ChatPanel({ msgs, input, setInput, send }: {
  msgs: { who: 'me' | '5sosy'; ar: string; en: string }[];
  input: string; setInput: (v: string) => void; send: () => void;
}) {
  const { isAR, t } = useApp();
  return (
    <div className="flex flex-col h-[420px]">
      <div className="flex-1 overflow-y-auto slim space-y-2 mb-3 pe-1">
        {msgs.length === 0 && (
          <div className="text-center text-slate-400 text-[13px] py-12">{t.books.selectToBegin}</div>
        )}
        {msgs.map((m, i) => {
          const me = m.who === 'me';
          return (
            <div key={i} className={`flex ${me ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed
                ${me ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-800'}`}>
                {isAR ? m.ar : m.en}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder={t.books.chatPh}
          className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-[13.5px] focus:outline-none focus:border-sky-400"
        />
        <button onClick={send} className="w-11 h-11 rounded-lg bg-sky-600 hover:bg-sky-700 text-white grid place-items-center">
          <span className="ltr text-[14px]">↑</span>
        </button>
      </div>
    </div>
  );
}

function gradientFor(hue: HueId): string {
  const stops: Record<HueId, [string, string]> = {
    sky:     ['#bae6fd', '#0284c7'],
    violet:  ['#ddd6fe', '#7c3aed'],
    emerald: ['#a7f3d0', '#059669'],
    amber:   ['#fde68a', '#d97706'],
    rose:    ['#fecdd3', '#e11d48'],
    indigo:  ['#c7d2fe', '#4f46e5'],
    cyan:    ['#a5f3fc', '#0891b2'],
    stone:   ['#e7e5e4', '#78716c'],
    fuchsia: ['#fbcfe8', '#c026d3'],
    teal:    ['#99f6e4', '#0d9488']
  };
  const [a, b] = stops[hue];
  return `linear-gradient(135deg, ${a} 0%, ${b} 100%)`;
}

function buildLog(action: ActionKey, books: Book[], isAR: boolean): AgentLogLine[] {
  const titles = books.map((b) => (isAR ? b.arT : b.enT)).join(', ');
  const meta = ACTION_META[action];
  const lab = meta.agent[0].toUpperCase() + meta.agent.slice(1) + 'Agent';
  const intro = `Routing intent to ${meta.agent} (mode=${meta.mode})`;
  const fetch = `Fetching embeddings for ${books.length} book${books.length > 1 ? 's' : ''} from Vertex AI…`;
  const finalMap: Record<ActionKey, string> = {
    chat:      'Context loaded. Ready for follow-up turns.',
    summarize: 'Extracted 12 key concepts → distilled to 4-paragraph summary.',
    explain:   'Re-rendered explanation in Egyptian Arabic register.',
    audio:     'Synthesized 2:18 narration · eg-ar-female-warm voice.',
    quiz:      'Generated 5 MCQs · calibrated to your mastery curve.',
    questions: 'Cross-referenced 4 years of ministerial exams.'
  };
  return [
    { agent: 'Orchestrator', text: intro, status: 'info' },
    { agent: 'IngestionAgent', text: fetch },
    { agent: lab, text: `Source corpus: ${titles}.`, status: 'info' },
    { agent: lab, text: finalMap[action], status: 'ok' }
  ];
}
