/**
 * One-shot Firestore seed.
 *
 * Auth methods (any one):
 *   1) GOOGLE_APPLICATION_CREDENTIALS=path/to/serviceAccountKey.json
 *   2) FIREBASE_SERVICE_ACCOUNT='<json string>'
 *   3) `gcloud auth application-default login` (uses ADC)
 *
 * Run:   npm run seed
 */
import 'dotenv/config';
import { cert, getApps, initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const PROJECT = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? 'khsosy';

if (!getApps().length) {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)), projectId: PROJECT });
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    initializeApp({ credential: applicationDefault(), projectId: PROJECT });
  } else {
    initializeApp({ projectId: PROJECT });
  }
}

const db = getFirestore();
const now = () => FieldValue.serverTimestamp();

async function seedSubjects() {
  const subjects = [
    { id: 'physics',   ar: 'فيزياء',     en: 'Physics',    hue: 'sky' },
    { id: 'chemistry', ar: 'كيمياء',     en: 'Chemistry',  hue: 'violet' },
    { id: 'biology',   ar: 'أحياء',       en: 'Biology',    hue: 'emerald' },
    { id: 'math',      ar: 'رياضيات',     en: 'Math',       hue: 'cyan' },
    { id: 'arabic',    ar: 'لغة عربية',  en: 'Arabic',     hue: 'amber' },
    { id: 'english',   ar: 'لغة انجليزية',en: 'English',   hue: 'indigo' },
    { id: 'history',   ar: 'تاريخ',       en: 'History',    hue: 'rose' }
  ];
  const batch = db.batch();
  for (const s of subjects) {
    batch.set(db.collection('subjects').doc(s.id), { ...s, createdAt: now() }, { merge: true });
  }
  await batch.commit();
  console.log(`✓ subjects (${subjects.length})`);
}

async function seedTextbooks() {
  const books = [
    { id: 'phys-g12-2025', subjectId: 'physics',   ar: 'الفيزياء — الصف الثالث الثانوي ٢٠٢٥', en: 'Physics — G12 (2025)',    grade: 'g3', pages: 312, indexed: true },
    { id: 'chem-g12-2025', subjectId: 'chemistry', ar: 'الكيمياء — الصف الثالث الثانوي ٢٠٢٥', en: 'Chemistry — G12 (2025)', grade: 'g3', pages: 288, indexed: true },
    { id: 'math-g12-2025', subjectId: 'math',      ar: 'الرياضيات البحتة — ٢٠٢٥',              en: 'Pure Math — G12 (2025)',  grade: 'g3', pages: 256, indexed: false },
    { id: 'bio-g12-2025',  subjectId: 'biology',   ar: 'الأحياء — الصف الثالث الثانوي ٢٠٢٥',  en: 'Biology — G12 (2025)',    grade: 'g3', pages: 244, indexed: true },
    { id: 'ar-g12-2025',   subjectId: 'arabic',    ar: 'النصوص والقراءة — ٢٠٢٥',                en: 'Arabic Texts — G12',      grade: 'g3', pages: 180, indexed: true },
    { id: 'hist-g12-2025', subjectId: 'history',   ar: 'التاريخ — ٢٠٢٥',                          en: 'History — G12 (2025)',   grade: 'g3', pages: 220, indexed: false }
  ];
  const batch = db.batch();
  for (const b of books) {
    batch.set(db.collection('textbooks').doc(b.id), { ...b, source: 'MOE', createdAt: now() }, { merge: true });
  }
  await batch.commit();
  console.log(`✓ textbooks (${books.length})`);
}

async function seedChapters() {
  const chapters = [
    { id: 'phys-ch4', textbookId: 'phys-g12-2025', n: 4, ar: 'الغازات', en: 'Gases', concepts: 18 },
    { id: 'phys-ch5', textbookId: 'phys-g12-2025', n: 5, ar: 'الترموديناميكا', en: 'Thermodynamics', concepts: 22 },
    { id: 'phys-ch6', textbookId: 'phys-g12-2025', n: 6, ar: 'الكهرومغناطيسية', en: 'Electromagnetism', concepts: 31 },
    { id: 'chem-ch2', textbookId: 'chem-g12-2025', n: 2, ar: 'التحليل الكمي', en: 'Quantitative analysis', concepts: 14 },
    { id: 'chem-ch3', textbookId: 'chem-g12-2025', n: 3, ar: 'الكيمياء العضوية', en: 'Organic chemistry', concepts: 26 },
    { id: 'math-ch3', textbookId: 'math-g12-2025', n: 3, ar: 'التفاضل والتكامل', en: 'Differential & integral calculus', concepts: 24 }
  ];
  const batch = db.batch();
  for (const c of chapters) batch.set(db.collection('chapters').doc(c.id), { ...c, createdAt: now() }, { merge: true });
  await batch.commit();
  console.log(`✓ chapters (${chapters.length})`);
}

