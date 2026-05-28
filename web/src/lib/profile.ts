import type { UserRole } from './roles';
import { resolveUserRole } from './roles';
import type { UserSettings } from './types';

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 32;

export function normalizeUsername(input: unknown): string {
  const raw = typeof input === 'string' ? input : '';
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, USERNAME_MAX);
}

export function isValidUsername(input: unknown): boolean {
  const username = normalizeUsername(input);
  return username.length >= USERNAME_MIN && /^[a-z0-9][a-z0-9_-]*[a-z0-9]$/.test(username);
}

export function usernameFromEmail(email: string | null | undefined, uid: string): string {
  const local = email?.split('@')[0] ?? '';
  const normalized = normalizeUsername(local);
  if (normalized.length >= USERNAME_MIN) return normalized;
  return `student-${uid.slice(0, 8).toLowerCase()}`;
}

export function defaultUserSettings(): UserSettings {
  return {
    account: {
      emailNotifications: true,
      loginAlerts: true
    },
    preferences: {
      interfaceDensity: 'comfortable',
      preferredLanguage: 'ar',
      ttsAccent: 'eg',
      dailyReminder: true,
      weeklyReport: true,
      weakConceptAlerts: true,
      examCountdown: true
    },
    privacy: {
      profileVisibility: 'public',
      activityVisibility: 'private',
      showBadges: true,
      saveChatHistory: true,
      allowAnonymousProductAnalytics: false
    }
  };
}

export function defaultBadges(role: UserRole) {
  const common = [{ id: 'founding-profile', label: 'Founding profile', earnedAt: null }];
  if (role === 'teacher') return [...common, { id: 'mentor-ready', label: 'Mentor ready', earnedAt: null }];
  if (role === 'parent') return [...common, { id: 'family-link', label: 'Family link', earnedAt: null }];
  if (role === 'school_admin') return [...common, { id: 'school-builder', label: 'School builder', earnedAt: null }];
  return [...common, { id: 'week-streak', label: 'Week streak', earnedAt: null }];
}

export function buildBaseUserProfile(input: {
  uid: string;
  email: string | null;
  displayName?: string | null;
  photoURL?: string | null;
  isAnonymous?: boolean;
  username?: string;
  role?: unknown;
}) {
  const role = input.isAnonymous ? 'guest' : resolveUserRole(input.email, input.role);
  const username = input.username && isValidUsername(input.username)
    ? normalizeUsername(input.username)
    : usernameFromEmail(input.email, input.uid);

  return {
    uid: input.uid,
    displayName: input.displayName ?? (input.isAnonymous ? 'Guest' : ''),
    email: input.email ?? null,
    photoURL: input.photoURL ?? null,
    isAnonymous: !!input.isAnonymous,
    username,
    role,
    title: role === 'teacher' ? 'Teacher' : role === 'parent' ? 'Parent' : 'Learner',
    description: '',
    coverURL: '',
    locale: 'ar',
    grade: 'g3',
    track: 'sci_sci',
    subjects: ['physics', 'chemistry', 'math'],
    streak: 0,
    xp: 0,
    badges: defaultBadges(role),
    settings: defaultUserSettings(),
    onboardingCompleted: false
  };
}

