'use client';

import { use, useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { collection, doc, getDoc, onSnapshot, orderBy, query } from 'firebase/firestore';
import { getFirebase } from '@/lib/firebase/client';
import { bookFromFirestore } from '@/lib/books';
import { ChromeLayout } from '@/components/shared/Chrome';
import { useApp } from '@/components/shared/Providers';
import { Card, Btn, SubjectChip } from '@/components/shared/atoms';
import { SUBJECT_META } from '@/constants/subjects';
import { callAgent } from '@/lib/agents';
import type { Book } from '@/lib/types';
import { LocaleBlock } from '@/i18n/LocaleBlock';

export default function Page({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = use(params);
  const { isAR, t } = useApp();
  const router = useRouter();

  const [book, setBook] = useState<Book | null>(null);
  const [pages, setPages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPageNum, setCurrentPageNum] = useState<number>(1);

  // Chatbot state
  const [chatInput, setChatInput] = useState('');
  const [chatMsgs, setChatMsgs] = useState<{ who: 'me' | '5sosy'; text: string }[]>([]);
  const [chatLoading, setChatLoading] = useState(false);

  // Search inside book state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

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
      } catch (e) {
        console.error('Failed to load book pages:', e);
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [id]);

  const currentPage = useMemo(() => {
    return pages.find(p => p.pageNumber === currentPageNum) || pages[0] || null;
  }, [pages, currentPageNum]);

  // Handle local searching in book
  const handleLocalSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    try {
      const res = await fetch('/api/books/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: searchQuery, limit: 10 })
      });
      if (res.ok) {
        const data = await res.json();
        // Filter results only belonging to this book
        const bookMatches = (data.results || []).filter((r: any) => r.bookId === id);
        setSearchResults(bookMatches);
      }
    } catch (err) {
      console.error('Local search error:', err);
    } finally {
      setSearchLoading(false);
    }
  };

  // Handle chatbot messaging
  const sendChatMessage = async () => {
    if (!chatInput.trim()) return;
    const msg = chatInput;
    setChatMsgs(prev => [...prev, { who: 'me', text: msg }]);
    setChatInput('');
    setChatLoading(true);

    try {
      // Ground the agent in the current book
      const res = await callAgent('orchestrator', {
        mode: 'chat',
        bookIds: [id],
        message: `[Current Page context: Page ${currentPageNum} says: "${currentPage?.text?.slice(0, 1000) || ''}"] ${msg}`,
        locale
      });

      const reply = (res?.result as any)?.message || 
        (isAR ? 'معلش، واجهت مشكلة في الاتصال بالمعلم الذكي.' : 'Sorry, I had trouble reaching the AI tutor.');
      
      setChatMsgs(prev => [...prev, { who: '5sosy', text: reply }]);
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

  const subjectMeta = SUBJECT_META[book.subject] || { glyph: '📚', hue: 'stone', ar: book.subject, en: book.subject };

  return (
    <ChromeLayout>
      <div className="max-w-[1600px] mx-auto px-4 lg:px-8 py-6 h-[calc(100vh-80px)] flex flex-col lg:flex-row gap-6 overflow-hidden">
        {/* Left Sidebar: Navigation & Search */}
        <div className="w-full lg:w-[320px] shrink-0 flex flex-col gap-4 max-h-full overflow-hidden">
          <Btn kind="outline" size="sm" className="w-fit" onClick={() => router.push(`/${locale}/books`)}>
            {isAR ? '➔ العودة للمكتبة' : '← Back to Library'}
          </Btn>

          <Card className="p-4 flex flex-col gap-3 shrink-0">
            <SubjectChip id={book.subject} size="sm" />
            <h2 className="font-extrabold text-[16px] text-slate-900 leading-snug">{isAR ? book.arT : book.enT}</h2>
            <p className="text-[12px] text-slate-500">{isAR ? book.arSub : book.enSub}</p>
            <div className="flex justify-between items-center text-[11px] text-slate-400 border-t border-slate-100 pt-3">
              <span>{book.pages} {t.books.pages}</span>
              <span>Year {book.year}</span>
            </div>
          </Card>

          {/* Local Vector Search inside Book */}
          <Card className="p-4 flex flex-col gap-2 shrink-0">
            <div className="text-[12px] font-extrabold text-slate-700 uppercase tracking-wider">
              {isAR ? 'ابحث داخل الكتاب' : 'Search Inside Book'}
            </div>
            <div className="relative flex items-center border border-slate-200 rounded-xl p-1 bg-slate-50 focus-within:border-sky-500 transition">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLocalSearch()}
                placeholder={isAR ? 'ابحث عن مفهوم...' : 'Search for a concept...'}
                className="flex-1 bg-transparent border-none text-[12px] focus:outline-none p-1.5"
              />
              <button onClick={handleLocalSearch} className="bg-sky-600 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg">
                {isAR ? 'بحث' : 'Find'}
              </button>
            </div>

            {searchLoading ? (
              <div className="text-center py-4"><div className="w-5 h-5 border-2 border-sky-600 border-t-transparent rounded-full animate-spin mx-auto"></div></div>
            ) : searchResults.length > 0 ? (
              <div className="max-h-[150px] overflow-y-auto space-y-2 slim mt-2">
                {searchResults.map((res: any, idx: number) => (
                  <div
                    key={idx}
                    onClick={() => setCurrentPageNum(res.pageNumber)}
                    className="p-2 border border-slate-100 rounded-lg hover:bg-sky-50 transition cursor-pointer text-start"
                  >
                    <div className="flex justify-between items-center text-[10px] text-slate-400 mb-1">
                      <span className="font-bold text-sky-600">{isAR ? `صفحة ${res.pageNumber}` : `Page ${res.pageNumber}`}</span>
                      <span>Score: {Math.round(res.score * 100)}%</span>
                    </div>
                    <p className="text-[11px] text-slate-600 line-clamp-2 leading-relaxed">{res.text}</p>
                  </div>
                ))}
              </div>
            ) : searchQuery.trim() !== '' && (
              <div className="text-[11px] text-slate-400 italic text-center py-2">{isAR ? 'لا توجد نتائج' : 'No results found.'}</div>
            )}
          </Card>

          {/* Quick Page Picker list */}
          <Card className="flex-1 p-3 flex flex-col overflow-hidden min-h-[150px]">
            <div className="text-[12px] font-extrabold text-slate-700 uppercase tracking-wider mb-2">
              {isAR ? 'فهرس الصفحات' : 'Page Navigation'}
            </div>
            <div className="flex-1 overflow-y-auto grid grid-cols-4 gap-1.5 p-1 slim">
              {pages.map((p) => (
                <button
                  key={p.pageNumber}
                  onClick={() => setCurrentPageNum(p.pageNumber)}
                  className={`py-1.5 rounded-lg font-bold text-[12px] transition ${
                    currentPageNum === p.pageNumber
                      ? 'bg-sky-600 text-white shadow-sm'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  {p.pageNumber}
                </button>
              ))}
            </div>
          </Card>
        </div>

        {/* Central Reading Area */}
        <div className="flex-1 flex flex-col bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm h-full">
          {/* Header */}
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-xl">{subjectMeta.glyph}</span>
              <span className="font-extrabold text-[15px] text-slate-900">
                {isAR ? `صفحة ${currentPageNum} من ${pages.length}` : `Page ${currentPageNum} of ${pages.length}`}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                disabled={currentPageNum <= 1}
                onClick={() => setCurrentPageNum(prev => Math.max(1, prev - 1))}
                className="w-9 h-9 rounded-full bg-white border border-slate-200 text-slate-700 hover:border-sky-500 disabled:opacity-50 transition grid place-items-center font-bold"
              >
                {isAR ? '➔' : '←'}
              </button>
              <button
                disabled={currentPageNum >= pages.length}
                onClick={() => setCurrentPageNum(prev => Math.min(pages.length, prev + 1))}
                className="w-9 h-9 rounded-full bg-white border border-slate-200 text-slate-700 hover:border-sky-500 disabled:opacity-50 transition grid place-items-center font-bold"
              >
                {isAR ? '←' : '→'}
              </button>
            </div>
          </div>

          {/* Reading Content */}
          <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 slim">
            {currentPage ? (
              // Reading pane follows the BOOK's language (axis 2), not the
              // user's UI locale (axis 1). A French user reading an Arabic
              // physics book sees this pane render RTL with the Arabic font;
              // the surrounding chrome stays in their UI locale.
              <LocaleBlock
                locale={book.language || 'ar'}
                as="article"
                className="max-w-3xl mx-auto prose prose-slate"
              >
                <div className="text-[16px] leading-[1.85] text-slate-800 whitespace-pre-line text-start font-medium selection:bg-sky-200">
                  {currentPage.text}
                </div>
              </LocaleBlock>
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
              <h3 className="font-extrabold text-[14px] text-white">{isAR ? 'معلم الفيزياء الذكي' : 'AI Textbook Tutor'}</h3>
              <p className="text-[11px] text-slate-400">{isAR ? 'اسألني أي شيء حول هذا الفصل' : 'Ask me anything about this page'}</p>
            </div>
          </div>

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 slim">
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
                    {m.text}
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
    </ChromeLayout>
  );
}
