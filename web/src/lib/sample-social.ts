import type { UserRole } from './roles';

export const MAX_IMAGE_ATTACHMENT_BYTES = 2 * 1024 * 1024;

export type SampleUser = {
  uid: string;
  username: string;
  displayName: string;
  email: string;
  role: UserRole;
  title: string;
  description: string;
  grade?: string;
  schoolId?: string;
  parentUids?: string[];
  childUids?: string[];
};

export const SAMPLE_SCHOOL = {
  id: 'egypt-public-demo-school',
  slug: 'egypt-public-demo-school',
  name: 'Egypt Public Demo School',
  type: 'public',
  country: 'Egypt',
  city: 'Cairo',
  description: 'Reference public-school profile scaffold for 5sosy relationship mapping.',
  websiteUrl: 'https://moe.gov.eg',
  externalLinks: [
    { label: 'Ministry of Education', url: 'https://moe.gov.eg' },
    { label: 'Google Maps', url: 'https://maps.google.com/?q=Cairo+Egypt+public+school' }
  ],
  map: {
    provider: 'google',
    placeQuery: 'public school Cairo Egypt',
    lat: 30.0444,
    lng: 31.2357
  },
  adminUid: 'demo-school-admin',
  teacherUids: ['demo-teacher-mona'],
  studentUids: ['demo-youssef']
};

export const SAMPLE_USERS: SampleUser[] = [
  {
    uid: 'demo-school-admin',
    username: 'school-admin-cairo',
    displayName: 'Nadia Samir',
    email: 'school.admin@demo.5sosy.app',
    role: 'school_admin',
    title: 'School Admin',
    description: 'Maintains staff, school profile, groups, and relationship maps.',
    schoolId: SAMPLE_SCHOOL.id
  },
  {
    uid: 'demo-teacher-mona',
    username: 'mona-physics',
    displayName: 'Mona Abdelrahman',
    email: 'mona.teacher@demo.5sosy.app',
    role: 'teacher',
    title: 'Physics Teacher',
    description: 'Supports G12 physics groups and timetable progress checkpoints.',
    schoolId: SAMPLE_SCHOOL.id
  },
  {
    uid: 'demo-parent-omar',
    username: 'omar-parent',
    displayName: 'Omar Sherif',
    email: 'omar.parent@demo.5sosy.app',
    role: 'parent',
    title: 'Parent',
    description: 'Reviews child progress, timetables, and parent consent links.',
    childUids: ['demo-youssef']
  },
  {
    uid: 'demo-youssef',
    username: 'youssef',
    displayName: 'Youssef Sherif',
    email: 'youssef@demo.5sosy.app',
    role: 'student',
    title: 'G12 Science Student',
    description: 'Studying physics, chemistry, math, and Arabic with 5sosy.',
    grade: 'g3',
    schoolId: SAMPLE_SCHOOL.id,
    parentUids: ['demo-parent-omar']
  }
];

export const SAMPLE_GROUPS = [
  {
    id: 'g12-physics-ar',
    name: 'G12 Physics - Arabic',
    grade: 'g3',
    subject: 'physics',
    language: 'ar',
    adminUids: ['demo-teacher-mona'],
    memberCount: 128,
    description: 'Automatically generated grade/subject/language discussion group.',
    threads: [
      {
        id: 'thread-gases',
        title: 'How should we pace gas laws before the mock exam?',
        author: 'Mona Abdelrahman',
        replies: 14,
        links: ['https://moe.gov.eg']
      },
      {
        id: 'thread-pv',
        title: 'PV=nRT problem set with common mistakes',
        author: 'Youssef Sherif',
        replies: 8,
        links: []
      }
    ]
  },
  {
    id: 'g12-math-en',
    name: 'G12 Math - English',
    grade: 'g3',
    subject: 'mathematics',
    language: 'en',
    adminUids: ['demo-school-admin'],
    memberCount: 64,
    description: 'Auto group for math learners using English explanations.',
    threads: []
  }
];

export const GROUP_ACTIVITY_IDEAS = [
  'Teacher-led weekly checkpoints',
  'Parent-visible progress summaries',
  'Peer problem-solving rooms',
  'Exam countdown rooms',
  'Book-page pinpoint requests',
  'AI-generated revision challenges',
  'School-specific announcements'
];

export const SAMPLE_TIMETABLES = {
  schoolWeek: [
    { day: 'Sun', time: '08:00', subject: 'Physics', location: 'Lab 2' },
    { day: 'Sun', time: '10:00', subject: 'Math', location: 'Room 14' },
    { day: 'Mon', time: '09:00', subject: 'Chemistry', location: 'Lab 1' },
    { day: 'Tue', time: '11:00', subject: 'Arabic', location: 'Room 7' },
    { day: 'Wed', time: '08:00', subject: 'Biology', location: 'Lab 3' }
  ],
  exams: [
    { date: '2026-06-08', subject: 'Physics', scope: 'Gases and thermodynamics' },
    { date: '2026-06-12', subject: 'Chemistry', scope: 'Quantitative analysis' },
    { date: '2026-06-16', subject: 'Math', scope: 'Calculus and algebra' }
  ],
  generatedStudyPlan: [
    { day: 'Sat', start: '17:00', end: '18:00', subject: 'Physics', reason: 'Exam proximity' },
    { day: 'Sat', start: '20:00', end: '20:30', subject: 'Math', reason: 'Weak topic refresh' },
    { day: 'Sun', start: '18:30', end: '19:15', subject: 'Chemistry', reason: 'School pace match' },
    { day: 'Mon', start: '21:00', end: '21:25', subject: 'Arabic', reason: 'Light review before sleep' }
  ],
  revisions: [
    { id: 'plan-v3', label: 'Current balanced plan', createdAt: '2026-05-28T12:00:00.000Z' },
    { id: 'plan-v2', label: 'Exam-heavy plan', createdAt: '2026-05-26T16:20:00.000Z' },
    { id: 'plan-v1', label: 'Initial onboarding plan', createdAt: '2026-05-24T09:10:00.000Z' }
  ]
};

export const SAMPLE_ADMIN_KPIS = [
  { label: 'Users', value: '1,248', delta: '+12%' },
  { label: 'Schools', value: '18', delta: '+3' },
  { label: 'Groups', value: '96', delta: '+24 auto' },
  { label: 'Messages', value: '8.4k', delta: '+31%' },
  { label: 'Plans generated', value: '2.1k', delta: '+18%' },
  { label: 'Pending consent', value: '14', delta: '-5' }
];

