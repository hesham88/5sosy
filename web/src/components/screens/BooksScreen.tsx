'use client';

import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { getFirebase } from '@/lib/firebase/client';
import { useAuth } from '@/lib/firebase/auth-context';
import { bookFromFirestore, bookMatchesQuery, compareBooks, normalizeSubject, bookTitle, bookSubtitle, bookType, bookGrade, bookTerm } from '@/lib/books';
import { ChromeLayout } from '../shared/Chrome';
import { useApp } from '../shared/Providers';
import { AgentLog, Btn, Card, Ring, SubjectChip, type AgentLogLine } from '../shared/atoms';
import { SUBJECT_META, HUE, type HueId } from '@/constants/subjects';
import { callAgent, type AgentName } from '@/lib/agents';
import type { Book, SubjectId, IngestionStatus, Video } from '@/lib/types';
import PipelineConsole from '../sync/PipelineConsole';
import InsightsVisualizer from '../books/InsightsVisualizer';

type ActionKey = 'chat' | 'summarize' | 'explain' | 'audio' | 'quiz' | 'questions';

const ACTION_META: Record<ActionKey, { glyph: string; agent: AgentName; mode: string }> = {
  chat:      { glyph: '💬', agent: 'orchestrator', mode: 'chat' },
  summarize: { glyph: '📝', agent: 'pedagogy',     mode: 'summary' },
  explain:   { glyph: '🇪🇬', agent: 'pedagogy',     mode: 'egyptian' },
  audio:     { glyph: '🎧', agent: 'av',           mode: 'narrate' },
  quiz:      { glyph: '✓',  agent: 'assessment',   mode: 'generate' },
  questions: { glyph: '❓', agent: 'pedagogy',     mode: 'common_qs' }
};

// Parse a YouTube URL into an embeddable form. Handles single videos AND
// playlists (the MOE "videos" are actually playlists) — a playlist embeds as
// `videoseries?list=…` which gives in-player next/prev navigation through the
// playlist's videos, so the modal no longer shows "Invalid video URL".
function parseYouTube(url: string): { embedUrl: string | null; isPlaylist: boolean; videoId: string | null; listId: string | null } {
  if (!url) return { embedUrl: null, isPlaylist: false, videoId: null, listId: null };
  let listId = '';
  let videoId = '';
  try {
    const u = new URL(url);
    listId = u.searchParams.get('list') || '';
    videoId = u.searchParams.get('v') || '';
    if (!videoId) {
      const m =
        u.pathname.match(/\/(?:embed|v|shorts)\/([\w-]{11})/) ||
        (u.hostname.includes('youtu.be') ? u.pathname.match(/\/([\w-]{11})/) : null);
      if (m) videoId = m[m.length - 1];
    }
  } catch {
    const lm = url.match(/[?&]list=([\w-]+)/);
    if (lm) listId = lm[1];
    const vm = url.match(/[?&]v=([\w-]{11})/) || url.match(/(?:youtu\.be\/|embed\/|v\/|shorts\/)([\w-]{11})/);
    if (vm) videoId = vm[1];
  }
  const base = 'https://www.youtube.com/embed/';
  const params = 'autoplay=1&rel=0';
  if (listId) {
    const inner = videoId.length === 11 ? videoId : 'videoseries';
    return { embedUrl: `${base}${inner}?${params}&list=${listId}`, isPlaylist: true, videoId: videoId || null, listId };
  }
  if (videoId.length === 11) {
    return { embedUrl: `${base}${videoId}?${params}`, isPlaylist: false, videoId, listId: null };
  }
  return { embedUrl: null, isPlaylist: false, videoId: null, listId: null };
}

// Sortable rank for a grade label so the filter lists eldest grades first.
// Higher = older student (3rd secondary highest → 1st primary lowest).
function gradeRank(g: string): number {
  const s = (g || '').trim();
  const gm = s.match(/G\s*(\d+)/i); // English codes G10/G11/G12 → secondary-ish
  if (gm) return 300 + parseInt(gm[1], 10);
  let stage = 0;
  if (/ثانوي/.test(s)) stage = 3;
  else if (/عدادي/.test(s)) stage = 2; // matches إعدادي / اعدادي
  else if (/ابتدائي/.test(s)) stage = 1;
  const ord: Record<string, number> = {
    'الأول': 1, 'الاول': 1, 'الثاني': 2, 'الثالث': 3, 'الرابع': 4, 'الخامس': 5, 'السادس': 6,
  };
  let n = 0;
  for (const [k, v] of Object.entries(ord)) { if (s.includes(k)) { n = v; break; } }
  return stage * 10 + n;
}

