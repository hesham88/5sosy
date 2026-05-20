import type { AvatarStyle, Curriculum } from '@/lib/types';

export const CURRICULUM_OPTIONS: { id: Curriculum; ar: string; en: string }[] = [
  { id: 'thanaweya', ar: 'الثانوية العامة', en: 'Thanaweya Amma' },
  { id: 'IB',        ar: 'بكالوريا دولية (IB)', en: 'IB' },
  { id: 'AP',        ar: 'AP الأمريكية', en: 'AP (American)' },
  { id: 'GCSE',      ar: 'GCSE البريطانية', en: 'GCSE (British)' },
  { id: 'other',     ar: 'منهج آخر', en: 'Other' }
];

export const YEAR_OF_EDUCATION_OPTIONS: { id: string; ar: string; en: string }[] = [
  { id: 'G7',  ar: 'الصف الأول الإعدادي',  en: 'Grade 7'  },
  { id: 'G8',  ar: 'الصف الثاني الإعدادي', en: 'Grade 8'  },
  { id: 'G9',  ar: 'الصف الثالث الإعدادي', en: 'Grade 9'  },
  { id: 'G10', ar: 'الأول الثانوي',         en: 'Grade 10' },
  { id: 'G11', ar: 'الثاني الثانوي',        en: 'Grade 11' },
  { id: 'G12', ar: 'الثالث الثانوي',        en: 'Grade 12' },
  { id: 'other', ar: 'غير ذلك',             en: 'Other'    }
];

export const AVATAR_STYLES: AvatarStyle[] = [
  'adventurer',
  'lorelei',
  'notionists',
  'bottts',
  'fun-emoji',
  'thumbs'
];

// Used by the avatar picker to render N thumbnails per style. The agent never
// chooses a seed itself — the client picks one when the user taps a tile.
export const AVATAR_SEED_PALETTE: string[] = [
  'sosy-1', 'sosy-2', 'sosy-3', 'sosy-4',
  'sosy-5', 'sosy-6', 'sosy-7', 'sosy-8'
];
