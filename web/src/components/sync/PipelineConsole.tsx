'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { doc, onSnapshot, Timestamp } from 'firebase/firestore';
import { getFirebase } from '@/lib/firebase/client';
import { useAuth } from '@/lib/firebase/auth-context';

/* ───────────────────────── types ───────────────────────── */
/* ... existing types omitted for brevity ... */

type JobKind = 'harvester' | 'analyzer' | 'migration' | 'reconcile' | 'mindmap';
type JobCommand = 'start' | 'pause' | 'resume' | 'stop' | 'reset';
type JobStatus = 'idle' | 'running' | 'paused' | 'completed' | 'error';

export type PipelineJobStatus = {
  status?: JobStatus | string;
  pausedByRequest?: boolean;
  autoRestart?: boolean;
  totalBooks?: number;
  downloadedBooks?: number;
  indexedBooks?: number;
  skippedBooks?: number;
  failedBooks?: number;
  totalPagesProcessed?: number;
  percentage?: number;
  activeBookTitle?: string;
  progressMessage?: string;
  errorMessage?: string;
  executionName?: string;
  mountPath?: string;
  startedAt?: Timestamp | { toMillis?: () => number } | null;
  lastHeartbeatAt?: Timestamp | { toMillis?: () => number } | null;
  logs?: Array<{ timestamp?: string; text?: string; status?: string; agent?: string }>;
  results?: {
    books?: number;
    book_pages?: number;
    users?: number;
    [key: string]: any;
  };
  evaluation?: {
    passed?: boolean;
    [key: string]: any;
  };
};

type JobCardConfig = {
  kind: JobKind;
  icon: string;
  titleAR: string;
  titleEN: string;
  subAR: string;
  subEN: string;
  primaryMetric: 'downloaded' | 'indexed';
};

const CARDS: JobCardConfig[] = [
  {
    kind: 'harvester',
    icon: '📥',
    titleAR: 'مهمة جمع الكتب',
    titleEN: 'Get Books',
    subAR: 'تنزيل ملفات PDF من بوابة الوزارة ورفعها إلى التخزين السحابي',
    subEN: 'Download MOE PDFs and stage them in cloud storage',
    primaryMetric: 'downloaded',
  },
  {
    kind: 'analyzer',
    icon: '🧠',
    titleAR: 'مهمة تحليل الكتب',
    titleEN: 'Analyze Books',
    subAR: 'استخراج المحتوى صفحة بصفحة مباشرة من التخزين وفهرسته',
    subEN: 'Stream pages directly from storage, OCR + embed + index',
    primaryMetric: 'indexed',
  },
  {
    kind: 'migration',
    icon: '🔄',
    titleAR: 'مهمة ترحيل البيانات',
    titleEN: 'Data Migration',
    subAR: 'ترحيل البيانات بالكامل من قاعدة Firestore الحالية إلى MongoDB',
    subEN: 'Migrate all data from Firestore to the new MongoDB cluster',
    primaryMetric: 'indexed',
  },
  {
    kind: 'reconcile',
    icon: '🧩',
    titleAR: 'مهمة مطابقة بيانات الصفحات',
    titleEN: 'Page Reconciliation',
    subAR: 'نسخ المادة والصف والنوع واللغة والكلمات المفتاحية إلى صفحات الكتب لتحسين البحث',
    subEN: 'Backfill subject/grade/type/language + keywords onto book pages for better search',
    primaryMetric: 'indexed',
  },
  {
    kind: 'mindmap',
    icon: '🗺️',
    titleAR: 'مهمة الخريطة المفاهيمية',
    titleEN: 'Mind-Map Builder',
    subAR: 'تجميع تضمينات الصفحات في مفاهيم وربطها عبر الصفوف الدراسية',
    subEN: 'Cluster page embeddings into concepts + cross-grade lineage',
    primaryMetric: 'indexed',
  },
];

/* ───────────────────────── helpers ───────────────────────── */

