import type { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SimStep = {
  key: string;
  input_type: 'text' | 'number' | 'choice' | 'multi_choice' | 'avatar' | 'upload';
  ar: string;
  en: string;
  options?: { id: string; ar: string; en: string }[];
};

const SIM_PLAN: SimStep[] = [
  { key: 'preferredName', input_type: 'text', ar: 'أهلاً! إيه الاسم اللي تحب أناديك بيه؟', en: 'Hi! What would you like me to call you?' },
  { key: 'age',            input_type: 'number', ar: 'كم سنك؟', en: 'How old are you?' },
  { key: 'yearOfEducation', input_type: 'choice', ar: 'في أي صف دراسي؟', en: 'What grade are you in?', options: [
    { id: 'G10', ar: 'الأول الثانوي',  en: 'Grade 10' },
    { id: 'G11', ar: 'الثاني الثانوي', en: 'Grade 11' },
    { id: 'G12', ar: 'الثالث الثانوي', en: 'Grade 12' },
    { id: 'other', ar: 'غير ذلك',      en: 'Other' }
  ]},
  { key: 'location', input_type: 'text', ar: 'فين عايش؟ (المدينة، الدولة)', en: 'Where do you live? (city, country)' },
  { key: 'curriculum', input_type: 'choice', ar: 'إيه المنهج اللي بتدرسه؟', en: 'Which curriculum do you follow?', options: [
    { id: 'thanaweya', ar: 'الثانوية العامة', en: 'Thanaweya Amma' },
    { id: 'IB',        ar: 'بكالوريا دولية (IB)', en: 'IB' },
    { id: 'AP',        ar: 'AP الأمريكية', en: 'AP (American)' },
    { id: 'GCSE',      ar: 'GCSE البريطانية', en: 'GCSE (British)' },
    { id: 'other',     ar: 'منهج آخر', en: 'Other' }
  ]},
  { key: 'favoriteSubjects', input_type: 'multi_choice', ar: 'إيه المواد اللي بتحبها أكتر؟', en: 'Which subjects do you love the most?', options: [
    { id: 'physics',   ar: 'فيزياء',     en: 'Physics' },
    { id: 'chemistry', ar: 'كيمياء',     en: 'Chemistry' },
    { id: 'biology',   ar: 'أحياء',       en: 'Biology' },
    { id: 'math',      ar: 'رياضيات',     en: 'Math' },
    { id: 'arabic',    ar: 'لغة عربية',  en: 'Arabic' },
    { id: 'english',   ar: 'لغة انجليزية', en: 'English' },
    { id: 'history',   ar: 'تاريخ',       en: 'History' },
    { id: 'geography', ar: 'جغرافيا',     en: 'Geography' }
  ]},
  { key: 'reason', input_type: 'text', ar: 'إيه اللي جابك لـ5sosy؟', en: 'What brought you to 5sosy?' },
  { key: 'goals',  input_type: 'text', ar: 'إيه هدفك في الشهر الجاي؟', en: "What's your goal for the next month?" },
  { key: 'customBooks', input_type: 'upload', ar: 'عندك كتب أو ملازم خاصة بيك تحب أذاكر معاك منها؟ (اختياري)', en: "Have any of your own books or notes you'd like me to study with you? (optional)" },
  { key: 'avatar', input_type: 'avatar', ar: 'آخر خطوة — اختار شكلك (avatar)!', en: 'Last step — pick an avatar!' }
];

function nextSimStep(collected: Record<string, unknown>): SimStep | null {
  for (const step of SIM_PLAN) {
    if (collected[step.key] === undefined || collected[step.key] === null) return step;
  }
  return null;
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
