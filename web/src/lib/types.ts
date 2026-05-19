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
};