const STATUS_TONE: Record<string, { dot: string; bg: string; text: string; label: string }> = {
  running:   { dot: 'bg-emerald-500 animate-pulse', bg: 'bg-emerald-50',  text: 'text-emerald-700', label: 'Running' },
  paused:    { dot: 'bg-amber-500',                  bg: 'bg-amber-50',    text: 'text-amber-700',   label: 'Paused' },
  completed: { dot: 'bg-sky-500',                    bg: 'bg-sky-50',      text: 'text-sky-700',     label: 'Completed' },
  error:     { dot: 'bg-rose-500',                   bg: 'bg-rose-50',     text: 'text-rose-700',    label: 'Error' },
  idle:      { dot: 'bg-slate-400',                  bg: 'bg-slate-100',   text: 'text-slate-600',   label: 'Idle' },
};

function statusTone(s?: string) {
  return STATUS_TONE[(s || 'idle').toLowerCase()] || STATUS_TONE.idle;
}

function toMillis(ts: unknown): number {
  const v = ts as { toMillis?: () => number } | undefined | null;
  return v && typeof v.toMillis === 'function' ? v.toMillis() : 0;
}

function heartbeatMs(s?: PipelineJobStatus): number {
  return toMillis(s?.lastHeartbeatAt);
}

function startedAtMs(s?: PipelineJobStatus): number {
  return toMillis(s?.startedAt);
}

function isStale(s: PipelineJobStatus | null, nowTick: number): boolean {
  if (!s || s.status !== 'running') return false;
  const hb = heartbeatMs(s);
  return hb > 0 && nowTick - hb > 90_000;
}

function executionShortId(s?: PipelineJobStatus | null): string {
  return s?.executionName?.split('/').pop() || '';
}

/** Human-readable "5s ago", "2m ago", "1h 12m ago". */
function relativeAgo(ms: number, nowTick: number, isAR: boolean): string {
  if (!ms) return '';
  const diff = Math.max(0, Math.floor((nowTick - ms) / 1000));
  if (diff < 60) return isAR ? `قبل ${diff} ثانية` : `${diff}s ago`;
  const m = Math.floor(diff / 60);
  if (m < 60) return isAR ? `قبل ${m} دقيقة` : `${m}m ago`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return isAR ? `قبل ${h} س ${rm} د` : `${h}h ${rm}m ago`;
}

function fmtDuration(secs: number, isAR: boolean): string {
  if (!isFinite(secs) || secs <= 0) return '—';
  if (secs < 60) return isAR ? `${Math.round(secs)} ث` : `${Math.round(secs)}s`;
  const m = Math.floor(secs / 60);
  if (m < 60) {
    const s = Math.round(secs - m * 60);
    return isAR ? `${m} د ${s} ث` : `${m}m ${s}s`;
  }
  const h = Math.floor(m / 60);
  const rm = m - h * 60;
  return isAR ? `${h} س ${rm} د` : `${h}h ${rm}m`;
}

/** Compute throughput (items/min) and ETA seconds based on elapsed wall-clock. */
function deriveThroughput(s: PipelineJobStatus | null, processedKey: 'downloadedBooks' | 'indexedBooks', nowTick: number) {
  if (!s || s.status !== 'running') return { perMin: 0, etaSec: 0 };
  const started = startedAtMs(s);
  if (!started) return { perMin: 0, etaSec: 0 };
  const elapsedSec = Math.max(1, (nowTick - started) / 1000);
  const processed = (s[processedKey] ?? 0) as number;
  const remaining = Math.max(0, (s.totalBooks ?? 0) - processed - (s.skippedBooks ?? 0));
  const perSec = processed / elapsedSec;
  const perMin = perSec * 60;
  const etaSec = perSec > 0 ? remaining / perSec : 0;
  return { perMin, etaSec };
}

/* ───────────────────────── component ───────────────────────── */

type Props = { isAR: boolean };

