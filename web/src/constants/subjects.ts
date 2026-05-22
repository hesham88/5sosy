import type { SubjectId } from '@/lib/types';

export const SUBJECT_META: Record<SubjectId, { ar: string; en: string; hue: HueId; glyph: string }> = {
  physics:    { ar: 'فيزياء',       en: 'Physics',     hue: 'sky',    glyph: '🔬' },
  chemistry:  { ar: 'كيمياء',       en: 'Chemistry',   hue: 'violet', glyph: '⚗️' },
  biology:    { ar: 'أحياء',         en: 'Biology',     hue: 'emerald', glyph: '🧬' },
  arabic:     { ar: 'لغة عربية',    en: 'Arabic',      hue: 'amber',  glyph: '📜' },
  history:    { ar: 'تاريخ',         en: 'History',     hue: 'rose',   glyph: '🏛️' },
  english:    { ar: 'لغة انجليزية', en: 'English',     hue: 'indigo', glyph: '🇬🇧' },
  math:       { ar: 'رياضيات',       en: 'Math',        hue: 'cyan',   glyph: '∑' },
  geology:    { ar: 'جيولوجيا',     en: 'Geology',     hue: 'stone',  glyph: '🪨' },
  philosophy: { ar: 'فلسفة',         en: 'Philosophy',  hue: 'fuchsia', glyph: '💭' },
  geography:  { ar: 'جغرافيا',       en: 'Geography',   hue: 'teal',   glyph: '🌍' },
  science:    { ar: 'علوم',         en: 'Science',     hue: 'teal',   glyph: '🧪' }
};

export type HueId =
  | 'sky' | 'violet' | 'emerald' | 'amber' | 'rose'
  | 'indigo' | 'cyan' | 'stone' | 'fuchsia' | 'teal';

export const HUE: Record<HueId, { bg: string; text: string; border: string; dot: string }> = {
  sky:     { bg: 'bg-sky-50',     text: 'text-sky-700',     border: 'border-sky-200',     dot: 'bg-sky-500' },
  violet:  { bg: 'bg-violet-50',  text: 'text-violet-700',  border: 'border-violet-200',  dot: 'bg-violet-500' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  amber:   { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',   dot: 'bg-amber-500' },
  rose:    { bg: 'bg-rose-50',    text: 'text-rose-700',    border: 'border-rose-200',    dot: 'bg-rose-500' },
  indigo:  { bg: 'bg-indigo-50',  text: 'text-indigo-700',  border: 'border-indigo-200',  dot: 'bg-indigo-500' },
  cyan:    { bg: 'bg-cyan-50',    text: 'text-cyan-700',    border: 'border-cyan-200',    dot: 'bg-cyan-500' },
  stone:   { bg: 'bg-stone-50',   text: 'text-stone-700',   border: 'border-stone-200',   dot: 'bg-stone-500' },
  fuchsia: { bg: 'bg-fuchsia-50', text: 'text-fuchsia-700', border: 'border-fuchsia-200', dot: 'bg-fuchsia-500' },
  teal:    { bg: 'bg-teal-50',    text: 'text-teal-700',    border: 'border-teal-200',    dot: 'bg-teal-500' }
};