async function seedConcepts() {
  const concepts = [
    { id: 'boyle',     subject: 'physics',   chapter: 'phys-ch4', ar: 'قانون بويل',           en: "Boyle's law",          difficulty: 0.3, prereqs: [] as string[] },
    { id: 'charles',   subject: 'physics',   chapter: 'phys-ch4', ar: 'قانون شارل',           en: "Charles' law",         difficulty: 0.3, prereqs: ['kelvin'] },
    { id: 'gay-lus',   subject: 'physics',   chapter: 'phys-ch4', ar: 'قانون جاي-لوساك',      en: 'Gay-Lussac law',       difficulty: 0.4, prereqs: ['kelvin'] },
    { id: 'ideal-gas', subject: 'physics',   chapter: 'phys-ch4', ar: 'قانون الغاز المثالي',   en: 'Ideal gas law',        difficulty: 0.6, prereqs: ['boyle','charles','gay-lus'] },
    { id: 'kelvin',    subject: 'physics',   chapter: 'phys-ch4', ar: 'مقياس كلفن',           en: 'Kelvin scale',         difficulty: 0.2, prereqs: [] },
    { id: 'moles',     subject: 'physics',   chapter: 'phys-ch4', ar: 'المولات n',            en: 'Moles n',              difficulty: 0.4, prereqs: [] },
    { id: 'isolate-t', subject: 'physics',   chapter: 'phys-ch4', ar: 'عزل المتغير T',        en: 'Isolate T from PV=nRT', difficulty: 0.7, prereqs: ['ideal-gas'] },
    { id: 'thermo-1',  subject: 'physics',   chapter: 'phys-ch5', ar: 'القانون الأول للديناميكا الحرارية', en: '1st law of thermodynamics', difficulty: 0.7, prereqs: ['ideal-gas'] },
    { id: 'titration', subject: 'chemistry', chapter: 'chem-ch2', ar: 'المعايرة الحمضية',     en: 'Acid-base titration',  difficulty: 0.6, prereqs: [] },
    { id: 'limits',    subject: 'math',      chapter: 'math-ch3', ar: 'النهايات',              en: 'Limits',               difficulty: 0.5, prereqs: [] },
    { id: 'derivs',    subject: 'math',      chapter: 'math-ch3', ar: 'قواعد الاشتقاق',        en: 'Derivative rules',     difficulty: 0.5, prereqs: ['limits'] },
    { id: 'integrals', subject: 'math',      chapter: 'math-ch3', ar: 'التكامل',                en: 'Integration',          difficulty: 0.7, prereqs: ['derivs'] }
  ];
  const batch = db.batch();
  for (const c of concepts) batch.set(db.collection('concepts').doc(c.id), { ...c, createdAt: now() }, { merge: true });
  await batch.commit();
  console.log(`✓ concepts (${concepts.length})`);
}

async function seedQuizQuestions() {
  const qs = [
    {
      id: 'q-boyle-1', conceptId: 'boyle', subject: 'physics', kind: 'mcq',
      ar: 'لو ضغط غاز ٢ atm وحجمه ٤ لتر، عند ثبات الحرارة، إيه حجمه لو الضغط بقى ٤ atm؟',
      en: 'A gas at 2 atm occupies 4 L. At constant T, what is its volume at 4 atm?',
      choices: [
        { id: 'a', ar: '٨ لتر', en: '8 L' },
        { id: 'b', ar: '٤ لتر', en: '4 L' },
        { id: 'c', ar: '٢ لتر', en: '2 L' },
        { id: 'd', ar: '١ لتر', en: '1 L' }
      ],
      answer: 'c'
    },
    {
      id: 'q-gaylus-1', conceptId: 'gay-lus', subject: 'physics', kind: 'short',
      ar: 'لما الحرارة بتزيد عند ثبات الحجم، الضغط بـ ___',
      en: 'At constant volume, raising temperature causes pressure to ___',
      acceptableAnswers: ['rise', 'زاد', 'يزيد', 'increase', 'increases']
    },
    {
      id: 'q-isolate-1', conceptId: 'isolate-t', subject: 'physics', kind: 'order',
      ar: 'رتّب الخطوات لحساب T من PV=nRT',
      en: 'Order the steps to compute T from PV=nRT',
      items: [
        { id: 's1', ar: 'حدّد المعطيات: P, V, n, R', en: 'List knowns: P, V, n, R' },
        { id: 's2', ar: 'اقسم الطرفين على n·R',       en: 'Divide both sides by n·R' },
        { id: 's3', ar: 'اكتب: T = (P·V) / (n·R)',     en: 'Write: T = (P·V) / (n·R)' },
        { id: 's4', ar: 'حوّل الإجابة لكلفن إذا لزم',  en: 'Convert answer to Kelvin if needed' }
      ],
      answer: ['s1', 's2', 's3', 's4']
    },
    {
      id: 'q-titr-1', conceptId: 'titration', subject: 'chemistry', kind: 'mcq',
      ar: 'الكاشف اللي بنستخدمه في معايرة حمض قوي مع قاعدة قوية:',
      en: 'Suitable indicator for strong acid vs strong base titration:',
      choices: [
        { id: 'a', ar: 'فينول فثالين', en: 'Phenolphthalein' },
        { id: 'b', ar: 'ميثيل البرتقالي', en: 'Methyl orange' },
        { id: 'c', ar: 'تورنسول', en: 'Litmus' },
        { id: 'd', ar: 'كل ما سبق', en: 'All of the above' }
      ],
      answer: 'd'
    },
    {
      id: 'q-limit-1', conceptId: 'limits', subject: 'math', kind: 'short',
      ar: 'احسب: lim (x→0) sin(x)/x',
      en: 'Evaluate: lim (x→0) sin(x)/x',
      acceptableAnswers: ['1', '1.0', 'one', 'واحد']
    }
  ];
  const batch = db.batch();
  for (const q of qs) batch.set(db.collection('quizQuestions').doc(q.id), { ...q, createdAt: now() }, { merge: true });
  await batch.commit();
  console.log(`✓ quizQuestions (${qs.length})`);
}

