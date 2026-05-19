'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChromeLayout } from '../shared/Chrome';
import { useApp } from '../shared/Providers';
import { AgentLog, Btn, Card, Ring, SubjectChip, type AgentLogLine } from '../shared/atoms';
import { SUBJECT_META, HUE, type HueId } from '@/constants/subjects';
import { BOOKS } from '@/constants/seed-data';
import { callAgent, type AgentName } from '@/lib/agents';
import type { Book, SubjectId } from '@/lib/types';

type ActionKey = 'chat' | 'summarize' | 'explain' | 'audio' | 'quiz' | 'questions';

const ACTION_META: Record<ActionKey, { glyph: string; agent: AgentName; mode: string }> = {
  chat:      { glyph: '💬', agent: 'orchestrator', mode: 'chat' },
  summarize: { glyph: '📝', agent: 'pedagogy',     mode: 'summary' },
  explain:   { glyph: '🇪🇬', agent: 'pedagogy',     mode: 'egyptian' },
  audio:     { glyph: '🎧', agent: 'av',           mode: 'narrate' },
  quiz:      { glyph: '✓',  agent: 'assessment',   mode: 'generate' },
  questions: { glyph: '❓', agent: 'pedagogy',     mode: 'common_qs' }
};

export default function BooksScreen() {
  const { isAR, t, locale } = useApp();
  const router = useRouter();
  const search = useSearchParams();
  const subjectFromUrl = search.get('subject') as SubjectId | null;

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [subjectFilter, setSubjectFilter] = useState<SubjectId | 'all'>(subjectFromUrl ?? 'all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'indexed'>('all');
  const [chatInput, setChatInput] = useState('');
  const [chatMsgs, setChatMsgs] = useState<{ who: 'me' | '5sosy'; ar: string; en: string }[]>([]);
  const [action, setAction] = useState<ActionKey | null>(null);
  const [actionLog, setActionLog] = useState<AgentLogLine[] | null>(null);
  const [actionPayload, setActionPayload] = useState<Record<string, unknown> | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => { if (subjectFromUrl) setSubjectFilter(subjectFromUrl); }, [subjectFromUrl]);

  const filtered = useMemo(() => BOOKS.filter((b) =>
    (subjectFilter === 'all' || b.subject === subjectFilter) &&
    (statusFilter === 'all' || b.status === 'indexed')
  ), [subjectFilter, statusFilter]);

  const selectedBooks = useMemo(() => BOOKS.filter((b) => selected.has(b.id)), [selected]);
  const count = selectedBooks.length;

  const toggle = (id: string, status: Book['status']) => {
    if (status !== 'indexed') return;
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllIndexed = () => setSelected(new Set(filtered.filter((b) => b.status === 'indexed').map((b) => b.id)));
  const clearAll = () => setSelected(new Set());

  const runAction = async (key: ActionKey) => {
    if (count === 0) return;
    setAction(key);
    setActionLoading(true);
    setActionPayload(null);
    setActionLog(buildLog(key, selectedBooks, isAR));
    const meta = ACTION_META[key];
    const res = await callAgent(meta.agent, {
      mode: meta.mode,
      bookIds: [...selected],
      subjects: [...new Set(selectedBooks.map((b) => b.subject))],
      locale
    }).catch(() => null);
    setActionPayload((res?.result as Record<string, unknown>) ?? {});
    setTimeout(() => setActionLoading(false), 2200);
  };

  const sendChat = async () => {
    if (!chatInput.trim() || count === 0) return;
    const user = chatInput;
    setChatMsgs((m) => [...m, { who: 'me', ar: user, en: user }]);
    setChatInput('');
    void callAgent('orchestrator', { mode: 'chat', bookIds: [...selected], message: user, locale }).catch(() => undefined);
    setTimeout(() => {
      const titles = selectedBooks.map((b) => (isAR ? b.arT : b.enT)).join(' + ');
      setChatMsgs((m) => [...m, {
        who: '5sosy',
        ar: `طيب، من خلال ${titles}: السؤال بتاعك بيقع في الفصل اللي بيتكلم عن المفهوم ده. تحب أبدأ بشرح مختصر ولا أديك مثال محلول؟`,
        en: `From ${titles}: your question lands in the chapter that covers this concept. Want a short explanation first, or a worked example?`
      }]);
    }, 900);
  };

  return (
    <ChromeLayout>
      <div className="px-5 lg:px-10 py-6 lg:py-8 max-w-[1400px]">
        <div className="flex items-end justify-between gap-4 mb-6 flex-wrap">
          <div>
            <h1 className="text-2xl lg:text-3xl font-extrabold text-slate-900">{t.books.title}</h1>
            <p className="text-slate-500 mt-1 text-[14px]">{t.books.sub}</p>
          </div>
          <Btn kind="outline" size="sm">+ {t.books.addBook}</Btn>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 mb-5">
          <FilterPill active={subjectFilter === 'all'} onClick={() => setSubjectFilter('all')}>
            {t.books.filterAll}
          </FilterPill>
          {Array.from(new Set(BOOKS.map((b) => b.subject))).map((s) => {
            const meta = SUBJECT_META[s];
            const h = HUE[meta.hue];
            return (
              <button
                key={s}
                onClick={() => setSubjectFilter(s)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold border transition
                  ${subjectFilter === s ? `${h.dot} text-white border-transparent` : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
              >
                <span>{meta.glyph}</span>
                <span>{isAR ? meta.ar : meta.en}</span>
              </button>
            );
          })}
          <div className="w-px h-6 bg-slate-200 mx-1" />
          <FilterPill active={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>
            {t.books.filterAll}
          </FilterPill>
          <FilterPill active={statusFilter === 'indexed'} onClick={() => setStatusFilter('indexed')}>
            ✓ {t.books.filterIndexed}
          </FilterPill>

          <div className="ms-auto flex items-center gap-2 text-[12px]">
            {count > 0 && (
              <>
                <span className="font-bold text-sky-700">
                  {count} {count === 1 ? t.books.selected : t.books.selectedPlural}
                </span>
                <button onClick={clearAll} className="text-slate-500 hover:text-rose-600 font-semibold">
                  {t.books.clear}
                </button>
              </>
            )}
            {count === 0 && (
              <button onClick={selectAllIndexed} className="text-slate-500 hover:text-sky-700 font-semibold">
                {t.books.selectAll}
              </button>
            )}
          </div>
        </div>

        {/* Book grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 lg:gap-5">
          {filtered.map((b) => (
            <BookCard
              key={b.id}
              book={b}
              selected={selected.has(b.id)}
              onToggle={() => toggle(b.id, b.status)}
            />
          ))}
        </div>

        {/* Empty state */}
        {filtered.length === 0 && (
          <Card className="p-8 text-center text-slate-500 mt-6">{isAR ? 'مفيش كتب بالفلتر ده' : 'No books match this filter'}</Card>
        )}

        {/* Result panel */}
        {action && (
          <div className="mt-6">
            <ResultPanel
              actionKey={action}
              books={selectedBooks}
              log={actionLog}
              loading={actionLoading}
              payload={actionPayload}
              onClose={() => { setAction(null); setActionLog(null); setActionPayload(null); }}
              onGoToQuiz={() => router.push(`/${locale}/quiz`)}
              chatMsgs={chatMsgs}
              chatInput={chatInput}
              setChatInput={setChatInput}
              sendChat={sendChat}
            />
          </div>
        )}
      </div>

      {/* Sticky action bar */}
      <div className={`sticky bottom-0 left-0 right-0 z-20 transition-transform ${count > 0 ? 'translate-y-0' : 'translate-y-full'}`}>
        <div className="bg-white border-t border-slate-200 shadow-lg">
          <div className="max-w-[1400px] mx-auto px-4 lg:px-10 py-3 flex items-center gap-2 overflow-x-auto slim">
            <div className="hidden sm:block text-[12px] text-slate-500 me-2 shrink-0">
              {count} {count === 1 ? t.books.selected : t.books.selectedPlural}
            </div>
            {(Object.keys(ACTION_META) as ActionKey[]).map((key) => (
              <ActionButton
                key={key}
                glyph={ACTION_META[key].glyph}
                label={t.books.action[key]}
                sub={t.books.actionSub[key]}
                active={action === key}
                onClick={() => runAction(key)}
              />
            ))}
          </div>
        </div>
      </div>
    </ChromeLayout>
  );
}

function FilterPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold border transition
        ${active ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
    >
      {children}
    </button>
  );
}

function BookCard({ book, selected, onToggle }: { book: Book; selected: boolean; onToggle: () => void }) {
  const { isAR, t } = useApp();
  const meta = SUBJECT_META[book.subject];
  const h = HUE[meta.hue];
  const isLocked = book.status !== 'indexed';

  return (
    <button
      onClick={onToggle}
      disabled={isLocked}
      className={`text-start group rounded-2xl border bg-white overflow-hidden transition-all
        ${selected ? 'border-sky-500 ring-2 ring-sky-200 shadow-md' : 'border-slate-200 hover:border-slate-300 hover:shadow-sm'}
        ${isLocked ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer card-lift'}`}
    >
      <div className={`relative aspect-[5/3] ${h.bg} grid place-items-center`} style={{ background: gradientFor(meta.hue) }}>
        <div className="text-6xl drop-shadow-sm">{meta.glyph}</div>
        <div className="absolute top-3 start-3">
          <StatusBadge status={book.status} />
        </div>
        <div className="absolute top-3 end-3">
          <div className={`w-7 h-7 rounded-full grid place-items-center border-2 transition
            ${selected ? 'bg-sky-600 border-sky-600 text-white' : 'bg-white/90 border-white text-transparent'}`}>
            <span className="text-[12px] font-bold ltr">✓</span>
          </div>
        </div>
        <div className="absolute bottom-3 end-3">
          <Ring value={book.mastery} size={36} stroke={4} />
        </div>
      </div>

      <div className="p-4">
        <SubjectChip id={book.subject} size="sm" />
        <div className="font-extrabold text-slate-900 text-[14.5px] mt-2 leading-snug line-clamp-2">
          {isAR ? book.arT : book.enT}
        </div>
        <div className="text-[11.5px] text-slate-500 mt-1 line-clamp-1">{isAR ? book.arSub : book.enSub}</div>
        <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-3 ltr">
          <span>{book.chapters} {t.books.chapters}</span>
          <span>·</span>
          <span>{book.pages} {t.books.pages}</span>
          <span className="ms-auto text-slate-400">{isAR ? book.lastAccessedAr : book.lastAccessedEn}</span>
        </div>
      </div>
    </button>
  );
}

function StatusBadge({ status }: { status: Book['status'] }) {
  const { t } = useApp();
  const cls = status === 'indexed' ? 'bg-emerald-500 text-white'
            : status === 'processing' ? 'bg-amber-500 text-white animate-pulse'
            : 'bg-slate-400 text-white';
  const label = status === 'indexed' ? t.books.indexed
              : status === 'processing' ? t.books.processing
              : t.books.queued;
  const glyph = status === 'indexed' ? '✓' : status === 'processing' ? '⟳' : '⏳';
  return (
    <span className={`inline-flex items-center gap-1 ${cls} rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide`}>
      <span className="ltr">{glyph}</span><span>{label}</span>
    </span>
  );
}

function ActionButton({ glyph, label, sub, active, onClick }: {
  glyph: string; label: string; sub: string; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={sub}
      className={`shrink-0 flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] font-semibold transition border
        ${active ? 'bg-sky-600 text-white border-sky-600 shadow-sm' : 'bg-white border-slate-200 text-slate-700 hover:border-sky-400 hover:text-sky-700'}`}
    >
      <span className="text-[16px] leading-none">{glyph}</span>
      <span>{label}</span>
    </button>
  );
}

function ResultPanel({
  actionKey, books, log, loading, payload, onClose, onGoToQuiz,
  chatMsgs, chatInput, setChatInput, sendChat
}: {
  actionKey: ActionKey;
  books: Book[];
  log: AgentLogLine[] | null;
  loading: boolean;
  payload: Record<string, unknown> | null;
  onClose: () => void;
  onGoToQuiz: () => void;
  chatMsgs: { who: 'me' | '5sosy'; ar: string; en: string }[];
  chatInput: string;
  setChatInput: (v: string) => void;
  sendChat: () => void;
}) {
  const { isAR, t } = useApp();
  const meta = ACTION_META[actionKey];
  const titles = books.map((b) => (isAR ? b.arT : b.enT));

  return (
    <Card className="overflow-hidden">
      <div className="px-5 pt-5 pb-3 flex items-center gap-3 border-b border-slate-100">
        <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-700 grid place-items-center text-xl">{meta.glyph}</div>
        <div className="flex-1 min-w-0">
          <div className="font-extrabold text-slate-900 text-[15px]">{t.books.action[actionKey]}</div>
          <div className="text-[12px] text-slate-500 truncate">
            {books.length === 1 ? titles[0] : `${books.length} ${isAR ? 'كتب' : 'books'} · ${titles.slice(0, 2).join(' + ')}${books.length > 2 ? '…' : ''}`}
          </div>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-[18px] px-2">✕</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12">
        <div className="lg:col-span-7 p-5 border-e border-slate-100 min-w-0">
          {actionKey === 'chat' ? (
            <ChatPanel msgs={chatMsgs} input={chatInput} setInput={setChatInput} send={sendChat} />
          ) : (
            <ActionResult actionKey={actionKey} loading={loading} payload={payload} books={books} onGoToQuiz={onGoToQuiz} />
          )}
        </div>
        <div className="lg:col-span-5 bg-slate-50 p-4 min-w-0">
          <div className="text-[11px] text-slate-500 mb-2 ltr">{t.books.panelHint}</div>
          {log && <AgentLog lines={log} heading={`${meta.agent}.log`} speed={11} />}
        </div>
      </div>
    </Card>
  );
}

function ActionResult({
  actionKey, loading, payload, books, onGoToQuiz
}: {
  actionKey: Exclude<ActionKey, 'chat'>;
  loading: boolean;
  payload: Record<string, unknown> | null;
  books: Book[];
  onGoToQuiz: () => void;
}) {
  const { isAR, t } = useApp();

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-3 rounded bg-slate-200 animate-pulse" />
        <div className="h-3 rounded bg-slate-200 animate-pulse w-[85%]" />
        <div className="h-3 rounded bg-slate-200 animate-pulse w-[70%]" />
        <div className="text-[11px] text-slate-500 mt-3">{t.books.workingOn}…</div>
      </div>
    );
  }

  if (actionKey === 'summarize') {
    return (
      <div>
        <div className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-[10.5px] font-bold px-2 py-0.5 rounded uppercase mb-3">
          ✓ {t.books.resultReady}
        </div>
        <p className="text-[14.5px] leading-[1.85] text-slate-700">
          {isAR
            ? `الكتب اللي اخترتها بتغطّي ${books.length} موضوع رئيسي. أهم المفاهيم: قوانين الغازات (بويل، شارل، PV=nRT)، التحويلات الحرارية، والعلاقات بين الضغط والحجم والحرارة. الفصل الثالث بيركّز على التطبيقات العملية، والفصل الرابع بيوسّع للسوائل.`
            : `Your selection covers ${books.length} core topic${books.length > 1 ? 's' : ''}. The key concepts: gas laws (Boyle's, Charles', PV=nRT), thermal transformations, and the relationships between P, V, T. Chapter 3 focuses on practical applications; Chapter 4 extends to fluids.`}
        </p>
        <ul className="mt-4 space-y-2 text-[13px] text-slate-700">
          <li className="flex gap-2"><span className="text-sky-600">▸</span><span>{isAR ? 'مفهوم: العلاقة العكسية بين P و V عند ثبات الحرارة' : 'Concept: inverse P–V relationship at constant T'}</span></li>
          <li className="flex gap-2"><span className="text-sky-600">▸</span><span>{isAR ? 'صيغة: P₁V₁ = P₂V₂' : 'Formula: P₁V₁ = P₂V₂'}</span></li>
          <li className="flex gap-2"><span className="text-sky-600">▸</span><span>{isAR ? 'فخ: التحويل من سيليزيوس لكلفن قبل الحساب' : 'Pitfall: convert °C → K before computing'}</span></li>
        </ul>
      </div>
    );
  }

  if (actionKey === 'explain') {
    return (
      <div>
        <div className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 text-[10.5px] font-bold px-2 py-0.5 rounded uppercase mb-3">
          🇪🇬 {isAR ? 'بالمصري' : 'Egyptian colloquial'}
        </div>
        <p className="text-[14.5px] leading-[1.95] text-slate-800 bg-amber-50/60 border-s-2 border-amber-400 ps-4 py-2 rounded-e-md">
          {isAR
            ? 'تخيل عربية ميكروباص ملياااانة ركاب. لما العربية تكون كبيرة، الناس مرتاحة، الضغط على الباب قليل. بس لما العربية تصغر فجأة، الناس هتزحم وهتخبط في الباب أكتر — ده اللي بنسميه ضغط أعلى. والقانون يقولك: لو ضربت الضغط في الحجم، الإجابة هي هي قبل وبعد، طول ما الحرارة مش متغيرة. كده فهمتها يا نجم؟'
            : "Picture a packed microbus. When it's roomy, people are chill — low pressure on the doors. Suddenly squeeze them into half the space and they bang on the doors way more. That's higher pressure. The law says: multiply pressure × volume and you get the same number before and after, as long as the temperature didn't change. Got it, champ?"}
        </p>
      </div>
    );
  }

  if (actionKey === 'audio') {
    return <AudioBlock />;
  }

  if (actionKey === 'quiz') {
    return (
      <div>
        <div className="inline-flex items-center gap-1 bg-violet-50 text-violet-700 text-[10.5px] font-bold px-2 py-0.5 rounded uppercase mb-3">
          ✓ {t.books.resultReady} · 5Q
        </div>
        <p className="text-[14.5px] text-slate-700 mb-4">
          {isAR
            ? 'حضّرت لك كويز ٥ أسئلة من الكتب اللي اخترتها. متوسط الصعوبة: متوسط. وقت متوقع: دقيقتين.'
            : "I built a 5-question quiz from your selection. Difficulty: medium. Expected time: ~2 minutes."}
        </p>
        <Btn kind="primary" onClick={onGoToQuiz}>
          ✓ {t.books.goToQuiz} <span className="ltr">→</span>
        </Btn>
      </div>
    );
  }

  if (actionKey === 'questions') {
    const items = isAR
      ? ['اشتق T من المعادلة PV=nRT — الخطوات والوحدات', 'لو ضغط غاز ٢ atm وحجمه ٤ لتر، احسب الحجم عند ٤ atm', 'علاقة بويل وعلاقة شارل — فرّق بينهم بمثال', 'ليه بنحول لكلفن قبل الحساب؟', 'استنتج العلاقة بين الكثافة وضغط الغاز']
      : ['Derive T from PV=nRT — show steps and units', 'A gas at 2 atm occupies 4 L. Find V at 4 atm', "Boyle's vs Charles' — distinguish with an example", 'Why must T be in Kelvin before calculating?', 'Relate gas density to pressure'];
    return (
      <div>
        <div className="inline-flex items-center gap-1 bg-rose-50 text-rose-700 text-[10.5px] font-bold px-2 py-0.5 rounded uppercase mb-3">
          ❓ {isAR ? 'أسئلة وزارية متكررة' : 'Frequent ministerial Qs'}
        </div>
        <ol className="space-y-2 text-[14px] text-slate-700">
          {items.map((q, i) => (
            <li key={i} className="flex gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-rose-100 text-rose-700 grid place-items-center text-[11px] font-bold ltr">{i + 1}</span>
              <span className="flex-1">{q}</span>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  return null;
}

function AudioBlock() {
  const { isAR } = useApp();
  const [playing, setPlaying] = useState(false);
  return (
    <div>
      <div className="inline-flex items-center gap-1 bg-sky-50 text-sky-700 text-[10.5px] font-bold px-2 py-0.5 rounded uppercase mb-3">
        🎧 EG-AR voice
      </div>
      <div className="bg-slate-900 rounded-xl p-4 flex items-center gap-3">
        <button onClick={() => setPlaying((p) => !p)}
          className="w-12 h-12 rounded-full bg-sky-500 hover:bg-sky-400 text-white grid place-items-center text-[14px] shadow-lg shadow-sky-900/40">
          <span className="ltr">{playing ? '❚❚' : '▶'}</span>
        </button>
        <div className="flex-1 flex items-end h-10 gap-[1.5px]">
          {Array.from({ length: 36 }).map((_, i) => (
            <span key={i} className="wave-bar"
              style={{
                animationDelay: `${(i * 60) % 700}ms`,
                animationPlayState: playing ? 'running' : 'paused',
                height: playing ? undefined : `${6 + (i % 8) * 2}px`,
                background: i > 20 ? '#0ea5e9' : '#38bdf8'
              }} />
          ))}
        </div>
        <span className="text-slate-300 text-[12px] ltr">2:18</span>
      </div>
      <p className="text-[13px] text-slate-600 mt-3 leading-relaxed">
        {isAR
          ? 'الملخص الصوتي ده مولّد بواسطة AV agent، بصوت عربي مصري ودود. بيغطي الفصلين الأساسيين في الكتب اللي اخترتها.'
          : 'Audio summary generated by the AV agent in a warm Egyptian-Arabic voice. Covers the two core chapters across your selection.'}
      </p>
    </div>
  );
}

function ChatPanel({ msgs, input, setInput, send }: {
  msgs: { who: 'me' | '5sosy'; ar: string; en: string }[];
  input: string; setInput: (v: string) => void; send: () => void;
}) {
  const { isAR, t } = useApp();
  return (
    <div className="flex flex-col h-[420px]">
      <div className="flex-1 overflow-y-auto slim space-y-2 mb-3 pe-1">
        {msgs.length === 0 && (
          <div className="text-center text-slate-400 text-[13px] py-12">{t.books.selectToBegin}</div>
        )}
        {msgs.map((m, i) => {
          const me = m.who === 'me';
          return (
            <div key={i} className={`flex ${me ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed
                ${me ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-800'}`}>
                {isAR ? m.ar : m.en}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder={t.books.chatPh}
          className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-[13.5px] focus:outline-none focus:border-sky-400"
        />
        <button onClick={send} className="w-11 h-11 rounded-lg bg-sky-600 hover:bg-sky-700 text-white grid place-items-center">
          <span className="ltr text-[14px]">↑</span>
        </button>
      </div>
    </div>
  );
}

function gradientFor(hue: HueId): string {
  const stops: Record<HueId, [string, string]> = {
    sky:     ['#bae6fd', '#0284c7'],
    violet:  ['#ddd6fe', '#7c3aed'],
    emerald: ['#a7f3d0', '#059669'],
    amber:   ['#fde68a', '#d97706'],
    rose:    ['#fecdd3', '#e11d48'],
    indigo:  ['#c7d2fe', '#4f46e5'],
    cyan:    ['#a5f3fc', '#0891b2'],
    stone:   ['#e7e5e4', '#78716c'],
    fuchsia: ['#fbcfe8', '#c026d3'],
    teal:    ['#99f6e4', '#0d9488']
  };
  const [a, b] = stops[hue];
  return `linear-gradient(135deg, ${a} 0%, ${b} 100%)`;
}

function buildLog(action: ActionKey, books: Book[], isAR: boolean): AgentLogLine[] {
  const titles = books.map((b) => (isAR ? b.arT : b.enT)).join(', ');
  const meta = ACTION_META[action];
  const lab = meta.agent[0].toUpperCase() + meta.agent.slice(1) + 'Agent';
  const intro = `Routing intent to ${meta.agent} (mode=${meta.mode})`;
  const fetch = `Fetching embeddings for ${books.length} book${books.length > 1 ? 's' : ''} from Vertex AI…`;
  const finalMap: Record<ActionKey, string> = {
    chat:      'Context loaded. Ready for follow-up turns.',
    summarize: 'Extracted 12 key concepts → distilled to 4-paragraph summary.',
    explain:   'Re-rendered explanation in Egyptian Arabic register.',
    audio:     'Synthesized 2:18 narration · eg-ar-female-warm voice.',
    quiz:      'Generated 5 MCQs · calibrated to your mastery curve.',
    questions: 'Cross-referenced 4 years of ministerial exams.'
  };
  return [
    { agent: 'Orchestrator', text: intro, status: 'info' },
    { agent: 'IngestionAgent', text: fetch },
    { agent: lab, text: `Source corpus: ${titles}.`, status: 'info' },
    { agent: lab, text: finalMap[action], status: 'ok' }
  ];
}
