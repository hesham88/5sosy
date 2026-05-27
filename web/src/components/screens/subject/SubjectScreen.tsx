'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ChromeLayout } from '../../shared/Chrome';
import { useApp } from '../../shared/Providers';
import { Card, Btn } from '../../shared/atoms';
import { SUBJECT_META, HUE, TRACK_LABELS, type HueId } from '@/constants/subjects';
import { MindMapNode, type MindNode } from '@/components/shared/MindMapNode';
import type { Subject } from '@/lib/types';

type BookItem = NonNullable<Subject['books']>[number];

type Concept = {
  conceptId: string;
  label: string;
  keywords: string[];
  count: number;
  grades: string[];
  languages: string[];
  bookCount: number;
  samplePage?: number | null;
  sampleBookId?: string | null;
  nameI18n?: Record<string, string> | null;
  descriptionI18n?: Record<string, string> | null;
};

type ChatMsg = { who: 'me' | '5sosy'; text: string; citations?: { bookId?: string; pageNumber: number }[] };
type PageHit = { bookId: string; bookTitle: string; pageNumber: number; text: string; score: number };

type TabId = 'tutor' | 'concepts' | 'mindmap' | 'ingest' | 'planner' | 'performance' | 'assessment' | 'explain';

function Select({ label, value, onChange, allLabel, options }: {
  label: string; value: string; onChange: (v: string) => void; allLabel: string; options: { value: string; label: string }[];
}) {
  return (
    <label className="flex flex-col gap-1 min-w-0">
      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-[12.5px] font-semibold text-slate-700 focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200/50 transition"
      >
        <option value="all">{allLabel}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

export default function SubjectScreen({ slug }: { slug: string }) {
  const { isAR, t, locale } = useApp();
  const router = useRouter();

  const [subject, setSubject] = useState<Subject | null>(null);
  const [loading, setLoading] = useState(true);

  const [gradeFilter, setGradeFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [languageFilter, setLanguageFilter] = useState('all');
  const [tab, setTab] = useState<TabId>('tutor');

  // In-subject search
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<PageHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  // Tutor chat
  const [chatMsgs, setChatMsgs] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatSession, setChatSession] = useState<string | null>(null);
  const chatListRef = useRef<HTMLDivElement | null>(null);

  // Concepts
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [conceptsLoading, setConceptsLoading] = useState(false);

  // Mind map
  const [mindmap, setMindmap] = useState<MindNode | null>(null);
  const [mindmapLoading, setMindmapLoading] = useState(false);
  const [mindmapError, setMindmapError] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch('/api/subjects')
      .then((r) => (r.ok ? r.json() : []))
      .then((list: Subject[]) => {
        if (active) setSubject(list.find((s) => s.slug === slug) || null);
      })
      .catch((e) => console.error('Failed to load subject:', e))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [slug]);

  const fullMeta = SUBJECT_META[slug];
  const name = fullMeta?.[locale] || subject?.nameI18n?.[locale] || fullMeta?.en || subject?.nameI18n?.en || subject?.name || slug;
  const desc = fullMeta?.description?.[locale] || subject?.descriptionI18n?.[locale] || fullMeta?.description?.en || subject?.descriptionI18n?.en || '';
  const h = HUE[(fullMeta?.hue as HueId)] || HUE.stone;
  const glyph = subject?.glyph || fullMeta?.glyph || '📚';
  const trackLabel = (subject?.tracks?.length)
    ? subject.tracks.map((tr) => TRACK_LABELS[tr]?.[isAR ? 'ar' : 'en'] || tr).join(' · ')
    : (isAR ? 'عام / مشترك' : 'General / Core');

  const allBooks = useMemo(() => subject?.books || [], [subject]);

  const books = useMemo(() => {
    let bs = allBooks;
    if (gradeFilter !== 'all') bs = bs.filter((b) => b.grade === gradeFilter);
    if (typeFilter !== 'all') bs = bs.filter((b) => b.type === typeFilter);
    if (languageFilter !== 'all') bs = bs.filter((b) => b.language === languageFilter);
    return bs;
  }, [allBooks, gradeFilter, typeFilter, languageFilter]);

  const gradeOptions = useMemo(() => {
    const m = new Map<string, string>();
    allBooks.forEach((b) => { if (b.grade && !m.has(b.grade)) m.set(b.grade, b.gradeI18n?.[locale] || b.gradeI18n?.en || b.grade); });
    return Array.from(m, ([value, label]) => ({ value, label }));
  }, [allBooks, locale]);

  const typeOptions = useMemo(() => {
    const m = new Map<string, string>();
    allBooks.forEach((b) => { if (b.type && !m.has(b.type)) m.set(b.type, b.typeI18n?.[locale] || b.typeI18n?.en || b.type); });
    return Array.from(m, ([value, label]) => ({ value, label }));
  }, [allBooks, locale]);

  const languageOptions = useMemo(() => {
    const set = new Set<string>();
    allBooks.forEach((b) => { if (b.language) set.add(b.language); });
    return Array.from(set).map((l) => ({ value: l, label: l === 'ar' ? (isAR ? 'عربي' : 'Arabic') : l === 'en' ? (isAR ? 'إنجليزي' : 'English') : l.toUpperCase() }));
  }, [allBooks, isAR]);

  const filtersChosen = gradeFilter !== 'all' || typeFilter !== 'all' || languageFilter !== 'all';
  const filterArgs = useMemo(() => ({
    grade: gradeFilter !== 'all' ? gradeFilter : undefined,
    language: languageFilter !== 'all' ? languageFilter : undefined,
  }), [gradeFilter, languageFilter]);

  // ── In-subject search: fan out across the filtered books (core list capped) ──
  const bookTitleOf = useCallback(
    (b: BookItem) => b.titleI18n?.[locale] || b.title || b.id,
    [locale]
  );

  const runSearch = useCallback(async () => {
    const query = q.trim();
    if (query.length < 2) { setHits([]); setSearched(false); return; }
    setSearching(true);
    setSearched(true);
    try {
      const targets = books.slice(0, 8);
      const all = await Promise.all(targets.map(async (b) => {
        try {
          const res = await fetch('/api/books/search', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ query, limit: 4, mode: 'smart', bookId: b.id }),
          });
          if (!res.ok) return [];
          const data = await res.json();
          return (data.results || []).map((r: { pageNumber: number; text: string; score: number }) => ({
            bookId: b.id, bookTitle: bookTitleOf(b), pageNumber: r.pageNumber, text: r.text, score: r.score || 0,
          }));
        } catch { return []; }
      }));
      const merged = all.flat().sort((a, b) => b.score - a.score).slice(0, 15);
      setHits(merged);
    } finally {
      setSearching(false);
    }
  }, [q, books, bookTitleOf]);

  // ── Tutor ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const el = chatListRef.current;
    if (!el) return;
    const raf = requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
    return () => cancelAnimationFrame(raf);
  }, [chatMsgs, chatLoading]);

  const sendChat = useCallback(async (overrideText?: string) => {
    const msg = (overrideText ?? chatInput).trim();
    if (!msg) return;
    setChatMsgs((prev) => [...prev, { who: 'me', text: msg }]);
    setChatInput('');
    setChatLoading(true);
    try {
      const history = chatMsgs.map((m) => ({ role: m.who === 'me' ? 'user' : 'assistant', content: m.text }));
      const res = await fetch('/api/subjects/ask', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug, question: msg, locale, history, sessionId: chatSession, ...filterArgs }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.sessionId) setChatSession(data.sessionId);
      const reply = data.answer || (isAR ? 'معلش، واجهت مشكلة في الوصول للمعلم الذكي.' : 'Sorry, I had trouble reaching the AI tutor.');
      setChatMsgs((prev) => [...prev, { who: '5sosy', text: reply, citations: data.citations || [] }]);
    } catch {
      setChatMsgs((prev) => [...prev, { who: '5sosy', text: isAR ? 'حدث خطأ أثناء معالجة طلبك.' : 'An error occurred while processing your request.' }]);
    } finally {
      setChatLoading(false);
    }
  }, [chatInput, chatMsgs, slug, locale, chatSession, filterArgs, isAR]);

  // ── Concepts (refetch when the tab is active and filters change) ────────────
  useEffect(() => {
    if (tab !== 'concepts' || !subject) return;
    let active = true;
    setConceptsLoading(true);
    fetch('/api/subjects/concepts', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug, limit: 48, ...filterArgs }),
    })
      .then((r) => (r.ok ? r.json() : { concepts: [] }))
      .then((d) => { if (active) setConcepts(d.concepts || []); })
      .catch(() => { if (active) setConcepts([]); })
      .finally(() => { if (active) setConceptsLoading(false); });
    return () => { active = false; };
  }, [tab, subject, slug, filterArgs]);

  // ── Mind map (same trigger) ─────────────────────────────────────────────────
  useEffect(() => {
    if (tab !== 'mindmap' || !subject) return;
    let active = true;
    setMindmapLoading(true);
    setMindmapError(false);
    fetch('/api/subjects/mindmap', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug, limit: 12, ...filterArgs }),
    })
      .then((r) => (r.ok ? r.json() : { status: 'error' }))
      .then((d) => {
        if (!active) return;
        if (d.status === 'ok' && d.mindmap) { d.mindmap.title = name; setMindmap(d.mindmap); }
        else { setMindmap(null); setMindmapError(d.status !== 'empty'); }
      })
      .catch(() => { if (active) { setMindmap(null); setMindmapError(true); } })
      .finally(() => { if (active) setMindmapLoading(false); });
    return () => { active = false; };
  }, [tab, subject, slug, filterArgs, name]);

  const conceptToTutor = (c: Concept) => {
    setTab('tutor');
    const cname = c.nameI18n?.[locale] || c.label;
    sendChat(isAR ? `اشرح لي مفهوم "${cname}"` : `Explain the concept "${cname}"`);
  };

  const jumpToBookPage = (page: number, bookId?: string | null) => {
    if (bookId) router.push(`/${locale}/books/${bookId}?page=${page}`);
  };

  const ts = t.subject;

  const TABS: { id: TabId; label: string; glyph: string }[] = [
    { id: 'tutor', label: ts.tabs.tutor, glyph: '🦉' },
    { id: 'concepts', label: ts.tabs.concepts, glyph: '🔗' },
    { id: 'mindmap', label: ts.tabs.mindmap, glyph: '🧠' },
    { id: 'ingest', label: ts.tabs.ingest, glyph: '⬆️' },
    { id: 'planner', label: ts.tabs.planner, glyph: '🗓️' },
    { id: 'performance', label: ts.tabs.performance, glyph: '📈' },
    { id: 'assessment', label: ts.tabs.assessment, glyph: '✍️' },
    { id: 'explain', label: ts.tabs.explain, glyph: '💡' },
  ];

  if (loading) {
    return (
      <ChromeLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="w-10 h-10 border-4 border-sky-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </ChromeLayout>
    );
  }

  if (!subject) {
    return (
      <ChromeLayout>
        <div className="max-w-md mx-auto py-16 text-center">
          <span className="text-5xl block mb-4">⚠️</span>
          <h2 className="text-xl font-bold text-slate-900">{isAR ? 'المادة غير موجودة' : 'Subject not found'}</h2>
          <Btn kind="primary" className="mt-6" onClick={() => router.push(`/${locale}/subjects`)}>{ts.back}</Btn>
        </div>
      </ChromeLayout>
    );
  }

  return (
    <ChromeLayout>
      <div className="px-5 lg:px-10 py-6 lg:py-8 max-w-[1400px] mx-auto">
        <button onClick={() => router.push(`/${locale}/subjects`)} className="text-[12.5px] font-bold text-slate-500 hover:text-sky-600 transition mb-4">
          {isAR ? '➔' : '←'} {ts.back}
        </button>

        {/* Header */}
        <Card className="overflow-hidden mb-5">
          <div className={`${h.bg} px-6 py-5 flex items-start gap-4`}>
            <div className={`w-16 h-16 rounded-2xl ${h.dot} text-white grid place-items-center text-4xl shadow-md shrink-0`}>{glyph}</div>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-extrabold text-slate-900 leading-tight">{name}</h1>
              <div className="text-[12px] text-slate-500 mt-1 font-medium capitalize">{trackLabel}</div>
              {desc && <p className="text-[13px] text-slate-650 mt-2 leading-relaxed max-w-3xl">{desc}</p>}
              <div className="text-[12px] font-bold text-slate-500 mt-2">{books.length} {ts.books}</div>
            </div>
          </div>

          {/* Filter bar + in-subject search */}
          <div className="px-6 py-4 border-t border-slate-100 space-y-3">
            <div className="relative flex items-center rounded-xl bg-slate-50 border border-slate-200 p-1.5 focus-within:border-sky-500 focus-within:ring-2 focus-within:ring-sky-200/60 transition">
              <span className="text-lg px-2 text-slate-400">🔍</span>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') runSearch(); }}
                placeholder={ts.search.placeholder}
                className="flex-1 bg-transparent border-none text-[13.5px] text-slate-800 focus:outline-none py-1.5 min-w-0"
              />
              {searching && <span className="w-4 h-4 me-1 border-2 border-sky-200 border-t-sky-600 rounded-full animate-spin shrink-0" />}
              {(q || searched) && (
                <button onClick={() => { setQ(''); setHits([]); setSearched(false); }} className="text-slate-400 hover:text-slate-700 text-lg px-2">✕</button>
              )}
              <button onClick={runSearch} className="bg-sky-600 hover:bg-sky-700 text-white font-extrabold text-[12.5px] px-4 py-2 rounded-lg transition whitespace-nowrap">{ts.search.btn}</button>
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <Select label={t.subjects.gradeLabel} value={gradeFilter} onChange={setGradeFilter} allLabel={t.subjects.allGrades} options={gradeOptions} />
              <Select label={t.subjects.typeLabel} value={typeFilter} onChange={setTypeFilter} allLabel={t.subjects.allTypes} options={typeOptions} />
              <Select label={t.subjects.languageLabel} value={languageFilter} onChange={setLanguageFilter} allLabel={t.subjects.allLanguages} options={languageOptions} />
              {filtersChosen && (
                <button onClick={() => { setGradeFilter('all'); setTypeFilter('all'); setLanguageFilter('all'); }} className="ms-auto text-[12px] font-bold text-slate-500 hover:text-sky-600 transition py-2">{t.subjects.resetFilters}</button>
              )}
            </div>

            {/* Search results */}
            {searched && (
              <div className="rounded-xl border border-slate-200 bg-white p-2 max-h-[260px] overflow-y-auto slim">
                {searching ? (
                  <div className="text-center py-4"><div className="w-5 h-5 border-2 border-sky-600 border-t-transparent rounded-full animate-spin mx-auto" /></div>
                ) : hits.length === 0 ? (
                  <div className="text-[12px] text-slate-400 italic text-center py-3">{ts.search.noResults}</div>
                ) : hits.map((hh, i) => (
                  <button key={i} onClick={() => router.push(`/${locale}/books/${hh.bookId}?page=${hh.pageNumber}`)} className="w-full text-start p-2.5 border border-slate-100 rounded-lg hover:bg-sky-50 transition mb-1.5">
                    <div className="flex justify-between items-center text-[10.5px] mb-1">
                      <span className="font-bold text-sky-600 truncate">{hh.bookTitle}</span>
                      <span className="text-slate-400 shrink-0 ms-2">{t.books.page} {hh.pageNumber} ↗</span>
                    </div>
                    <p className="text-[11.5px] text-slate-600 line-clamp-2 leading-relaxed">{hh.text}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* Tabs */}
        <div className="flex gap-1.5 mb-4 overflow-x-auto slim pb-1">
          {TABS.map((tb) => (
            <button
              key={tb.id}
              onClick={() => setTab(tb.id)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[12.5px] font-bold whitespace-nowrap transition ${tab === tb.id ? 'bg-sky-600 text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-600 hover:border-sky-400'}`}
            >
              <span>{tb.glyph}</span>{tb.label}
            </button>
          ))}
        </div>

        {/* Panels */}
        {tab === 'tutor' && (
          <Card className="flex flex-col h-[560px] overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-900 text-white flex items-center gap-3 shrink-0">
              <div className="w-8 h-8 rounded-lg bg-sky-500/20 text-sky-400 grid place-items-center">🦉</div>
              <div>
                <h3 className="font-extrabold text-[14px]">{ts.tutor.title.replace('{subject}', name)}</h3>
                <p className="text-[11px] text-slate-400">{ts.tutor.sub}</p>
              </div>
            </div>
            <div ref={chatListRef} className="flex-1 overflow-y-auto p-4 space-y-3 slim bg-slate-50/40">
              {chatMsgs.length === 0 && <div className="text-center py-12 text-slate-400 text-[12px] italic">{ts.tutor.empty}</div>}
              {chatMsgs.map((m, i) => {
                const me = m.who === 'me';
                return (
                  <div key={i} className={`flex ${me ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-[12.5px] leading-relaxed text-start ${me ? 'bg-sky-600 text-white' : 'bg-white border border-slate-200 text-slate-800'}`}>
                      <div className="whitespace-pre-wrap">{m.text}</div>
                      {!me && m.citations && m.citations.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {m.citations.filter((c) => c.pageNumber).slice(0, 8).map((c, ci) => (
                            <button key={ci} onClick={() => c.bookId && router.push(`/${locale}/books/${c.bookId}?page=${c.pageNumber}`)} className="text-[10.5px] font-bold bg-sky-50 text-sky-700 hover:bg-sky-100 rounded-md px-2 py-0.5 transition">
                              {t.books.page} {c.pageNumber} ↗
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {chatLoading && (
                <div className="flex justify-start"><div className="bg-white border border-slate-200 text-slate-400 rounded-2xl px-3.5 py-2.5 flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" />
                  <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                  <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:0.4s]" />
                </div></div>
              )}
            </div>
            <div className="p-3 border-t border-slate-100 bg-white shrink-0">
              <div className="flex gap-2">
                <input value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendChat()} placeholder={ts.tutor.placeholder} className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-[13px] focus:outline-none focus:border-sky-500" />
                <button onClick={() => sendChat()} className="w-10 h-10 rounded-xl bg-sky-600 hover:bg-sky-700 text-white grid place-items-center">➔</button>
              </div>
            </div>
          </Card>
        )}

        {tab === 'concepts' && (
          <Card className="p-5">
            <h3 className="font-extrabold text-[15px] text-slate-900">{ts.concepts.title}</h3>
            <p className="text-[12.5px] text-slate-500 mb-4">{ts.concepts.sub}</p>
            {conceptsLoading ? (
              <div className="text-center py-10"><div className="w-7 h-7 border-2 border-sky-600 border-t-transparent rounded-full animate-spin mx-auto" /></div>
            ) : concepts.length === 0 ? (
              <div className="text-center py-10 text-slate-400 text-[13px]">{ts.concepts.empty}</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {concepts.map((c) => {
                  const cname = c.nameI18n?.[locale] || c.label;
                  const cdesc = c.descriptionI18n?.[locale];
                  return (
                    <button key={c.conceptId} onClick={() => conceptToTutor(c)} title={cdesc || `${c.count} ${ts.concepts.occurrences}`} className="group text-start px-3 py-2 rounded-xl border border-slate-200 bg-white hover:border-sky-400 hover:bg-sky-50 transition max-w-[260px]">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-[12.5px] text-slate-800 truncate">{cname}</span>
                        <span className="text-[10px] font-bold text-slate-400 bg-slate-100 rounded-full px-1.5 py-0.5 shrink-0">{c.count}</span>
                      </div>
                      {cdesc && <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{cdesc}</p>}
                    </button>
                  );
                })}
              </div>
            )}
          </Card>
        )}

        {tab === 'mindmap' && (
          <Card className="p-5">
            <h3 className="font-extrabold text-[15px] text-slate-900 flex items-center gap-2"><span>🧠</span>{ts.mindmap.title}</h3>
            <p className="text-[12.5px] text-slate-500 mb-4">{ts.mindmap.sub}</p>
            {mindmapLoading ? (
              <div className="flex flex-col items-center py-12 gap-3 text-slate-500"><div className="w-8 h-8 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" /><span className="text-[13px]">{ts.mindmap.generating}</span></div>
            ) : mindmapError || !mindmap ? (
              <div className="text-center py-12 text-slate-400 text-[13px]">{ts.mindmap.empty}</div>
            ) : (
              <ul className="text-start" dir={isAR ? 'rtl' : 'ltr'}>
                <MindMapNode node={mindmap} depth={0} branch={0} onJump={jumpToBookPage} pageLabel={(n) => `${t.books.page} ${n}`} />
              </ul>
            )}
          </Card>
        )}

        {tab === 'ingest' && (
          <Card className="p-6 max-w-2xl">
            <h3 className="font-extrabold text-[15px] text-slate-900 flex items-center gap-2"><span>⬆️</span>{ts.ingest.title}</h3>
            <p className="text-[12.5px] text-slate-500 mb-4">{ts.ingest.sub}</p>
            {!filtersChosen && (
              <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12.5px] text-amber-800 font-medium">{ts.ingest.needFilters}</div>
            )}
            <div className="rounded-2xl border-2 border-dashed border-slate-200 px-6 py-10 text-center text-slate-400">
              <div className="text-4xl mb-2">📄</div>
              <p className="text-[13px] font-medium">{ts.ingest.uploadCta}</p>
              <p className="text-[11.5px] mt-1">{ts.ingest.defaultType}</p>
            </div>
            <Btn kind="primary" className="mt-4 w-full opacity-60 cursor-not-allowed" disabled>{ts.soon}</Btn>
          </Card>
        )}

        {(tab === 'planner' || tab === 'performance' || tab === 'assessment' || tab === 'explain') && (
          <Card className="p-8 text-center max-w-2xl mx-auto">
            <div className="text-4xl mb-3">{TABS.find((x) => x.id === tab)?.glyph}</div>
            <h3 className="font-extrabold text-[16px] text-slate-900">{ts[tab].title}</h3>
            <p className="text-[13px] text-slate-500 mt-1.5 max-w-md mx-auto leading-relaxed">{ts[tab].sub}</p>
            <span className="inline-block mt-4 text-[11px] font-bold text-slate-400 bg-slate-100 rounded-full px-3 py-1">{ts.soon}</span>
          </Card>
        )}
      </div>
    </ChromeLayout>
  );
}
