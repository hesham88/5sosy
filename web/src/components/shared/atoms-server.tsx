// Server-safe atoms (no 'use client').
export function Card({
  children, className = '', as
}: { children: React.ReactNode; className?: string; as?: keyof JSX.IntrinsicElements }) {
  const As = (as ?? 'div') as keyof JSX.IntrinsicElements;
  return <As className={`bg-white rounded-xl border border-slate-200 ${className}`}>{children}</As>;
}
