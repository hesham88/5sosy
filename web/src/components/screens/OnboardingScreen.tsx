'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { ref as storageRef, uploadBytes } from 'firebase/storage';
import { useApp } from '../shared/Providers';
import { Btn, Logo } from '../shared/atoms';
import { useAuth } from '@/lib/firebase/auth-context';
import { useProfile } from '@/lib/firebase/use-profile';
import { getFirebase } from '@/lib/firebase/client';
import { dicebearUrl, randomSeed } from '@/lib/avatar';
import { AVATAR_SEED_PALETTE, AVATAR_STYLES } from '@/constants/onboarding';
import type { AvatarStyle, CustomBook, SubjectId } from '@/lib/types';

type InputType = 'text' | 'number' | 'choice' | 'multi_choice' | 'avatar' | 'upload';

type NextStepQuestion = {
  kind: 'question';
  key: string;
  agent_text: string;
  input_type: InputType;
  options?: { id: string; ar: string; en: string }[];
};

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
  const { user } = useAuth();
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
          setError(isAR ? 'حصل خلل في الاتصال — حاول تاني.' : 'Connection hiccup — please retry.');
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
    [collected, locale, username, isAR]
  );

  const persistAndExit = useCallback(
    async (finalProfile: Record<string, unknown>) => {
      if (!user) return;
      setFinishing(true);
      try {
        const { db } = getFirebase();
        const userRef = doc(db, 'users', user.uid);
        const books = (finalProfile.customBooks as CustomBook[] | undefined) ?? [];
        const profileWrite: Record<string, unknown> = {
          ...finalProfile,
          onboardingCompleted: true,
          onboardingCompletedAt: serverTimestamp()
        };
        if (Array.isArray(profileWrite.favoriteSubjects)) {
          profileWrite.favoriteSubjects = (profileWrite.favoriteSubjects as string[]).filter(Boolean);
        }
        // Mirror favoriteSubjects into the catalogue-facing `subjects` field so
        // existing screens that key off `subjects` start showing the user's picks.
        if (Array.isArray(profileWrite.favoriteSubjects) && profileWrite.favoriteSubjects.length) {
          profileWrite.subjects = profileWrite.favoriteSubjects as SubjectId[];
        }
        delete profileWrite.customBooks;

        await setDoc(userRef, profileWrite, { merge: true });

        for (const b of books) {
          if (!b?.id || !b?.storagePath) continue;
          await setDoc(doc(db, 'users', user.uid, 'customBooks', b.id), {
            name: b.name ?? b.id,
            storagePath: b.storagePath,
            sizeBytes: b.sizeBytes ?? null,
            mimeType: b.mimeType ?? null,
            uploadedAt: serverTimestamp()
          });
        }

        router.replace(`/${locale}/home`);
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

  // Auto-scroll the chat as messages arrive.
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, pending, currentStep]);

  const progress = useMemo(() => {
    const totalKeys = [
      'preferredName', 'age', 'yearOfEducation', 'location', 'curriculum',
      'favoriteSubjects', 'reason', 'goals', 'customBooks', 'avatarSeed'
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
        <div className="ms-auto flex items-center gap-2 text-[12px] text-slate-500 ltr">
          {progress.done}/{progress.total}
        </div>
      </div>

      <div className="max-w-2xl w-full mx-auto px-6 lg:px-0 py-6 lg:py-10 flex-1 flex flex-col">
        <div ref={listRef} className="flex-1 overflow-y-auto space-y-3 pr-1">
          {messages.map((m) => (
            <Bubble key={m.id} role={m.role} text={m.text} isAR={isAR} />
          ))}
          {pending && !finishing && <PendingIndicator isAR={isAR} />}
          {finishing && (
            <div className="text-center text-[13px] text-slate-500 py-6">
              {isAR ? 'بنحفظ بياناتك ونجهز الصفحة الرئيسية…' : 'Saving your profile and prepping home…'}
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
              user={user}
              locale={locale}
              isAR={isAR}
              busy={pending}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function PendingIndicator({ isAR }: { isAR: boolean }) {
  return (
    <div className="flex items-center gap-2 text-slate-400 text-[13px] px-1">
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-400 animate-pulse" />
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-400 animate-pulse [animation-delay:120ms]" />
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-400 animate-pulse [animation-delay:240ms]" />
      <span className="ms-1">{isAR ? 'بيفكر…' : 'thinking…'}</span>
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
  user,
  locale,
  isAR,
  busy
}: {
  step: NextStepQuestion;
  onAnswer: (text: string, value: unknown) => void;
  user: { uid: string };
  locale: string;
  isAR: boolean;
  busy: boolean;
}) {
  switch (step.input_type) {
    case 'text':
      return <TextInput onSubmit={(v) => onAnswer(v, v)} placeholder={isAR ? 'اكتب إجابتك' : 'Type your answer'} disabled={busy} />;
    case 'number':
      return <NumberInput onSubmit={(v) => onAnswer(String(v), v)} placeholder={isAR ? 'رقم' : 'Number'} disabled={busy} />;
    case 'choice':
      return (
        <ChoiceRow
          options={step.options ?? []}
          locale={locale}
          onPick={(opt) => onAnswer(isAR ? opt.ar : opt.en, opt.id)}
          disabled={busy}
        />
      );
    case 'multi_choice':
      return (
        <MultiChoiceRow
          options={step.options ?? []}
          locale={locale}
          isAR={isAR}
          onConfirm={(picked) =>
            onAnswer(
              picked.map((o) => (isAR ? o.ar : o.en)).join(', ') || (isAR ? '(تخطى)' : '(skip)'),
              picked.map((o) => o.id)
            )
          }
          disabled={busy}
        />
      );
    case 'avatar':
      return (
        <AvatarPicker
          isAR={isAR}
          onPick={(style, seed) =>
            onAnswer(
              isAR ? 'اخترت شكلي ✨' : 'Picked an avatar ✨',
              { avatarStyle: style, avatarSeed: seed }
            )
          }
          disabled={busy}
        />
      );
    case 'upload':
      return (
        <UploadStep
          uid={user.uid}
          isAR={isAR}
          onSubmit={(books) =>
            onAnswer(
              books.length
                ? (isAR ? `رفعت ${books.length} ملف` : `Uploaded ${books.length} file(s)`)
                : (isAR ? '(تخطى)' : '(skip)'),
              books
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
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (!v.trim() || disabled) return; onSubmit(v.trim()); setV(''); }}
      className="flex items-center gap-2"
    >
      <input
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
  options: { id: string; ar: string; en: string }[];
  locale: string;
  onPick: (opt: { id: string; ar: string; en: string }) => void;
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
          {isAR ? opt.ar : opt.en}
        </button>
      ))}
    </div>
  );
}

function MultiChoiceRow({
  options,
  locale,
  isAR,
  onConfirm,
  disabled
}: {
  options: { id: string; ar: string; en: string }[];
  locale: string;
  isAR: boolean;
  onConfirm: (picked: { id: string; ar: string; en: string }[]) => void;
  disabled: boolean;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const toggle = (id: string) => {
    setPicked((p) => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };
  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-3">
        {options.map((opt) => {
          const on = picked.has(opt.id);
          return (
            <button
              key={opt.id}
              onClick={() => toggle(opt.id)}
              disabled={disabled}
              className={`rounded-lg border-2 px-3 py-1.5 text-[13px] font-semibold transition disabled:opacity-50
                ${on
                  ? 'border-sky-500 bg-sky-50 text-sky-700'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'}`}
            >
              {locale === 'ar' ? opt.ar : opt.en}
            </button>
          );
        })}
      </div>
      <Btn
        kind="primary"
        onClick={() => onConfirm(options.filter((o) => picked.has(o.id)))}
        disabled={disabled}
      >
        {isAR ? 'تمام →' : 'Continue →'}
      </Btn>
    </div>
  );
}

function AvatarPicker({
  isAR,
  onPick,
  disabled
}: {
  isAR: boolean;
  onPick: (style: AvatarStyle, seed: string) => void;
  disabled: boolean;
}) {
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
          {isAR ? '🎲 جدد' : '🎲 Shuffle'}
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

function UploadStep({
  uid: userId,
  isAR,
  onSubmit,
  disabled
}: {
  uid: string;
  isAR: boolean;
  onSubmit: (books: CustomBook[]) => void;
  disabled: boolean;
}) {
  const [books, setBooks] = useState<CustomBook[]>([]);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handlePick = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setUploading(true);
    setErr(null);
    try {
      const { storage } = getFirebase();
      const out: CustomBook[] = [];
      for (const f of Array.from(files)) {
        const id = `${Date.now()}-${uid()}`;
        const path = `users/${userId}/uploads/onboarding/${id}-${f.name}`;
        const r = storageRef(storage, path);
        await uploadBytes(r, f, { contentType: f.type || 'application/octet-stream' });
        out.push({
          id,
          name: f.name,
          storagePath: path,
          sizeBytes: f.size,
          mimeType: f.type || undefined
        });
      }
      setBooks((prev) => [...prev, ...out]);
    } catch (e) {
      setErr((e as Error).message || 'upload failed');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div>
      <div
        className="border-2 border-dashed border-slate-300 rounded-xl bg-white px-6 py-6 text-center hover:border-sky-400 hover:bg-sky-50/40 transition cursor-pointer"
        onClick={() => inputRef.current?.click()}
      >
        <div className="text-3xl mb-1">📎</div>
        <div className="font-bold text-slate-900 text-[14px]">
          {isAR ? 'اضغط لرفع كتب أو ملازم' : 'Click to upload books or notes'}
        </div>
        <div className="text-[12px] text-slate-500 mt-1">
          {isAR ? 'PDF، صور أو مستندات. اختياري.' : 'PDF, images, or documents. Optional.'}
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx"
          onChange={(e) => handlePick(e.target.files)}
          disabled={disabled || uploading}
        />
      </div>

      {uploading && (
        <div className="text-[12.5px] text-slate-500 mt-2">{isAR ? 'بنرفع…' : 'Uploading…'}</div>
      )}
      {err && (
        <div className="text-[12.5px] text-rose-600 mt-2">{err}</div>
      )}

      {books.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {books.map((b) => (
            <li
              key={b.id}
              className="flex items-center gap-2 text-[12.5px] text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5"
            >
              <span>📄</span>
              <span className="truncate flex-1">{b.name}</span>
              <button
                onClick={() => setBooks((bs) => bs.filter((x) => x.id !== b.id))}
                className="text-slate-400 hover:text-rose-500"
                aria-label="remove"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2 mt-4">
        <Btn kind="primary" onClick={() => onSubmit(books)} disabled={disabled || uploading}>
          {books.length
            ? (isAR ? 'تمام، كمل →' : 'Done, continue →')
            : (isAR ? 'تخطى →' : 'Skip →')}
        </Btn>
      </div>
    </div>
  );
}
