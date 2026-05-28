import type { UserRole } from './roles';

export type Locale = 'ar' | 'en';

export type SubjectId = string;

export type Subject = {
  slug: string;
  name: string;
  nameI18n: Record<string, string>;
  descriptionI18n: Record<string, string>;
  hue: string;
  glyph: string;
  tracks: string[];
  bookCount?: number;
  languages?: string[];
  grades?: string[];
  types?: string[];
  books?: Array<{ id: string; title: string; titleI18n?: Record<string, string>; language?: string; grade?: string; gradeI18n?: Record<string, string>; type?: string; typeI18n?: Record<string, string> }>;
};

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
  // Pre-translated metadata per locale (ar/en/fr/de/es/it/zh), written by
  // scripts/translate_book_metadata.py. Absent until that batch runs; consumers
  // fall back to the ar/en fields.
  titleI18n?: Record<string, string>;
  subI18n?: Record<string, string>;
  typeI18n?: Record<string, string>;
  gradeI18n?: Record<string, string>;
  termI18n?: Record<string, string>;
  stageI18n?: Record<string, string>;
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

export type Visibility = 'private' | 'connections' | 'public';

export type UserBadge = {
  id: string;
  label: string;
  earnedAt?: unknown;
};

export type UserSettings = {
  account?: {
    emailNotifications?: boolean;
    loginAlerts?: boolean;
  };
  preferences?: {
    interfaceDensity?: 'compact' | 'comfortable' | 'spacious';
    preferredLanguage?: string;
    ttsAccent?: 'eg' | 'msa';
    dailyReminder?: boolean;
    weeklyReport?: boolean;
    weakConceptAlerts?: boolean;
    examCountdown?: boolean;
  };
  privacy?: {
    profileVisibility?: Visibility;
    activityVisibility?: Visibility;
    showBadges?: boolean;
    saveChatHistory?: boolean;
    allowAnonymousProductAnalytics?: boolean;
  };
};

export type ParentConsentState = {
  status: 'not_required' | 'pending' | 'approved' | 'rejected';
  parentEmail?: string;
  parentUid?: string;
  requestedAt?: unknown;
  approvedAt?: unknown;
};

export type RelationshipSummary = {
  parents?: string[];
  children?: string[];
  teachers?: string[];
  students?: string[];
  schools?: string[];
  friends?: string[];
};

export type ActivityLogEntry = {
  id?: string;
  type: string;
  title: string;
  actorUid: string;
  occurredAt?: unknown;
  occurredAtIso?: string;
  resourceType?: string;
  resourceId?: string;
  visibility?: Visibility;
  metadata?: Record<string, unknown>;
};

export type SchoolProfile = {
  id: string;
  slug: string;
  name: string;
  type: 'public' | 'private' | 'international' | 'other';
  country: string;
  city?: string;
  description?: string;
  websiteUrl?: string;
  externalLinks?: Array<{ label: string; url: string }>;
  map?: {
    provider: 'google';
    placeQuery?: string;
    lat?: number;
    lng?: number;
  };
  adminUid: string;
  teacherUids?: string[];
  studentUids?: string[];
};

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
  role?: UserRole;
  title?: string;
  description?: string;
  coverURL?: string;
  badges?: UserBadge[];
  settings?: UserSettings;
  parentConsent?: ParentConsentState;
  relationships?: RelationshipSummary;
  schoolId?: string;
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
