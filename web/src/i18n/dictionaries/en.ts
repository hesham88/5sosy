const dict = {
  appName: '5sosy',
  appSub: 'Your AI tutor',
  nav: {
    home: 'Home', subjects: 'Subjects', plan: 'Plan',
    practice: 'Practice', oral: 'Oral', progress: 'Progress', settings: 'Settings',
    profile: 'Profile', signOut: 'Sign out'
  },
  cta: { start: 'Get started', next: 'Next', back: 'Back', save: 'Save', finish: 'Finish', skip: 'Skip', signIn: 'Sign in', signUp: 'Sign up' },
  auth: {
    title: 'Welcome to 5sosy',
    sub: 'Sign in to continue your plan and study streak.',
    google: 'Continue with Google',
    anon: 'Continue as guest',
    email: 'Email',
    password: 'Password',
    or: 'or'
  },
  home: {
    greet: 'Hi Youssef 👋',
    sub: 'What are we studying today?',
    intentPh: 'Tell me what you need to study today…',
    examples: [
      'Physics exam in 48 hours',
      "I don't get gas laws",
      'Review history chapter 2',
      'Chemistry — quantitative analysis'
    ],
    plan: "Today's plan",
    planSub: 'Built by the planner from your goal',
    weak: 'Concepts to revisit',
    streak: 'Streak',
    streakDay: 'days in a row',
    xp: 'XP',
    next: 'Upcoming exams',
    activity: '5sosy activity'
  }
} as const;

export default dict;
