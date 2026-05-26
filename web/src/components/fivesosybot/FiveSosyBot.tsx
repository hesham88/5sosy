'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '@/components/shared/Providers';
import { dirFor } from '@/i18n/config';

type StepType = 'text' | 'function_call' | 'function_response' | 'transfer';

type Grounding = {
  queries?: string[];
  citations?: { uri: string; title?: string | null }[];
};

type TraceStep = {
  index: number;
  agent: string;
  step_type: StepType;
  tool?: string;
  to?: string;
  input?: Record<string, unknown>;
  output?: unknown;
  final?: boolean;
  duration_ms?: number;
  grounding?: Grounding;
};

type Msg =
  | { id: string; role: 'user'; text: string }
  | {
      id: string;
      role: 'bot';
      text: string;
      trace: TraceStep[];
      intent?: string;
      durationMs?: number;
      streaming: boolean;
      error?: string;
    };

type Dict = {
  title: string;
  subtitle: string;
  placeholder: string;
  send: string;
  thinking: string;
  showTrace: string;
  hideTrace: string;
  open: string;
  close: string;
  empty: string;
  errorPrefix: string;
  durLabel: string;
  intentLabel: string;
  sourcesLabel: string;
};

const T: Record<'ar' | 'en', Dict> = {
  ar: {
    title: '5sosybot',
    subtitle: 'مساعد الوكيل التجريبي',
    placeholder: 'اسأل عن الوقت أو الجو في أي مدينة…',
    send: 'إرسال',
    thinking: 'بفكّر…',
    showTrace: 'اعرض الخطوات',
    hideTrace: 'إخفاء الخطوات',
    open: 'افتح 5sosybot',
    close: 'إغلاق',
    empty: 'جرّب: "الجو عامل ايه في القاهرة؟"',
    errorPrefix: 'حصلت مشكلة:',
    durLabel: 'المدة',
    intentLabel: 'النية',
    sourcesLabel: 'المصادر'
  },
  en: {
    title: '5sosybot',
    subtitle: 'agent POC',
    placeholder: 'Ask about time or weather in any city…',
    send: 'Send',
    thinking: 'Thinking…',
    showTrace: 'Show steps',
    hideTrace: 'Hide steps',
    open: 'Open 5sosybot',
    close: 'Close',
    empty: 'Try: "what time is it in Tokyo?"',
    errorPrefix: 'Something went wrong:',
    durLabel: 'duration',
    intentLabel: 'intent',
    sourcesLabel: 'sources'
  }
} as const;

function uid() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
}

