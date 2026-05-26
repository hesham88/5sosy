export type Locale = 'ar' | 'en';

export type SubjectId =
  | 'physics' | 'chemistry' | 'biology' | 'arabic' | 'history'
  | 'english' | 'math' | 'geology' | 'philosophy' | 'geography'
  | 'science';

export type Grade = 'g1' | 'g2' | 'g3';
export type Track = 'sci_sci' | 'sci_math' | 'lit';

export type PlanBlock = {
  id: number;
  subject: SubjectId;
  dur: number;
  type: 'review' | 'quiz' | 'lesson' | 'practice' | 'audio' | 'oral';
  arT: string; enT: string;
  arSub: string; enSub: string;
};

export type WeakTopic = {
  id: string;
  subject: SubjectId;
  arT: string; enT: string;
  conf: number;
};

export type UpcomingExam = {
  id: number;
  subject: SubjectId;
  arT: string; enT: string;
  days: number;
  urgent: boolean;
};

export type ActivityItem = {
  agent: string;
  arT: string; enT: string;
  ago: string; agoEn: string;
  glyph: string;
  status?: 'ok' | 'warn' | 'info';
};

export type Book = {
  id: string;
  subject: SubjectId;
  rawSubject?: string;
  arT: string;
  enT: string;
  arSub: string;
  enSub: string;
  publisher: string;
  year: number;
  chapters: number;
  pages: number;
  status: 'indexed' | 'processing' | 'queued' | 'downloading' | 'parsing' | 'error';
  mastery: number;
  lastAccessedAr?: string;
  lastAccessedEn?: string;
  cover: string;
  type?: string;
  stage?: string;
  grade?: string;
  term?: string;
  language?: string;
  sourceUrl?: string;
  storagePath?: string;
  errorMessage?: string;
  createdAtMs?: number;
  updatedAtMs?: number;
  arStage?: string;
  enStage?: string;
  arGrade?: string;
  enGrade?: string;
  arTerm?: string;
  enTerm?: string;
  arType?: string;
  enType?: string;
  arSubject?: string;
  enSubject?: string;
  // Pre-translated title/subtitle per locale (ar/en/fr/de/es/it/zh), written by
  // scripts/translate_book_metadata.py. Absent until that batch runs; consumers
  // fall back to arT/enT.
  titleI18n?: Record<string, string>;
  subI18n?: Record<string, string>;
};

export type SubjectProgress = {
  subject: SubjectId;
  mastery: number;
  chaptersDone: number;
  chaptersTotal: number;
  books: number;
  weakTopics: number;
  minutesThisWeek: number;
  lastTopicAr: string;
  lastTopicEn: string;
};

export type WeekPlanDay = {
  dayKey: 'sat' | 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri';
  arLabel: string;
  enLabel: string;
  date: number;
  isToday?: boolean;
  blocks: PlanBlock[];
};

export type Curriculum = 'thanaweya' | 'IB' | 'AP' | 'GCSE' | 'other';

export type AvatarStyle =
  | 'adventurer' | 'lorelei' | 'notionists' | 'bottts' | 'fun-emoji' | 'thumbs';

export type CustomBook = {
  id: string;
  name: string;
  storagePath: string;
  sizeBytes?: number;
  mimeType?: string;
};

export type UserDoc = {
  uid: string;
  displayName: string;
  email: string | null;
  photoURL: string | null;
  isAnonymous: boolean;
  username: string;
  locale: Locale;
  grade: Grade;
  track: Track;
  subjects: SubjectId[];
  streak: number;
  xp: number;

  // Onboarding-collected (optional until onboardingCompleted === true)
  preferredName?: string;
  age?: number;
  country?: string;
  educationSystem?: string;
  yearOfEducation?: string;
  interests?: string;
  avatarSeed?: string;
  avatarStyle?: AvatarStyle;
  onboardingCompleted?: boolean;
  onboardingCompletedAt?: unknown; // Firestore Timestamp on read
  lastLoginAt?: unknown;           // Firestore Timestamp on read; drives 24h expiry

  // Legacy onboarding fields — no longer collected as of 2026-05-21, kept so
  // existing user docs from earlier onboarding versions still typecheck.
  location?: { country: string; city?: string };
  curriculum?: Curriculum;
  favoriteSubjects?: SubjectId[];
  reason?: string;
  goals?: string;
};

export type IngestedBookDetail = {
  id: string;
  title: string;
  stage: string;
  grade: string;
  term: string;
  type: string;
  status: 'queued' | 'downloading' | 'parsing' | 'completed' | 'failed';
  progress: number; // 0 to 100
  govUrl: string;
};

export type IngestedTaskDetail = {
  name: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  progress: number;
  errorMessage?: string;
};

export type IngestionStatus = {
  status: 'idle' | 'running' | 'paused' | 'completed' | 'error';
  pausedByRequest: boolean;
  logs: {
    timestamp: string;
    text: string;
    status?: 'ok' | 'warn' | 'info' | 'error';
    agent: string;
  }[];
  totalBooks: number;
  downloadedBooks: number;
  parsedBooks: number;
  totalPagesProcessed?: number;
  progressMessage?: string;
  percentage: number;
  activeBookId?: string;
  activeBookTitle?: string;
  booksList?: Record<string, IngestedBookDetail>;
  totalTasks?: number;
  completedTasks?: number;
  progressPercentage?: number;
  tasks?: Record<string, IngestedTaskDetail>;
  executionName?: string;
  lastHeartbeatAt?: { toMillis(): number } | null;
  errorMessage?: string;
};

export type PlaylistItem = {
  videoId: string;
  title: string;
  position: number;
  thumbnail: string;
};

export type Video = {
  id: string;
  title: string;
  stage: string;
  grade: string;
  subject: SubjectId;
  term: string;
  youtubeUrl: string;
  sourceUrl: string;
  createdAtMs?: number;
  playlistId?: string;
  items?: PlaylistItem[];
};
