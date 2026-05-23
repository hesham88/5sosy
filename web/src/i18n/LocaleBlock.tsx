'use client';

/**
 * LocaleBlock — render a chunk of content in a specific locale's direction
 * and font, independent of the user's UI shell locale.
 *
 * This is the key primitive for the four-axis locale model:
 *
 *   <html dir>          ← user preference locale  (axis 1)
 *   <LocaleBlock>       ← book.language           (axis 2)
 *   <LocaleBlock>       ← translation target      (axis 4, transient)
 *
 * Example — a French user reads an Arabic physics book; while the chrome
 * stays LTR/French, the book pane flips RTL/Arabic:
 *
 *   <LocaleBlock locale={book.language} as="article" className="prose">
 *     {bookContent}
 *   </LocaleBlock>
 *
 * When a session translation is active, swap the `locale` prop to the
 * translation target — same component, no parent reflow.
 */
import { dirFor, type Locale, isLocale } from './config';

const FONT_VAR: Record<Locale, string> = {
  ar: 'var(--font-cairo), var(--font-tajawal), system-ui, sans-serif',
  en: 'var(--font-inter), system-ui, sans-serif',
  fr: 'var(--font-inter), system-ui, sans-serif',
  de: 'var(--font-inter), system-ui, sans-serif',
  es: 'var(--font-inter), system-ui, sans-serif',
  it: 'var(--font-inter), system-ui, sans-serif',
  zh: 'var(--font-zh), var(--font-inter), "Microsoft YaHei", "PingFang SC", system-ui, sans-serif',
};

type Props = {
  /** The content's intrinsic locale — usually book.language or a translation target. */
  locale: Locale | string;
  /** HTML element to render (default: div). */
  as?: keyof React.JSX.IntrinsicElements;
  /** Pass-through className for layout. */
  className?: string;
  /** Inline style overrides (merged after the locale's font-family). */
  style?: React.CSSProperties;
  /** Children render inside the locale-aware wrapper. */
  children: React.ReactNode;
  /** Optional ARIA lang override (defaults to `locale`). */
  langOverride?: string;
};

export function LocaleBlock({
  locale,
  as: Tag = 'div',
  className,
  style,
  children,
  langOverride,
}: Props) {
  // Be defensive — book.language could be a stale code we don't support yet.
  // Fall back to the document's ambient direction (no `dir=` attribute set)
  // and a neutral font stack, rather than throwing.
  const safeLocale: Locale | null = isLocale(locale as string) ? (locale as Locale) : null;

  const direction = safeLocale ? dirFor(safeLocale) : undefined;
  const fontFamily = safeLocale ? FONT_VAR[safeLocale] : undefined;

  const mergedStyle: React.CSSProperties = {
    ...(fontFamily ? { fontFamily } : null),
    ...style,
  };

  // We render the element via createElement-style props to keep TS happy
  // across all intrinsic tags ('div' | 'article' | 'section' | ...).
  const TagAny = Tag as 'div';
  return (
    <TagAny
      lang={langOverride ?? (safeLocale ?? undefined)}
      dir={direction}
      className={className}
      style={mergedStyle}
      data-content-locale={safeLocale ?? 'unknown'}
    >
      {children}
    </TagAny>
  );
}

/**
 * Inline variant — same semantics, renders as <span>. Use when the content
 * appears mid-paragraph (e.g. an Arabic book title inside an English sentence).
 */
export function LocaleInline({
  locale,
  className,
  children,
  langOverride,
}: Omit<Props, 'as' | 'style'>) {
  const safeLocale: Locale | null = isLocale(locale as string) ? (locale as Locale) : null;
  const direction = safeLocale ? dirFor(safeLocale) : undefined;
  const fontFamily = safeLocale ? FONT_VAR[safeLocale] : undefined;
  return (
    <span
      lang={langOverride ?? (safeLocale ?? undefined)}
      dir={direction}
      className={className}
      style={fontFamily ? { fontFamily } : undefined}
      data-content-locale={safeLocale ?? 'unknown'}
    >
      {children}
    </span>
  );
}
