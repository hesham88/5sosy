'use client';

import React, { useEffect, useState } from 'react';
import { useApp } from '../shared/Providers';
import { SUBJECT_META, HUE } from '@/constants/subjects';
import { Card } from '../shared/atoms';

type InsightsData = {
  totalBooks: number;
  totalPages: number;
  avgPages: number;
  languages: Record<string, number>;
  subjects: Record<string, number>;
  types: Record<string, number>;
  pagesBySubject: Record<string, { avg: number; total: number }>;
};

interface InsightsVisualizerProps {
  isAR: boolean;
}

export default function InsightsVisualizer({ isAR }: InsightsVisualizerProps) {
  const { locale, t } = useApp();
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchInsights() {
      try {
        const res = await fetch('/api/books/insights');
        if (!res.ok) {
          throw new Error('Failed to fetch book insights');
        }
        const json = await res.json();
        setData(json);
      } catch (err: any) {
        setError(err.message || 'Error loading insights');
      } finally {
        setLoading(false);
      }
    }
    void fetchInsights();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 space-y-4 min-h-[300px]">
        <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
        <p className="text-slate-500 text-sm font-medium">
          {isAR ? 'جاري تحميل الإحصائيات الفنية...' : 'Analyzing database insights...'}
        </p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8 text-center bg-rose-50 border border-rose-200 rounded-2xl max-w-md mx-auto my-12">
        <p className="text-rose-600 font-semibold mb-2">
          {isAR ? 'فشل تحميل الإحصائيات' : 'Failed to Load Insights'}
        </p>
        <p className="text-slate-500 text-sm">{error}</p>
      </div>
    );
  }

  const getPercentage = (value: number, total: number) => {
    if (total === 0) return 0;
    return Math.round((value / total) * 100);
  };

  const getLanguageLabel = (lang: string) => {
    const labels: Record<string, string> = {
      ar: isAR ? 'العربية' : 'Arabic',
      en: isAR ? 'الإنجليزية' : 'English',
      fr: isAR ? 'الفرنسية' : 'French',
      de: isAR ? 'الألمانية' : 'German',
      es: isAR ? 'الإسبانية' : 'Spanish',
      it: isAR ? 'الإيطالية' : 'Italian',
      zh: isAR ? 'الصينية' : 'Chinese',
      unknown: isAR ? 'غير معروف' : 'Unknown'
    };
    return labels[lang] || lang.toUpperCase();
  };

  const getSubjectMeta = (slug: string) => {
    const meta = SUBJECT_META[slug];
    if (meta) {
      return {
        name: (meta as any)[locale] || meta.en || meta.ar,
        glyph: meta.glyph,
        hue: meta.hue
      };
    }
    return {
      name: slug.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      glyph: '📚',
      hue: 'stone' as const
    };
  };

  // Sorted arrays for breakdowns
  const sortedSubjects = Object.entries(data.subjects)
    .sort((a, b) => b[1] - a[1]);

  const sortedLanguages = Object.entries(data.languages)
    .sort((a, b) => b[1] - a[1]);

  const sortedPagesBySubject = Object.entries(data.pagesBySubject || {})
    .sort((a, b) => b[1].avg - b[1].avg);

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Total Books */}
        <div className="relative overflow-hidden p-6 rounded-2xl bg-white border border-slate-200 shadow-sm hover:border-slate-300 transition-all duration-300">
          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl -z-10"></div>
          <div className="text-sm font-bold text-slate-500">
            {isAR ? 'إجمالي الكتب المتاحة' : 'Total Library Books'}
          </div>
          <div className="mt-4 flex items-baseline space-x-2 rtl:space-x-reverse">
            <span className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 to-purple-600">
              {data.totalBooks}
            </span>
            <span className="text-xs text-slate-400 font-bold">{isAR ? 'كتب' : 'books'}</span>
          </div>
        </div>

        {/* Total Pages */}
        <div className="relative overflow-hidden p-6 rounded-2xl bg-white border border-slate-200 shadow-sm hover:border-slate-300 transition-all duration-300">
          <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl -z-10"></div>
          <div className="text-sm font-bold text-slate-500">
            {isAR ? 'إجمالي عدد الصفحات المؤرشفة' : 'Total Pages Processed'}
          </div>
          <div className="mt-4 flex items-baseline space-x-2 rtl:space-x-reverse">
            <span className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-500 to-pink-600">
              {data.totalPages.toLocaleString()}
            </span>
            <span className="text-xs text-slate-400 font-bold">{isAR ? 'صفحة' : 'pages'}</span>
          </div>
        </div>

        {/* Avg Pages */}
        <div className="relative overflow-hidden p-6 rounded-2xl bg-white border border-slate-200 shadow-sm hover:border-slate-300 transition-all duration-300">
          <div className="absolute top-0 right-0 w-32 h-32 bg-pink-500/10 rounded-full blur-3xl -z-10"></div>
          <div className="text-sm font-bold text-slate-500">
            {isAR ? 'متوسط الصفحات لكل كتاب' : 'Average Pages per Book'}
          </div>
          <div className="mt-4 flex items-baseline space-x-2 rtl:space-x-reverse">
            <span className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-rose-600">
              {data.avgPages}
            </span>
            <span className="text-xs text-slate-400 font-bold">{isAR ? 'صفحة/كتاب' : 'pages/book'}</span>
          </div>
        </div>
      </div>

      {/* Grid Breakdowns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Language breakdown */}
        <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-lg font-extrabold text-slate-900 mb-6 flex items-center gap-2">
              <span>🌐</span> {isAR ? 'توزيع لغات الكتب' : 'Language Distribution'}
            </h3>
            <div className="space-y-4">
              {sortedLanguages.map(([lang, count]) => {
                const pct = getPercentage(count, data.totalBooks);
                const label = getLanguageLabel(lang);
                return (
                  <div key={lang} className="space-y-2">
                    <div className="flex justify-between text-sm text-slate-650 font-bold">
                      <span>{label}</span>
                      <span>{count} ({pct}%)</span>
                    </div>
                    <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Subjects breakdown */}
        <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col">
          <h3 className="text-lg font-extrabold text-slate-900 mb-6 flex items-center gap-2">
            <span>🔬</span> {isAR ? 'الكتب حسب المواد الدراسية (أعلى 6)' : 'Top Subjects by Book Count (Top 6)'}
          </h3>
          <div className="space-y-5 flex-1 overflow-y-auto max-h-[380px] pr-2 slim">
            {sortedSubjects.slice(0, 6).map(([subject, count]) => {
              const pct = getPercentage(count, data.totalBooks);
              const meta = getSubjectMeta(subject);
              const h = HUE[meta.hue] || HUE.stone;
              return (
                <div key={subject} className="space-y-2">
                  <div className="flex justify-between items-center text-sm font-bold">
                    <span className="flex items-center gap-2 text-slate-800">
                      <span className="text-lg">{meta.glyph}</span>
                      <span>{meta.name}</span>
                    </span>
                    <span className="text-slate-500 font-semibold">{count} {isAR ? 'كتب' : 'books'} ({pct}%)</span>
                  </div>
                  <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${h.dot} rounded-full transition-all duration-500`}
                      style={{ width: `${pct}%` }}
                    ></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* New Insight Cards: Page Count Breakdown and Analytics */}
      <div className="grid grid-cols-1 gap-8">
        {/* Textbook Page Count Analytics per Subject */}
        <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
          <div className="flex justify-between items-center mb-6 flex-wrap gap-2">
            <h3 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
              <span>📖</span> {isAR ? 'إحصائيات سماكة الكتب والصفحات حسب المواد' : 'Page Count Thickness Analytics per Subject'}
            </h3>
            <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-bold">
              {isAR ? 'مرتبة تنازلياً حسب متوسط الصفحات' : 'Sorted by average page count'}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 text-xs font-bold uppercase tracking-wider text-start">
                  <th className="pb-3 text-start">{isAR ? 'المادة الدراسية' : 'Subject'}</th>
                  <th className="pb-3 text-center">{isAR ? 'متوسط الصفحات' : 'Average Pages'}</th>
                  <th className="pb-3 text-center">{isAR ? 'إجمالي الصفحات' : 'Total Pages'}</th>
                  <th className="pb-3 text-center">{isAR ? 'الكتب المؤرشفة' : 'Textbooks'}</th>
                </tr>
              </thead>
              <tbody>
                {sortedPagesBySubject.slice(0, 10).map(([subject, stats]) => {
                  const meta = getSubjectMeta(subject);
                  const count = data.subjects[subject] || 0;
                  return (
                    <tr key={subject} className="border-b border-slate-100 hover:bg-slate-50/50 transition">
                      <td className="py-4 text-start font-bold text-slate-800 flex items-center gap-2.5">
                        <span className="text-xl shrink-0">{meta.glyph}</span>
                        <span className="truncate max-w-[240px]">{meta.name}</span>
                      </td>
                      <td className="py-4 text-center font-extrabold text-indigo-600">
                        {stats.avg} <span className="text-[10px] font-semibold text-slate-450">{isAR ? 'صفحة' : 'pgs'}</span>
                      </td>
                      <td className="py-4 text-center font-semibold text-slate-700">
                        {stats.total.toLocaleString()}
                      </td>
                      <td className="py-4 text-center font-bold text-slate-500">
                        {count}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
