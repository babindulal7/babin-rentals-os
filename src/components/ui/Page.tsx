import type { ReactNode, CSSProperties } from 'react'
import Icon from './Icon'
import type { IconName } from './Icon'
import { BRAND, BRAND_ON, BRAND_TEXT } from '../../lib/status'
import type { BrandKey } from '../../lib/status'
import { CollapsibleAside } from './CollapsibleAside'
import { useViewport } from '../../lib/device'
import { Button as SharedButton, type ButtonProps } from './Button'
import { Card as SharedCard, surfaceStyle } from './Card'

/**
 * Page furniture shared by every Generation C screen.
 *
 * Every deep render in the set repeats the same skeleton — title block, KPI
 * strip, cards, a ~300px right rail, and a footer note bar. Building it once
 * here is what keeps 16 sections looking like one product.
 */

/* ── card ──────────────────────────────────────────────────────────────── */

export const cardStyle = surfaceStyle

export function Card({
  id,
  title,
  action,
  children,
  style,
  bodyStyle,
}: {
  id?: string
  title?: string
  action?: ReactNode
  children: ReactNode
  style?: CSSProperties
  bodyStyle?: CSSProperties
}) {
  return (
    <SharedCard
      as="section"
      headingLevel="h2"
      padding="sm"
      {...(id !== undefined ? { id } : {})}
      {...(title !== undefined ? { title, action } : {})}
      {...(style !== undefined ? { style } : {})}
      {...(bodyStyle !== undefined ? { bodyStyle } : {})}
    >
      {children}
    </SharedCard>
  )
}

/* ── page title block ──────────────────────────────────────────────────── */

export { PageHeader, type PageHeaderProps } from './header/PageHeader'

/* ── buttons ───────────────────────────────────────────────────────────── */

/**
 * The app's most-imported button. 67 module files take it from here rather than
 * from `components/ui/Button`, so its height is the single largest lever on
 * **Law 15 — 44×44 on every device, desktop included.** It used to be a fixed
 * `height: 34`, which put every one of those call sites 10px under the floor at
 * every width; `minHeight` rather than `height` so a wrapped label grows the
 * button instead of overflowing it.
 */
export function Button({
  children,
  icon,
  variant = 'secondary',
  ...props
}: Omit<ButtonProps, 'icon'> & {
  children: ReactNode
  icon?: IconName | undefined
}) {
  return (
    <SharedButton
      type="button"
      size="sm"
      variant={variant}
      icon={icon ? <Icon name={icon} size={16} /> : undefined}
      {...props}
    >
      {children}
    </SharedButton>
  )
}

/* ── KPI strip ─────────────────────────────────────────────────────────── */

export interface Kpi {
  label: string
  value: string
  icon: IconName
  accent: BrandKey
  /** Delta line, e.g. "8.4% vs last month". */
  delta?: { direction: 'up' | 'down'; text: string; good?: boolean }
  /** Extra explanation — printed on the tile as part of its one-line caption. */
  note?: string
  /** A secondary FIGURE (e.g. "Rs 1,234 receivable") — stays visible on the card. */
  detail?: string
  /** Law L1 — Every money tile carries its one-line definition tooltip (§9.3, §15.1) */
  definition?: string
  /** Law L2 — Every computed figure resolving to zero or less explains itself (§10.3) */
  zeroExplanation?: string
  /** Sparkline points, 0–100, drawn as a polyline. Optional. */
  spark?: number[]
}

