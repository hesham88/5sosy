'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { useApp } from '../shared/Providers';
import { Btn, Logo } from '../shared/atoms';
import { useAuth } from '@/lib/firebase/auth-context';
import { useProfile } from '@/lib/firebase/use-profile';
import { getFirebase } from '@/lib/firebase/client';
import { dicebearUrl, randomSeed } from '@/lib/avatar';
import { AVATAR_SEED_PALETTE, AVATAR_STYLES } from '@/constants/onboarding';
import type { AvatarStyle } from '@/lib/types';
import { LanguageSwitcher } from '../shared/LanguageSwitcher';

type InputType = 'text' | 'number' | 'choice' | 'avatar';

type ChoiceOption = {
  id: string;
  ar?: string;
  en?: string;
  // Some agent versions emit a single locale-collapsed `label` instead of
  // ar/en. Tolerate it so buttons don't render empty.
  label?: string;
};

type NextStepQuestion = {
  kind: 'question';
  key: string;
  agent_text: string;
  input_type: InputType;
  options?: ChoiceOption[];
};

function optionLabel(opt: ChoiceOption, isAR: boolean): string {
  const primary = isAR ? opt.ar : opt.en;
  return primary || opt.label || opt.ar || opt.en || opt.id;
}

type NextStepComplete = {
  kind: 'complete';
  agent_text: string;
  profile: Record<string, unknown>;
};

type NextStep = NextStepQuestion | NextStepComplete;

type ChatMsg = { id: string; role: 'agent' | 'user'; text: string };

const uid = () => Math.random().toString(36).slice(2, 10);

async function streamOnboarding(
  body: {
    message: string;
    locale: string;
    username: string;
    session_id?: string;
    collected_so_far: Record<string, unknown>;
  },
  signal: AbortSignal
): Promise<{ next_step: NextStep | null; session_id: string | null }> {
  const res = await fetch('/api/agents/onboarding', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal
  });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let lastTurn: { next_step: NextStep | null; session_id: string | null } = {
    next_step: null,
    session_id: null
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n\n')) !== -1) {
      const frame = buf.slice(0, nl);
      buf = buf.slice(nl + 2);
      let evt = 'message';
      let data = '';
      for (const line of frame.split('\n')) {
        if (line.startsWith('event:')) evt = line.slice(6).trim();
        else if (line.startsWith('data:')) data += line.slice(5).trim();
      }
      if (!data) continue;
      try {
        const parsed = JSON.parse(data);
        if (evt === 'turn') {
          lastTurn = {
            next_step: (parsed.next_step as NextStep | null) ?? null,
            session_id: (parsed.session_id as string | undefined) ?? null
          };
        } else if (evt === 'start') {
          if (typeof parsed.session_id === 'string') lastTurn.session_id = parsed.session_id;
        } else if (evt === 'error') {
          throw new Error(parsed.message || 'agent error');
        }
      } catch {
        // ignore malformed frames
      }
    }
  }

  return lastTurn;
}

