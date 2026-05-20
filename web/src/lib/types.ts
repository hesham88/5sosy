export type Locale = 'ar' | 'en';

export type SubjectId =
  | 'physics' | 'chemistry' | 'biology' | 'arabic' | 'history'
  | 'english' | 'math' | 'geology' | 'philosophy' | 'geography';

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
  arT: string;
  enT: string;
  arSub: string;
  enSub: string;
  publisher: string;
  year: number;
  chapters: number;
  pages: number;
  status: 'indexed' | 'processing' | 'queued';
  mastery: number;
  lastAccessedAr?: string;
  lastAccessedEn?: string;
  cover: string;
  type?: string;
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
  yearOfEducation?: string;
  location?: { country: string; city?: string };
  curriculum?: Curriculum;
  favoriteSubjects?: SubjectId[];
  reason?: string;
  goals?: string;
  avatarSeed?: string;
  avatarStyle?: AvatarStyle;
  onboardingCompleted?: boolean;
  onboardingCompletedAt?: unknown; // Firestore Timestamp on read
  lastLoginAt?: unknown;           // Firestore Timestamp on read; drives 24h expiry
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
};

