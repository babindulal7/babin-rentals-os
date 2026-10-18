import { useLayoutEffect, useState } from 'react'
import { BP } from './breakpoints'
import { useViewport } from './device'

/**
 * **Does the application header have desktop room?**
 *
 * `useViewport()` answers how wide the window is. A page's header actions need
 * a different answer: how wide the HEADER is, and the expanded sidebar takes
 * 256px of the window away from it. Measured 15 Oct 2026 (zoom audit,
 * `artifacts/zoom-audit-2026-10-15/`): a 1920px laptop at 150% scaling is a
 * 1280px "desktop", and with the sidebar open by default its header is 1024px
 * wide — narrower than a 1094px tablet's (1030px). Every desktop-only header
 * truncated its title there: Inventory 14px, Finance 15px, Operations and
 * Settings 55px.
 *
 * The threshold is the widest tablet header: a 1279px window less the 64px rail
 * (`--app-sidebar-collapsed-width`). Below it the header has no more room than
 * the tablet layout was built for, so pages use their compact header. Width
 * decides (Law 14): this measures the header box, never the device.
 *
 * RULING 2026-10-15 (zoom audit): the compact header follows the header's own
 * width. Revert = return `viewport !== 'desktop'` from `useCompactHeader`.
 */
export const RAIL_WIDTH = 64
export const DESKTOP_HEADER_MIN = BP.desktop - RAIL_WIDTH

function headerIsNarrow(): boolean {
  if (typeof document === 'undefined') return false
  const header = document.querySelector<HTMLElement>('header.app-global-header')
  const width = header?.getBoundingClientRect().width ?? 0
  /* 0 means "not laid out" (jsdom, a hidden pane): no evidence of crowding. */
  return width > 0 && width < DESKTOP_HEADER_MIN
}

/**
 * True when page headers should keep only their primary verb beside the title
 * and move secondary actions into More: below desktop always, and on a desktop
 * whose header is narrower than the widest tablet header (sidebar open on a
 * 1280–1471px window).
 */
export function useCompactHeader(): boolean {
  const viewport = useViewport()
  const [narrow, setNarrow] = useState(headerIsNarrow)

  useLayoutEffect(() => {
    if (viewport !== 'desktop') return
    const sync = () => setNarrow(headerIsNarrow())
    sync()
    const header = document.querySelector<HTMLElement>('header.app-global-header')
    if (!header || typeof ResizeObserver === 'undefined') return
    /* The header's width does not depend on its own content, so moving actions
       into More cannot flip this back. */
    const observer = new ResizeObserver(sync)
    observer.observe(header)
    return () => observer.disconnect()
  }, [viewport])

  return viewport !== 'desktop' || narrow
}
