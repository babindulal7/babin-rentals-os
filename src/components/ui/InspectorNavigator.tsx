import { useEffect } from 'react'
import type { InspectorPosition } from '../../lib/inspectorNavigation'
import { BP } from '../../lib/breakpoints'
import Icon from './Icon'

interface Props extends InspectorPosition {
  active: boolean
  onPrevious: () => void
  onNext: () => void
}

/** Never hijack shortcuts from text editing, including Nepali IME input. */
export function shouldNavigateInspector(event: KeyboardEvent, desktopWidth: number): boolean {
  if (event.defaultPrevented || event.isComposing || event.keyCode === 229) return false
  if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false
  if (desktopWidth < BP.desktop) return false
  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return false
  const target = event.target
  if (target instanceof Element && (
    target.closest('input, textarea, select, [role="combobox"], [role="textbox"], [role="searchbox"]') ||
    target.closest('[contenteditable]:not([contenteditable="false"])')
  )) return false
  return true
}

/**
 * Browse visible rows; never dispatch record operations from keyboard.
 * Alt+ArrowUp/Down applies only to an open desktop inspector.
 */
export function InspectorNavigator({
  active, position, total, canPrevious, canNext, onPrevious, onNext,
}: Props) {
  useEffect(() => {
    if (!active) return
    const onKey = (event: KeyboardEvent) => {
      if (!shouldNavigateInspector(event, window.innerWidth)) return
      if (event.key === 'ArrowUp' && canPrevious) {
        event.preventDefault()
        onPrevious()
      } else if (event.key === 'ArrowDown' && canNext) {
        event.preventDefault()
        onNext()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, canPrevious, canNext, onPrevious, onNext])

  return (
    <nav className="premium-inspector-nav" aria-label="Browse visible records">
      <span className="premium-inspector-nav__count" role="status" aria-live="polite">
        {position > 0 ? `${position} of ${total} on this page` : 'Record not in current results'}
      </span>
      <div className="premium-inspector-nav__buttons">
        <button type="button" onClick={onPrevious} disabled={!canPrevious} aria-label="Previous record" aria-keyshortcuts="Alt+ArrowUp" title="Previous visible record (Alt+↑)">
          <Icon name="chevron_up" size={18} />
        </button>
        <button type="button" onClick={onNext} disabled={!canNext} aria-label="Next record" aria-keyshortcuts="Alt+ArrowDown" title="Next visible record (Alt+↓)">
          <Icon name="chevron_down" size={18} />
        </button>
      </div>
    </nav>
  )
}
