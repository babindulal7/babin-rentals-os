import { useCallback, useEffect, useId, useState, type ReactNode } from 'react'
import { WorkspaceHeaderInformation } from '../shell/WorkspacePortal'
import { FilterDrawer } from './FilterDrawer'
import Icon from './Icon'

/** RULING 2026-10-20: mirror the left filter slider for existing right-side information. */
export function InformationDrawer({ children, id, width = 320, label = 'Quick information' }: {
  children: ReactNode
  id?: string
  width?: number
  label?: string
}) {
  const generatedId = useId()
  const panelId = id ?? `information-${generatedId}`
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  useEffect(() => {
    const reveal = (event: Event) => {
      if ((event as CustomEvent<string>).detail === label) setOpen(true)
    }
    window.addEventListener('babin:show-information', reveal)
    return () => window.removeEventListener('babin:show-information', reveal)
  }, [label])
  return <>
    <span className="information-drawer-anchor" aria-hidden="true" />
    <WorkspaceHeaderInformation>
      <button type="button" className="information-drawer-toggle" aria-label={label}
        title={label} aria-expanded={open} aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}>
        <Icon name={open ? 'panel_left_close' : 'panel_left_open'} size={20} style={{ transform: 'scaleX(-1)' }} />
      </button>
    </WorkspaceHeaderInformation>
    <FilterDrawer id={panelId} open={open} onClose={close} side="right" width={width}
      title={label} description="Information, notes and related details" keepMounted>
      <aside aria-label={label} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', minWidth: 0 }}>
        {children}
      </aside>
    </FilterDrawer>
  </>
}
