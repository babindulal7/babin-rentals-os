import { createContext, useContext } from 'react'
import { useViewport } from '../../lib/device'

/* RULING 2026-10-14: a floor workspace docked beside the queue is ~44% of the window, so the
   window width says "desktop" while the room it has is phone-sized. Inside the dock the
   workspaces take the one-column layout. Revert = make this return `useViewport()` unchanged. */
export const FloorPanelContext = createContext(false)

export function useFloorViewport(): ReturnType<typeof useViewport> {
  const viewport = useViewport()
  return useContext(FloorPanelContext) ? 'phone' : viewport
}
