import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { BP } from '../../lib/breakpoints'
import './premium-inspector.css'

const DRAWER_MS = 200
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Premium Workbench v1 dock width. The reserved workspace strip
 * (`--context-drawer-w`, consumed by `.app-workspace` in ui-v2.css) and the
 * panel's inline `--context-drawer-width` both read this one value, so the
 * panel and the space the list yields can never disagree.
 */
const DOCK_WIDTH = 'clamp(320px, 27vw, 420px)'

export interface ContextDrawerProps {
  id: string
  open: boolean
  onClose: () => void
  title: ReactNode
  subtitle?: ReactNode
  status?: ReactNode
  actions?: ReactNode
  children: ReactNode
  width?: number
  /** Opt-in list master-detail docking at desktop (>= BP.desktop). Default false. */
  docked?: boolean
  /** Small traversal toolbar rendered between the header and the scrollable body. */
  navigation?: ReactNode
}

/**
 * A record inspector for list pages. Desktop stays non-modal so operators can
 * compare rows; phone switches to a modal sheet and locks the page beneath it.
 * Record-specific data, permissions and mutations stay with the caller.
 *
 * Premium Workbench v1: with `docked`, desktop (>=1280) stops covering the
 * list — the workspace reserves the panel's strip the same way it does for the
 * filter/information drawers, and the open drawer no longer steals focus so
 * the browsable list keeps it. Tablet keeps the overlay; phone keeps the sheet.
 */
export function ContextDrawer({
  id,
  open,
  onClose,
  title,
  subtitle,
  status,
  actions,
  children,
  width = 420,
  docked = false,
  navigation,
}: ContextDrawerProps) {
  const panelRef = useRef<HTMLElement | null>(null)
  const priorFocus = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)
  const [phone, setPhone] = useState(() => typeof window !== 'undefined' && window.innerWidth < BP.phone)
  const [desktop, setDesktop] = useState(() => typeof window !== 'undefined' && window.innerWidth >= BP.desktop)
  const [reducedMotion, setReducedMotion] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false,
  )
  const [mounted, setMounted] = useState(open)
  const [closing, setClosing] = useState(false)

  onCloseRef.current = onClose

  useEffect(() => {
    const update = () => {
      setPhone(window.innerWidth < BP.phone)
      setDesktop(window.innerWidth >= BP.desktop)
    }
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (open) {
      setMounted(true)
      setClosing(false)
      return
    }
    if (!mounted) return
    setClosing(true)
    const timer = window.setTimeout(() => {
      setMounted(false)
      setClosing(false)
    }, reducedMotion ? 0 : DRAWER_MS)
    return () => window.clearTimeout(timer)
  }, [mounted, open, reducedMotion])

  /* Only a desktop (>= BP.desktop) dock-enabled drawer docks. The class stays
     applied through the exit animation so the panel does not snap to overlay
     width mid-close; the reserved strip is released immediately below, exactly
     as FilterDrawer releases its own. */
  const dockedActive = docked && !phone && desktop

  /* Slide, don't cover, at desktop — mirrors FilterDrawer's `pushing` effect:
     while the docked inspector is open, `.app-workspace` (ui-v2.css) animates
     its right padding out by this width, so the list yields the strip instead
     of hiding under the panel. */
  const pushing = open && dockedActive
  useEffect(() => {
    if (!pushing) return
    const root = document.documentElement
    root.style.setProperty('--context-drawer-w', DOCK_WIDTH)
    return () => {
      root.style.removeProperty('--context-drawer-w')
    }
  }, [pushing])

  /* RULING 2026-10-20 — one drawer owns each edge. A dock-enabled inspector
     joins the side-drawer protocol FilterDrawer already runs: opening it
     dismisses an open right-edge drawer (the information drawer), and any
     right-edge drawer opened beside it dismisses the inspector. Below desktop
     any drawer dismisses it — the same rule FilterDrawer enforces on itself. */
  useEffect(() => {
    if (!open || !docked) return
    const other = (event: Event) => {
      const detail = (event as CustomEvent<{ id: string; side: string }>).detail
      if (detail.id === id) return
      if (!desktop || detail.side === 'right') onCloseRef.current()
    }
    window.dispatchEvent(new CustomEvent('babin:side-drawer-open', { detail: { id, side: 'right' } }))
    window.addEventListener('babin:side-drawer-open', other)
    return () => window.removeEventListener('babin:side-drawer-open', other)
  }, [open, docked, desktop, id])

  useEffect(() => {
    if (!open) return
    if (priorFocus.current === null && document.activeElement instanceof HTMLElement && !panelRef.current?.contains(document.activeElement)) {
      priorFocus.current = document.activeElement
    }
    const handleKeyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab' || !phone || !panelRef.current) return
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true')
      if (focusable.length === 0) {
        event.preventDefault()
        panelRef.current.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    window.addEventListener('keydown', handleKeyboard)
    if (phone) document.body.style.overflow = 'hidden'
    const frame = window.requestAnimationFrame(() => {
      /* Premium Workbench v1: a docked desktop inspector must not steal focus
         from the browsable list beside it — the operator is still reading rows.
         Every other presentation keeps the existing focus move. */
      if (!dockedActive) panelRef.current?.focus()
    })
    return () => {
      window.removeEventListener('keydown', handleKeyboard)
      if (phone) document.body.style.overflow = ''
      window.cancelAnimationFrame(frame)
    }
  }, [open, phone, dockedActive])

  useEffect(() => {
    if (open || priorFocus.current === null) return
    priorFocus.current.focus()
    priorFocus.current = null
  }, [open])

  useEffect(() => () => priorFocus.current?.focus(), [])

  if (!mounted) return null
  const titleId = `${id}-title`
  const drawerClasses = [
    'context-drawer',
    phone ? 'context-drawer--phone' : '',
    closing ? 'context-drawer--closing' : '',
    dockedActive ? 'context-drawer--docked' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={drawerClasses} aria-hidden={closing || undefined}>
      {phone && <button className="context-drawer__scrim" type="button" onClick={onClose} aria-label="Close record details" />}
      <aside
        ref={panelRef}
        id={id}
        className="context-drawer__panel"
        role="dialog"
        aria-labelledby={titleId}
        {...(phone ? { 'aria-modal': true } : {})}
        tabIndex={-1}
        style={{ '--context-drawer-width': dockedActive ? DOCK_WIDTH : `${width}px` } as CSSProperties}
      >
        <header className="context-drawer__header">
          <div className="context-drawer__identity">
            <div className="context-drawer__title-row">
              <h2 id={titleId}>{title}</h2>
              {status}
            </div>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="context-drawer__close" onClick={onClose} aria-label="Close record details">×</button>
        </header>
        {navigation}
        <div className="context-drawer__body">{children}</div>
        {actions && <footer className="context-drawer__actions">{actions}</footer>}
      </aside>
    </div>
  )
}
