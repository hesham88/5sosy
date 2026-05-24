'use client';

import React, { useEffect, useState } from 'react';

type InsightsData = {
  totalBooks: number;
  totalPages: number;
  avgPages: number;
  languages: Record<string, number>;
  subjects: Record<string, number>;
  types: Record<string, number>;
};

interface InsightsVisualizerProps {
  isAR: boolean;
}

export default function InsightsVisualizer({ isAR }: InsightsVisualizerProps) {
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
        <div className="w-12 h-12 border-4 border-indigo-500/30 border-t-indigo-600 rounded-full animate-spin"></div>
        <p className="text-gray-400 text-sm font-medium">
          {isAR ? 'جاري تحميل الإحصائيات الفنية...' : 'Analyzing database insights...'}
        </p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8 text-center bg-red-500/10 border border-red-500/20 rounded-2xl max-w-md mx-auto my-12">
        <p className="text-red-400 font-semibold mb-2">
          {isAR ? 'فشل تحميل الإحصائيات' : 'Failed to Load Insights'}
        </p>
        <p className="text-gray-400 text-sm">{error}</p>
      </div>
    );
  }

  // Math helper for percentages
  const getPercentage = (value: number, total: number) => {
    if (total === 0) return 0;
    return Math.round((value / total) * 100);
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Total Books */}
        <div className="relative overflow-hidden p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xl hover:border-white/20 transition-all duration-300">
          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl -z-10"></div>
          <div className="text-sm font-medium text-gray-400">
            {isAR ? 'إجمالي الكتب المتاحة' : 'Total Library Books'}
          </div>
          <div className="mt-4 flex items-baseline space-x-2">
            <span className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">
              {data.totalBooks}
            </span>
            <span className="text-xs text-gray-500">{isAR ? 'كتب' : 'books'}</span>
          </div>
        </div>

        {/* Total Pages */}
        <div className="relative overflow-hidden p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xl hover:border-white/20 transition-all duration-300">
          <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl -z-10"></div>
          <div className="text-sm font-medium text-gray-400">
            {isAR ? 'إجمالي عدد الصفحات المؤرشفة' : 'Total Pages Processed'}
          </div>
          <div className="mt-4 flex items-baseline space-x-2">
            <span className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">
              {data.totalPages.toLocaleString()}
            </span>
            <span className="text-xs text-gray-500">{isAR ? 'صفحة' : 'pages'}</span>
          </div>
        </div>

        {/* Avg Pages */}
        <div className="relative overflow-hidden p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xl hover:border-white/20 transition-all duration-300">
          <div className="absolute top-0 right-0 w-32 h-32 bg-pink-500/10 rounded-full blur-3xl -z-10"></div>
          <div className="text-sm font-medium text-gray-400">
            {isAR ? 'متوسط الصفحات لكل كتاب' : 'Average Pages per Book'}
          </div>
          <div className="mt-4 flex items-baseline space-x-2">
            <span className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-rose-400">
              {data.avgPages}
            </span>
            <span className="text-xs text-gray-500">{isAR ? 'صفحة/كتاب' : 'pages/book'}</span>
          </div>
        </div>
      </div>

      {/* Grid Breakdowns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Language & Material Type */}
        <div className="space-y-6">
          {/* Languages card */}
          <div className="p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xl">
            <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
              <span>🌐</span> {isAR ? 'توزيع لغات الكتب' : 'Language Distribution'}
            </h3>
            <div className="space-y-4">
              {Object.entries(data.languages).map(([lang, count]) => {
                const pct = getPercentage(count, data.totalBooks);
                const label = lang === 'ar' ? (isAR ? 'عربي' : 'Arabic') : lang === 'en' ? (isAR ? 'إنجليزي' : 'English') : lang.toUpperCase();
                return (
                  <div key={lang} className="space-y-2">
                    <div className="flex justify-between text-sm text-gray-300 font-medium">
                      <span>{label}</span>
                      <span>{count} ({pct}%)</span>
                    </div>
                    <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Types card */}
          <div className="p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xl">
            <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
              <span>📚</span> {isAR ? 'أنواع مصادر التعلم' : 'Resource Categories'}
            </h3>
            <div className="space-y-4">
              {Object.entries(data.types).map(([type, count]) => {
                const pct = getPercentage(count, data.totalBooks);
                return (
                  <div key={type} className="space-y-2">
                    <div className="flex justify-between text-sm text-gray-300 font-medium">
                      <span className="capitalize">{type}</span>
                      <span>{count} ({pct}%)</span>
                    </div>
                    <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all duration-500"
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
        <div className="p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xl flex flex-col">
          <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
            <span>🔬</span> {isAR ? 'الكتب حسب المواد الدراسية' : 'Distribution by Subject'}
          </h3>
          <div className="space-y-4 flex-1 overflow-y-auto max-h-[360px] pr-2">
            {Object.entries(data.subjects).map(([subject, count]) => {
              const pct = getPercentage(count, data.totalBooks);
              return (
                <div key={subject} className="space-y-2">
                  <div className="flex justify-between text-sm text-gray-300 font-medium">
                    <span className="capitalize">{subject}</span>
                    <span>{count} ({pct}%)</span>
                  </div>
                  <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-pink-500 to-rose-500 rounded-full transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    ></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
