'use client';

import { use, useEffect, useRef, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { collection, doc, getDoc, onSnapshot, orderBy, query } from 'firebase/firestore';
import { getFirebase } from '@/lib/firebase/client';
import { bookFromFirestore, bookTitle, bookSubtitle } from '@/lib/books';
import { ChromeLayout } from '@/components/shared/Chrome';
import { useApp } from '@/components/shared/Providers';
import { Card, Btn, SubjectChip } from '@/components/shared/atoms';
import { SUBJECT_META } from '@/constants/subjects';
import type { Book } from '@/lib/types';
import { LocaleBlock } from '@/i18n/LocaleBlock';

type MindNode = { title: string; summary?: string; page?: number | null; children?: MindNode[] };

const BRANCH_COLORS = [
  'border-sky-400 bg-sky-50',
  'border-amber-400 bg-amber-50',
  'border-emerald-400 bg-emerald-50',
  'border-violet-400 bg-violet-50',
  'border-rose-400 bg-rose-50',
  'border-cyan-400 bg-cyan-50',
  'border-orange-400 bg-orange-50',
  'border-indigo-400 bg-indigo-50',
];

function MindMapNode({ node, depth, branch, onJump, pageLabel }: {
  node: MindNode; depth: number; branch: number;
  onJump: (n: number) => void; pageLabel: (n: number) => string;
}) {
  const hasPage = typeof node.page === 'number' && node.page > 0;
  const color = depth === 1 ? BRANCH_COLORS[branch % BRANCH_COLORS.length] : 'border-slate-200 bg-white';
  return (
    <li className="my-1">
      <div className={`inline-flex items-center gap-2 rounded-xl border ps-3 pe-2 py-1.5 ${color}`}>
        <span className={`${depth === 0 ? 'text-[15px] font-extrabold' : depth === 1 ? 'text-[13px] font-bold' : 'text-[12.5px] font-medium'} text-slate-800`}>
          {node.title}
        </span>
        {hasPage && (
          <button
            onClick={() => onJump(node.page as number)}
            className="text-[11px] font-bold text-sky-700 bg-white/70 hover:bg-sky-600 hover:text-white rounded-full px-2 py-0.5 border border-sky-200 transition shrink-0"
          >
            {pageLabel(node.page as number)}
          </button>
        )}
      </div>
      {Array.isArray(node.children) && node.children.length > 0 && (
        <ul className="ms-4 ps-3 border-s border-dashed border-slate-200 mt-1">
          {node.children.map((c, i) => (
            <MindMapNode key={i} node={c} depth={depth + 1} branch={depth === 0 ? i : branch} onJump={onJump} pageLabel={pageLabel} />
          ))}
        </ul>
      )}
    </li>
  );
}

export default function Page({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = use(params);
  const { isAR, t } = useApp();
  const router = useRouter();

  const [book, setBook] = useState<Book | null>(null);
  const [pages, setPages] = useState<any[]>([]);            // sparse: only loaded pages
  const [pageCount, setPageCount] = useState(0);
  const [pageLoading, setPageLoading] = useState(false);

  // Session-scoped translation (never persisted): translate each page to the
  // user's UI locale on demand when the toggle is on.
  const [translateOn, setTranslateOn] = useState(false);
  const [translations, setTranslations] = useState<Record<number, { text: string; dir: string }>>({});
  const [translating, setTranslating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentPageNum, setCurrentPageNum] = useState<number>(1);

  // Chatbot state
  const [chatInput, setChatInput] = useState('');
  const [chatMsgs, setChatMsgs] = useState<{ who: 'me' | '5sosy'; text: string; citations?: { pageNumber: number }[] }[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatSession, setChatSession] = useState<string | null>(null);
  const chatListRef = useRef<HTMLDivElement | null>(null);

  // Search inside book state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchSuggestion, setSearchSuggestion] = useState<string | null>(null);

  // Deep-link: open the page referenced by ?page=N (e.g. arriving from a
  // global search result). Runs once on mount; in-book navigation uses
  // setCurrentPageNum directly so it doesn't depend on the URL.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const p = parseInt(new URLSearchParams(window.location.search).get('page') || '', 10);
    if (Number.isFinite(p) && p > 0) setCurrentPageNum(p);
  }, []);

  // Mind map state (session-scoped; generated on demand)
  const [mindmapOpen, setMindmapOpen] = useState(false);
  const [mindmap, setMindmap] = useState<MindNode | null>(null);
  const [mindmapLoading, setMindmapLoading] = useState(false);
  const [mindmapError, setMindmapError] = useState(false);

  async function loadMindmap() {
    setMindmapOpen(true);
    if (mindmap || mindmapLoading) return;
    setMindmapLoading(true);
    setMindmapError(false);
    try {
      const res = await fetch('/api/books/mindmap', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bookId: id, locale, title: (isAR ? book?.arT : book?.enT) || book?.enT || '' }),
      });
      const d = await res.json();
      if (d?.status === 'ok' && d.mindmap) setMindmap(d.mindmap);
      else setMindmapError(true);
    } catch {
      setMindmapError(true);
    } finally {
      setMindmapLoading(false);
    }
  }

  function jumpToPage(n: number) {
    setCurrentPageNum(n);
    setMindmapOpen(false);
  }

  useEffect(() => {
    const provider = (process.env.NEXT_PUBLIC_DATABASE_PROVIDER || 'firestore').toLowerCase();

    if (provider === 'mongodb') {
      let active = true;
      setLoading(true);
      
      fetch(`/api/books/${id}`)
        .then((res) => {
          if (res.ok) return res.json();
          throw new Error('Book fetch failed');
        })
        .then((data) => {
          if (active) {
            setBook(data.book);
            setPages(data.pages || []);
            setPageCount(data.pageCount || (data.pages || []).length);
          }
        })
        .catch((err) => {
          console.error('Failed to load book from MongoDB API:', err);
          if (active) setBook(null);
        })
        .finally(() => {
          if (active) setLoading(false);
        });

      return () => {
        active = false;
      };
    }

    const { db } = getFirebase();
    const bookRef = doc(db, 'books', id);

    const unsub = onSnapshot(bookRef, async (snapshot) => {
      if (!snapshot.exists()) {
        setBook(null);
        setLoading(false);
        return;
      }
      const data = snapshot.data();
      setBook(bookFromFirestore(snapshot.id, data));

      // Pages source preference order:
      //   1. New: `books/{id}/content/full.pagesList` — written by lean indexer
      //   2. Legacy: `books/{id}.pagesList` — old bloated main-doc field
      //   3. Fallback: `books/{id}/pages/{pageN}` subcollection (each doc one page)
      try {
        let loaded: { pageNumber: number; text: string }[] = [];

        const contentSnap = await getDoc(doc(db, 'books', id, 'content', 'full'));
        if (contentSnap.exists()) {
          const c = contentSnap.data();
          if (Array.isArray(c.pagesList)) {
            loaded = c.pagesList as { pageNumber: number; text: string }[];
          }
        }

        if (loaded.length === 0 && Array.isArray(data.pagesList)) {
          loaded = data.pagesList as { pageNumber: number; text: string }[];
        }

        if (loaded.length === 0) {
          const pagesQ = query(
            collection(db, 'books', id, 'pages'),
            orderBy('pageNumber', 'asc')
          );
          const pagesSnap = await getDoc(doc(db, 'books', id)); // priming, ignored
          void pagesSnap;
          const { getDocs } = await import('firebase/firestore');
          const qSnap = await getDocs(pagesQ);
          loaded = qSnap.docs.map((d) => {
            const pd = d.data();
            return { pageNumber: pd.pageNumber as number, text: (pd.text as string) || '' };
          });
        }

        loaded.sort((a, b) => (a.pageNumber || 0) - (b.pageNumber || 0));
        setPages(loaded);
        setPageCount(loaded.length);
      } catch (e) {
        console.error('Failed to load book pages:', e);
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [id]);

  const currentPage = useMemo(() => {
    return pages.find(p => p.pageNumber === currentPageNum) || null;
  }, [pages, currentPageNum]);

  // Lazy-load the requested page on demand (mongodb) so opening a book is instant
  // instead of transferring every page's OCR up front.
  useEffect(() => {
    const provider = (process.env.NEXT_PUBLIC_DATABASE_PROVIDER || 'firestore').toLowerCase();
    if (provider !== 'mongodb' || !book) return;
    if (pages.some(p => p.pageNumber === currentPageNum)) return;
    let active = true;
    setPageLoading(true);
    fetch(`/api/books/${id}?page=${currentPageNum}`)
      .then(r => r.json())
      .then(d => {
        if (active && d?.page) {
          setPages(prev => prev.some(p => p.pageNumber === d.page.pageNumber) ? prev : [...prev, d.page]);
        }
      })
      .catch((e) => console.error('page fetch failed', e))
      .finally(() => { if (active) setPageLoading(false); });
    return () => { active = false; };
    // `pages` intentionally omitted — we gate on the membership check above to avoid a refetch loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPageNum, book, id]);

  // Translate the current page on demand (session-only) when the toggle is on.
  useEffect(() => {
    if (!translateOn || !book || !currentPage || !currentPage.text) return;
    if (translations[currentPageNum]) return;
    let active = true;
    setTranslating(true);
    fetch('/api/books/translate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: currentPage.text, source_locale: book.language || 'ar', target_locale: locale, mode: 'pedagogical' }),
    })
      .then(r => r.json())
      .then(d => {
        if (active && d?.translated) setTranslations(prev => ({ ...prev, [currentPageNum]: { text: d.translated, dir: d.dir || 'ltr' } }));
      })
      .catch(e => console.error('translate failed', e))
      .finally(() => { if (active) setTranslating(false); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [translateOn, currentPageNum, currentPage?.text, book, locale]);

  // Handle local searching in book
  const handleLocalSearch = async (overrideQuery?: string) => {
    const q = (overrideQuery ?? searchQuery).trim();
    if (!q) {
      setSearchResults([]);
      return;
    }
    if (overrideQuery) setSearchQuery(overrideQuery);
    setSearchLoading(true);
    setSearchSuggestion(null);
    try {
      const res = await fetch('/api/books/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: q, limit: 10, mode: 'smart', bookId: id })
      });
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.results || []);
        setSearchSuggestion(data.didYouMean && data.didYouMean.toLowerCase() !== q.toLowerCase() ? data.didYouMean : null);
      }
    } catch (err) {
      console.error('Local search error:', err);
    } finally {
      setSearchLoading(false);
    }
  };

  // Keep the tutor chat pinned to the newest message after each turn.
  useEffect(() => {
    const el = chatListRef.current;
    if (!el) return;
    const raf = requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
    return () => cancelAnimationFrame(raf);
  }, [chatMsgs, chatLoading]);

  // Explicit clear — the search (query + results) otherwise persists so the
  // user can jump between several matched pages without re-searching.
  const clearLocalSearch = () => {
    setSearchQuery('');
    setSearchResults([]);
    setSearchSuggestion(null);
  };

  // Handle chatbot messaging
  const sendChatMessage = async () => {
    if (!chatInput.trim()) return;
    const msg = chatInput;
    setChatMsgs(prev => [...prev, { who: 'me', text: msg }]);
    setChatInput('');
    setChatLoading(true);

    try {
      // Real RAG over THIS book via the document agent (/v1/books/ask).
      const history = chatMsgs.map(m => ({ role: m.who === 'me' ? 'user' : 'assistant', content: m.text }));
      const res = await fetch('/api/books/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bookId: id, question: msg, locale, history, sessionId: chatSession }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.sessionId) setChatSession(data.sessionId);
      const reply = data.answer ||
        (isAR ? 'معلش، واجهت مشكلة في الوصول للمعلم الذكي.' : 'Sorry, I had trouble reaching the AI tutor.');

      setChatMsgs(prev => [...prev, { who: '5sosy', text: reply, citations: data.citations || [] }]);
    } catch (err) {
      console.error('Chat error:', err);
      setChatMsgs(prev => [...prev, {
        who: '5sosy',
        text: isAR ? 'حدث خطأ أثناء معالجة طلبك.' : 'An error occurred while processing your request.'
      }]);
    } finally {
      setChatLoading(false);
    }
  };

  if (loading) {
    return (
      <ChromeLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="w-10 h-10 border-4 border-sky-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      </ChromeLayout>
    );
  }

  if (!book) {
    return (
      <ChromeLayout>
        <div className="max-w-md mx-auto py-16 text-center">
          <span className="text-5xl block mb-4">⚠️</span>
          <h2 className="text-xl font-bold text-slate-900">{isAR ? 'الكتاب غير موجود' : 'Book Not Found'}</h2>
          <p className="text-slate-500 mt-2 text-[14px]">
            {isAR ? 'الكتاب المطلوب قد يكون تم حذفه أو لم يكتمل فهرسته بعد.' : 'The requested book is either deleted or not finished parsing.'}
          </p>
          <Btn kind="primary" className="mt-6" onClick={() => router.push(`/${locale}/books`)}>
            {isAR ? 'العودة للمكتبة' : 'Return to Library'}
          </Btn>
        </div>
      </ChromeLayout>
    );
  }

  const subjectMeta = SUBJECT_META[book.subject];
  const subjectName = subjectMeta ? ((subjectMeta as any)[locale] || subjectMeta.en || subjectMeta.ar) : book.subject;
  const glyph = subjectMeta ? subjectMeta.glyph : '📚';

  return (
    <ChromeLayout>
      <div className="max-w-[1600px] mx-auto px-4 lg:px-8 py-6 h-[calc(100vh-80px)] flex flex-col lg:flex-row gap-6 overflow-hidden">
        {/* Left Sidebar: Navigation & Search */}
        <div className="w-full lg:w-[320px] shrink-0 flex flex-col gap-4 max-h-full overflow-hidden">
          <Btn kind="outline" size="sm" className="w-fit" onClick={() => router.push(`/${locale}/books`)}>
            {isAR ? '➔' : '←'} {t.books.backToLibrary}
          </Btn>

          <Card className="p-4 flex flex-col gap-3 shrink-0">
            <SubjectChip id={book.subject} size="sm" />
            <h2 className="font-extrabold text-[16px] text-slate-900 leading-snug">{bookTitle(book, locale)}</h2>
            <p className="text-[12px] text-slate-500">{bookSubtitle(book, locale)}</p>
            <div className="flex justify-between items-center text-[11px] text-slate-400 border-t border-slate-100 pt-3">
              <span>{book.pages} {t.books.pages}</span>
              <span>{t.books.year} {book.year}</span>
            </div>
          </Card>

          {/* Quick Page Picker list */}
          <Card className="flex-1 p-3 flex flex-col overflow-hidden min-h-[150px]">
            <div className="text-[12px] font-extrabold text-slate-700 uppercase tracking-wider mb-2">
              {t.books.pageNavigation}
            </div>
            <div className="flex-1 overflow-y-auto grid grid-cols-4 gap-1.5 p-1 slim">
              {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  onClick={() => setCurrentPageNum(n)}
                  className={`py-1.5 rounded-lg font-bold text-[12px] transition ${
                    currentPageNum === n
                      ? 'bg-sky-600 text-white shadow-sm'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </Card>
        </div>

        {/* Central Reading Area */}
        <div className="flex-1 flex flex-col bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm h-full">
          {/* Smart search bar — above the page, unified (exact-first → semantic) */}
          <div className="px-4 lg:px-6 pt-4 pb-3 border-b border-slate-100 bg-white shrink-0 relative">
            <div className="relative flex items-center border border-slate-200 rounded-xl p-1 bg-slate-50 focus-within:border-sky-500 focus-within:ring-2 focus-within:ring-sky-200/60 transition">
              <span className="px-2 text-slate-400">🔍</span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLocalSearch()}
                placeholder={t.books.searchInsideBook}
                className="flex-1 bg-transparent border-none text-[13px] focus:outline-none p-1.5 min-w-0"
              />
              {(searchQuery !== '' || searchResults.length > 0) && (
                <button
                  onClick={clearLocalSearch}
                  title={t.books.clearSearch}
                  aria-label={t.books.clearSearch}
                  className="w-7 h-7 shrink-0 grid place-items-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/70 transition"
                >
                  ✕
                </button>
              )}
              <button
                onClick={() => handleLocalSearch()}
                className="bg-sky-600 hover:bg-sky-700 text-white text-[12px] font-bold px-4 py-1.5 rounded-lg whitespace-nowrap"
              >
                {t.books.smartSearch}
              </button>
            </div>
            {searchSuggestion && !searchLoading && (
              <div className="text-[11.5px] text-slate-600 mt-1.5">
                {t.books.didYouMean}{' '}
                <button onClick={() => handleLocalSearch(searchSuggestion)} className="font-bold text-amber-600 hover:underline">
                  {searchSuggestion}
                </button>
                {isAR ? '؟' : '?'}
              </div>
            )}
            {searchLoading && (
              <div className="text-center py-3"><div className="w-5 h-5 border-2 border-sky-600 border-t-transparent rounded-full animate-spin mx-auto" /></div>
            )}
            {/* Results slide down in-flow, pushing the page below — not an overlay. */}
            <div
              className={`overflow-hidden transition-all duration-300 ease-out ${
                !searchLoading && searchResults.length > 0 ? 'max-h-[300px] opacity-100 mt-2' : 'max-h-0 opacity-0 mt-0'
              }`}
            >
              <div className="max-h-[300px] overflow-y-auto space-y-2 slim border border-slate-200 rounded-xl bg-white p-2">
                {searchResults.map((res: any, idx: number) => {
                  const active = res.pageNumber === currentPageNum;
                  return (
                    <button
                      key={idx}
                      onClick={() => setCurrentPageNum(res.pageNumber)}
                      className={`w-full p-2.5 border rounded-lg transition cursor-pointer text-start ${
                        active ? 'border-sky-400 bg-sky-50 ring-1 ring-sky-300' : 'border-slate-100 hover:bg-sky-50'
                      }`}
                    >
                      <div className="flex justify-between items-center text-[10.5px] text-slate-400 mb-1">
                        <span className="font-bold text-sky-600">{t.books.page} {res.pageNumber} ↗</span>
                        <span>{Math.min(100, Math.round((res.score || 0) * 100))}%</span>
                      </div>
                      <p className="text-[11.5px] text-slate-600 line-clamp-2 leading-relaxed">{res.text}</p>
                    </button>
                  );
                })}
              </div>
            </div>
            {!searchLoading && searchResults.length === 0 && searchQuery.trim() !== '' && (
              <div className="text-[11px] text-slate-400 italic text-center py-2">{t.books.noMatchingPagesShort}</div>
            )}
          </div>
          {/* Header */}
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-xl">{glyph}</span>
              <span className="font-extrabold text-[15px] text-slate-900">
                {t.books.page} {currentPageNum} {t.books.pageOf} {pageCount}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setTranslateOn(v => !v)}
                className={`inline-flex items-center gap-1.5 text-[12px] font-bold px-3 h-9 rounded-full border transition ${
                  translateOn
                    ? 'bg-sky-600 text-white border-sky-600'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-sky-400'
                }`}
                title={translateOn ? t.books.showOriginal : t.books.translate}
              >
                <span>🌐</span>
                <span className="hidden sm:inline">{translateOn ? t.books.showOriginal : t.books.translate}</span>
              </button>
              <button
                onClick={loadMindmap}
                className="inline-flex items-center gap-1.5 text-[12px] font-bold px-3 h-9 rounded-full border bg-white text-slate-700 border-slate-200 hover:border-violet-400 transition"
                title={t.books.mindMap}
              >
                <span>🧠</span>
                <span className="hidden sm:inline">{t.books.mindMap}</span>
              </button>
              <button
                disabled={currentPageNum <= 1}
                onClick={() => setCurrentPageNum(prev => Math.max(1, prev - 1))}
                className="w-9 h-9 rounded-full bg-white border border-slate-200 text-slate-700 hover:border-sky-500 disabled:opacity-50 transition grid place-items-center font-bold"
              >
                {isAR ? '➔' : '←'}
              </button>
              <button
                disabled={currentPageNum >= pageCount}
                onClick={() => setCurrentPageNum(prev => Math.min(pageCount, prev + 1))}
                className="w-9 h-9 rounded-full bg-white border border-slate-200 text-slate-700 hover:border-sky-500 disabled:opacity-50 transition grid place-items-center font-bold"
              >
                {isAR ? '←' : '→'}
              </button>
            </div>
          </div>

          {/* Reading Content */}
          <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 slim">
            {!currentPage && pageLoading ? (
              <div className="grid place-items-center py-24">
                <div className="w-8 h-8 border-2 border-sky-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : currentPage ? (
              (() => {
                const tr = translateOn ? translations[currentPageNum] : null;
                const showTranslating = translateOn && !tr && translating;
                if (showTranslating) {
                  return (
                    <div className="grid place-items-center py-24 gap-3 text-slate-500">
                      <div className="w-7 h-7 border-2 border-sky-600 border-t-transparent rounded-full animate-spin" />
                      <span className="text-[13px]">{t.books.translating}</span>
                    </div>
                  );
                }
                // Reading pane follows the BOOK's language unless a temporary
                // translation to the user's locale is active.
                const text = tr ? tr.text : currentPage.text;
                const paneLocale = tr ? (locale as any) : (book.language || 'ar');
                return (
                  <>
                    {tr && (
                      <div className="max-w-3xl mx-auto mb-4 flex items-center gap-2 text-[11.5px] text-sky-700 bg-sky-50 border border-sky-100 rounded-lg px-3 py-1.5">
                        <span>🌐</span>
                        <span>{isAR ? 'نسخة مترجمة مؤقتة' : 'Temporary translation'}</span>
                        <button onClick={() => setTranslateOn(false)} className="ms-auto font-bold hover:underline">{t.books.showOriginal}</button>
                      </div>
                    )}
                    <LocaleBlock locale={paneLocale} as="article" className="max-w-3xl mx-auto prose prose-slate">
                      <div className="text-[16px] leading-[1.85] text-slate-800 whitespace-pre-line text-start font-medium selection:bg-sky-200">
                        {text}
                      </div>
                    </LocaleBlock>
                  </>
                );
              })()
            ) : (
              <div className="text-center py-24 text-slate-400 italic">
                {isAR ? 'صفحة فارغة أو غير متوفرة.' : 'Page content is empty or unavailable.'}
              </div>
            )}
          </div>
        </div>

        {/* Right Sidebar: Chat with 5sosy */}
        <div className="w-full lg:w-[350px] shrink-0 flex flex-col bg-slate-900 border border-slate-900 rounded-3xl overflow-hidden shadow-lg h-full">
          <div className="px-5 py-4 border-b border-slate-800 flex items-center gap-3 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-sky-500/20 text-sky-400 grid place-items-center text-md">🦉</div>
            <div>
              <h3 className="font-extrabold text-[14px] text-white">
                {locale === 'ar' ? `معلم ${subjectName} الذكي` :
                 locale === 'fr' ? `Tuteur IA en ${subjectName}` :
                 locale === 'de' ? `KI-Tutor für ${subjectName}` :
                 locale === 'es' ? `Tutor de IA de ${subjectName}` :
                 locale === 'it' ? `Tutor IA di ${subjectName}` :
                 locale === 'zh' ? `AI ${subjectName} 导师` : `AI ${subjectName} Tutor`}
              </h3>
              <p className="text-[11px] text-slate-400">{isAR ? 'اسألني أي شيء حول هذا الفصل' : 'Ask me anything about this page'}</p>
            </div>
          </div>

          {/* Chat Messages */}
          <div ref={chatListRef} className="flex-1 overflow-y-auto p-4 space-y-3 slim">
            {chatMsgs.length === 0 && (
              <div className="text-center py-12 text-slate-500 text-[12px] italic">
                {isAR ? 'ابدأ بطرح سؤال حول المحتوى المعروض (مثال: اشرح الفقرة الثانية)' : 'Ask a question about the text (e.g. explain the formulas on this page)'}
              </div>
            )}
            {chatMsgs.map((m, i) => {
              const me = m.who === 'me';
              return (
                <div key={i} className={`flex ${me ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[12.5px] leading-relaxed text-start
                    ${me ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-100'}`}>
                    <div className="whitespace-pre-wrap">{m.text}</div>
                    {!me && m.citations && m.citations.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {Array.from(new Set(m.citations.map(c => c.pageNumber))).filter(Boolean).map(pn => (
                          <button
                            key={pn}
                            onClick={() => setCurrentPageNum(pn as number)}
                            className="text-[10.5px] font-bold bg-sky-500/20 text-sky-300 hover:bg-sky-500/30 rounded-md px-2 py-0.5 transition"
                          >
                            {t.books.page} {pn} ↗
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="bg-slate-800 text-slate-400 rounded-2xl px-3.5 py-2.5 text-[12px] flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"></div>
                  <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                  <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:0.4s]"></div>
                </div>
              </div>
            )}
          </div>

          {/* Chat Input */}
          <div className="p-3 border-t border-slate-800 bg-slate-950 shrink-0">
            <div className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendChatMessage()}
                placeholder={isAR ? 'اسأل 5sosy...' : 'Ask 5sosy...'}
                className="flex-1 bg-slate-900 border border-slate-850 rounded-xl px-3 py-2 text-[13px] text-white focus:outline-none focus:border-sky-500"
              />
              <button
                onClick={sendChatMessage}
                className="w-10 h-10 rounded-xl bg-sky-600 hover:bg-sky-700 text-white grid place-items-center"
              >
                ➔
              </button>
            </div>
          </div>
        </div>
      </div>

      {mindmapOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setMindmapOpen(false)}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            dir={isAR ? 'rtl' : 'ltr'}
          >
            <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100 shrink-0">
              <span className="text-2xl">🧠</span>
              <h3 className="font-extrabold text-slate-900 text-[16px]">{t.books.mindMapTitle}</h3>
              <button
                onClick={() => setMindmapOpen(false)}
                className="ms-auto w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 grid place-items-center font-bold transition"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 slim">
              {mindmapLoading ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-500 gap-3">
                  <div className="w-8 h-8 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
                  <span className="text-[13px] font-medium">{t.books.mindMapGenerating}</span>
                </div>
              ) : mindmapError || !mindmap ? (
                <div className="text-center py-16 text-slate-500 text-[13px]">{t.books.mindMapEmpty}</div>
              ) : (
                <>
                  {mindmap.summary && (
                    <p className="text-[13px] text-slate-600 leading-relaxed mb-4 bg-slate-50 rounded-xl p-3 border border-slate-100">
                      {mindmap.summary}
                    </p>
                  )}
                  <ul className="text-start">
                    <MindMapNode
                      node={mindmap}
                      depth={0}
                      branch={0}
                      onJump={jumpToPage}
                      pageLabel={(n) => `${t.books.page} ${n}`}
                    />
                  </ul>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </ChromeLayout>
  );
}
