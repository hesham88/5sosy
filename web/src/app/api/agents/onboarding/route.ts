import type { NextRequest } from 'next/server';
import { MIN_PARENT_CONSENT_AGE } from '@/lib/roles';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SimStep = {
  key: string;
  input_type: 'text' | 'number' | 'choice' | 'avatar';
  ar: string;
  en: string;
  options?: { id: string; ar: string; en: string }[];
  // When the user picked "other" on this key, the next turn re-asks the same
  // key as a free-text question so they can type their own answer.
  otherFollowupAr?: string;
  otherFollowupEn?: string;
};

const SIM_PLAN: SimStep[] = [
  { key: 'preferredName', input_type: 'text', ar: 'أهلاً! إيه الاسم اللي تحب أناديك بيه؟', en: 'Hi! What would you like me to call you?' },
  { key: 'age',            input_type: 'number', ar: 'كم سنك؟', en: 'How old are you?' },
  { key: 'country', input_type: 'text', ar: 'في أي دولة عايش؟', en: 'Which country do you live in?' },
  { key: 'role', input_type: 'choice',
    ar: 'ما هو دورك الأساسي في خصوصي؟',
    en: 'Which role best describes you on 5sosy?',
    options: [
      { id: 'student', ar: 'طالب', en: 'Student' },
      { id: 'parent', ar: 'ولي أمر', en: 'Parent' },
      { id: 'teacher', ar: 'معلم', en: 'Teacher' },
      { id: 'lifelong_learner', ar: 'متعلم مدى الحياة', en: 'Lifelong learner' },
      { id: 'school_admin', ar: 'إداري مدرسة', en: 'School admin' }
    ]
  },
  { key: 'parentEmail', input_type: 'text',
    ar: 'تحتاج إلى موافقة ولي الأمر لأن سنك أقل من 13 سنة. ما هو البريد الإلكتروني لولي أمرك؟',
    en: 'You need parent approval since you are under 13. What is your parent email?' },
  { key: 'yearOfEducation', input_type: 'choice',
    ar: 'في أي سنة دراسية؟', en: 'What year of education are you in?',
    otherFollowupAr: 'تمام، اكتب صفك أو سنتك الدراسية بالظبط.',
    otherFollowupEn: 'OK — what\'s your exact grade or year?',
    options: [
      { id: 'G10', ar: 'الصف العاشر',     en: 'Grade 10' },
      { id: 'G11', ar: 'الصف الحادي عشر', en: 'Grade 11' },
      { id: 'G12', ar: 'الصف الثاني عشر', en: 'Grade 12' },
      { id: 'bachelor1', ar: 'الجامعة، سنة أولى', en: "Bachelor's, year 1" },
      { id: 'bachelor2', ar: 'الجامعة، سنة ثانية', en: "Bachelor's, year 2" },
      { id: 'bachelor3', ar: 'الجامعة، سنة ثالثة', en: "Bachelor's, year 3" },
      { id: 'bachelor4', ar: 'الجامعة، سنة رابعة', en: "Bachelor's, year 4" },
      { id: 'graduate',  ar: 'دراسات عليا',         en: 'Graduate' },
      { id: 'other',     ar: 'غير ذلك',              en: 'Other' },
      { id: 'skip',      ar: 'تخطى',                 en: 'Skip' }
    ]
  },
  { key: 'interests', input_type: 'text',
    ar: 'إيه المواضيع اللي بتشدك؟ مواد بتحبها، حاجات نفسك تعرفها، هوايات — أي حاجة في بالك.',
    en: 'What topics interest you the most? Subjects you love, things you want to learn, hobbies — anything on your mind.' },
  { key: 'avatar', input_type: 'avatar', ar: 'آخر خطوة — اختار شكلك (avatar)!', en: 'Last step — pick an avatar!' }
];