export default function PipelineConsole({ isAR }: Props) {
  const { user } = useAuth();
  const isAdmin = user?.email === 'hesham1988@gmail.com';

  const [harvester, setHarvester] = useState<PipelineJobStatus | null>(null);
  const [analyzer, setAnalyzer] = useState<PipelineJobStatus | null>(null);
  const [migration, setMigration] = useState<PipelineJobStatus | null>(null);
  const [reconcile, setReconcile] = useState<PipelineJobStatus | null>(null);
  const [mindmap, setMindmap] = useState<PipelineJobStatus | null>(null);
  const [busy, setBusy] = useState<Record<JobKind, JobCommand | null>>({ harvester: null, analyzer: null, migration: null, reconcile: null, mindmap: null });
  const [nowTick, setNowTick] = useState(Date.now());

  // Firestore real-time listeners on the three status docs
  useEffect(() => {
    try {
      const { db } = getFirebase();
      const unsubH = onSnapshot(
        doc(db, 'ingestion', 'harvester_status'),
        (snap) => setHarvester(snap.exists() ? (snap.data() as PipelineJobStatus) : null),
        (err) => console.error('[pipeline] harvester listener failed:', err),
      );
      const unsubA = onSnapshot(
        doc(db, 'ingestion', 'analyzer_status'),
        (snap) => setAnalyzer(snap.exists() ? (snap.data() as PipelineJobStatus) : null),
        (err) => console.error('[pipeline] analyzer listener failed:', err),
      );
      const unsubM = onSnapshot(
        doc(db, 'ingestion', 'migration_status'),
        (snap) => setMigration(snap.exists() ? (snap.data() as PipelineJobStatus) : null),
        (err) => console.error('[pipeline] migration listener failed:', err),
      );
      const unsubR = onSnapshot(
        doc(db, 'ingestion', 'reconcile_status'),
        (snap) => setReconcile(snap.exists() ? (snap.data() as PipelineJobStatus) : null),
        (err) => console.error('[pipeline] reconcile listener failed:', err),
      );
      const unsubMm = onSnapshot(
        doc(db, 'ingestion', 'mindmap_status'),
        (snap) => setMindmap(snap.exists() ? (snap.data() as PipelineJobStatus) : null),
        (err) => console.error('[pipeline] mindmap listener failed:', err),
      );
      return () => {
        unsubH();
        unsubA();
        unsubM();
        unsubR();
        unsubMm();
      };
    } catch (e) {
      console.error('[pipeline] init failed:', e);
    }
  }, []);

  // tick for heartbeat staleness recompute
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 10_000);
    return () => clearInterval(id);
  }, []);

  async function trigger(kind: JobKind, command: JobCommand) {
    setBusy((b) => ({ ...b, [kind]: command }));
    try {
      const res = await fetch(`/api/agents/${kind}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ command }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error(`[pipeline] ${kind}/${command} failed:`, err);
      }
    } catch (e) {
      console.error(`[pipeline] ${kind}/${command} error:`, e);
    } finally {
      setTimeout(() => setBusy((b) => ({ ...b, [kind]: null })), 800);
    }
  }

  const statuses: Record<JobKind, PipelineJobStatus | null> = {
    harvester,
    analyzer,
    migration,
    reconcile,
    mindmap,
  };

  return (
    <section className="relative mb-6 space-y-4">
      {!isAdmin && (
        <div className="absolute inset-0 z-20 bg-slate-900/40 backdrop-blur-[2px] rounded-2xl flex flex-col items-center justify-center p-6 text-center select-none animate-fade-in">
          <div className="bg-slate-950/80 border border-white/10 backdrop-blur-md px-6 py-5 rounded-2xl max-w-sm shadow-2xl flex flex-col items-center gap-3">
            <span className="text-3xl">🔒</span>
            <h3 className="font-extrabold text-[15px] text-white">
              {isAR ? 'الوصول مقتصر على المشرفين' : 'Admin Restricted Area'}
            </h3>
            <p className="text-[12px] text-slate-350">
              {isAR 
                ? 'مزامنة وإدارة خط الإنتاج متاح فقط للمشرف المرخص.' 
                : 'Pipeline management is locked. Only accessible by authorized administrators.'}
            </p>
          </div>
        </div>
      )}

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[16px] font-extrabold text-slate-900 flex items-center gap-2">
            <span>⚙️</span> {isAR ? 'لوحة تحكم خط الإنتاج' : 'Pipeline Console'}
          </h2>
          <p className="text-[12px] text-slate-500 mt-0.5">
            {isAR
              ? 'تشغيل مهام جمع وتحليل الكتب بشكل مستقل، مع تتبع لحظي للتقدم'
              : 'Run the get-books and analyze-books jobs independently, with live progress.'}
          </p>
        </div>
      </header>

      <div className="space-y-4">
        {CARDS.map((cfg) => (
          <JobCard
            key={cfg.kind}
            cfg={cfg}
            isAR={isAR}
            status={statuses[cfg.kind]}
            stale={isStale(statuses[cfg.kind], nowTick)}
            busy={busy[cfg.kind]}
            onCommand={(cmd) => trigger(cfg.kind, cmd)}
          />
        ))}
      </div>
    </section>
  );
}

/* ───────────────────────── card ───────────────────────── */

type JobCardProps = {
  cfg: JobCardConfig;
  isAR: boolean;
  status: PipelineJobStatus | null;
  stale: boolean;
  busy: JobCommand | null;
  onCommand: (cmd: JobCommand) => void;
};

function JobCard({ cfg, isAR, status, stale, busy, onCommand }: JobCardProps) {
  const s = status?.status ?? 'idle';
  const tone = statusTone(s);
  const pct = Math.max(0, Math.min(100, status?.percentage ?? 0));

  const total = status?.totalBooks ?? 0;
  const processedKey = cfg.primaryMetric === 'downloaded' ? 'downloadedBooks' : 'indexedBooks';
  const primary = (status?.[processedKey] ?? 0) as number;
  const failed = status?.failedBooks ?? 0;
  const skipped = status?.skippedBooks ?? 0;

  const exec = executionShortId(status);
  const logsUrl = exec
    ? `https://console.cloud.google.com/run/jobs/executions/details/us-east4/${exec}/logs?project=khsosy`
    : '';

  // 1s tick locally so "last update X ago" + ETA refresh smoothly even when
  // the status doc doesn't change.
  const [nowTick, setNowTick] = useState<number>(Date.now());
  useEffect(() => {
    if (s !== 'running' && s !== 'paused') return;
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [s]);

  const { perMin, etaSec } = useMemo(
    () => deriveThroughput(status, processedKey, nowTick),
    [status, processedKey, nowTick],
  );
  const hbAgo = relativeAgo(heartbeatMs(status ?? undefined), nowTick, isAR);

  // Full log history, newest first, used by the scrollable console.
  const fullLogs = useMemo(() => (status?.logs ?? []).slice().reverse(), [status?.logs]);

  // Auto-scroll the console to the top whenever a new log lands (we render
  // newest first, so the top edge is the freshest entry).
  const consoleRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (consoleRef.current) consoleRef.current.scrollTop = 0;
  }, [fullLogs.length]);

  // Button visibility — Start when idle/completed/error, Pause when running, Resume when paused.
  // Stop kills the execution and disables auto-restart; only meaningful while running.
  // Reset is always available except mid-run; we still show it as a destructive secondary action.
  const showStart = s === 'idle' || s === 'completed' || !status;
  const showPause = s === 'running';
  const showResume = (s === 'paused' || s === 'error') && cfg.kind !== 'migration';
  const showStop = s === 'running' || s === 'paused';
  const showReset = s !== 'running';

  return (
    <article className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-2xl leading-none">{cfg.icon}</span>
            <h3 className="text-[15px] font-extrabold text-slate-900">
              {isAR ? cfg.titleAR : cfg.titleEN}
            </h3>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold border border-transparent ${tone.bg} ${tone.text}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${tone.dot}`} />
              {isAR ? tone.label : tone.label}
            </span>
          </div>
          <p className="text-[12px] text-slate-500 mt-0.5 max-w-xl">{isAR ? cfg.subAR : cfg.subEN}</p>
        </div>

        {/* Control buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {showStart && (
            <CtrlBtn tone="primary" busy={busy === 'start'} onClick={() => onCommand('start')}>
              <span>▶</span> {isAR ? 'تشغيل' : 'Start'}
            </CtrlBtn>
          )}
          {showResume && (
            <CtrlBtn tone="primary" busy={busy === 'resume'} onClick={() => onCommand('resume')}>
              <span>▶</span> {isAR ? 'استئناف' : 'Resume'}
            </CtrlBtn>
          )}
          {showPause && (
            <CtrlBtn tone="warn" busy={busy === 'pause'} onClick={() => onCommand('pause')}>
              <span>⏸</span> {isAR ? 'إيقاف مؤقت' : 'Pause'}
            </CtrlBtn>
          )}
          {showStop && (
            <CtrlBtn tone="danger" busy={busy === 'stop'} onClick={() => {
              if (confirm(isAR
                ? 'إيقاف المهمة فوراً؟ الكتب المعالجة حتى الآن ستبقى.'
                : 'Stop this job now? Books processed so far are kept.')) {
                onCommand('stop');
              }
            }}>
              <span>■</span> {isAR ? 'إيقاف' : 'Stop'}
            </CtrlBtn>
          )}
          {showReset && (
            <CtrlBtn tone="ghost" busy={busy === 'reset'} onClick={() => {
              const msg = cfg.kind === 'migration'
                ? (isAR
                    ? 'هل تريد ترحيل البيانات مع إعادة ضبط قاعدة MongoDB بالكامل؟ هذا الإجراء سيقوم بمسح الجداول في MongoDB والبدء من جديد.'
                    : 'Wipe all target MongoDB collections and start the migration from scratch?')
                : cfg.kind === 'harvester'
                ? (isAR
                    ? 'إعادة ضبط كاملة لجمع الكتب — سيتم حذف جميع كتب وملفات المزامنة. تأكيد؟'
                    : 'Reset the harvester? This wipes all books + PDFs from Firestore (storage objects kept).')
                : (isAR
                    ? 'إعادة ضبط تحليل الكتب — سيتم مسح الفهرسة لكل كتاب وإعادة تعيين الحالة إلى "downloaded". الملفات تبقى. تأكيد؟'
                    : 'Reset the analyzer? Indexed books revert to status=downloaded; pages + content are deleted. PDFs are kept.');
              if (confirm(msg)) onCommand('reset');
            }}>
              {isAR ? 'إعادة ضبط' : 'Reset'}
            </CtrlBtn>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="px-5 py-4 space-y-4">
        {/* Progress bar + percentage + throughput/ETA */}
        <div>
          <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">
              {isAR ? 'التقدم' : 'Progress'}
            </span>
            <div className="flex items-center gap-3 text-[11px] text-slate-600">
              {s === 'running' && cfg.kind !== 'migration' && perMin > 0 && (
                <span className="font-mono">
                  ⚡ {perMin.toFixed(1)} {isAR ? 'كتاب/د' : 'books/min'}
                </span>
              )}
              {s === 'running' && cfg.kind !== 'migration' && etaSec > 0 && (
                <span className="font-mono text-slate-500">
                  ⏱ ETA {fmtDuration(etaSec, isAR)}
                </span>
              )}
              <span className="text-[12px] font-bold text-slate-700">{pct.toFixed(0)}%</span>
            </div>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${s === 'error' ? 'bg-rose-500' : s === 'paused' ? 'bg-amber-500' : 'bg-emerald-500'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          {hbAgo && (s === 'running' || s === 'paused') && (
            <div className="mt-1 text-[10.5px] text-slate-400 ltr">
              {isAR ? 'آخر تحديث: ' : 'last update '}
              <span className="font-mono">{hbAgo}</span>
            </div>
          )}
        </div>

        {/* Stats */}
        {cfg.kind === 'migration' ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Stat label={isAR ? 'الكتب المنقولة' : 'Books'} value={status?.results?.books ?? 0} tone="slate" />
            <Stat label={isAR ? 'الصفحات المنقولة' : 'Pages'} value={status?.results?.book_pages ?? 0} tone="sky" />
            <Stat label={isAR ? 'المستخدمين' : 'Users'} value={status?.results?.users ?? 0} tone="emerald" />
            <Stat
              label={isAR ? 'التحقق' : 'Validation'}
              value={
                s === 'completed'
                  ? (isAR ? 'ناجح ✓' : 'Passed ✓')
                  : s === 'error'
                  ? (isAR ? 'فشل ❌' : 'Failed ❌')
                  : (isAR ? 'معلق' : 'Pending')
              }
              tone={s === 'completed' ? 'emerald' : s === 'error' ? 'rose' : 'slate'}
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Stat label={isAR ? 'إجمالي' : 'Total'} value={total} tone="slate" />
            <Stat
              label={cfg.primaryMetric === 'downloaded'
                ? (isAR ? 'تم التنزيل' : 'Downloaded')
                : (isAR ? 'مفهرس' : 'Indexed')}
              value={primary}
              tone="emerald"
            />
            {cfg.primaryMetric === 'downloaded' && skipped > 0 && (
              <Stat label={isAR ? 'متخطى' : 'Skipped'} value={skipped} tone="sky" />
            )}
            {cfg.primaryMetric === 'indexed' && (status?.totalPagesProcessed ?? 0) > 0 && (
              <Stat label={isAR ? 'صفحات' : 'Pages'} value={status?.totalPagesProcessed ?? 0} tone="sky" />
            )}
            <Stat label={isAR ? 'فشل' : 'Failed'} value={failed} tone={failed > 0 ? 'rose' : 'slate'} />
          </div>
        )}

        {/* Active book line */}
        {status?.activeBookTitle && (
          <div className="text-[12.5px] text-slate-600 flex items-center gap-2">
            <span className="text-emerald-500">●</span>
            <span className="truncate font-semibold">{status.activeBookTitle}</span>
            {status.progressMessage && (
              <span className="text-slate-400 truncate">— {status.progressMessage}</span>
            )}
          </div>
        )}

        {/* Banners */}
        {stale && (
          <Banner tone="warn" icon="⚠️"
            title={isAR ? 'لم تستلم نبضات حياة من المهمة منذ أكثر من ٩٠ ثانية.' : "Job hasn't checked in for over 90s."}
            body={isAR
              ? 'قد تكون المهمة قد توقفت. جرّب "إيقاف" ثم "تشغيل" من جديد، أو افحص سجلات Cloud Run.'
              : 'The Job container may have died. Try Stop → Start, or open Cloud Logging to inspect.'}
          />
        )}
        {s === 'error' && status?.errorMessage && (
          <Banner tone="error" icon="❌"
            title={isAR ? 'فشلت المهمة.' : 'Job failed.'}
            body={status.errorMessage}
            mono
          />
        )}

        {/* Footer: exec id + logs link + tail logs */}
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 ltr">
          {exec && (
            <span className="font-mono bg-slate-100 px-2 py-0.5 rounded">
              exec: {exec.slice(0, 22)}
            </span>
          )}
          {logsUrl && (
            <a href={logsUrl} target="_blank" rel="noopener noreferrer" className="text-sky-600 hover:text-sky-700 hover:underline">
              ↗ Cloud Logging
            </a>
          )}
          {status?.mountPath && cfg.kind === 'analyzer' && (
            <span className="font-mono bg-slate-100 px-2 py-0.5 rounded">
              mount: {status.mountPath}
            </span>
          )}
        </div>

        {/* Scrollable console — full log history (newest first) */}
        {fullLogs.length > 0 && (
          <div className="bg-slate-950 text-slate-100 border border-slate-800 rounded-xl overflow-hidden ltr">
            <div className="px-3 py-2 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {isAR ? 'سجل الكونسول' : 'Console log'}
              </div>
              <span className="text-[10px] font-mono text-slate-500">
                {fullLogs.length} {isAR ? 'سطر' : 'entries'}
              </span>
            </div>
            <div
              ref={consoleRef}
              className="max-h-[260px] overflow-y-auto px-3 py-2 space-y-1 slim font-mono text-[11.5px] leading-snug"
            >
              {fullLogs.map((log, i) => (
                <ConsoleLine key={i} log={log} />
              ))}
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

/* ───────────────────────── tiny atoms ───────────────────────── */

function CtrlBtn({
  tone, busy, onClick, children,
}: { tone: 'primary' | 'warn' | 'danger' | 'ghost'; busy?: boolean; onClick: () => void; children: React.ReactNode }) {
  const cls = {
    primary: 'bg-slate-900 hover:bg-slate-800 text-white shadow-sm',
    warn: 'bg-amber-500 hover:bg-amber-600 text-white shadow-sm',
    danger: 'bg-rose-600 hover:bg-rose-700 text-white shadow-sm',
    ghost: 'border border-rose-200 text-rose-600 hover:bg-rose-50',
  }[tone];
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={`px-3.5 py-1.5 rounded-lg text-[12.5px] font-bold transition flex items-center gap-1.5 disabled:opacity-60 ${cls}`}
    >
      {busy ? <span className="animate-spin">⚙️</span> : null}
      {children}
    </button>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone: 'slate' | 'emerald' | 'sky' | 'rose' }) {
  const palette = {
    slate:   'bg-slate-50 text-slate-700 border-slate-100',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    sky:     'bg-sky-50 text-sky-700 border-sky-100',
    rose:    'bg-rose-50 text-rose-700 border-rose-100',
  }[tone];
  return (
    <div className={`rounded-xl border px-3 py-2 ${palette}`}>
      <div className="text-[10px] font-bold uppercase tracking-wider opacity-70">{label}</div>
      <div className="text-[18px] font-extrabold leading-tight mt-0.5">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
    </div>
  );
}

function Banner({
  tone, icon, title, body, mono,
}: { tone: 'warn' | 'error'; icon: string; title: string; body: string; mono?: boolean }) {
  const palette = tone === 'error'
    ? 'bg-rose-50 border-rose-200 text-rose-900'
    : 'bg-amber-50 border-amber-200 text-amber-900';
  const subtone = tone === 'error' ? 'text-rose-700' : 'text-amber-700';
  return (
    <div className={`rounded-xl border p-3 text-[13px] flex items-start gap-2 ${palette}`}>
      <span className="text-lg leading-none">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="font-bold">{title}</div>
        <div className={`text-[12px] mt-0.5 ${subtone} ${mono ? 'font-mono break-all' : ''}`}>{body}</div>
      </div>
    </div>
  );
}

function ConsoleLine({ log }: { log: { timestamp?: string; text?: string; status?: string; agent?: string } }) {
  const lvl = (log.status || 'info').toLowerCase();
  const palette: Record<string, { dot: string; text: string }> = {
    error: { dot: 'bg-rose-400',   text: 'text-rose-200' },
    warn:  { dot: 'bg-amber-400',  text: 'text-amber-100' },
    ok:    { dot: 'bg-emerald-400', text: 'text-emerald-100' },
    info:  { dot: 'bg-sky-400',    text: 'text-slate-100' },
  };
  const p = palette[lvl] || palette.info;
  return (
    <div className="flex items-start gap-2">
      <span className={`mt-1.5 inline-block w-1.5 h-1.5 rounded-full shrink-0 ${p.dot}`} />
      <span className="text-slate-500 shrink-0">
        {log.timestamp?.slice(11, 19) || '         '}
      </span>
      {log.agent && (
        <span className="text-slate-400 shrink-0 uppercase text-[10px] mt-0.5">
          [{log.agent}]
        </span>
      )}
      <span className={`flex-1 break-words ${p.text}`}>{log.text}</span>
    </div>
  );
}