export default function OnboardingScreen() {
  const { isAR, t, locale } = useApp();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { profile } = useProfile();

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [collected, setCollected] = useState<Record<string, unknown>>({});
  const [currentStep, setCurrentStep] = useState<NextStepQuestion | null>(null);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const sessionIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // Bootstrap: when sign-in just happened, prefill name from profile/displayName.
  useEffect(() => {
    if (!profile) return;
    setCollected((c) => {
      if (c.preferredName) return c;
      const pref = profile.preferredName || profile.displayName || '';
      return pref ? { ...c, preferredName: pref } : c;
    });
  }, [profile]);

  const username = user?.uid ?? 'guest';

  const sendTurn = useCallback(
    async (answerText: string, answerValue: unknown | null, key: string | null) => {
      setPending(true);
      setError(null);
      const next: Record<string, unknown> =
        key && answerValue !== null ? { ...collected, [key]: answerValue } : { ...collected };
      setCollected(next);
      if (answerText.trim()) {
        setMessages((m) => [...m, { id: uid(), role: 'user', text: answerText }]);
      }
      // Abort any previous in-flight request — protects against rapid double-sends
      // and against React Strict Mode replaying the bootstrap effect in dev.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const result = await streamOnboarding(
          {
            message: answerText,
            locale,
            username,
            session_id: sessionIdRef.current ?? undefined,
            collected_so_far: next
          },
          controller.signal
        );
        if (controller.signal.aborted) return; // superseded by a newer request
        if (result.session_id) sessionIdRef.current = result.session_id;
        const step = result.next_step;
        if (!step) {
          setError(t.onboarding.connectionError);
          setPending(false);
          return;
        }
        setMessages((m) => [...m, { id: uid(), role: 'agent', text: step.agent_text }]);
        if (step.kind === 'complete') {
          setCurrentStep(null);
          await persistAndExit(step.profile);
          return;
        }
        setCurrentStep(step);
        setPending(false);
      } catch (e) {
        const err = e as { name?: string; message?: string };
        // Expected when a turn is superseded (Strict Mode replay, rapid resends,
        // unmount). Don't surface to the user.
        if (err?.name === 'AbortError' || controller.signal.aborted) return;
        setError(err?.message || 'unknown');
        setPending(false);
      }
    },
    // persistAndExit captured below; intentionally not in deps (stable via ref usage)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [collected, locale, username, t]
  );

  const persistAndExit = useCallback(
    async (finalProfile: Record<string, unknown>) => {
      if (!user) return;
      setFinishing(true);
      try {
        const { db } = getFirebase();
        const userRef = doc(db, 'users', user.uid);
        const provider = (process.env.NEXT_PUBLIC_DATABASE_PROVIDER || 'firestore').toLowerCase();

        const profileWrite: Record<string, unknown> = {
          ...finalProfile,
          onboardingCompleted: true,
          onboardingCompletedAt: provider === 'mongodb' ? new Date().toISOString() : serverTimestamp()
        };

        if (provider === 'mongodb') {
          const token = await user.getIdToken();
          const writeRes = await fetch('/api/users/profile', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'content-type': 'application/json'
            },
            body: JSON.stringify(profileWrite)
          });
          if (!writeRes.ok) {
            throw new Error(`profile save failed: HTTP ${writeRes.status}`);
          }
          // Verify the flag actually landed before navigating, otherwise
          // AuthGate would see stale state and bounce us back here.
          const verifyRes = await fetch('/api/users/profile', {
            headers: { 'Authorization': `Bearer ${token}` },
            cache: 'no-store',
          });
          if (verifyRes.ok) {
            const verifyDoc = await verifyRes.json();
            if (verifyDoc?.onboardingCompleted !== true) {
              throw new Error('profile verification failed: onboardingCompleted not set');
            }
          }
        } else {
          await setDoc(userRef, profileWrite, { merge: true });
        }

        // Hard navigation — bypasses Next.js client cache so AuthGate +
        // useProfile re-evaluate from scratch with the fresh profile.
        if (typeof window !== 'undefined') {
          window.location.replace(`/${locale}/home`);
        } else {
          router.replace(`/${locale}/home`);
        }
      } catch (e) {
        setFinishing(false);
        setError((e as Error).message || 'persist failed');
      }
    },
    [user, locale, router]
  );

  // Kick off the conversation when we have a signed-in user.
  useEffect(() => {
    if (!user) return;
    if (sessionIdRef.current) return;
    void sendTurn('', null, null);
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Auto-scroll the chat to the newest message. Defer to the next frame so the
  // freshly-appended bubble is laid out before we measure scrollHeight —
  // otherwise we'd scroll to the stale (pre-append) bottom, which reads as "top".
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const raf = requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
    return () => cancelAnimationFrame(raf);
  }, [messages, pending, currentStep, finishing]);

  const progress = useMemo(() => {
    const totalKeys = [
      'preferredName', 'age', 'country',
      'yearOfEducation', 'interests', 'avatarSeed'
    ];
    const done = totalKeys.filter((k) => collected[k] !== undefined && collected[k] !== null).length;
    return { done, total: totalKeys.length };
  }, [collected]);

  if (!user) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-50">
        <div className="text-slate-500 text-sm">…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <div className="px-6 lg:px-10 py-5 flex items-center gap-3 border-b border-slate-200 bg-white">
        <Logo size={36} />
        <div>
          <div className="font-extrabold text-slate-900 text-[17px] leading-none">{t.appName}</div>
          <div className="text-[11px] text-slate-500 mt-1">{t.appSub}</div>
        </div>
        <div className="ms-auto flex items-center gap-3">
          <button
            onClick={async () => {
              try { await signOut(); } catch {}
              window.location.href = `/${locale}/sign-in`;
            }}
            className="text-[12px] font-semibold text-slate-500 hover:text-sky-700 transition"
          >
            {isAR ? '↩ تسجيل دخول مختلف' : '↩ Use a different sign-in'}
          </button>
          <LanguageSwitcher variant="dropdown" />
          <span className="text-[12px] text-slate-500 ltr">
            {progress.done}/{progress.total}
          </span>
        </div>
      </div>

      <div className="max-w-2xl w-full mx-auto px-6 lg:px-0 py-6 lg:py-10 flex-1 flex flex-col">
        <div ref={listRef} className="flex-1 overflow-y-auto space-y-3 pr-1">
          {messages.map((m) => (
            <Bubble key={m.id} role={m.role} text={m.text} isAR={isAR} />
          ))}
          {pending && !finishing && <PendingIndicator label={t.onboarding.thinking} />}
          {finishing && (
            <div className="text-center text-[13px] text-slate-500 py-6">
              {t.onboarding.saving}
            </div>
          )}
          {error && (
            <div className="text-[12.5px] text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
        </div>

        {currentStep && !finishing && (
          <div className="mt-4 border-t border-slate-200 pt-4">
            <AnswerWidget
              step={currentStep}
              onAnswer={(answerText, answerValue) =>
                sendTurn(answerText, answerValue, currentStep.key)
              }
              locale={locale}
              busy={pending}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function PendingIndicator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-slate-400 text-[13px] px-1">
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-400 animate-pulse" />
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-400 animate-pulse [animation-delay:120ms]" />
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-400 animate-pulse [animation-delay:240ms]" />
      <span className="ms-1">{label}</span>
    </div>
  );
}

function Bubble({ role, text, isAR }: { role: 'agent' | 'user'; text: string; isAR: boolean }) {
  const isAgent = role === 'agent';
  return (
    <div className={`flex ${isAgent ? '' : 'justify-end'}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-[14px] leading-relaxed shadow-sm
          ${isAgent ? 'bg-white border border-slate-200 text-slate-800' : 'bg-sky-600 text-white'}`}
        dir={isAR ? 'rtl' : 'ltr'}
      >
        {text}
      </div>
    </div>
  );
}

function AnswerWidget({
  step,
  onAnswer,
  locale,
  busy
}: {
  step: NextStepQuestion;
  onAnswer: (text: string, value: unknown) => void;
  locale: string;
  busy: boolean;
}) {
  const { t } = useApp();
  switch (step.input_type) {
    case 'text':
      return <TextInput onSubmit={(v) => onAnswer(v, v)} placeholder={t.onboarding.typeAnswer} disabled={busy} />;
    case 'number':
      return <NumberInput onSubmit={(v) => onAnswer(String(v), v)} placeholder={t.onboarding.number} disabled={busy} />;
    case 'choice':
      return (
        <ChoiceRow
          options={step.options ?? []}
          locale={locale}
          onPick={(opt) => onAnswer(optionLabel(opt, locale === 'ar'), opt.id)}
          disabled={busy}
        />
      );
    case 'avatar':
      return (
        <AvatarPicker
          onPick={(style, seed) =>
            onAnswer(
              t.onboarding.pickedAvatar,
              { avatarStyle: style, avatarSeed: seed }
            )
          }
          disabled={busy}
        />
      );
    default:
      return null;
  }
}

function TextInput({
  onSubmit,
  placeholder,
  disabled
}: {
  onSubmit: (v: string) => void;
  placeholder: string;
  disabled: boolean;
}) {
  const [v, setV] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  // Keep the cursor in the box: focus on mount and refocus each time the turn
  // finishes (disabled flips back to false), so the user can keep typing
  // without clicking back in after every reply.
  useEffect(() => {
    if (!disabled) inputRef.current?.focus();
  }, [disabled]);
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (!v.trim() || disabled) return; onSubmit(v.trim()); setV(''); }}
      className="flex items-center gap-2"
    >
      <input
        ref={inputRef}
        autoFocus
        value={v}
        onChange={(e) => setV(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-[14px] focus:border-sky-500 focus:ring-2 focus:ring-sky-500/30 outline-none"
      />
      <Btn type="submit" kind="primary" disabled={disabled || !v.trim()}>
        →
      </Btn>
    </form>
  );
}

function NumberInput({
  onSubmit,
  placeholder,
  disabled
}: {
  onSubmit: (v: number) => void;
  placeholder: string;
  disabled: boolean;
}) {
  const [v, setV] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!disabled) inputRef.current?.focus();
  }, [disabled]);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const n = Number(v);
        if (!Number.isFinite(n) || disabled) return;
        onSubmit(n);
        setV('');
      }}
      className="flex items-center gap-2"
    >
      <input
        ref={inputRef}
        autoFocus
        type="number"
        inputMode="numeric"
        value={v}
        onChange={(e) => setV(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-[14px] ltr focus:border-sky-500 focus:ring-2 focus:ring-sky-500/30 outline-none"
      />
      <Btn type="submit" kind="primary" disabled={disabled || !v.trim()}>
        →
      </Btn>
    </form>
  );
}