async function seedDemoUsers() {
  const users = [
    {
      uid: 'demo-youssef', username: 'youssef', displayName: 'Youssef Sherif', email: 'youssef@demo.5sosy.app',
      isAnonymous: false, locale: 'ar', grade: 'g3', track: 'sci_sci',
      subjects: ['physics', 'chemistry', 'biology', 'math', 'arabic'],
      streak: 7, xp: 1240
    },
    {
      uid: 'demo-farida', username: 'farida', displayName: 'Farida El-Sayed', email: 'farida@demo.5sosy.app',
      isAnonymous: false, locale: 'ar', grade: 'g2', track: 'sci_math',
      subjects: ['physics', 'chemistry', 'math', 'arabic', 'english'],
      streak: 12, xp: 2480
    },
    {
      uid: 'demo-ahmed', username: 'ahmed', displayName: 'Ahmed Hassan', email: 'ahmed@demo.5sosy.app',
      isAnonymous: false, locale: 'en', grade: 'g3', track: 'lit',
      subjects: ['arabic', 'history', 'geography', 'philosophy', 'english'],
      streak: 3, xp: 540
    }
  ];

  for (const u of users) {
    const ref = db.collection('users').doc(u.uid);
    await ref.set({ ...u, createdAt: now(), lastSeenAt: now() }, { merge: true });

    // Sub-collections
    await ref.collection('mastery').doc('boyle').set({ conceptId: 'boyle', mastery: 0.82, lastSeenAt: now() });
    await ref.collection('mastery').doc('isolate-t').set({ conceptId: 'isolate-t', mastery: 0.28, lastSeenAt: now() });
    await ref.collection('mastery').doc('titration').set({ conceptId: 'titration', mastery: 0.45, lastSeenAt: now() });

    await ref.collection('quizAttempts').add({
      subject: 'physics', conceptId: 'isolate-t', score: 0.67,
      durationSec: 222, createdAt: now()
    });
    await ref.collection('quizAttempts').add({
      subject: 'chemistry', conceptId: 'titration', score: 0.5,
      durationSec: 180, createdAt: now()
    });

    await ref.collection('activity').add({
      agent: 'AssessmentAgent', text: 'Updated your gas-laws score → 32%',
      createdAt: now()
    });
    await ref.collection('activity').add({
      agent: 'PedagogyAgent', text: 'Found 2 new weak concepts in Thermo ch.',
      createdAt: now()
    });

    await ref.collection('studyPlans').doc('today').set({
      blocks: [
        { id: 1, subject: 'physics',   dur: 25, type: 'review',   conceptId: 'boyle' },
        { id: 2, subject: 'physics',   dur: 15, type: 'quiz',     conceptId: 'isolate-t' },
        { id: 3, subject: 'chemistry', dur: 20, type: 'lesson',   conceptId: 'titration' },
        { id: 4, subject: 'math',      dur: 30, type: 'practice', conceptId: 'derivs' },
        { id: 5, subject: 'arabic',    dur: 15, type: 'audio',    conceptId: 'arabic-poetry' },
        { id: 6, subject: 'physics',   dur: 20, type: 'oral',     conceptId: 'thermo-1' }
      ],
      generatedBy: 'PlannerAgent', generatedAt: now()
    });
  }
  console.log(`✓ demo users (${users.length}) with mastery/quizAttempts/activity/studyPlans`);
}

async function main() {
  console.log(`Seeding project: ${PROJECT}`);
  await seedSubjects();
  await seedTextbooks();
  await seedChapters();
  await seedConcepts();
  await seedQuizQuestions();
  await seedDemoUsers();
  console.log('\n✓ Done.');
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
