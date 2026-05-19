'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { SUBJECT_META, HUE } from '@/constants/subjects';
import { useApp } from './Providers';
import type { SubjectId } from '@/lib/types';

export function Logo({ size = 36 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <div
        className="relative grid place-items-center rounded-2xl text-white font-extrabold shadow-md"
        style={{
          width: size, height: size,
          background: 'linear-gradient(135deg,#0ea5e9 0%,#0284c7 60%,#0c4a6e 100%)'
        }}
      >
        <span className="ltr" style={{ fontSize: size * 0.45 }}>5</span>
        <span className="absolute -bottom-1 -end-1 grid place-items-center bg-amber-400 rounded-full"
              style={{ width: size * 0.4, height: size * 0.4, fontSize: size * 0.22 }}>
          📖
        </span>
      </div>
    </div>
  );
}

type BtnKind = 'primary' | 'amber' | 'ghost' | 'danger' | 'soft' | 'outline';
type BtnSize = 'sm' | 'md' | 'lg';

export function Btn({
  children, kind = 'primary', size = 'md', className = '', ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { kind?: BtnKind; size?: BtnSize }) {
  const base = 'inline-flex items-center justify-center gap-2 font-semibold rounded-lg transition focus:outline-none focus:ring-2 focus:ring-sky-500/30 disabled:opacity-50';
  const sz = size === 'lg' ? 'px-5 py-3 text-[15px]'
           : size === 'sm' ? 'px-3 py-1.5 text-[12px]'
           : 'px-4 py-2.5 text-[13.5px]';
  const k = kind === 'primary' ? 'bg-sky-600 hover:bg-sky-700 text-white shadow-sm shadow-sky-600/20'
          : kind === 'amber'   ? 'bg-amber-500 hover:bg-amber-600 text-white'
          : kind === 'ghost'   ? 'text-slate-700 hover:bg-slate-100'
          : kind === 'danger'  ? 'bg-rose-600 hover:bg-rose-700 text-white'
          : kind === 'soft'    ? 'bg-sky-50 hover:bg-sky-100 text-sky-700'
          : 'bg-white border border-slate-200 hover:border-slate-300 text-slate-700';
  return <button className={`${base} ${sz} ${k} ${className}`} {...rest}>{children}</button>;
}

export function Card({
  children, className = '', lift = false, as
}: { children: React.ReactNode; className?: string; lift?: boolean; as?: keyof JSX.IntrinsicElements }) {
  const As = (as ?? 'div') as keyof JSX.IntrinsicElements;
  return (
    <As className={`bg-white rounded-xl border border-slate-200 ${lift ? 'card-lift' : ''} ${className}`}>
      {children}
    </As>
  );
}

export function Ring({ value = 0.4, size = 44, stroke = 5, color }: { value?: number; size?: number; stroke?: number; color?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  const dash = c * v;
  const auto = v < 0.4 ? '#ef4444' : v < 0.7 ? '#f59e0b' : '#22c55e';
  return (
    <svg className="ring-svg" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle className="track" cx={size/2} cy={size/2} r={r} stroke="#e2e8f0" strokeWidth={stroke} fill="none" />
      <circle className="fill" cx={size/2} cy={size/2} r={r}
              stroke={color ?? auto} strokeWidth={stroke} fill="none"
              strokeDasharray={`${dash} ${c - dash}`}
              transform={`rotate(-90 ${size/2} ${size/2})`} />
    </svg>
  );
}

export function SubjectChip({ id, size = 'md' }: { id: SubjectId; size?: 'sm' | 'md' }) {
  const { isAR } = useApp();
  const m = SUBJECT_META[id];
  if (!m) return null;
  const h = HUE[m.hue];
  const sz = size === 'sm' ? 'text-[11px] px-2 py-0.5' : 'text-[12px] px-2.5 py-1';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md font-semibold ${h.bg} ${h.text} ${sz}`}>
      <span>{m.glyph}</span>
      <span>{isAR ? m.ar : m.en}</span>
    </span>
  );
}

export type AgentLogLine = {
  agent: string;
  text: string;
  status?: 'ok' | 'warn' | 'info';
  delay?: number;
};

export function AgentLog({
  lines, speed = 18, onDone, height = 'auto', heading
}: { lines: AgentLogLine[]; speed?: number; onDone?: () => void; height?: string | number; heading?: string }) {
  const [shown, setShown] = useState<(AgentLogLine & { partial?: string })[]>([]);
  const [typing, setTyping] = useState(true);
  const lineIdx = useRef(0);
  const charIdx = useRef(0);

  useEffect(() => {
    setShown([]); lineIdx.current = 0; charIdx.current = 0; setTyping(true);
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const i = lineIdx.current;
      if (i >= lines.length) { setTyping(false); onDone?.(); return; }
      const ln = lines[i];
      charIdx.current += 1;
      const partial = ln.text.slice(0, charIdx.current);
      setShown((prev) => {
        const next = prev.slice();
        next[i] = { ...ln, partial };
        return next;
      });
      if (charIdx.current >= ln.text.length) {
        lineIdx.current += 1;
        charIdx.current = 0;
        timer = setTimeout(tick, ln.delay ?? 220);
      } else {
        timer = setTimeout(tick, speed);
      }
    };
    timer = setTimeout(tick, 200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines]);

  return (
    <div className="terminal rounded-xl p-4 ltr" style={{ height }}>
      {heading && (
        <div className="flex items-center gap-2 pb-2 mb-2 border-b border-slate-700/60">
          <span className="w-2 h-2 rounded-full bg-rose-400" />
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span className="dim ms-2">{heading}</span>
        </div>
      )}
      {shown.map((ln, i) => {
        const isLast = i === shown.length - 1 && typing;
        const cls = ln.status === 'ok' ? 'ok' : ln.status === 'warn' ? 'warn' : '';
        return (
          <div key={i} className={`whitespace-pre-wrap ${isLast ? 'tw-cursor' : ''}`}>
            <span className="dim">▸ </span>
            <span className="lab">[{ln.agent}]</span>
            <span className={cls}> {ln.partial}</span>
          </div>
        );
      })}
    </div>
  );
}

export function Confetti({ show, count = 24 }: { show: boolean; count?: number }) {
  const pieces = useMemo(() => Array.from({ length: count }).map((_, i) => ({
    left: Math.random() * 100,
    delay: Math.random() * 0.3,
    bg: ['#f59e0b','#0284c7','#ef4444','#22c55e','#a78bfa'][i % 5],
    rot: Math.random() * 360
  })), [count]);
  if (!show) return null;
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {pieces.map((p, i) => (
        <span key={i} className="confetti" style={{
          left: `${p.left}%`,
          background: p.bg,
          animationDelay: `${p.delay}s`,
          transform: `rotate(${p.rot}deg)`,
          top: 0
        }} />
      ))}
    </div>
  );
}