function ChoiceRow({
  options,
  locale,
  onPick,
  disabled
}: {
  options: ChoiceOption[];
  locale: string;
  onPick: (opt: ChoiceOption) => void;
  disabled: boolean;
}) {
  const isAR = locale === 'ar';
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt.id}
          onClick={() => onPick(opt)}
          disabled={disabled}
          className="rounded-lg border-2 border-slate-200 bg-white hover:border-sky-500 hover:bg-sky-50 text-slate-800 text-[13.5px] font-semibold px-3.5 py-2 transition disabled:opacity-50"
        >
          {optionLabel(opt, isAR)}
        </button>
      ))}
    </div>
  );
}

function AvatarPicker({
  onPick,
  disabled
}: {
  onPick: (style: AvatarStyle, seed: string) => void;
  disabled: boolean;
}) {
  const { t } = useApp();
  const [activeStyle, setActiveStyle] = useState<AvatarStyle>(AVATAR_STYLES[0]);
  const [seeds, setSeeds] = useState<string[]>(AVATAR_SEED_PALETTE);

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-3">
        {AVATAR_STYLES.map((s) => (
          <button
            key={s}
            onClick={() => setActiveStyle(s)}
            disabled={disabled}
            className={`text-[12px] font-semibold px-3 py-1.5 rounded-lg border-2 transition disabled:opacity-50
              ${activeStyle === s
                ? 'border-sky-500 bg-sky-50 text-sky-700'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}
          >
            {s}
          </button>
        ))}
        <button
          onClick={() => setSeeds(Array.from({ length: AVATAR_SEED_PALETTE.length }, () => randomSeed()))}
          disabled={disabled}
          className="text-[12px] font-semibold px-3 py-1.5 rounded-lg border-2 border-amber-300 bg-amber-50 text-amber-700 hover:border-amber-400 transition disabled:opacity-50"
        >
          🎲 {t.onboarding.shuffle}
        </button>
      </div>
      <div className="grid grid-cols-4 sm:grid-cols-6 gap-2.5">
        {seeds.map((seed) => (
          <button
            key={seed}
            onClick={() => onPick(activeStyle, seed)}
            disabled={disabled}
            className="aspect-square rounded-xl border-2 border-slate-200 bg-white hover:border-sky-500 transition overflow-hidden disabled:opacity-50"
            title={`${activeStyle}:${seed}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={dicebearUrl(activeStyle, seed)} alt="" className="w-full h-full object-cover" />
          </button>
        ))}
      </div>
    </div>
  );
}

