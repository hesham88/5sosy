'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ChromeLayout } from '../shared/Chrome';
import { useApp } from '../shared/Providers';
import { useProfile } from '@/lib/firebase/use-profile';
import { Btn, Card } from '../shared/atoms';
import { SUBJECT_META, HUE, TRACK_LABELS, type HueId } from '@/constants/subjects';
import type { Subject } from '@/lib/types';
import SubjectFilters from './subjects/SubjectFilters';

export default function SubjectsScreen() {
  const { isAR, t, locale } = useApp();
  const router = useRouter();
  const { profile } = useProfile();
  const [filter, setFilter] = useState<'all' | 'track'>('track');
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);

  // Search + multi-attribute filter state (Batch 2 — Subjects search engine, frontend tier)
  const [q, setQ] = useState('');
  const [gradeFilter, setGradeFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [languageFilter, setLanguageFilter] = useState('all');
  const [trackFilter, setTrackFilter] = useState('all');
  // Semantic (content-level) search results from the backend, keyed by subject slug.
  const [semantic, setSemantic] = useState<{ query: string; map: Record<string, number> } | null>(null);
  const [semanticLoading, setSemanticLoading] = useState(false);

  const activeTrack = profile?.track || 'sci_sci';

  useEffect(() => {
    async function loadSubjects() {
      try {
        const res = await fetch('/api/subjects');
        if (res.ok) {
          const data = await res.json();
          setSubjects(data);
        }
      } catch (err) {
        console.error('Failed to load subjects:', err);
      } finally {
        setLoading(false);
      }
    }
    loadSubjects();
  }, []);

  const visible = useMemo(
    () =>
      filter === 'track'
        ? subjects.filter((s) => s.tracks.length === 0 || s.tracks.includes(activeTrack))
        : subjects,
    [filter, subjects, activeTrack]
  );

  // Filter dropdown options, derived from the loaded data with localized labels.
  const gradeOptions = useMemo(() => {
    const m = new Map<string, string>();
    subjects.forEach((s) =>
      (s.books || []).forEach((b) => {
        if (b.grade && !m.has(b.grade)) m.set(b.grade, b.gradeI18n?.[locale] || b.gradeI18n?.en || b.grade);
      })
    );
    return Array.from(m, ([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [subjects, locale]);

  const typeOptions = useMemo(() => {
    const m = new Map<string, string>();
    subjects.forEach((s) =>
      (s.books || []).forEach((b) => {
        if (b.type && !m.has(b.type)) m.set(b.type, b.typeI18n?.[locale] || b.typeI18n?.en || b.type);
      })
    );
    return Array.from(m, ([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [subjects, locale]);

  const languageOptions = useMemo(() => {
    const set = new Set<string>();
    subjects.forEach((s) => (s.languages || []).forEach((l) => l && set.add(l)));
    return Array.from(set)
      .sort()
      .map((l) => ({
        value: l,
        label: l === 'ar' ? (isAR ? 'عربي' : 'Arabic') : l === 'en' ? (isAR ? 'إنجليزي' : 'English') : l.toUpperCase(),
      }));
  }, [subjects, isAR]);

  const trackOptions = useMemo(() => {
    const set = new Set<string>();
    subjects.forEach((s) => s.tracks.forEach((tr) => set.add(tr)));
    return Array.from(set).map((tr) => ({ value: tr, label: TRACK_LABELS[tr]?.[isAR ? 'ar' : 'en'] || tr }));
  }, [subjects, isAR]);

  const hasActiveFilters =
    q.trim() !== '' || gradeFilter !== 'all' || typeFilter !== 'all' || languageFilter !== 'all' || trackFilter !== 'all';

  const resetFilters = () => {
    setQ('');
    setGradeFilter('all');
    setTypeFilter('all');
    setLanguageFilter('all');
    setTrackFilter('all');
  };

  // A search/filter spans ALL subjects (so matches outside the active track surface);
  // with no active query/filter we respect the track toggle for the default browse view.
  const displayed = useMemo(() => {
    const base = hasActiveFilters ? subjects : visible;
    const query = q.trim().toLowerCase();
    return base.filter((s) => {
      if (trackFilter !== 'all' && !s.tracks.includes(trackFilter)) return false;
      if (languageFilter !== 'all' && !(s.languages || []).includes(languageFilter)) return false;
      if (gradeFilter !== 'all' && !(s.books || []).some((b) => b.grade === gradeFilter)) return false;
      if (typeFilter !== 'all' && !(s.books || []).some((b) => b.type === typeFilter)) return false;
      if (!query) return true;
      // Cross-locale, cross-field haystack: subject names (all locales) + every book's
      // title/grade/type/language and their i18n variants.
      const parts: string[] = [s.name, ...Object.values(s.nameI18n || {})];
      const meta = SUBJECT_META[s.slug];
      if (meta) parts.push(meta.ar, meta.en, meta.fr, meta.de, meta.es, meta.it, meta.zh);
      (s.books || []).forEach((b) => {
        parts.push(b.title || '', b.grade || '', b.type || '', b.language || '');
        if (b.titleI18n) parts.push(...Object.values(b.titleI18n));
        if (b.gradeI18n) parts.push(...Object.values(b.gradeI18n));
        if (b.typeI18n) parts.push(...Object.values(b.typeI18n));
      });
      return parts.join(' ').toLowerCase().includes(query);
    });
  }, [subjects, visible, hasActiveFilters, q, gradeFilter, typeFilter, languageFilter, trackFilter]);

  // Backend semantic search: finds subjects whose page CONTENT matches the query
  // (not just metadata). Triggered on submit (Enter) to keep it off the keystroke
  // hot path. Honours the active grade/language filters as pre-filters.
  const runSemanticSearch = useCallback(
    async (query: string) => {
      const qq = query.trim();
      if (qq.length < 3) {
        setSemantic(null);
        return;
      }
      setSemanticLoading(true);
      try {
        const res = await fetch('/api/subjects/search', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            query: qq,
            limit: 16,
            grade: gradeFilter !== 'all' ? gradeFilter : undefined,
            language: languageFilter !== 'all' ? languageFilter : undefined,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const map: Record<string, number> = {};
          (data.results || []).forEach((r: { slug: string; score: number }) => {
            map[r.slug] = r.score;
          });
          setSemantic({ query: qq, map });
        }
      } catch {
        /* semantic is best-effort; client filter already covers the basics */
      } finally {
        setSemanticLoading(false);
      }
    },
    [gradeFilter, languageFilter]
  );

  // Drop stale semantic results once the query no longer matches what produced them.
  useEffect(() => {
    if (semantic && semantic.query !== q.trim()) setSemantic(null);
  }, [q, semantic]);

  const passesDropdowns = useCallback(
    (s: Subject) => {
      if (trackFilter !== 'all' && !s.tracks.includes(trackFilter)) return false;
      if (languageFilter !== 'all' && !(s.languages || []).includes(languageFilter)) return false;
      if (gradeFilter !== 'all' && !(s.books || []).some((b) => b.grade === gradeFilter)) return false;
      if (typeFilter !== 'all' && !(s.books || []).some((b) => b.type === typeFilter)) return false;
      return true;
    },
    [trackFilter, languageFilter, gradeFilter, typeFilter]
  );

  // Layer 2 of the filter: which books WITHIN a subject match the active filters/
  // query. Dropdowns (grade/type/language) always apply; the text query also
  // narrows, but never blanks a card that surfaced via subject/semantic match.
  const matchingBooks = useCallback(
    (s: Subject) => {
      let books = s.books || [];
      if (gradeFilter !== 'all') books = books.filter((b) => b.grade === gradeFilter);
      if (typeFilter !== 'all') books = books.filter((b) => b.type === typeFilter);
      if (languageFilter !== 'all') books = books.filter((b) => b.language === languageFilter);
      const query = q.trim().toLowerCase();
      if (query) {
        const qm = books.filter((b) => {
          const parts: string[] = [b.title || '', b.grade || '', b.type || '', b.language || ''];
          if (b.titleI18n) parts.push(...Object.values(b.titleI18n));
          if (b.gradeI18n) parts.push(...Object.values(b.gradeI18n));
          if (b.typeI18n) parts.push(...Object.values(b.typeI18n));
          return parts.join(' ').toLowerCase().includes(query);
        });
        return qm.length ? qm : books;
      }
      return books;
    },
    [gradeFilter, typeFilter, languageFilter, q]
  );

  // Merge instant client matches with content matches from the backend. Subjects
  // matched semantically (but missed by the metadata substring pass) are added if
  // they pass the dropdown filters; the list is ordered by semantic score first.
  const finalList = useMemo(() => {
    const sem = semantic && semantic.query === q.trim() ? semantic.map : null;
    if (!sem) return displayed;
    const bySlug = new Map(displayed.map((s) => [s.slug, s]));
    for (const slug of Object.keys(sem)) {
      if (bySlug.has(slug)) continue;
      const subj = subjects.find((s) => s.slug === slug);
      if (subj && passesDropdowns(subj)) bySlug.set(slug, subj);
    }
    return Array.from(bySlug.values()).sort((a, b) => (sem[b.slug] || 0) - (sem[a.slug] || 0));
  }, [displayed, semantic, q, subjects, passesDropdowns]);

  return (
    <ChromeLayout>
      <div className="px-5 lg:px-10 py-6 lg:py-8 max-w-[1400px]">
        <div className="flex items-end justify-between gap-4 mb-6 flex-wrap">
          <div>
            <h1 className="text-2xl lg:text-3xl font-extrabold text-slate-900">{t.subjects.title}</h1>
            <p className="text-slate-500 mt-1 text-[14px]">{t.subjects.sub}</p>
          </div>
          <div className="inline-flex bg-white rounded-lg border border-slate-200 p-1 text-[12.5px] font-semibold">
            <button
              onClick={() => setFilter('track')}
              className={`px-3 py-1.5 rounded-md transition ${filter === 'track' ? 'bg-sky-600 text-white' : 'text-slate-650 hover:text-slate-900'}`}
            >
              {t.subjects.onlyTrack}
            </button>
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 rounded-md transition ${filter === 'all' ? 'bg-sky-600 text-white' : 'text-slate-650 hover:text-slate-900'}`}
            >
              {t.subjects.allSubjects}
            </button>
          </div>
        </div>

        {!loading && subjects.length > 0 && (
          <SubjectFilters
            t={t.subjects}
            isAR={isAR}
            q={q}
            setQ={setQ}
            gradeFilter={gradeFilter}
            setGradeFilter={setGradeFilter}
            typeFilter={typeFilter}
            setTypeFilter={setTypeFilter}
            languageFilter={languageFilter}
            setLanguageFilter={setLanguageFilter}
            trackFilter={trackFilter}
            setTrackFilter={setTrackFilter}
            gradeOptions={gradeOptions}
            typeOptions={typeOptions}
            languageOptions={languageOptions}
            trackOptions={trackOptions}
            hasActiveFilters={hasActiveFilters}
            onReset={resetFilters}
            onSubmit={() => runSemanticSearch(q)}
            searching={semanticLoading}
          />
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center p-12 space-y-4">
            <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
            <p className="text-slate-500 text-sm font-medium">
              {isAR ? 'جاري تحميل المواد الدراسية...' : 'Loading subjects...'}
            </p>
          </div>
        ) : finalList.length === 0 ? (
          <Card className="p-8 text-center text-slate-500">{hasActiveFilters ? t.subjects.noMatch : t.subjects.none}</Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 lg:gap-5">
            {finalList.map((s) => {
              const meta = SUBJECT_META[s.slug] || { hue: 'stone', glyph: '📚' };
              const h = HUE[meta.hue as HueId] || HUE.stone;
              // SUBJECT_META carries all 7 locales and is the authoritative source for
              // name/description; the per-subject i18n maps from the API are secondary.
              // Never bottom out at the raw Arabic `s.name` when a localized value exists.
              const fullMeta = SUBJECT_META[s.slug];
              const name = fullMeta?.[locale] || s.nameI18n[locale] || fullMeta?.en || s.nameI18n.en || s.name;
              const desc = fullMeta?.description?.[locale] || s.descriptionI18n[locale] || fullMeta?.description?.en || s.descriptionI18n.en || '';
              const trackLabel = s.tracks.length > 0
                ? s.tracks.map((tr) => TRACK_LABELS[tr]?.[isAR ? 'ar' : 'en'] || tr).join(' · ')
                : (isAR ? 'عام / مشترك' : 'General / Core');

              // Layer-2 filtered books for this subject; chips/count/list all derive
              // from this so the filter cascades into the card, not just the grid.
              const books = matchingBooks(s);

              // Localize grades and book types based on the (filtered) books inside the subject
              const localizedGrades = Array.from(new Set(
                books.map(b => b.gradeI18n?.[locale] || b.gradeI18n?.en || b.grade || '')
              )).filter(Boolean);

              const localizedTypes = Array.from(new Set(
                books.map(b => b.typeI18n?.[locale] || b.typeI18n?.en || b.type || '')
              )).filter(Boolean);

              return (
                <Card key={s.slug} className="overflow-hidden card-lift flex flex-col justify-between min-h-[280px]">
                  <div>
                    <div className={`${h.bg} px-5 pt-5 pb-4 flex items-start gap-4`}>
                      <div className={`w-14 h-14 rounded-2xl ${h.dot} text-white grid place-items-center text-3xl shadow-md shrink-0`}>
                        {s.glyph || meta.glyph}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-extrabold text-slate-900 text-[17px] leading-tight truncate">
                          {name}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1 capitalize font-medium">
                          {trackLabel}
                        </div>
                      </div>
                    </div>

                    {/* Subject Description */}
                    <div className="px-5 py-4 border-b border-slate-100 min-h-[72px]">
                      <p className="text-[12.5px] text-slate-650 leading-relaxed font-medium">
                        {desc}
                      </p>
                    </div>

                    {/* Meta details (Languages, Grades, Types) */}
                    <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/20 text-[12px] space-y-2.5">
                      {s.languages && s.languages.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide min-w-[75px]">
                            {isAR ? 'اللغات:' : 'Languages:'}
                          </span>
                          <div className="flex gap-1 flex-wrap">
                            {s.languages.map((lang) => (
                              <span key={lang} className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-650 font-bold text-[9.5px] uppercase">
                                {lang === 'ar' ? (isAR ? 'عربي' : 'AR') : lang === 'en' ? (isAR ? 'إنجليزي' : 'EN') : lang.toUpperCase()}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {localizedGrades.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide min-w-[75px]">
                            {isAR ? 'الصفوف:' : 'Grades:'}
                          </span>
                          <div className="flex gap-1 flex-wrap">
                            {localizedGrades.map((g) => (
                              <span key={g} className="px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 font-bold text-[9.5px]">
                                {g}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {localizedTypes.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide min-w-[75px]">
                            {isAR ? 'أنواع الكتب:' : 'Book Types:'}
                          </span>
                          <div className="flex gap-1 flex-wrap max-w-full">
                            {localizedTypes.slice(0, 4).map((t) => (
                              <span key={t} className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-750 font-bold text-[9.5px] truncate max-w-[130px]" title={t}>
                                {t}
                              </span>
                            ))}
                            {localizedTypes.length > 4 && (
                              <span className="text-[9.5px] text-slate-400 font-bold">+{localizedTypes.length - 4}</span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Expandable Books List (filtered — layer 2) */}
                    {books.length > 0 && (
                      <div className="border-b border-slate-100">
                        <button
                          onClick={() => setExpandedSlug(expandedSlug === s.slug ? null : s.slug)}
                          className="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition text-[12px] font-bold text-slate-650"
                        >
                          <span className="flex items-center gap-1.5">
                            <span>📚</span>
                            <span>{isAR ? 'عرض المراجع والكتب' : 'View Textbooks'}</span>
                            <span className="px-1.5 py-0.5 rounded-full bg-slate-100 text-[10.5px] text-slate-500 font-bold">
                              {hasActiveFilters && books.length !== s.bookCount ? `${books.length}/${s.bookCount}` : s.bookCount}
                            </span>
                          </span>
                          <span className="text-slate-400 text-[10px] transition-transform duration-200" style={{ transform: expandedSlug === s.slug ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                            ▼
                          </span>
                        </button>

                        {expandedSlug === s.slug && (
                          <div className="px-4 py-3 bg-slate-50/50 max-h-[220px] overflow-y-auto space-y-2 border-t border-slate-100 slim">
                            {books.map((b) => {
                              const bookTitleStr = b.titleI18n?.[locale] || b.title;
                              return (
                                <div
                                  key={b.id}
                                  onClick={() => router.push(`/${locale}/books/${b.id}`)}
                                  className="p-2.5 rounded-lg bg-white border border-slate-200 hover:border-sky-500 hover:shadow-sm transition cursor-pointer flex justify-between items-center gap-2"
                                >
                                  <div className="min-w-0 flex-1">
                                    <p className="text-[12px] font-bold text-slate-700 truncate">{bookTitleStr}</p>
                                    <div className="flex gap-1.5 mt-1 items-center flex-wrap">
                                      <span className="text-[9.5px] font-bold px-1 py-0.25 bg-slate-100 text-slate-650 rounded uppercase">
                                        {b.language}
                                      </span>
                                      <span className="text-[9.5px] font-semibold text-slate-400 truncate max-w-[120px]">
                                        {b.typeI18n?.[locale] || b.typeI18n?.en || b.type}
                                      </span>
                                      <span className="text-[9.5px] font-medium text-slate-300">·</span>
                                      <span className="text-[9.5px] font-bold text-sky-600">
                                        {b.gradeI18n?.[locale] || b.gradeI18n?.en || b.grade}
                                      </span>
                                    </div>
                                  </div>
                                  <span className="text-slate-400 text-xs shrink-0 select-none">{locale === 'ar' ? '◀' : '▶'}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="px-3 py-3 flex items-center gap-2 flex-wrap bg-white">
                      <Btn kind="primary" size="sm" className="flex-1" onClick={() => router.push(`/${locale}/books?subject=${s.slug}`)}>
                        📖 {t.subjects.openBooks}
                      </Btn>
                      <Btn kind="outline" size="sm" className="flex-1" onClick={() => router.push(`/${locale}/session?subject=${s.slug}`)}>
                        ▶ {t.subjects.drill}
                      </Btn>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </ChromeLayout>
  );
}