function Spark({ points, color }: { points: number[]; color: string }) {
  if (points.length < 2) return null
  const w = 100
  const h = 26
  const max = Math.max(...points)
  const min = Math.min(...points)
  const span = max - min || 1
  const d = points
    .map((p, i) => `${(i / (points.length - 1)) * w},${h - ((p - min) / span) * (h - 3) - 1.5}`)
    .join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden style={{ width: '100%', height: h, display: 'block' }}>
      <polyline points={d} fill="none" stroke={color} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

export function KpiStrip({ items, columns }: { items: Kpi[]; columns?: number }) {
  // Law 13/14 — a caller's `columns` (or the `items.length` fallback) is
  // chosen for desktop width and, uncapped, squeezes every card's icon,
  // label and value into an unreadable sliver at tablet/phone widths. This
  // is the one place every KpiStrip caller renders through, so clamping
  // here fixes the squeeze everywhere at once instead of asking each of the
  // ~25 call sites to pass its own responsive column count.
  const viewport = useViewport()
  const requested = columns ?? items.length
  const cols = viewport === 'phone' ? Math.min(requested, 2) : viewport === 'tablet' ? Math.min(requested, 3) : requested
  return (
    <section
      aria-label="Key figures"
      style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, gap: 'var(--sp-md)' }}
    >
      {items.map((k) => {
        const isZero = k.value === '0' || k.value === 'Rs 0' || k.value === 'Rs. 0' || k.value === 'Rs 0.00' || k.value === '—'
        // RULING 2026-10-23: no (i) on a tile. The one-line definition (L1), note and — when the
        // figure is zero — its explanation (L2) are printed on the tile itself, one line, ellipsised.
        const caption = isZero && k.zeroExplanation ? k.zeroExplanation : [k.definition, k.note].filter(Boolean).join(' · ')
        const hasSecondLine = Boolean(caption || k.delta || k.detail)
        return (
          <article key={k.label} className="surface-card kpi-tile" style={{ padding: '8px 12px', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 8, rowGap: 2, minHeight: 28 }}>
              <span
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 'var(--r-sm)',
                  background: BRAND[isZero ? 'neutral' : k.accent],
                  color: BRAND_ON[isZero ? 'neutral' : k.accent],
                  display: 'grid',
                  placeItems: 'center',
                  flexShrink: 0,
                }}
              >
                <Icon name={k.icon} size={14} fill />
              </span>
              <span
                className="kpi-tile__label"
                style={{
                  flex: '1 1 auto',
                  fontSize: 'var(--t-meta)',
                  fontWeight: 600,
                  color: 'var(--muted)',
                  minWidth: 'min(100%, min-content)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {k.label}
              </span>
              <span
                className="kpi-value"
                style={{
                  flex: '0 1 auto',
                  marginLeft: 'auto',
                  maxWidth: '100%',
                  fontSize: 'clamp(14px, 1.1vw, 17px)',
                  color: 'var(--text)',
                  lineHeight: 1.2,
                  letterSpacing: '-0.02em',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {k.value}
              </span>
              {k.spark && (
                <span style={{ width: 40, flexShrink: 0 }}>
                  <Spark points={k.spark} color={BRAND[k.accent]} />
                </span>
              )}
            </div>

            {hasSecondLine && (
              <div style={{ marginTop: 2, fontSize: 'var(--t-th)', display: 'flex', alignItems: 'center', gap: 'var(--sp-xs)', minWidth: 0 }}>
                {k.delta && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 3,
                      flexShrink: 0,
                      fontWeight: 600,
                      color: (k.delta.good ?? k.delta.direction === 'up') ? 'var(--success-text)' : 'var(--danger-text)',
                    }}
                  >
                    <Icon name={k.delta.direction === 'up' ? 'arrow_up' : 'arrow_down'} size={12} fill />
                    {k.delta.text}
                  </span>
                )}
                {k.detail && <span style={{ color: 'var(--muted)', flexShrink: 0 }}>{k.detail}</span>}
                {caption && (
                  <span
                    className="kpi-tile__caption"
                    title={caption}
                    style={{ color: 'var(--muted)', minWidth: 0, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                  >
                    {caption}
                  </span>
                )}
              </div>
            )}
          </article>
        )
      })}
    </section>
  )
}

/* ── side rails ────────────────────────────────────────────────────────── */

/**
 * User ruling, 7 Oct 2026: right-hand summaries stay visible everywhere;
 * remove the collapse handle and ignore old per-route collapse preferences.
 * Desktop retains its sticky, scrollable rail; smaller screens reflow.
 */
