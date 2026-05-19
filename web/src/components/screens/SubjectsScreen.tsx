'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChromeLayout } from '../shared/Chrome';
import { useApp } from '../shared/Providers';
import { Btn, Card, Ring, SubjectChip } from '../shared/atoms';
import { SUBJECT_META, HUE } from '@/constants/subjects';
import { SUBJECT_PROGRESS, BOOKS } from '@/constants/seed-data';
import type { SubjectId } from '@/lib/types';

const TRACK_SUBJECTS: Record<'sci_sci' | 'sci_math' | 'lit', SubjectId[]> = {
  sci_sci:  ['physics','chemistry','biology','math','arabic','english'],
  sci_math: ['physics','chemistry','math','arabic','english','geology'],
  lit:      ['arabic','english','history','geography','philosophy','math']
};

export default function SubjectsScreen() {
  const { isAR, t, locale } = useApp();
  const router = useRouter();
  const [filter, setFilter] = useState<'all' | 'track'>('track');
  const trackIds = TRACK_SUBJECTS.sci_sci;

  const visible = filter === 'track'
    ? SUBJECT_PROGRESS.filter((s) => trackIds.includes(s.subject))
    : SUBJECT_PROGRESS;

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
              className={`px-3 py-1.5 rounded-md transition ${filter === 'track' ? 'bg-sky-600 text-white' : 'text-slate-600 hover:text-slate-900'}`}
            >
              {t.subjects.onlyTrack}
            </button>
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 rounded-md transition ${filter === 'all' ? 'bg-sky-600 text-white' : 'text-slate-600 hover:text-slate-900'}`}
            >
              {t.subjects.allSubjects}
            </button>
          </div>
        </div>

        {visible.length === 0 ? (
          <Card className="p-8 text-center text-slate-500">{t.subjects.none}</Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 lg:gap-5">
            {visible.map((s) => {
              const meta = SUBJECT_META[s.subject];
              const h = HUE[meta.hue];
              const bookCount = BOOKS.filter((b) => b.subject === s.subject).length;
              return (
                <Card key={s.subject} className="overflow-hidden card-lift">
                  <div className={`${h.bg} px-5 pt-5 pb-4 flex items-start gap-4`}>
                    <div className={`w-14 h-14 rounded-2xl ${h.dot} text-white grid place-items-center text-3xl shadow-md`}>
                      {meta.glyph}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-extrabold text-slate-900 text-[17px] leading-tight">
                        {isAR ? meta.ar : meta.en}
                      </div>
                      <div className="text-[12px] text-slate-600 mt-1 truncate">
                        {t.subjects.last}: <span className="font-semibold text-slate-700">{isAR ? s.lastTopicAr : s.lastTopicEn}</span>
                      </div>
                    </div>
                    <Ring value={s.mastery} size={48} stroke={5} />
                  </div>

                  <div className="grid grid-cols-3 gap-2 px-5 py-3 border-b border-slate-100">
                    <Stat label={t.subjects.chapters} value={`${s.chaptersDone}/${s.chaptersTotal}`} />
                    <Stat label={t.subjects.books} value={String(bookCount || s.books)} />
                    <Stat label={t.subjects.weak} value={String(s.weakTopics)} tone={s.weakTopics > 2 ? 'rose' : 'slate'} />
                  </div>

                  <div className="px-3 py-3 flex items-center gap-2 flex-wrap">
                    <Btn kind="primary" size="sm" onClick={() => router.push(`/${locale}/session`)}>
                      ▶ {t.subjects.drill}
                    </Btn>
                    <Btn kind="outline" size="sm" onClick={() => router.push(`/${locale}/books?subject=${s.subject}`)}>
                      📖 {t.subjects.openBooks}
                    </Btn>
                    <Btn kind="ghost" size="sm" onClick={() => router.push(`/${locale}/quiz`)}>
                      ✓ {t.subjects.takeQuiz}
                    </Btn>
                    <div className="ms-auto text-[11px] text-slate-400 ltr inline-flex items-center gap-1">
                      <span>⏱</span><span>{s.minutesThisWeek}m / wk</span>
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

function Stat({ label, value, tone = 'slate' }: { label: string; value: string; tone?: 'slate' | 'rose' }) {
  const c = tone === 'rose' ? 'text-rose-600' : 'text-slate-900';
  return (
    <div className="text-center">
      <div className={`text-[16px] font-extrabold ltr ${c}`}>{value}</div>
      <div className="text-[10.5px] text-slate-500 mt-0.5">{label}</div>
    </div>
  );
}