function StepBadge({ type }: { type: StepType }) {
  const map: Record<StepType, string> = {
    function_call: 'bg-violet-50 text-violet-700 border-violet-200',
    function_response: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    transfer: 'bg-amber-50 text-amber-700 border-amber-200',
    text: 'bg-sky-50 text-sky-700 border-sky-200'
  };
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-mono ${map[type]}`}>
      {type}
    </span>
  );
}

function TraceItem({ step, isAR }: { step: TraceStep; isAR: boolean }) {
  const ms = step.duration_ms ?? 0;
  const ms_short = ms > 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
  return (
    <div className="border-s-2 border-slate-200 ps-3 py-1.5 text-[12px] space-y-1">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-mono text-slate-500">#{step.index}</span>
        <span className="font-semibold text-slate-700">{step.agent}</span>
        <StepBadge type={step.step_type} />
        <span className="ms-auto text-[10px] text-slate-400 font-mono">{ms_short}</span>
      </div>
      {step.step_type === 'function_call' && step.tool && (
        <div className="font-mono text-[11px] text-slate-600">
          <span className="text-violet-700">{step.tool}</span>
          <span className="text-slate-400">(</span>
          <span className="text-slate-600">
            {step.input ? JSON.stringify(step.input) : ''}
          </span>
          <span className="text-slate-400">)</span>
        </div>
      )}
      {step.step_type === 'function_response' && (
        <div className="font-mono text-[11px] text-slate-600 break-all">
          <span className="text-emerald-700">↳</span>{' '}
          {typeof step.output === 'object'
            ? JSON.stringify(step.output)
            : String(step.output ?? '')}
        </div>
      )}
      {step.step_type === 'transfer' && step.to && (
        <div className="font-mono text-[11px] text-amber-700">
          → {step.to}
        </div>
      )}
      {step.step_type === 'text' && typeof step.output === 'string' && (
        <div className="text-[12px] text-slate-700">{step.output}</div>
      )}
      {step.grounding && (step.grounding.queries?.length || step.grounding.citations?.length) ? (
        <div className="mt-1 space-y-0.5">
          {step.grounding.queries?.map((q, i) => (
            <div key={`q${i}`} className="text-[10px] text-slate-500 font-mono">
              🔎 {q}
            </div>
          ))}
          {step.grounding.citations?.map((c, i) => (
            <a
              key={`c${i}`}
              href={c.uri}
              target="_blank"
              rel="noreferrer"
              className="inline-block me-1 mt-0.5 text-[10px] text-sky-700 hover:underline truncate max-w-[200px] align-middle"
              title={c.uri}
            >
              {c.title || c.uri}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function BotMessage({ msg, isAR, dict }: { msg: Extract<Msg, { role: 'bot' }>; isAR: boolean; dict: Dict }) {
  const [open, setOpen] = useState(false);
  const hasTrace = msg.trace.length > 0;
  return (
    <div className="max-w-[85%] me-auto">
      <div className="bg-slate-50 border border-slate-200 rounded-2xl rounded-ss-md px-3 py-2 text-[13.5px] text-slate-800 whitespace-pre-wrap">
        {msg.text || (msg.streaming ? <span className="text-slate-400 italic">{dict.thinking}</span> : '')}
        {msg.error && <div className="mt-1 text-rose-600 text-[12px]">{dict.errorPrefix} {msg.error}</div>}
      </div>
      {(hasTrace || msg.intent || msg.durationMs) && (
        <div className="mt-1.5 flex items-center gap-2 text-[11px] text-slate-500">
          {msg.intent && (
            <span className="font-mono">
              {dict.intentLabel}: <span className="text-slate-700">{msg.intent}</span>
            </span>
          )}
          {msg.durationMs !== undefined && (
            <span className="font-mono">
              {dict.durLabel}: {(msg.durationMs / 1000).toFixed(1)}s
            </span>
          )}
          {hasTrace && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="ms-auto text-sky-700 hover:underline"
            >
              {open ? dict.hideTrace : dict.showTrace} ({msg.trace.length})
            </button>
          )}
        </div>
      )}
      {open && hasTrace && (
        <div className="mt-2 bg-white border border-slate-200 rounded-lg p-2 space-y-1">
          {msg.trace.map((s) => (
            <TraceItem key={s.index} step={s} isAR={isAR} />
          ))}
        </div>
      )}
    </div>
  );
}

function UserMessage({ text }: { text: string }) {
  return (
    <div className="max-w-[85%] ms-auto bg-sky-600 text-white rounded-2xl rounded-se-md px-3 py-2 text-[13.5px] whitespace-pre-wrap">
      {text}
    </div>
  );
}

async function streamChat({
  body,
  onStep,
  onFinal,
  onError,
  signal
}: {
  body: { message: string; locale: string; username: string; session_id?: string };
  onStep: (s: TraceStep) => void;
  onFinal: (f: { final_response: string; trace: TraceStep[]; intent?: string; duration_ms?: number; session_id: string }) => void;
  onError: (msg: string) => void;
  signal: AbortSignal;
}) {
  const res = await fetch('/api/agents/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal
  });
  if (!res.ok || !res.body) {
    onError(`HTTP ${res.status}`);
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
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
        if (evt === 'step') onStep(parsed as TraceStep);
        else if (evt === 'final') onFinal(parsed);
        else if (evt === 'error') onError(parsed.message || 'unknown');
      } catch {
        // ignore malformed frames
      }
    }
  }
}

type FeedbackDict = {
  reportButton: string; title: string; intro: string; name: string; email: string;
  subject: string; description: string; reproduce: string; attachment: string;
  attachmentHint: string; optional: string; submit: string; submitting: string;
  success: string; errorGeneric: string; tooLarge: string; cancel: string;
};

const MAX_ATTACH_BYTES = 2 * 1024 * 1024;

function FeedbackForm({
  t, locale, sessionId, onClose, onDone,
}: {
  t: { feedback: FeedbackDict };
  locale: string;
  sessionId: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const f = t.feedback;
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [reproduce, setReproduce] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !description.trim() || busy) return;
    if (file && file.size > MAX_ATTACH_BYTES) {
      setError(f.tooLarge);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('subject', subject);
      fd.append('description', description);
      fd.append('name', name);
      fd.append('email', email);
      fd.append('reproduce', reproduce);
      fd.append('locale', locale);
      if (sessionId) fd.append('sessionId', sessionId);
      if (file) fd.append('file', file);
      const res = await fetch('/api/feedback', { method: 'POST', body: fd });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'failed');
      }
      onDone();
    } catch {
      setError(f.errorGeneric);
    } finally {
      setBusy(false);
    }
  };

  const labelCls = 'block text-[11.5px] font-bold text-slate-600 mb-1';
  const inputCls =
    'w-full rounded-lg border border-slate-200 px-2.5 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-400';

  return (
    <div className="absolute inset-0 z-20 bg-white flex flex-col">
      <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2">
        <span aria-hidden>⚑</span>
        <span className="font-bold text-[14px] text-slate-900">{f.title}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label={f.cancel}
          className="ms-auto w-7 h-7 grid place-items-center rounded-lg hover:bg-slate-100 text-slate-500 text-lg leading-none"
        >
          ×
        </button>
      </div>
      <form onSubmit={submit} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        <p className="text-[12.5px] text-slate-500">{f.intro}</p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelCls}>{f.name} <span className="text-slate-400 font-normal">· {f.optional}</span></label>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
          </div>
          <div>
            <label className={labelCls}>{f.email} <span className="text-slate-400 font-normal">· {f.optional}</span></label>
            <input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} />
          </div>
        </div>
        <div>
          <label className={labelCls}>{f.subject}</label>
          <input className={inputCls} value={subject} onChange={(e) => setSubject(e.target.value)} disabled={busy} required />
        </div>
        <div>
          <label className={labelCls}>{f.description}</label>
          <textarea className={`${inputCls} resize-none`} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} disabled={busy} required />
        </div>
        <div>
          <label className={labelCls}>{f.reproduce} <span className="text-slate-400 font-normal">· {f.optional}</span></label>
          <textarea className={`${inputCls} resize-none`} rows={2} value={reproduce} onChange={(e) => setReproduce(e.target.value)} disabled={busy} />
        </div>
        <div>
          <label className={labelCls}>{f.attachment} <span className="text-slate-400 font-normal">· {f.optional}</span></label>
          <input
            type="file"
            accept="image/*,application/pdf"
            disabled={busy}
            onChange={(e) => {
              const sel = e.target.files?.[0] || null;
              if (sel && sel.size > MAX_ATTACH_BYTES) {
                setError(f.tooLarge);
                setFile(null);
                e.target.value = '';
              } else {
                setError(null);
                setFile(sel);
              }
            }}
            className="block w-full text-[12px] text-slate-600 file:me-2 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-[12px] file:font-semibold"
          />
          <p className="text-[10.5px] text-slate-400 mt-1">{f.attachmentHint}</p>
        </div>
        {error && <div className="text-[12px] text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-2">{error}</div>}
      </form>
      <div className="border-t border-slate-200 p-2.5 flex justify-end gap-2 bg-white">
        <button type="button" onClick={onClose} disabled={busy} className="rounded-lg border border-slate-200 px-3 py-2 text-[13px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
          {f.cancel}
        </button>
        <button type="button" onClick={submit} disabled={busy || !subject.trim() || !description.trim()} className="rounded-lg bg-sky-600 hover:bg-sky-700 disabled:bg-slate-300 text-white px-4 py-2 text-[13px] font-semibold">
          {busy ? f.submitting : f.submit}
        </button>
      </div>
    </div>
  );
}

export function FiveSosyBot() {
  const { locale, isAR, t } = useApp();
  const dict = T[isAR ? 'ar' : 'en'];
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const sessionIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // Problem-report form (hybrid: opened from a button or when the agent
  // classifies a report_feedback intent; captured via a structured form and
  // persisted server-side through /api/feedback).
  const [showForm, setShowForm] = useState(false);

  // Keep the newest message in view. Defer to the next frame so the streamed
  // content is laid out before we measure scrollHeight.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const raf = requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
    return () => cancelAnimationFrame(raf);
  }, [messages, busy, open]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || busy) return;
    const userMsgId = uid();
    const botMsgId = uid();
    setMessages((m) => [
      ...m,
      { id: userMsgId, role: 'user', text },
      { id: botMsgId, role: 'bot', text: '', trace: [], streaming: true }
    ]);
    setInput('');
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await streamChat({
        body: {
          message: text,
          locale,
          username: 'guest',
          ...(sessionIdRef.current ? { session_id: sessionIdRef.current } : {})
        },
        signal: controller.signal,
        onStep: (step) => {
          setMessages((m) =>
            m.map((msg) =>
              msg.id === botMsgId && msg.role === 'bot'
                ? {
                    ...msg,
                    trace: [...msg.trace, step],
                    text:
                      step.step_type === 'text' && step.final && typeof step.output === 'string'
                        ? step.output
                        : msg.text
                  }
                : msg
            )
          );
        },
        onFinal: (f) => {
          sessionIdRef.current = f.session_id;
          if (f.intent === 'report_feedback') setShowForm(true);
          setMessages((m) =>
            m.map((msg) =>
              msg.id === botMsgId && msg.role === 'bot'
                ? {
                    ...msg,
                    text: f.final_response || msg.text,
                    trace: f.trace?.length ? f.trace : msg.trace,
                    intent: f.intent,
                    durationMs: f.duration_ms,
                    streaming: false
                  }
                : msg
            )
          );
        },
        onError: (err) => {
          setMessages((m) =>
            m.map((msg) =>
              msg.id === botMsgId && msg.role === 'bot'
                ? { ...msg, streaming: false, error: err }
                : msg
            )
          );
        }
      });
    } catch (e) {
      const err = (e as Error).message || 'network';
      setMessages((m) =>
        m.map((msg) =>
          msg.id === botMsgId && msg.role === 'bot'
            ? { ...msg, streaming: false, error: err }
            : msg
        )
      );
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }, [input, busy, locale]);

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <>
      {!open && (
        <button
          type="button"
          aria-label={dict.open}
          onClick={() => setOpen(true)}
          className="fixed bottom-5 end-5 z-50 grid place-items-center w-14 h-14 rounded-full shadow-lg shadow-sky-900/30 text-white font-extrabold text-xl"
          style={{
            background: 'linear-gradient(135deg,#0ea5e9 0%,#0284c7 60%,#0c4a6e 100%)'
          }}
        >
          <span className="ltr">5</span>
          <span className="absolute -bottom-1 -end-1 grid place-items-center bg-amber-400 rounded-full w-6 h-6 text-[11px]">
            💬
          </span>
        </button>
      )}

      {open && (
        <div
          className="fixed bottom-5 end-5 z-50 w-[min(380px,calc(100vw-2.5rem))] h-[min(560px,calc(100vh-2.5rem))] flex flex-col bg-white rounded-2xl border border-slate-200 shadow-2xl shadow-slate-900/20 overflow-hidden"
          dir={dirFor(locale)}
        >
          <div
            className="px-4 py-3 text-white flex items-center gap-3"
            style={{
              background: 'linear-gradient(135deg,#0ea5e9 0%,#0284c7 60%,#0c4a6e 100%)'
            }}
          >
            <div className="grid place-items-center w-8 h-8 rounded-lg bg-white/15 font-extrabold">
              <span className="ltr">5</span>
            </div>
            <div className="leading-tight">
              <div className="font-bold ltr">{dict.title}</div>
              <div className="text-[11px] opacity-80">{dict.subtitle}</div>
            </div>
            <button
              type="button"
              onClick={() => setShowForm(true)}
              title={t.feedback.reportButton}
              aria-label={t.feedback.reportButton}
              className="ms-auto w-8 h-8 grid place-items-center rounded-lg hover:bg-white/15 text-base leading-none"
            >
              ⚑
            </button>
            <button
              type="button"
              aria-label={dict.close}
              onClick={() => setOpen(false)}
              className="w-8 h-8 grid place-items-center rounded-lg hover:bg-white/15 text-lg leading-none"
            >
              ×
            </button>
          </div>

          {showForm && (
            <FeedbackForm
              t={t}
              locale={locale}
              sessionId={sessionIdRef.current}
              onClose={() => setShowForm(false)}
              onDone={() => {
                setShowForm(false);
                setMessages((m) => [
                  ...m,
                  { id: uid(), role: 'bot', text: t.feedback.success, trace: [], streaming: false },
                ]);
              }}
            />
          )}

          <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5 bg-slate-50/40">
            {messages.length === 0 && (
              <div className="text-center text-slate-400 text-[12px] mt-8 px-4">
                {dict.empty}
              </div>
            )}
            {messages.map((m) =>
              m.role === 'user' ? (
                <UserMessage key={m.id} text={m.text} />
              ) : (
                <BotMessage key={m.id} msg={m} isAR={isAR} dict={dict} />
              )
            )}
          </div>

          <div className="border-t border-slate-200 p-2 bg-white">
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKey}
                placeholder={dict.placeholder}
                rows={1}
                disabled={busy}
                className="flex-1 resize-none rounded-lg border border-slate-200 px-3 py-2 text-[13.5px] focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-400 disabled:opacity-50 max-h-24"
              />
              <button
                type="button"
                onClick={send}
                disabled={busy || !input.trim()}
                className="rounded-lg bg-sky-600 hover:bg-sky-700 disabled:bg-slate-300 text-white px-3 py-2 text-[13px] font-semibold"
              >
                {dict.send}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
