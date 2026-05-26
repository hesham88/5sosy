'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ChromeLayout } from '../shared/Chrome';
import { useApp } from '../shared/Providers';
import { useProfile } from '@/lib/firebase/use-profile';
import { Btn, Card } from '../shared/atoms';
import { SUBJECT_META, HUE, type HueId } from '@/constants/subjects';
import type { Subject } from '@/lib/types';

export default function SubjectsScreen() {
  const { isAR, t, locale } = useApp();
  const router = useRouter();
  const { profile } = useProfile();
  const [filter, setFilter] = useState<'all' | 'track'>('track');
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);

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

  const visible = filter === 'track'
    ? subjects.filter((s) => s.tracks.length === 0 || s.tracks.includes(activeTrack))
    : subjects;

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

        {loading ? (
          <div className="flex flex-col items-center justify-center p-12 space-y-4">
            <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
            <p className="text-slate-500 text-sm font-medium">
              {isAR ? 'جاري تحميل المواد الدراسية...' : 'Loading subjects...'}
            </p>
          </div>
        ) : visible.length === 0 ? (
          <Card className="p-8 text-center text-slate-500">{t.subjects.none}</Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 lg:gap-5 animate-fade-in">
            {visible.map((s) => {
              const meta = SUBJECT_META[s.slug] || { hue: 'stone', glyph: '📚' };
              const h = HUE[meta.hue as HueId] || HUE.stone;
              const name = s.nameI18n[locale] || s.nameI18n.en || s.name;
              const desc = s.descriptionI18n[locale] || s.descriptionI18n.en || '';
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
                          {s.tracks.length > 0 ? s.tracks.join(' · ') : (isAR ? 'عام / مشترك' : 'General / Core')}
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

                      {s.grades && s.grades.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide min-w-[75px]">
                            {isAR ? 'الصفوف:' : 'Grades:'}
                          </span>
                          <div className="flex gap-1 flex-wrap">
                            {s.grades.map((g) => (
                              <span key={g} className="px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 font-bold text-[9.5px] uppercase">
                                {g.toUpperCase()}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {s.types && s.types.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide min-w-[75px]">
                            {isAR ? 'أنواع الكتب:' : 'Book Types:'}
                          </span>
                          <div className="flex gap-1 flex-wrap max-w-full">
                            {s.types.slice(0, 4).map((t) => (
                              <span key={t} className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-750 font-bold text-[9.5px] truncate max-w-[130px]" title={t}>
                                {t}
                              </span>
                            ))}
                            {s.types.length > 4 && (
                              <span className="text-[9.5px] text-slate-400 font-bold">+{s.types.length - 4}</span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Expandable Books List */}
                    {s.books && s.books.length > 0 && (
                      <div className="border-b border-slate-100">
                        <button
                          onClick={() => setExpandedSlug(expandedSlug === s.slug ? null : s.slug)}
                          className="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition text-[12px] font-bold text-slate-650"
                        >
                          <span className="flex items-center gap-1.5">
                            <span>📚</span>
                            <span>{isAR ? 'عرض المراجع والكتب' : 'View Textbooks'}</span>
                            <span className="px-1.5 py-0.5 rounded-full bg-slate-100 text-[10.5px] text-slate-500 font-bold">
                              {s.bookCount}
                            </span>
                          </span>
                          <span className="text-slate-400 text-[10px] transition-transform duration-200" style={{ transform: expandedSlug === s.slug ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                            ▼
                          </span>
                        </button>
                        
                        {expandedSlug === s.slug && (
                          <div className="px-4 py-3 bg-slate-50/50 max-h-[220px] overflow-y-auto space-y-2 border-t border-slate-100 slim">
                            {s.books.map((b) => {
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
                                      <span className="text-[9.5px] font-bold px-1 py-0.25 bg-slate-100 text-slate-600 rounded uppercase">
                                        {b.language}
                                      </span>
                                      <span className="text-[9.5px] font-semibold text-slate-400 capitalize truncate max-w-[120px]">{b.type}</span>
                                      <span className="text-[9.5px] font-medium text-slate-300">·</span>
                                      <span className="text-[9.5px] font-bold text-sky-600 uppercase">{b.grade}</span>
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