export function Rail({
  children,
  id,
  width = 288,
  label = 'Page summary',
}: {
  children: ReactNode
  id?: string
  width?: number
  label?: string
}) {
  const desktop = useViewport() === 'desktop'
  return (
    <aside
      aria-label={label}
      {...(id !== undefined ? { id } : {})}
      style={{ position: desktop ? 'sticky' : 'relative', top: desktop ? 'calc(var(--header-h) + var(--sp-md))' : undefined, alignSelf: 'flex-start', minWidth: 0, width: desktop ? width : '100%', maxWidth: '100%' }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', minWidth: 0, maxHeight: desktop ? 'calc(100dvh - var(--header-h) - var(--sp-md) * 2)' : undefined, overflowY: desktop ? 'auto' : undefined, overscrollBehavior: desktop ? 'contain' : undefined }}>
        {children}
      </div>
    </aside>
  )
}

/**
 * `Rail` at desktop; the same children as a plain column below 1280.
 *
 * Rulings §7: below 1280 means reflow, not hide. The parent grid must
 * drop its rail track too; useRailGridColumns below handles that half.
 */
export function ReflowRail({
  children,
  id,
  width = 288,
  label = 'Page summary',
}: {
  children: ReactNode
  id?: string
  width?: number
  label?: string
}) {
  const viewport = useViewport()
  if (viewport === 'desktop') {
    return (
      <Rail width={width} label={label} {...(id !== undefined ? { id } : {})}>
        {children}
      </Rail>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', minWidth: 0 }}>{children}</div>
  )
}

/**
 * The other half of `ReflowRail`: the `content | rail` grid's own tracks. The
 * rail track has to disappear below 1280, or the reflowed column lands in a
 * second column that is still there and the content is squeezed anyway.
 *
 * A hook rather than a wrapper component because the screens that need it
 * already own their grid `<div>` (with their own margins, gaps and
 * `alignItems`); this changes only the one property that has to change.
 */
export function useRailGridColumns(): string {
  return useViewport() === 'desktop' ? 'minmax(0,1fr) auto' : 'minmax(0,1fr)'
}

/**
 * `KpiStrip`'s column clamp (2 at phone, 3 at tablet), for the screens that
 * hand-roll their own `<section aria-label="Key figures">` grid instead of
 * going through it. Same rule in one place rather than a magic number per page.
 */
export function useBandColumns(): (n: number) => number {
  const viewport = useViewport()
  return (n: number) => (viewport === 'phone' ? Math.min(n, 2) : viewport === 'tablet' ? Math.min(n, 3) : n)
}

/**
 * The left-hand filter/navigation rail a handful of list screens carry.
 * Retains its own collapse mechanics; right-hand summaries stay visible.
 */
export function SideRail({
  children,
  id,
  width = 210,
  label = 'Filters',
}: {
  children: ReactNode
  id?: string
  width?: number
  label?: string
}) {
  return (
    <CollapsibleAside side="left" width={width} label={label} {...(id !== undefined ? { id } : {})}>
      {children}
    </CollapsibleAside>
  )
}

/** Label/value rows — the shape every "… Summary" card in the renders uses. */
export function SummaryRows({ rows }: { rows: Array<{ label: string; value: React.ReactNode; tone?: BrandKey; mono?: boolean }> }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
      {rows.map((r) => {
        const isNumeric =
          typeof r.value === 'number' ||
          (typeof r.value === 'string' &&
            (/^(?:(?:Rs\.?|NPR)\s*)?[\d,]+(?:\.\d+)?(?:\s*%)?$/.test(r.value.trim()) ||
              /^\d{4}-\d{2}-\d{2}/.test(r.value.trim())))
        const useFigure = r.mono ?? isNumeric
        return (
          <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 'var(--t-meta)' }}>
            <span style={{ color: 'var(--text2)', minWidth: 0, flex: 1 }}>{r.label}</span>
            <span
              className={useFigure ? 'figure' : undefined}
              style={{
                fontWeight: 600,
                color:
                  (typeof r.value === 'number' && r.value === 0) ||
                  (typeof r.value === 'string' && /^(?:(?:Rs\.?|NPR)\s*)?0(?:\.0+)?\s*%?$/.test(r.value.trim()))
                    ? 'var(--muted)'
                    : r.tone
                      ? BRAND_TEXT[r.tone]
                      : 'var(--text)',
                whiteSpace: 'nowrap',
              }}
            >
              {r.value}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// RULING 2026-10-23: the footer "About this page" (i) is removed — the header (i) already carries
// the page explanation, so a second copy at the bottom of the page only repeated it.

export { PageActions, type PageActionsProps } from './PageActions'
export { ScreenHeader, type ScreenHeaderProps } from './ScreenHeader'
export { OverflowMenu, type OverflowMenuItem, type OverflowMenuProps } from './OverflowMenu'
