import { createContext, useContext } from 'react'
import { useViewport } from '../../lib/device'

/**
 * Below this much room, a floor workspace takes its one-column layout.
 *
 * It is a container width, not a window breakpoint (Law 14): list + 320px rail needs roughly this
 * much before the checklist table stops clipping its Status column. Revert = `() => false` in the
 * Shell's measurement, or delete the context and return `useViewport()` from `useFloorViewport`.
 */
export const FLOOR_TWO_COLUMN_MIN = 900

/* RULING 2026-10-14: the window's width is not the room a floor workspace has. The dock beside the
   queue is ~44% of the window, and a tablet held upright gives the full-screen sheet ~780px — in
   both the window says "tablet/desktop" while the room is phone-sized. The shell measures its own
   body and says so here; the workspaces then take the one-column layout. */
export const FloorNarrowContext = createContext(false)

export function useFloorViewport(): ReturnType<typeof useViewport> {
  const viewport = useViewport()
  return useContext(FloorNarrowContext) ? 'phone' : viewport
}
