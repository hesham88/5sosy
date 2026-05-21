import { SUBJECT_META } from '@/constants/subjects';
import type { Book, SubjectId } from '@/lib/types';

type RawBookDoc = Record<string, unknown>;

const STATUS_VALUES = new Set<Book['status']>([
  'indexed',
  'processing',
  'queued',
  'downloading',
  'parsing',
  'error',
]);

const SUBJECT_ALIASES: Array<[SubjectId, string[]]> = [
  ['physics', ['physics', 'phys', 'phy_', 'فيزياء', 'الفيزياء']],
  ['chemistry', ['chemistry', 'كيمياء', 'الكيمياء']],
  ['biology', ['biology', 'أحياء', 'احياء', 'الأحياء', 'الاحياء']],
  ['arabic', ['arabic', 'عربي', 'العربية', 'اللغة العربية']],
  ['history', ['history', 'تاريخ', 'التاريخ']],
  ['english', ['english', 'انجليزي', 'إنجليزي', 'الانجليزية', 'الإنجليزية']],
  ['math', ['math', 'رياضيات', 'الرياضيات', 'جبر', 'هندسة', 'تفاضل', 'calculus', 'algebra']],
  ['geology', ['geology', 'جيولوجيا', 'الجيولوجيا']],
  ['philosophy', ['philosophy', 'فلسفة', 'الفلسفة', 'منطق', 'logic']],
  ['geography', ['geography', 'جغرافيا', 'الجغرافيا', 'دراسات اجتماعية', 'social studies']],
];

export function bookFromFirestore(id: string, data: RawBookDoc): Book {
  const rawSubject = text(data.subject ?? data.subjectId ?? data.rawSubject, '');
  const subject = normalizeSubject(rawSubject);
  const title = text(data.title ?? data.name ?? data.arT ?? data.enT ?? data.ar ?? data.en, rawSubject || id);
  const stage = text(data.stage, '');
  const grade = text(data.grade, '');
  const term = text(data.term, '');
  const type = text(data.type, 'Student Book');
  const publisher = text(
    data.publisher ?? data.distributor ?? data.author ?? data.source,
    type === 'Added Book' ? 'User upload' : 'MOE Egypt'
  );
  const language = text(data.language ?? data.lang, '');
  const year = number(data.year, new Date().getFullYear());
  const sourceUrl = text(data.govUrl ?? data.link ?? data.sourceUrl ?? data.url ?? data.downloadUrl, '');
  const storagePath = text(data.storagePath ?? data.gcsUri, '');
  const subtitle = compact([stage, grade, term]).join(' / ') || compact([publisher, String(year)]).join(' / ');
  const status = normalizeStatus(data.status);
  const createdAtMs = timestampMs(data.createdAt);
  const updatedAtMs = timestampMs(data.updatedAt);

  return {
    id,
    subject,
    rawSubject: rawSubject || undefined,
    arT: text(data.arT ?? data.arTitle ?? data.ar, title),
    enT: text(data.enT ?? data.enTitle ?? data.en, title),
    arSub: text(data.arSub, subtitle),
    enSub: text(data.enSub, subtitle),
    publisher,
    year,
    chapters: number(data.chapters, 0),
    pages: number(data.pages, Array.isArray(data.pagesList) ? data.pagesList.length : 0),
    status,
    mastery: masteryValue(data.mastery),
    lastAccessedAr: text(data.lastAccessedAr, ''),
    lastAccessedEn: text(data.lastAccessedEn, ''),
    cover: text(data.cover, SUBJECT_META[subject].hue),
    type,
    stage: stage || undefined,
    grade: grade || undefined,
    term: term || undefined,
    language: language || undefined,
    sourceUrl: sourceUrl || undefined,
    storagePath: storagePath || undefined,
    errorMessage: text(data.errorMessage, ''),
    createdAtMs,
    updatedAtMs,
  };
}

export function compareBooks(a: Book, b: Book): number {
  const aTime = a.updatedAtMs || a.createdAtMs || 0;
  const bTime = b.updatedAtMs || b.createdAtMs || 0;
  if (aTime !== bTime) return bTime - aTime;

  const aYear = a.year || 0;
  const bYear = b.year || 0;
  if (aYear !== bYear) return bYear - aYear;

  return (a.enT || a.arT || a.id).localeCompare(b.enT || b.arT || b.id, undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

export function bookMatchesQuery(book: Book, query: string): boolean {
  const q = normalize(query);
  if (!q) return true;
  return normalize(
    [
      book.arT,
      book.enT,
      book.arSub,
      book.enSub,
      book.rawSubject,
      book.publisher,
      book.stage,
      book.grade,
      book.term,
      book.type,
      book.language,
      book.year,
    ].filter(Boolean).join(' ')
  ).includes(q);
}

function normalizeSubject(raw: string): SubjectId {
  const lowered = normalize(raw);
  if ((Object.keys(SUBJECT_META) as SubjectId[]).includes(raw as SubjectId)) {
    return raw as SubjectId;
  }
  for (const [id, aliases] of SUBJECT_ALIASES) {
    if (aliases.some((alias) => lowered.includes(normalize(alias)))) return id;
  }
  if (lowered.includes('science') || lowered.includes('علوم')) return 'biology';
  if (lowered.includes('ict') || lowered.includes('تكنولوجيا')) return 'math';
  return 'geology';
}

function normalizeStatus(value: unknown): Book['status'] {
  const status = text(value, 'indexed').toLowerCase();
  if (status === 'completed') return 'indexed';
  if (status === 'failed') return 'error';
  return STATUS_VALUES.has(status as Book['status']) ? status as Book['status'] : 'indexed';
}

function masteryValue(value: unknown): number {
  const raw = number(value, 0);
  return raw > 1 ? raw / 100 : raw;
}

function timestampMs(value: unknown): number | undefined {
  if (!value) return undefined;
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  if (typeof value === 'object' && 'toMillis' in value && typeof value.toMillis === 'function') {
    return value.toMillis();
  }
  return undefined;
}

function text(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  return fallback;
}

function number(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function compact(values: string[]): string[] {
  return values.map((value) => value.trim()).filter(Boolean);
}

function normalize(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}