// Returns the next step OR a follow-up version of the current step if the user
// picked "other" on a choice question that supports it.
function nextSimStep(collected: Record<string, unknown>): SimStep | null {
  for (const step of SIM_PLAN) {
    if (step.key === 'parentEmail' && !isUnderage(collected.age)) continue;
    const v = collected[step.key];
    if (v === undefined || v === null) return step;
    // "other" on choice steps → re-emit as a free-text follow-up with the same key.
    if (v === 'other' && step.otherFollowupAr && step.otherFollowupEn) {
      return {
        ...step,
        input_type: 'text',
        ar: step.otherFollowupAr,
        en: step.otherFollowupEn,
        options: undefined
      };
    }
    // "skip" is a valid answer — move on.
  }
  return null;
}

function isUnderage(age: unknown): boolean {
  const n = Number(age);
  return Number.isFinite(n) && n > 0 && n < MIN_PARENT_CONSENT_AGE;
}

function sim(req: { locale: string; collected_so_far?: Record<string, unknown>; session_id?: string }): Response {
  const sessionId = req.session_id ?? crypto.randomUUID().replace(/-/g, '');
  const startedAt = new Date().toISOString();
  const collected = req.collected_so_far ?? {};
  const isAR = req.locale === 'ar';
  const step = nextSimStep(collected);

  let nextStep: Record<string, unknown>;
  if (!step) {
    const name = (collected.preferredName as string | undefined) ?? (isAR ? 'صديقي' : 'friend');
    nextStep = {
      kind: 'complete',
      agent_text: isAR ? `تمام يا ${name}! خلصنا — يلا بينا.` : `Great, ${name}! All set — let's go.`,
      profile: collected
    };
    if (isUnderage(collected.age)) {
      nextStep.profile = {
        ...collected,
        parentConsent: {
          status: 'pending',
          parentEmail: collected.parentEmail
        }
      };
    }
  } else {
    nextStep = {
      kind: 'question',
      key: step.key,
      agent_text: isAR ? step.ar : step.en,
      input_type: step.input_type,
      ...(step.options ? { options: step.options } : {})
    };
  }

  const traceStep = {
    index: 0,
    agent: 'onboarding',
    step_type: 'text',
    output: JSON.stringify(nextStep),
    final: true,
    duration_ms: 0
  };
  const turn = {
    session_id: sessionId,
    username: 'guest',
    locale: req.locale,
    next_step: nextStep,
    raw_final: JSON.stringify(nextStep),
    trace: [traceStep],
    started_at: startedAt,
    finished_at: startedAt,
    duration_ms: 0,
    source: 'simulated'
  };

  const body =
    `event: start\ndata: ${JSON.stringify({ session_id: sessionId, started_at: startedAt, source: 'simulated' })}\n\n` +
    `event: step\ndata: ${JSON.stringify(traceStep)}\n\n` +
    `event: turn\ndata: ${JSON.stringify(turn)}\n\n`;

  return new Response(body, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no'
    }
  });
}

export async function POST(req: NextRequest) {
  let payload: Record<string, unknown> = {};
  try {
    payload = (await req.json()) as Record<string, unknown>;
  } catch {
    return new Response('invalid json', { status: 400 });
  }

  const locale = String(payload.locale ?? 'en');
  const collected = (payload.collected_so_far as Record<string, unknown>) ?? {};
  const sessionId = payload.session_id as string | undefined;

  const base = process.env.AGENTS_BASE_URL?.replace(/\/$/, '');
  const apiKey = process.env.AGENTS_API_KEY;

  if (!base || !apiKey) {
    return sim({ locale, collected_so_far: collected, session_id: sessionId });
  }

  const upstream = await fetch(`${base}/v1/onboarding`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey
    },
    body: JSON.stringify(payload)
  }).catch((e) => {
    console.warn('[onboarding] upstream fetch failed:', (e as Error).message);
    return null;
  });

  if (!upstream || !upstream.ok || !upstream.body) {
    return sim({ locale, collected_so_far: collected, session_id: sessionId });
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no'
    }
  });
}
