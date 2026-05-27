'use client';

export type MindNode = {
  title: string;
  summary?: string;
  page?: number | null;
  bookId?: string | null;   // subject-level mind maps span books; book-level ignores this
  children?: MindNode[];
};

export const BRANCH_COLORS = [
  'border-sky-400 bg-sky-50',
  'border-amber-400 bg-amber-50',
  'border-emerald-400 bg-emerald-50',
  'border-violet-400 bg-violet-50',
  'border-rose-400 bg-rose-50',
  'border-cyan-400 bg-cyan-50',
  'border-orange-400 bg-orange-50',
  'border-indigo-400 bg-indigo-50',
];

export function MindMapNode({ node, depth, branch, onJump, pageLabel }: {
  node: MindNode;
  depth: number;
  branch: number;
  onJump: (page: number, bookId?: string | null) => void;
  pageLabel: (n: number) => string;
}) {
  const hasPage = typeof node.page === 'number' && node.page > 0;
  const color = depth === 1 ? BRANCH_COLORS[branch % BRANCH_COLORS.length] : 'border-slate-200 bg-white';
  return (
    <li className="my-1">
      <div className={`inline-flex items-center gap-2 rounded-xl border ps-3 pe-2 py-1.5 ${color}`}>
        <span className={`${depth === 0 ? 'text-[15px] font-extrabold' : depth === 1 ? 'text-[13px] font-bold' : 'text-[12.5px] font-medium'} text-slate-800`}>
          {node.title}
        </span>
        {hasPage && (
          <button
            onClick={() => onJump(node.page as number, node.bookId)}
            className="text-[11px] font-bold text-sky-700 bg-white/70 hover:bg-sky-600 hover:text-white rounded-full px-2 py-0.5 border border-sky-200 transition shrink-0"
          >
            {pageLabel(node.page as number)}
          </button>
        )}
      </div>
      {Array.isArray(node.children) && node.children.length > 0 && (
        <ul className="ms-4 ps-3 border-s border-dashed border-slate-200 mt-1">
          {node.children.map((c, i) => (
            <MindMapNode key={i} node={c} depth={depth + 1} branch={depth === 0 ? i : branch} onJump={onJump} pageLabel={pageLabel} />
          ))}
        </ul>
      )}
    </li>
  );
}
