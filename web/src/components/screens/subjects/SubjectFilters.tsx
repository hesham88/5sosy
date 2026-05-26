'use client';

type Option = { value: string; label: string };

type SubjectsDict = {
  searchPlaceholder: string;
  searchBtn: string;
  filtersTitle: string;
  gradeLabel: string;
  typeLabel: string;
  languageLabel: string;
  trackLabel: string;
  allGrades: string;
  allTypes: string;
  allLanguages: string;
  allTracks: string;
  resetFilters: string;
};

type Props = {
  t: SubjectsDict;
  isAR: boolean;
  q: string;
  setQ: (v: string) => void;
  gradeFilter: string;
  setGradeFilter: (v: string) => void;
  typeFilter: string;
  setTypeFilter: (v: string) => void;
  languageFilter: string;
  setLanguageFilter: (v: string) => void;
  trackFilter: string;
  setTrackFilter: (v: string) => void;
  gradeOptions: Option[];
  typeOptions: Option[];
  languageOptions: Option[];
  trackOptions: Option[];
  hasActiveFilters: boolean;
  onReset: () => void;
};

function Select({
  label,
  value,
  onChange,
  allLabel,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  allLabel: string;
  options: Option[];
}) {
  return (
    <label className="flex flex-col gap-1 min-w-0">
      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-[12.5px] font-semibold text-slate-700 focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200/50 transition"
      >
        <option value="all">{allLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function SubjectFilters({
  t,
  isAR,
  q,
  setQ,
  gradeFilter,
  setGradeFilter,
  typeFilter,
  setTypeFilter,
  languageFilter,
  setLanguageFilter,
  trackFilter,
  setTrackFilter,
  gradeOptions,
  typeOptions,
  languageOptions,
  trackOptions,
  hasActiveFilters,
  onReset,
}: Props) {
  return (
    <div className="mb-6 rounded-2xl border border-slate-200 bg-white shadow-sm p-4 lg:p-5 space-y-4">
      {/* Unified search box — spans subjects, books, grades, types, languages */}
      <div className="relative flex items-center rounded-xl bg-white border border-slate-200 p-1.5 focus-within:border-sky-500 focus-within:ring-2 focus-within:ring-sky-200/60 transition">
        <span className="text-lg px-2 text-slate-400">🔍</span>
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t.searchPlaceholder}
          className="flex-1 bg-transparent border-none text-[13.5px] text-slate-800 focus:outline-none py-1.5 min-w-0"
        />
        {q && (
          <button
            onClick={() => setQ('')}
            className="text-slate-400 hover:text-slate-700 text-lg px-2 select-none"
            aria-label={isAR ? 'مسح' : 'Clear'}
          >
            ✕
          </button>
        )}
      </div>

      {/* Multi-attribute filters */}
      <div className="flex flex-wrap items-end gap-3">
        <Select label={t.gradeLabel} value={gradeFilter} onChange={setGradeFilter} allLabel={t.allGrades} options={gradeOptions} />
        <Select label={t.typeLabel} value={typeFilter} onChange={setTypeFilter} allLabel={t.allTypes} options={typeOptions} />
        <Select label={t.languageLabel} value={languageFilter} onChange={setLanguageFilter} allLabel={t.allLanguages} options={languageOptions} />
        <Select label={t.trackLabel} value={trackFilter} onChange={setTrackFilter} allLabel={t.allTracks} options={trackOptions} />
        {hasActiveFilters && (
          <button
            onClick={onReset}
            className="ms-auto text-[12px] font-bold text-slate-500 hover:text-sky-600 transition py-2"
          >
            {t.resetFilters}
          </button>
        )}
      </div>
    </div>
  );
}