export default function BooksScreen() {
  const { isAR, t, locale } = useApp();
  const { user } = useAuth();
  const router = useRouter();
  const search = useSearchParams();
  const subjectFromUrl = search.get('subject') as SubjectId | null;

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [subjectFilter, setSubjectFilter] = useState<SubjectId | 'all'>(subjectFromUrl ?? 'all');
  const [activeTab, setActiveTab] = useState<'official' | 'added' | 'videos' | 'insights'>('official');
  const [gradeFilter, setGradeFilter] = useState<string | 'all'>('all');
  const [stageFilter, setStageFilter] = useState<'all' | 'primary' | 'preparatory' | 'secondary'>('all');
  const [typeFilter, setTypeFilter] = useState<string | 'all'>('all');
  const [languageFilter, setLanguageFilter] = useState<string | 'all'>('all');
  const [yearFilter, setYearFilter] = useState<string | 'all'>('all');
  const [publisherFilter, setPublisherFilter] = useState<string | 'all'>('all');
  const [catalogQuery, setCatalogQuery] = useState('');
  const PAGE_SIZE = 60;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const [chatInput, setChatInput] = useState('');
  const [chatMsgs, setChatMsgs] = useState<{ who: 'me' | '5sosy'; ar: string; en: string }[]>([]);
  const [action, setAction] = useState<ActionKey | null>(null);
  const [actionLog, setActionLog] = useState<AgentLogLine[] | null>(null);
  const [actionPayload, setActionPayload] = useState<Record<string, unknown> | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const [syncStatus, setSyncStatus] = useState<IngestionStatus | null>(null);
  const [dbBooks, setDbBooks] = useState<Book[]>([]);
  const [dbVideos, setDbVideos] = useState<Video[]>([]);
  const [booksLoading, setBooksLoading] = useState(true);
  const [videosLoading, setVideosLoading] = useState(true);
  const [syncStarting, setSyncStarting] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());

  // Video selected for modal player
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  // Active item within a crawled playlist (null = playlist default / single video)
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  useEffect(() => { setActiveItemId(null); }, [selectedVideo]);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchSuggestion, setSearchSuggestion] = useState<string | null>(null);

  // Mobile filters drawer
  const [showMobileFilters, setShowMobileFilters] = useState(false);

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
    const provider = (process.env.NEXT_PUBLIC_DATABASE_PROVIDER || 'firestore').toLowerCase();

    if (provider === 'mongodb') {
      let active = true;

      const fetchBooksAndVideos = async () => {
        try {
          setBooksLoading(true);
          const res = await fetch('/api/books');
          if (res.ok && active) {
            const data = await res.json();
            setDbBooks(data);
          }
        } catch (err) {
          console.error('Failed to fetch books from MongoDB:', err);
        } finally {
          if (active) setBooksLoading(false);
        }

        try {
          setVideosLoading(true);
          const res = await fetch('/api/videos');
          if (res.ok && active) {
            const data = await res.json();
            setDbVideos(data);
          }
        } catch (err) {
          console.error('Failed to fetch videos from MongoDB:', err);
        } finally {
          if (active) setVideosLoading(false);
        }
      };

      const fetchStatus = async () => {
        try {
          const res = await fetch('/api/ingestion/status');
          if (res.ok && active) {
            const data = await res.json();
            setSyncStatus(data);
          }
        } catch (err) {
          console.error('Failed to fetch sync status from MongoDB:', err);
        }
      };

      fetchBooksAndVideos();
      fetchStatus();

      const interval = setInterval(() => {
        if (!active) return;
        fetchStatus();
        
        // Only refresh books if ingestion is active to avoid unnecessary backend load
        fetch('/api/books')
          .then((res) => {
            if (res.ok) return res.json();
            throw new Error();
          })
          .then((data) => {
            if (active && Array.isArray(data)) setDbBooks(data);
          })
          .catch(() => {});
      }, 5000);

      return () => {
        active = false;
        clearInterval(interval);
      };
    }

    try {
      const { db } = getFirebase();
      const statusDoc = doc(db, 'ingestion', 'status');
      const unsubStatus = onSnapshot(
        statusDoc,
        (snapshot) => {
          if (snapshot.exists()) {
            const data = snapshot.data() as IngestionStatus;
            console.info('[sync status]', data.status, `${data.downloadedBooks}/${data.totalBooks}`, `exec=${data.executionName || '?'}`);
            setSyncStatus(data);
          } else {
            console.info('[sync status] doc does not exist');
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
          let badDocs = 0;
          snapshot.forEach((d) => {
            try {
              list.push(bookFromFirestore(d.id, d.data()));
            } catch (mapErr) {
              badDocs += 1;
              console.warn('[books listener] skipped malformed doc', d.id, mapErr);
            }
          });
          if (badDocs > 0) {
            console.warn(`[books listener] skipped ${badDocs}/${snapshot.size} malformed docs`);
          }
          list.sort(compareBooks);
          console.info(`[books listener] received ${snapshot.size} docs, mapped ${list.length}`);
          setDbBooks(list);
          setBooksLoading(false);
        },
        (err) => {
          console.error('books listener failed:', err);
          setBooksLoading(false);
        }
      );

      const videosCol = collection(db, 'videos');
      const unsubVideos = onSnapshot(
        videosCol,
        (snapshot) => {
          const list: Video[] = [];
          snapshot.forEach((d) => {
            try {
              const data = d.data();
              list.push({
                id: d.id,
                title: data.title || '',
                stage: data.stage || '',
                grade: data.grade || '',
                subject: normalizeSubject(data.subject || ''),
                term: data.term || '',
                youtubeUrl: data.youtubeUrl || '',
                sourceUrl: data.sourceUrl || '',
              });
            } catch (err) {
              console.warn('[videos listener] skipped malformed doc', d.id, err);
            }
          });
          list.sort((a, b) => a.title.localeCompare(b.title));
          console.info(`[videos listener] received ${snapshot.size} docs`);
          setDbVideos(list);
          setVideosLoading(false);
        },
        (err) => {
          console.error('videos listener failed:', err);
          setVideosLoading(false);
        }
      );

      return () => {
        unsubStatus();
        unsubBooks();
        unsubVideos();
      };
    } catch (e) {
      console.error('Firebase snapshot initialization error:', e);
      setBooksLoading(false);
      setVideosLoading(false);
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
      if (command === 'start') setTimeout(() => setSyncStarting(false), 1500);
    }
  };

  // Liveness staleness
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

  // Reset the render window to the first page whenever the result set changes.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [activeTab, subjectFilter, gradeFilter, stageFilter, typeFilter, languageFilter, yearFilter, publisherFilter, catalogQuery]);

  // Separate official and added books
  const officialBooks = useMemo(() => dbBooks.filter(b => b.type !== 'Added Book'), [dbBooks]);
  const addedBooks = useMemo(() => dbBooks.filter(b => b.type === 'Added Book'), [dbBooks]);

  const activeBooks = activeTab === 'official' ? officialBooks : addedBooks;
  const indexedCount = useMemo(() => dbBooks.filter((b) => b.status === 'indexed').length, [dbBooks]);
  const processingCount = useMemo(
    () => dbBooks.filter((b) => b.status !== 'indexed' && b.status !== 'error').length,
    [dbBooks]
  );
  const totalPages = useMemo(() => dbBooks.reduce((sum, b) => sum + (b.pages || 0), 0), [dbBooks]);

  // Dynamic matching helper for Stage.
  const matchesStage = useCallback((hay?: string) => {
    if (stageFilter === 'all') return true;
    if (!hay) return false;
    // Normalize Arabic hamza/alef/ya/ta-marbuta variants so e.g. "الإبتدائية"
    // (hamza form) matches the "ابتدائي" stage. Use prefix-free tokens
    // (بتدائ / عداد / ثانو) that survive ال + masculine/feminine endings.
    const s = hay
      .toLowerCase()
      .replace(/[أإآ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه');
    if (stageFilter === 'primary') return s.includes('primary') || s.includes('بتدائ');
    if (stageFilter === 'preparatory') return s.includes('preparatory') || s.includes('عداد');
    if (stageFilter === 'secondary') return s.includes('secondary') || s.includes('ثانو');
    return false;
  }, [stageFilter]);

  // Stage often lives in grade/subtitle, not the (frequently empty) stage field —
  // build a combined haystack so the stage filter still works.
  const stageHay = useCallback(
    (b: Book) =>
      [b.stage, b.arStage, b.enStage, b.grade, b.arGrade, b.enGrade, b.arSub, b.enSub]
        .filter(Boolean)
        .join(' '),
    []
  );

  // Grades list for active filter
  const availableGrades = useMemo(() => {
    const grades = new Set<string>();
    if (activeTab === 'videos') {
      dbVideos.forEach(v => {
        if (v.grade) grades.add(v.grade);
      });
    } else {
      activeBooks.forEach(b => {
        if (b.grade) {
          grades.add(b.grade);
          return;
        }
        const match = b.arSub.match(/G\d+/i) || b.enSub.match(/G\d+/i) || b.arSub.match(/الصف\s+(\S+)/);
        if (match) grades.add(match[0].trim());
      });
    }
    // Eldest grades first (3rd secondary → 1st primary); unknowns sink to the bottom.
    return Array.from(grades).sort((a, b) => {
      const d = gradeRank(b) - gradeRank(a);
      return d !== 0 ? d : a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [activeBooks, dbVideos, activeTab]);

  // Book types list for official catalog — most-stocked type first (Student Book).
  const availableTypes = useMemo(() => {
    const counts = new Map<string, number>();
    officialBooks.forEach(b => {
      if (b.type) counts.set(b.type, (counts.get(b.type) || 0) + 1);
    });
    return Array.from(counts.entries())
      .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
      .map(([type]) => type);
  }, [officialBooks]);

  // Localized display labels for the filter dropdowns. The option VALUE stays
  // the raw (Arabic) string so filtering still matches; only the shown text is
  // translated via the per-book i18n maps.
  const gradeLabels = useMemo(() => {
    const m = new Map<string, string>();
    activeBooks.forEach((b) => { if (b.grade && !m.has(b.grade)) m.set(b.grade, bookGrade(b, locale)); });
    return m;
  }, [activeBooks, locale]);
  const typeLabels = useMemo(() => {
    const m = new Map<string, string>();
    officialBooks.forEach((b) => { if (b.type && !m.has(b.type)) m.set(b.type, bookType(b, locale)); });
    return m;
  }, [officialBooks, locale]);

  // Languages list for active filter
  const availableLanguages = useMemo(() => {
    const langs = new Set<string>();
    activeBooks.forEach(b => {
      if (b.language) langs.add(b.language);
    });
    return Array.from(langs).sort();
  }, [activeBooks]);

  // Years list for active filter
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    activeBooks.forEach(b => {
      if (b.year) years.add(b.year);
    });
    return Array.from(years).sort((a, b) => b - a); // descending order
  }, [activeBooks]);

  // Publishers list for active filter
  const availablePublishers = useMemo(() => {
    const publishers = new Set<string>();
    activeBooks.forEach(b => {
      if (b.publisher) publishers.add(b.publisher);
    });
    return Array.from(publishers).sort();
  }, [activeBooks]);

  // Filters Books list
  const filtered = useMemo(() => {
    if (activeTab === 'videos' || activeTab === 'insights') return [];
    return activeBooks.filter((b) => {
      const matchSubject = subjectFilter === 'all' || b.subject === subjectFilter;
      const matchGrade =
        gradeFilter === 'all' ||
        b.grade === gradeFilter ||
        b.arSub.toLowerCase().includes(gradeFilter.toLowerCase()) ||
        b.enSub.toLowerCase().includes(gradeFilter.toLowerCase());
      const matchStage = matchesStage(stageHay(b));
      const matchType = typeFilter === 'all' || b.type === typeFilter;
      const matchLanguage = languageFilter === 'all' || b.language === languageFilter;
      const matchYear = yearFilter === 'all' || b.year === Number(yearFilter);
      const matchPublisher = publisherFilter === 'all' || b.publisher === publisherFilter;
      return matchSubject && matchGrade && matchStage && matchType && matchLanguage && matchYear && matchPublisher && bookMatchesQuery(b, catalogQuery);
    });
  }, [activeBooks, subjectFilter, gradeFilter, matchesStage, stageHay, typeFilter, languageFilter, yearFilter, publisherFilter, catalogQuery, activeTab]);

  // Filters Videos list
  const filteredVideos = useMemo(() => {
    if (activeTab !== 'videos') return [];
    return dbVideos.filter((v) => {
      const matchSubject = subjectFilter === 'all' || v.subject === subjectFilter;
      const matchGrade = gradeFilter === 'all' || v.grade === gradeFilter;
      const matchStage = matchesStage([v.stage, v.grade].filter(Boolean).join(' '));

      const q = catalogQuery.trim().toLowerCase();
      const matchQuery =
        !q ||
        v.title.toLowerCase().includes(q) ||
        v.subject.toLowerCase().includes(q) ||
        v.grade.toLowerCase().includes(q) ||
        v.stage.toLowerCase().includes(q);

      return matchSubject && matchGrade && matchStage && matchQuery;
    });
  }, [dbVideos, subjectFilter, gradeFilter, matchesStage, catalogQuery, activeTab]);

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

  const clearAllFilters = () => {
    setSubjectFilter('all');
    setGradeFilter('all');
    setStageFilter('all');
    setTypeFilter('all');
    setLanguageFilter('all');
    setYearFilter('all');
    setPublisherFilter('all');
    setCatalogQuery('');
  };

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
    const msgVal = chatInput;
    setChatMsgs((m) => [...m, { who: 'me', ar: msgVal, en: msgVal }]);
    setChatInput('');
    void callAgent('orchestrator', { mode: 'chat', bookIds: [...selected], message: msgVal, locale }).catch(() => undefined);
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
  const handleVectorSearch = async (overrideQuery?: string) => {
    const q = (overrideQuery ?? searchQuery).trim();
    if (!q) return;
    if (overrideQuery) setSearchQuery(overrideQuery);
    setSearchLoading(true);
    setShowSearchModal(true);
    setSearchSuggestion(null);
    try {
      const res = await fetch('/api/books/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: q, limit: 12, mode: 'smart' })
      });
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.results || []);
        setSearchSuggestion(data.didYouMean && data.didYouMean.toLowerCase() !== q.toLowerCase() ? data.didYouMean : null);
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
        title: file.name.replace(/\.[^/.]+$/, "")
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
      if (res.ok) {
        // Optimistically drop it from the grid; the catalog poll (mongodb) or
        // snapshot (firestore) confirms shortly after.
        setDbBooks((prev) => prev.filter((b) => b.id !== bookId));
      } else {
        const data = await res.json().catch(() => ({}));
        console.error('Delete failed:', data);
        alert(
          (isAR ? 'تعذّر حذف الكتاب: ' : 'Failed to delete: ') + (data.error || res.statusText)
        );
      }
    } catch (err) {
      console.error('Failed to delete book:', err);
      alert(isAR ? 'تعذّر الاتصال بخدمة الحذف.' : 'Could not reach the delete service.');
    }
  };

  return (
    <ChromeLayout>
      <div className="px-4 lg:px-8 py-6 max-w-[1500px] mx-auto">
        {/* Header Hero banner */}
        <div className="mb-6 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="p-5 lg:p-6 flex flex-col gap-5">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-bold text-emerald-700 border border-emerald-100">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  {t.books.liveFirestore}
                </div>
                <h1 className="text-2xl lg:text-3xl font-extrabold text-slate-950 mt-3">{t.books.title}</h1>
                <p className="text-slate-500 mt-1 text-[14px] max-w-3xl">{t.books.sub}</p>
              </div>
              <Btn kind="outline" size="sm" onClick={() => setShowSyncDashboard((prev) => !prev)}>
                🔄 {t.books.syncConsole}
              </Btn>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <LibraryStat label={isAR ? 'كل الكتب' : 'Books'} value={dbBooks.length} tone="slate" />
              <LibraryStat label={t.books.indexed} value={indexedCount} tone="emerald" />
              <LibraryStat label={isAR ? 'قيد المعالجة' : 'In progress'} value={processingCount} tone="amber" />
              <LibraryStat label={t.books.pages} value={totalPages} tone="sky" />
            </div>

            {/* Unified smart search — exact-first, semantic fallback (one box, no toggle) */}
            <div className="relative flex items-center rounded-xl bg-white border border-slate-200 p-1.5 focus-within:border-sky-500 focus-within:ring-2 focus-within:ring-sky-200/60 transition">
              <span className="text-lg px-2 text-slate-400">🔍</span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleVectorSearch()}
                placeholder={t.books.searchEverything}
                className="flex-1 bg-transparent border-none text-[13.5px] text-slate-800 focus:outline-none py-1.5 min-w-0"
              />
              <button
                onClick={() => handleVectorSearch()}
                className="bg-sky-600 hover:bg-sky-700 text-white font-extrabold text-[12.5px] px-4 py-2 rounded-lg transition shadow-sm whitespace-nowrap"
              >
                {t.books.smartSearch}
              </button>
            </div>
          </div>
        </div>

        {/* New two-job Pipeline Console — Get Books + Analyze Books */}
        {showSyncDashboard && (
          <PipelineConsole isAR={isAR} />
        )}

        {/* Legacy single-job Sync Console — kept around during the transition */}
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
                {(syncStatus?.status === 'paused' || syncStatus?.status === 'error') && (
                  <button
                    onClick={() => triggerSyncCommand('resume')}
                    className="px-3.5 py-1.5 rounded-lg text-[12.5px] font-bold bg-sky-600 hover:bg-sky-700 text-white transition flex items-center gap-1.5 shadow-sm"
                  >
                    <span>▶</span> {isAR ? 'استئناف' : 'Resume'}
                  </button>
                )}
                {(syncStatus?.status === 'idle' || syncStatus?.status === 'completed' || !syncStatus) && (
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
                    {t.books.reset}
                  </button>
                )}
              </div>
            </div>

            {/* Execution info */}
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

            {/* Heartbeat warning */}
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

            {/* Error banner */}
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

            {/* Granular Task Status Dashboard */}
            {syncStatus && syncStatus.status !== 'idle' && (
              <div className="space-y-4">
                {/* Agent Task Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <AgentTaskCard
                    name={syncStatus.tasks?.crawler?.name || (isAR ? 'عامل زحف وفهرسة المناهج' : 'Crawler & Scraper Agent')}
                    status={syncStatus.tasks?.crawler?.status || (syncStatus.status === 'running' ? 'running' : 'queued')}
                    progress={syncStatus.tasks?.crawler?.progress || 0}
                    errorMessage={syncStatus.tasks?.crawler?.errorMessage}
                    icon="🕸️"
                  />
                  <AgentTaskCard
                    name={syncStatus.tasks?.video_extractor?.name || (isAR ? 'عامل استخراج القنوات التعليمية' : 'Video Extractor Agent')}
                    status={syncStatus.tasks?.video_extractor?.status || 'queued'}
                    progress={syncStatus.tasks?.video_extractor?.progress || 0}
                    errorMessage={syncStatus.tasks?.video_extractor?.errorMessage}
                    icon="🎥"
                  />
                </div>

                {/* Granular Textbook Ingestion checklist */}
                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                  <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                    <h3 className="text-[13px] font-extrabold text-slate-800 uppercase tracking-wide">
                      {isAR ? 'قائمة التحقق التفصيلية للكتب المكتشفة' : 'Textbook Ingestion Checklist'}
                    </h3>
                    <span className="text-[11px] font-bold text-sky-600 bg-sky-50 px-2.5 py-0.5 rounded-full">
                      {syncStatus.completedTasks || 0} / {syncStatus.totalTasks || 0} {isAR ? 'مهام مكتملة' : 'Tasks Done'}
                    </span>
                  </div>

                  <div className="max-h-[260px] overflow-y-auto p-4 space-y-2 slim bg-white">
                    {syncStatus.tasks && Object.entries(syncStatus.tasks)
                      .filter(([k]) => k.startsWith('book_'))
                      .map(([key, t]) => (
                        <BookTaskRow key={key} task={t} />
                      ))}

                    {(!syncStatus.tasks || Object.keys(syncStatus.tasks).filter(k => k.startsWith('book_')).length === 0) && (
                      <div className="text-center py-6 text-slate-400 italic text-[12px]">
                        {isAR ? 'في انتظار الزاحف للبدء في اكتشاف المناهج...' : 'Waiting for Crawler to discover curriculum books...'}
                      </div>
                    )}
                  </div>
                </div>

                {/* Log terminal */}
                <div className="bg-slate-900 rounded-xl p-3.5 text-white">
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
              </div>
            )}
          </Card>
        )}

        {/* Sidebar + Main Grid Container */}
        <div className="flex flex-col lg:flex-row gap-6 mt-6 items-start">
          {/* Desktop Sidebar Filters */}
          <aside className="hidden lg:block w-72 shrink-0 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-extrabold text-slate-900 text-[14px]">
                {t.books.filterCatalog}
              </h3>
              <button
                onClick={clearAllFilters}
                className="text-[11.5px] font-bold text-slate-400 hover:text-sky-600 transition"
              >
                {t.books.reset}
              </button>
            </div>
            
            <FilterContent
              isAR={isAR}
              t={t}
              subjectFilter={subjectFilter}
              setSubjectFilter={setSubjectFilter}
              gradeFilter={gradeFilter}
              setGradeFilter={setGradeFilter}
              stageFilter={stageFilter}
              setStageFilter={setStageFilter}
              typeFilter={typeFilter}
              setTypeFilter={setTypeFilter}
              languageFilter={languageFilter}
              setLanguageFilter={setLanguageFilter}
              yearFilter={yearFilter}
              setYearFilter={setYearFilter}
              publisherFilter={publisherFilter}
              setPublisherFilter={setPublisherFilter}
              catalogQuery={catalogQuery}
              setCatalogQuery={setCatalogQuery}
              availableGrades={availableGrades}
              availableTypes={availableTypes}
              availableLanguages={availableLanguages}
              availableYears={availableYears}
              availablePublishers={availablePublishers}
              gradeLabels={gradeLabels}
              typeLabels={typeLabels}
              activeTab={activeTab}
            />
          </aside>

          {/* Main Area */}
          <div className="flex-1 min-w-0 w-full space-y-6">
            
            {/* Header controls, Mobile Filter and stats */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {/* Mobile filters button */}
                <button
                  onClick={() => setShowMobileFilters(true)}
                  className="lg:hidden bg-white border border-slate-200 text-slate-700 font-bold text-[12.5px] px-3.5 py-2.5 rounded-xl shadow-sm hover:border-slate-300 transition flex items-center gap-1.5"
                >
                  <span>⚙️</span> {t.books.filtersBtn}
                  {(subjectFilter !== 'all' || gradeFilter !== 'all' || stageFilter !== 'all' || typeFilter !== 'all' || catalogQuery) && (
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
                  )}
                </button>

                {/* Tabs selector */}
                <div className="inline-flex rounded-xl bg-slate-100 border border-slate-200 p-1 overflow-x-auto slim">
                  <CatalogTab
                    active={activeTab === 'official'}
                    onClick={() => { setActiveTab('official'); setGradeFilter('all'); }}
                    label={t.books.ministryBooks}
                    count={officialBooks.length}
                  />
                  <CatalogTab
                    active={activeTab === 'added'}
                    onClick={() => { setActiveTab('added'); setGradeFilter('all'); }}
                    label={t.books.userUploads}
                    count={addedBooks.length}
                  />
                  <CatalogTab
                    active={activeTab === 'videos'}
                    onClick={() => { setActiveTab('videos'); setGradeFilter('all'); }}
                    label={t.books.videosTab}
                    count={dbVideos.length}
                  />
                  <CatalogTab
                    active={activeTab === 'insights'}
                    onClick={() => { setActiveTab('insights'); setGradeFilter('all'); }}
                    label={t.books.insightsTab}
                    count={undefined}
                  />
                </div>
              </div>

              {/* Status and count */}
              <div className="flex items-center gap-2 text-[12px] justify-end">
                <span className="text-slate-500">
                  {activeTab === 'videos' ? filteredVideos.length : filtered.length} {t.books.resultsLabel}
                </span>
                {activeTab !== 'videos' && (
                  <>
                    {count > 0 ? (
                      <>
                        <span className="font-bold text-sky-700">
                          {count} {count === 1 ? t.books.selected : t.books.selectedPlural}
                        </span>
                        <button onClick={clearAll} className="text-slate-500 hover:text-rose-600 font-semibold">
                          {t.books.clear}
                        </button>
                      </>
                    ) : (
                      <button onClick={selectAllIndexed} className="text-slate-500 hover:text-sky-700 font-semibold">
                        {t.books.selectAll}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Grid display */}
            {activeTab === 'insights' ? (
              <InsightsVisualizer isAR={isAR} />
            ) : activeTab === 'videos' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
                {filteredVideos.slice(0, visibleCount).map((v) => (
                  <VideoCard key={v.id} video={v} onClick={() => setSelectedVideo(v)} />
                ))}

                {filteredVideos.length > visibleCount && (
                  <div className="w-full col-span-full flex justify-center pt-2">
                    <button
                      onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                      className="px-6 py-2.5 rounded-full bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition shadow-sm"
                    >
                      {isAR
                        ? `عرض المزيد (${filteredVideos.length - visibleCount} متبقٍ)`
                        : `Load more (${filteredVideos.length - visibleCount} more)`}
                    </button>
                  </div>
                )}

                {filteredVideos.length === 0 && (
                  <Card className="p-8 text-center text-slate-500 w-full col-span-full">
                    {videosLoading
                      ? (isAR ? 'جاري تحميل الفيديوهات...' : 'Loading educational videos…')
                      : (isAR ? 'لا توجد فيديوهات مطابقة للخيارات المحددة.' : 'No videos match the selected filters.')}
                  </Card>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
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
                          className="mt-4 bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-[12px] px-4 py-2 rounded-xl transition shadow-sm"
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

                {filtered.slice(0, visibleCount).map((b) => (
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
                        className="absolute top-2 start-2 z-10 w-7 h-7 rounded-full bg-rose-50 border border-rose-200 text-rose-600 hover:bg-rose-500 hover:text-white transition grid place-items-center opacity-0 group-hover:opacity-100 shadow-sm"
                        title={isAR ? 'حذف هذا الكتاب' : 'Delete this book'}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}

                {filtered.length > visibleCount && (
                  <div className="w-full col-span-full flex justify-center pt-2">
                    <button
                      onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                      className="px-6 py-2.5 rounded-full bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition shadow-sm"
                    >
                      {isAR
                        ? `عرض المزيد (${filtered.length - visibleCount} متبقٍ)`
                        : `Load more (${filtered.length - visibleCount} more)`}
                    </button>
                  </div>
                )}

                {filtered.length === 0 && (
                  <Card className="p-8 text-center text-slate-500 w-full col-span-full">
                    {booksLoading
                      ? (isAR ? 'جاري تحميل الكتب...' : 'Loading textbooks…')
                      : (isAR ? 'لا توجد كتب تطابق خيارات التصفية الحالية.' : 'No textbooks match the current filters.')}
                  </Card>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Action Panel */}
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

      {/* Mobile Drawer Slide-over */}
      {showMobileFilters && (
        <div className="fixed inset-0 z-40 lg:hidden flex justify-end">
          {/* Backdrop */}
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowMobileFilters(false)} />
          {/* Content */}
          <div className="relative w-80 max-w-[85vw] h-full bg-white shadow-2xl p-5 overflow-y-auto z-50 flex flex-col justify-between">
            <div className="space-y-6">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <h3 className="font-extrabold text-slate-900 text-[15px]">
                  {t.books.filterCatalog}
                </h3>
                <button
                  onClick={() => { clearAllFilters(); setShowMobileFilters(false); }}
                  className="text-[11.5px] font-bold text-slate-400 hover:text-sky-600 transition"
                >
                  {t.books.reset}
                </button>
              </div>
              
              <FilterContent
                isAR={isAR}
                t={t}
                subjectFilter={subjectFilter}
                setSubjectFilter={(s: any) => { setSubjectFilter(s); setShowMobileFilters(false); }}
                gradeFilter={gradeFilter}
                setGradeFilter={(g: any) => { setGradeFilter(g); setShowMobileFilters(false); }}
                stageFilter={stageFilter}
                setStageFilter={(st: any) => { setStageFilter(st); setShowMobileFilters(false); }}
                typeFilter={typeFilter}
                setTypeFilter={(ty: any) => { setTypeFilter(ty); setShowMobileFilters(false); }}
                languageFilter={languageFilter}
                setLanguageFilter={(l: any) => { setLanguageFilter(l); setShowMobileFilters(false); }}
                yearFilter={yearFilter}
                setYearFilter={(y: any) => { setYearFilter(y); setShowMobileFilters(false); }}
                publisherFilter={publisherFilter}
                setPublisherFilter={(p: any) => { setPublisherFilter(p); setShowMobileFilters(false); }}
                catalogQuery={catalogQuery}
                setCatalogQuery={setCatalogQuery}
                availableGrades={availableGrades}
                availableTypes={availableTypes}
                availableLanguages={availableLanguages}
                availableYears={availableYears}
                availablePublishers={availablePublishers}
                gradeLabels={gradeLabels}
                typeLabels={typeLabels}
                activeTab={activeTab}
              />
            </div>
            <button
              onClick={() => setShowMobileFilters(false)}
              className="mt-6 w-full py-2.5 bg-slate-900 text-white font-bold rounded-xl text-[13px] hover:bg-slate-800 transition"
            >
              {isAR ? 'عرض النتائج' : 'Show Results'}
            </button>
          </div>
        </div>
      )}

      {/* Glassmorphic Search Results Modal */}
      {showSearchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
          <div className="relative w-full max-w-4xl bg-white/90 backdrop-blur-lg border border-slate-200/80 rounded-3xl shadow-2xl p-6 overflow-hidden flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
              <div>
                <h3 className="text-[17px] font-extrabold text-slate-900 flex items-center gap-2">
                  <span>🧠</span> {t.books.smartSearchResults}
                </h3>
                <p className="text-[12px] text-slate-500 mt-0.5">
                  {t.books.matchesFor}: &quot;{searchQuery}&quot;
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
              {searchSuggestion && !searchLoading && (
                <div className="text-[13px] text-slate-600 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
                  {t.books.didYouMean}{' '}
                  <button
                    onClick={() => handleVectorSearch(searchSuggestion)}
                    className="font-bold text-amber-700 hover:underline"
                  >
                    {searchSuggestion}
                  </button>
                  {isAR ? '؟' : '?'}
                </div>
              )}
              {searchLoading ? (
                <div className="space-y-4 py-12">
                  <div className="flex justify-center"><div className="w-8 h-8 border-4 border-sky-600 border-t-transparent rounded-full animate-spin"></div></div>
                  <p className="text-center text-slate-500 text-[13px]">{t.books.processingSearch}</p>
                </div>
              ) : searchResults.length === 0 ? (
                <div className="text-center py-12 text-slate-400 italic">
                  {t.books.noMatchingPages}
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
                        <span className="font-extrabold text-[13.5px] text-slate-950 truncate max-w-[70%]">{(isAR ? res.bookTitleAr : res.bookTitleEn) || res.bookTitle}</span>
                        <span className="text-[11px] bg-sky-50 text-sky-700 font-bold px-2 py-0.5 rounded-lg">
                          {t.books.match}: {Math.min(100, Math.round((res.score || 0) * 100))}%
                        </span>
                      </div>
                      
                      <div className="text-[12px] text-slate-600 line-clamp-3 mb-3 rtl leading-relaxed font-normal">
                        {res.text}
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span>{res.grade} · {res.subject}</span>
                        <span className="font-bold text-sky-600">{t.books.page} {res.pageNumber} ➔</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Premium Video Modal Iframe Player */}
      {selectedVideo && (() => {
        const { embedUrl } = parseYouTube(selectedVideo.youtubeUrl);
        const items = selectedVideo.items || [];
        const hasItems = items.length > 0;
        const listParam = selectedVideo.playlistId ? `&list=${selectedVideo.playlistId}` : '';
        // When a specific crawled item is chosen, play it (inside the playlist
        // context); otherwise fall back to the playlist/single-video embed.
        const playerSrc = activeItemId
          ? `https://www.youtube.com/embed/${activeItemId}?rel=0${listParam}`
          : embedUrl;
        const activeTitle = activeItemId ? items.find(i => i.videoId === activeItemId)?.title : null;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
            <div className="fixed inset-0" onClick={() => setSelectedVideo(null)} />
            <div className="relative w-full max-w-5xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col z-50">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/50">
                <div className="min-w-0">
                  <span className="text-[10px] uppercase font-bold text-sky-400 tracking-wider">
                    {selectedVideo.subject.toUpperCase()} · {selectedVideo.grade}
                  </span>
                  <h3 className="text-[15px] font-extrabold text-white truncate mt-0.5">
                    {activeTitle || selectedVideo.title}
                  </h3>
                  {hasItems && (
                    <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-bold text-amber-300">
                      🎞️ {isAR ? `قائمة تشغيل — ${items.length} فيديو` : `Playlist — ${items.length} videos`}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setSelectedVideo(null)}
                  className="w-8 h-8 rounded-full bg-slate-850 text-slate-400 hover:bg-slate-700 hover:text-white transition grid place-items-center font-bold text-[14px]"
                >
                  ✕
                </button>
              </div>

              <div className={`flex flex-col ${hasItems ? 'lg:flex-row' : ''}`}>
                <div className={`relative w-full aspect-video bg-black ${hasItems ? 'lg:flex-1' : ''}`}>
                  {playerSrc ? (
                    <iframe
                      src={playerSrc}
                      title={activeTitle || selectedVideo.title}
                      frameBorder="0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      className="absolute inset-0 w-full h-full"
                    />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-400">
                      <span>{isAR ? 'رابط الفيديو غير صالح' : 'Invalid video URL'}</span>
                      {selectedVideo.youtubeUrl && (
                        <a
                          href={selectedVideo.youtubeUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sky-400 hover:text-sky-300 text-[13px] font-semibold"
                        >
                          {isAR ? 'افتح على يوتيوب ↗' : 'Open on YouTube ↗'}
                        </a>
                      )}
                    </div>
                  )}
                </div>

                {hasItems && (
                  <div className="lg:w-80 shrink-0 max-h-[260px] lg:max-h-[60vh] overflow-y-auto slim bg-slate-950/40 border-t lg:border-t-0 lg:border-s border-slate-800 p-2 space-y-1">
                    {items.map((it, i) => {
                      const active = (activeItemId ?? items[0]?.videoId) === it.videoId;
                      return (
                        <button
                          key={it.videoId}
                          onClick={() => setActiveItemId(it.videoId)}
                          className={`w-full flex items-start gap-2.5 p-2 rounded-xl text-start transition ${
                            active ? 'bg-sky-600/20 ring-1 ring-sky-500/40' : 'hover:bg-slate-800/60'
                          }`}
                        >
                          <div className="relative w-20 shrink-0 aspect-video rounded-lg overflow-hidden bg-slate-800">
                            {it.thumbnail
                              // eslint-disable-next-line @next/next/no-img-element
                              ? <img src={it.thumbnail} alt="" className="absolute inset-0 w-full h-full object-cover" />
                              : <span className="absolute inset-0 grid place-items-center text-slate-500 text-[10px]">▶</span>}
                            <span className="absolute bottom-0.5 end-0.5 bg-black/70 text-white text-[9px] font-bold rounded px-1">{i + 1}</span>
                          </div>
                          <span className={`text-[11.5px] leading-snug line-clamp-3 ${active ? 'text-white font-semibold' : 'text-slate-300'}`}>
                            {it.title}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Sticky action bar */}
      <div className={`fixed bottom-0 left-0 right-0 z-20 transition-transform ${count > 0 ? 'translate-y-0' : 'translate-y-full'}`}>
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

/* FilterContent Sub-component */
function FilterContent({
  isAR,
  t,
  subjectFilter,
  setSubjectFilter,
  gradeFilter,
  setGradeFilter,
  stageFilter,
  setStageFilter,
  typeFilter,
  setTypeFilter,
  languageFilter,
  setLanguageFilter,
  yearFilter,
  setYearFilter,
  publisherFilter,
  setPublisherFilter,
  catalogQuery,
  setCatalogQuery,
  availableGrades,
  availableTypes,
  availableLanguages,
  availableYears,
  availablePublishers,
  gradeLabels,
  typeLabels,
  activeTab
}: {
  isAR: boolean;
  t: any;
  subjectFilter: any;
  setSubjectFilter: any;
  gradeFilter: any;
  setGradeFilter: any;
  stageFilter: any;
  setStageFilter: any;
  typeFilter: any;
  setTypeFilter: any;
  languageFilter: any;
  setLanguageFilter: any;
  yearFilter: any;
  setYearFilter: any;
  publisherFilter: any;
  setPublisherFilter: any;
  catalogQuery: any;
  setCatalogQuery: any;
  availableGrades: string[];
  availableTypes: string[];
  availableLanguages: string[];
  availableYears: number[];
  availablePublishers: string[];
  gradeLabels: Map<string, string>;
  typeLabels: Map<string, string>;
  activeTab: string;
}) {
  return (
    <div className="space-y-6">
      {/* 1. Free-text search input */}
      <div>
        <label className="block text-[11.5px] font-bold text-slate-400 uppercase mb-2">
          {t.books.searchTextLabel}
        </label>
        <div className="flex items-center gap-2 rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 focus-within:border-slate-400 focus-within:bg-white transition">
          <span className="text-slate-400">⌕</span>
          <input
            type="text"
            value={catalogQuery}
            onChange={(e) => setCatalogQuery(e.target.value)}
            placeholder={t.books.findPlaceholder}
            className="flex-1 bg-transparent border-none text-[13px] text-slate-800 focus:outline-none min-w-0"
          />
        </div>
      </div>

      {/* 2. Stage Filter */}
      <div>
        <label className="block text-[11.5px] font-bold text-slate-400 uppercase mb-2">
          {t.books.educationStage}
        </label>
        <div className="flex flex-col gap-1.5">
          {[
            { id: 'all', label: t.books.allStages },
            { id: 'primary', label: t.books.stagePrimary },
            { id: 'preparatory', label: t.books.stagePrep },
            { id: 'secondary', label: t.books.stageSecondary }
          ].map((st) => (
            <button
              key={st.id}
              onClick={() => setStageFilter(st.id as any)}
              className={`text-start px-3.5 py-2 rounded-xl text-[13px] font-semibold border transition
                ${stageFilter === st.id
                  ? 'bg-slate-900 text-white border-slate-900 font-extrabold shadow-sm'
                  : 'bg-white text-slate-650 border-slate-200 hover:border-slate-350 hover:bg-slate-50'}`}
            >
              {st.label}
            </button>
          ))}
        </div>
      </div>

      {/* 3. Grade Filter */}
      {availableGrades.length > 0 && (
        <div>
          <label className="block text-[11.5px] font-bold text-slate-400 uppercase mb-2">
            {t.books.gradeLabel}
          </label>
          <select
            value={gradeFilter}
            onChange={(e) => setGradeFilter(e.target.value)}
            className="w-full text-[13px] bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-850 focus:outline-none focus:border-sky-500 focus:bg-white transition"
          >
            <option value="all">{t.books.allGrades}</option>
            {availableGrades.map((g) => (
              <option key={g} value={g}>{gradeLabels.get(g) || g}</option>
            ))}
          </select>
        </div>
      )}

      {/* 4. Book Type (Only for textbooks) */}
      {activeTab !== 'videos' && availableTypes.length > 0 && (
        <div>
          <label className="block text-[11.5px] font-bold text-slate-400 uppercase mb-2">
            {t.books.bookTypeLabel}
          </label>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="w-full text-[13px] bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-850 focus:outline-none focus:border-sky-500 focus:bg-white transition"
          >
            <option value="all">{t.books.allTypes}</option>
            {availableTypes.map((ty) => (
              <option key={ty} value={ty}>{typeLabels.get(ty) || ty}</option>
            ))}
          </select>
        </div>
      )}

      {/* Language Filter */}
      {availableLanguages.length > 0 && (
        <div>
          <label className="block text-[11.5px] font-bold text-slate-400 uppercase mb-2">
            {t.books.languageLabel}
          </label>
          <select
            value={languageFilter}
            onChange={(e) => setLanguageFilter(e.target.value)}
            className="w-full text-[13px] bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-850 focus:outline-none focus:border-sky-500 focus:bg-white transition"
          >
            <option value="all">{t.books.allLanguages}</option>
            {availableLanguages.map((l) => (
              <option key={l} value={l}>{l === 'ar' ? (isAR ? 'عربي' : 'Arabic') : l === 'en' ? (isAR ? 'إنجليزي' : 'English') : l.toUpperCase()}</option>
            ))}
          </select>
        </div>
      )}

      {/* Year Filter */}
      {availableYears.length > 0 && (
        <div>
          <label className="block text-[11.5px] font-bold text-slate-400 uppercase mb-2">
            {t.books.yearLabel}
          </label>
          <select
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            className="w-full text-[13px] bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-850 focus:outline-none focus:border-sky-500 focus:bg-white transition"
          >
            <option value="all">{t.books.allYears}</option>
            {availableYears.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      )}

      {/* Publisher Filter */}
      {availablePublishers.length > 0 && (
        <div>
          <label className="block text-[11.5px] font-bold text-slate-400 uppercase mb-2">
            {t.books.publisherLabel}
          </label>
          <select
            value={publisherFilter}
            onChange={(e) => setPublisherFilter(e.target.value)}
            className="w-full text-[13px] bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-850 focus:outline-none focus:border-sky-500 focus:bg-white transition"
          >
            <option value="all">{t.books.allPublishers}</option>
            {availablePublishers.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
      )}

      {/* 5. Subject Filter */}
      <div>
        <label className="block text-[11.5px] font-bold text-slate-400 uppercase mb-2">
          {t.books.subjectsLabel}
        </label>
        <div className="space-y-1">
          <button
            onClick={() => setSubjectFilter('all')}
            className={`w-full text-start px-3 py-2 rounded-xl text-[13px] font-semibold transition
              ${subjectFilter === 'all'
                ? 'bg-slate-100 text-slate-900 font-extrabold shadow-sm'
                : 'text-slate-600 hover:bg-slate-50'}`}
          >
            📚 {t.books.allSubjects}
          </button>
          {Object.keys(SUBJECT_META).map((s) => {
            const meta = SUBJECT_META[s as SubjectId];
            const active = subjectFilter === s;
            return (
              <button
                key={s}
                onClick={() => setSubjectFilter(s as SubjectId)}
                className={`w-full text-start px-3 py-2 rounded-xl text-[13px] font-semibold transition flex items-center justify-between
                  ${active ? 'bg-sky-50 text-sky-800 font-extrabold' : 'text-slate-650 hover:bg-slate-50'}`}
              >
                <span className="flex items-center gap-2">
                  <span>{meta.glyph}</span>
                  <span>{isAR ? meta.ar : meta.en}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* AgentTaskCard component */
function AgentTaskCard({ name, status, progress, errorMessage, icon }: {
  name: string; status: string; progress: number; errorMessage?: string; icon: string;
}) {
  const statusColors = {
    completed: 'bg-emerald-50 border-emerald-100 text-emerald-700',
    running: 'bg-sky-50 border-sky-100 text-sky-700 animate-pulse',
    failed: 'bg-rose-50 border-rose-100 text-rose-700',
    queued: 'bg-slate-50 border-slate-100 text-slate-500'
  }[status] || 'bg-slate-50 text-slate-600';

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex items-start gap-4">
      <span className="text-3xl p-2 bg-slate-50 rounded-xl">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h4 className="font-extrabold text-[13.5px] text-slate-900 truncate">{name}</h4>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${statusColors}`}>
            {status}
          </span>
        </div>
        
        {/* Concurrency friendly progress bar */}
        <div className="mt-3 relative w-full h-2 bg-slate-100 rounded-full overflow-hidden">
          <div 
            className={`h-full rounded-full transition-all duration-500 ${
              status === 'failed' ? 'bg-rose-500' :
              status === 'completed' ? 'bg-emerald-500' : 'bg-sky-600'
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-slate-400 mt-1">
          <span>{progress}%</span>
          {errorMessage && (
            <span className="text-rose-600 font-semibold truncate max-w-[80%]" title={errorMessage}>
              {errorMessage}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* BookTaskRow component */
function BookTaskRow({ task }: { task: any }) {
  const status = task.status;
  const progress = task.progress;

  const statusIcon = status === 'completed' ? '🟢' :
                     status === 'running' ? '🔵' :
                     status === 'failed' ? '🔴' : '⏳';

  return (
    <div className="border border-slate-100 bg-slate-50/20 rounded-xl p-3 flex flex-col md:flex-row md:items-center justify-between gap-3 text-[12px]">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className="shrink-0">{statusIcon}</span>
        <span className="font-semibold text-slate-700 truncate" title={task.name}>
          {task.name}
        </span>
      </div>
      
      <div className="flex items-center gap-4 shrink-0 w-full md:w-auto">
        <div className="flex-1 md:w-36 flex items-center gap-2">
          <div className="relative w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
            <div 
              className={`h-full rounded-full ${
                status === 'failed' ? 'bg-rose-500' :
                status === 'completed' ? 'bg-emerald-500' : 'bg-sky-600'
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-[10px] text-slate-500 font-bold min-w-[28px] text-end">{progress}%</span>
        </div>
        
        {task.errorMessage && (
          <span className="text-[11px] text-rose-600 max-w-[150px] truncate" title={task.errorMessage}>
            ⚠️ {task.errorMessage}
          </span>
        )}
      </div>
    </div>
  );
}

/* VideoCard component */
function VideoCard({ video, onClick }: { video: Video; onClick: () => void }) {
  const { isAR } = useApp();
  const { videoId, isPlaylist } = parseYouTube(video.youtubeUrl);
  const thumbnailUrl = videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : null;

  return (
    <div 
      onClick={onClick}
      className="relative group rounded-2xl border border-slate-200 bg-white overflow-hidden hover:border-sky-300 hover:shadow-md transition duration-300 flex flex-col cursor-pointer card-lift"
    >
      <div className="relative aspect-video bg-gradient-to-br from-slate-800 to-slate-950 overflow-hidden flex items-center justify-center">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={video.title}
            className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
          />
        ) : (
          <span className="text-4xl opacity-40">🎞️</span>
        )}
        <div className="absolute inset-0 bg-slate-950/20 group-hover:bg-slate-950/35 transition duration-300 flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-white/90 backdrop-blur shadow-md flex items-center justify-center text-sky-600 transform scale-90 group-hover:scale-100 transition duration-300">
            <span className="text-[16px] ms-0.5">▶</span>
          </div>
        </div>
        <div className="absolute top-2.5 start-2.5">
          <SubjectChip id={video.subject} size="sm" />
        </div>
        {isPlaylist && (
          <div className="absolute top-2.5 end-2.5 rounded-md bg-slate-900/80 px-2 py-0.5 text-[10px] font-bold text-white">
            🎞️ {isAR ? 'قائمة' : 'Playlist'}
          </div>
        )}
      </div>
      
      <div className="p-4 flex-1 flex flex-col justify-between">
        <div>
          <h3 className="font-extrabold text-slate-900 text-[14px] leading-snug line-clamp-2 group-hover:text-sky-700 transition">
            {video.title}
          </h3>
          <div className="text-[11.5px] text-slate-500 mt-1">
            {video.grade} · {video.stage}
          </div>
        </div>
        <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
          <span>{video.term}</span>
          <span className="text-sky-600 font-bold flex items-center gap-0.5">
            {isAR ? 'شاهد الشرح' : 'Watch Video'} ➔
          </span>
        </div>
      </div>
    </div>
  );
}

function LibraryStat({ label, value, tone }: { label: string; value: number; tone: 'slate' | 'emerald' | 'amber' | 'sky' }) {
  const { locale } = useApp();
  const cls = tone === 'emerald' ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
            : tone === 'amber' ? 'bg-amber-50 border-amber-100 text-amber-700'
            : tone === 'sky' ? 'bg-sky-50 border-sky-100 text-sky-700'
            : 'bg-slate-50 border-slate-200 text-slate-700';
  return (
    <div className={`rounded-xl border px-4 py-3 ${cls}`}>
      <div className="text-[11px] font-bold uppercase tracking-wide opacity-75">{label}</div>
      <div className="mt-1 text-2xl font-extrabold ltr text-start">
        {new Intl.NumberFormat(locale).format(value)}
      </div>
    </div>
  );
}

function CatalogTab({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count?: number }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-extrabold transition ${
        active ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-800'
      }`}
    >
      <span>{label}</span>
      {count !== undefined && (
        <span className={`rounded-full px-2 py-0.5 text-[11px] ${active ? 'bg-sky-50 text-sky-700' : 'bg-white/70 text-slate-500'}`}>
          {count}
        </span>
      )}
    </button>
  );
}

function BookCard({ book, selected, onToggle, onViewDetails }: { book: Book; selected: boolean; onToggle: () => void; onViewDetails: () => void }) {
  const { isAR, t, locale } = useApp();
  const meta = SUBJECT_META[book.subject] || { glyph: '📚', hue: 'stone', ar: book.subject, en: book.subject };
  const isLocked = book.status !== 'indexed';
  const isAdded = book.type === 'Added Book';
  // Metadata prefers the pre-translated locale field (when present); falls back
  // to the stored Arabic for non-Arabic locales until the batch has run.
  const title = bookTitle(book, locale);
  const subtitle = bookSubtitle(book, locale);
  const typeLabel = bookType(book, locale);
  const details = [
    bookGrade(book, locale),
    bookTerm(book, locale),
    book.language ? book.language.toUpperCase() : '',
  ].filter(Boolean);

  return (
    <div
      className={`relative text-start group rounded-2xl border bg-white overflow-hidden transition-all min-h-[380px] flex flex-col
        ${selected ? 'border-sky-500 ring-2 ring-sky-200 shadow-md' : 'border-slate-200 hover:border-slate-300 hover:shadow-md'}
        ${isLocked ? 'opacity-80' : 'card-lift'}`}
    >
      <div
        onClick={() => { if (!isLocked) onViewDetails(); }}
        className={`relative aspect-[4/3] grid place-items-center overflow-hidden ${isLocked ? 'cursor-not-allowed' : 'cursor-pointer'}`}
        style={{ background: gradientFor(meta.hue as HueId) }}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(255,255,255,0.55),transparent_28%),linear-gradient(180deg,rgba(15,23,42,0.02),rgba(15,23,42,0.24))]" />
        <div className="relative w-[58%] max-w-[190px] aspect-[3/4] rounded-xl bg-white/92 shadow-xl border border-white/70 p-4 flex flex-col justify-between">
          <div>
            <div className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wide line-clamp-1">
              {typeLabel || (isAR ? 'كتاب' : 'Book')}
            </div>
            <div className="mt-3 text-5xl drop-shadow-sm">{meta.glyph}</div>
          </div>
          <div className="space-y-1">
            <div className="h-1.5 rounded-full bg-slate-200" />
            <div className="h-1.5 rounded-full bg-slate-100 w-2/3" />
          </div>
        </div>
        <div className="absolute top-3 start-3 flex items-center gap-2">
          <StatusBadge status={book.status} />
        </div>
        <div className="absolute bottom-3 start-3 flex gap-1.5">
          {book.year > 0 && (
            <span className="rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-bold text-slate-700 shadow-sm ltr">
              {book.year}
            </span>
          )}
          {isAdded && (
            <span className="rounded-full bg-slate-900/85 px-2.5 py-1 text-[11px] font-bold text-white shadow-sm">
              {isAR ? 'مضاف' : 'Added'}
            </span>
          )}
        </div>
        <div className="absolute bottom-3 end-3 rounded-full bg-white/90 p-1 shadow-sm">
          <Ring value={book.mastery} size={34} stroke={4} />
        </div>
      </div>

      <div className="p-4 flex-1 flex flex-col">
        {!isLocked && (
          <button
            onClick={onToggle}
            className="absolute top-3.5 end-3.5 z-10 w-8 h-8 rounded-full grid place-items-center border transition bg-white/95 border-white/80 hover:border-sky-500 shadow-sm"
            aria-label={selected ? 'Deselect book' : 'Select book'}
          >
            <div className={`w-4 h-4 rounded-full border ${selected ? 'bg-sky-600 border-sky-600' : 'bg-transparent border-slate-300'} transition`} />
          </button>
        )}

        <div className="flex items-center justify-between gap-2">
          <SubjectChip id={book.subject} size="sm" />
          {book.sourceUrl && (
            <a
              href={book.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-[11px] font-bold text-sky-700 hover:text-sky-900"
              title={isAR ? 'افتح مصدر الكتاب' : 'Open book source'}
            >
              ↗ {isAR ? 'المصدر' : 'Source'}
            </a>
          )}
        </div>

        <button
          onClick={() => { if (!isLocked) onViewDetails(); }}
          className={`font-extrabold text-slate-950 text-[15px] mt-3 leading-snug line-clamp-2 text-start ${
            isLocked ? 'cursor-not-allowed' : 'hover:text-sky-700 cursor-pointer transition'
          }`}
        >
          {title}
        </button>

        <div className="text-[12px] text-slate-500 mt-1.5 line-clamp-2 min-h-[36px]">{subtitle}</div>

        <div className="grid grid-cols-2 gap-2 mt-4 text-[11.5px]">
          <BookFact label={t.books.pages} value={book.pages ? String(book.pages) : '0'} />
          <BookFact label={t.books.chapters} value={book.chapters ? String(book.chapters) : '0'} />
          <BookFact label={t.books.year} value={book.year ? String(book.year) : '-'} />
          <BookFact label={isAR ? 'النوع' : 'Type'} value={typeLabel || '-'} />
        </div>

        {details.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {details.slice(0, 3).map((item) => (
              <span key={item} className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">
                {item}
              </span>
            ))}
          </div>
        )}

        <div className="mt-auto pt-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10.5px] font-bold text-slate-400 uppercase">{t.books.publisher}</div>
            <div className="text-[12px] font-semibold text-slate-700 truncate">{book.publisher}</div>
          </div>
          <button
            onClick={() => { if (!isLocked) onViewDetails(); }}
            disabled={isLocked}
            className="shrink-0 rounded-lg bg-slate-950 px-3 py-2 text-[12px] font-bold text-white hover:bg-sky-700 disabled:bg-slate-200 disabled:text-slate-500 transition"
          >
            {isAR ? 'فتح' : 'Open'}
          </button>
        </div>
      </div>
    </div>
  );
}

function BookFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 border border-slate-100 px-2.5 py-2 min-w-0">
      <div className="text-[10px] uppercase font-bold text-slate-400 truncate">{label}</div>
      <div className="text-[12px] font-extrabold text-slate-800 truncate mt-0.5">{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: Book['status'] }) {
  const { t, isAR } = useApp();
  const cls = status === 'indexed' ? 'bg-emerald-500 text-white'
            : status === 'error' ? 'bg-rose-600 text-white'
            : status === 'processing' || status === 'downloading' || status === 'parsing' ? 'bg-amber-500 text-white animate-pulse'
            : 'bg-slate-500 text-white';
  const label = status === 'indexed' ? t.books.indexed
              : status === 'error' ? (isAR ? 'خطأ' : 'Error')
              : status === 'processing' || status === 'downloading' || status === 'parsing' ? t.books.processing
              : t.books.queued;
  const glyph = status === 'indexed' ? '✓' : status === 'error' ? '!' : status === 'processing' || status === 'downloading' || status === 'parsing' ? '⟳' : '⏳';
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
      <p className="text-[13px] text-slate-650 mt-3 leading-relaxed">
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
