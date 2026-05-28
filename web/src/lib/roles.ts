export type UserRole =
  | 'super_admin'
  | 'admin'
  | 'student'
  | 'parent'
  | 'teacher'
  | 'lifelong_learner'
  | 'school_admin'
  | 'guest';

export type PermissionKey =
  | 'manage_roles'
  | 'manage_profiles'
  | 'manage_schools'
  | 'manage_groups'
  | 'view_admin_dashboard'
  | 'view_relationship_maps'
  | 'message_users'
  | 'join_groups'
  | 'manage_child_profiles'
  | 'manage_school_staff'
  | 'edit_own_profile'
  | 'view_activity_history';

export const SUPER_ADMIN_EMAIL = 'hesham1988@gmail.com';
export const MIN_PARENT_CONSENT_AGE = 13;

export const ONBOARDING_ROLES: UserRole[] = [
  'student',
  'parent',
  'teacher',
  'lifelong_learner',
  'school_admin'
];

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  student: 'Student',
  parent: 'Parent',
  teacher: 'Teacher',
  lifelong_learner: 'Lifelong Learner',
  school_admin: 'School Admin',
  guest: 'Guest'
};

export const ROLE_STYLES: Record<UserRole, { accent: string; soft: string; ring: string }> = {
  super_admin: {
    accent: 'bg-slate-950 text-white',
    soft: 'bg-slate-100 text-slate-800',
    ring: 'ring-slate-900'
  },
  admin: {
    accent: 'bg-cyan-700 text-white',
    soft: 'bg-cyan-50 text-cyan-800',
    ring: 'ring-cyan-600'
  },
  student: {
    accent: 'bg-sky-600 text-white',
    soft: 'bg-sky-50 text-sky-800',
    ring: 'ring-sky-500'
  },
  parent: {
    accent: 'bg-emerald-600 text-white',
    soft: 'bg-emerald-50 text-emerald-800',
    ring: 'ring-emerald-500'
  },
  teacher: {
    accent: 'bg-amber-600 text-white',
    soft: 'bg-amber-50 text-amber-800',
    ring: 'ring-amber-500'
  },
  lifelong_learner: {
    accent: 'bg-violet-600 text-white',
    soft: 'bg-violet-50 text-violet-800',
    ring: 'ring-violet-500'
  },
  school_admin: {
    accent: 'bg-indigo-600 text-white',
    soft: 'bg-indigo-50 text-indigo-800',
    ring: 'ring-indigo-500'
  },
  guest: {
    accent: 'bg-stone-600 text-white',
    soft: 'bg-stone-100 text-stone-700',
    ring: 'ring-stone-400'
  }
};

export const ROLE_PERMISSIONS: Record<UserRole, PermissionKey[]> = {
  super_admin: [
    'manage_roles',
    'manage_profiles',
    'manage_schools',
    'manage_groups',
    'view_admin_dashboard',
    'view_relationship_maps',
    'message_users',
    'join_groups',
    'manage_child_profiles',
    'manage_school_staff',
    'edit_own_profile',
    'view_activity_history'
  ],
  admin: [
    'manage_profiles',
    'manage_schools',
    'manage_groups',
    'view_admin_dashboard',
    'view_relationship_maps',
    'message_users',
    'join_groups',
    'edit_own_profile',
    'view_activity_history'
  ],
  school_admin: [
    'manage_schools',
    'manage_groups',
    'view_relationship_maps',
    'message_users',
    'join_groups',
    'manage_school_staff',
    'edit_own_profile',
    'view_activity_history'
  ],
  teacher: ['message_users', 'join_groups', 'manage_groups', 'edit_own_profile', 'view_activity_history'],
  parent: ['message_users', 'join_groups', 'manage_child_profiles', 'edit_own_profile', 'view_activity_history'],
  student: ['message_users', 'join_groups', 'edit_own_profile', 'view_activity_history'],
  lifelong_learner: ['message_users', 'join_groups', 'edit_own_profile', 'view_activity_history'],
  guest: []
};

export function normalizeEmail(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase();
}

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  return normalizeEmail(email) === SUPER_ADMIN_EMAIL;
}

export function isUnderParentConsentAge(age: unknown): boolean {
  const n = Number(age);
  return Number.isFinite(n) && n > 0 && n < MIN_PARENT_CONSENT_AGE;
}

export function normalizeRole(input: unknown): UserRole | null {
  if (typeof input !== 'string') return null;
  return ([
    'super_admin',
    'admin',
    'student',
    'parent',
    'teacher',
    'lifelong_learner',
    'school_admin',
    'guest'
  ] as const).includes(input as UserRole)
    ? (input as UserRole)
    : null;
}

export function onboardingRole(input: unknown): UserRole {
  const role = normalizeRole(input);
  return role && ONBOARDING_ROLES.includes(role) ? role : 'student';
}

export function resolveUserRole(email: string | null | undefined, requestedRole?: unknown): UserRole {
  if (isSuperAdminEmail(email)) return 'super_admin';
  return onboardingRole(requestedRole);
}

export function hasPermission(role: UserRole | null | undefined, permission: PermissionKey): boolean {
  const effectiveRole = role ?? 'guest';
  return ROLE_PERMISSIONS[effectiveRole].includes(permission);
}

export function canAssignRole(actorRole: UserRole, targetRole: UserRole): boolean {
  if (actorRole === 'super_admin') return targetRole !== 'super_admin';
  if (actorRole === 'admin') {
    return !['super_admin', 'admin'].includes(targetRole);
  }
  return false;
}

