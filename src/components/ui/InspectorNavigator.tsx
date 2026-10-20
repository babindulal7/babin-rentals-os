import { useEffect } from 'react'
import type { InspectorPosition } from '../../lib/inspectorNavigation'
import { BP } from '../../lib/breakpoints'
import Icon from './Icon'

interface Props extends InspectorPosition {
  active: boolean
  onPrevious: () => void
  onNext: () => void
}

/**
 * Browse the visible rows; never dispatch record operations from keyboard.
 * Alt+ArrowUp/Down applies only to an open desktop inspector and does not
 * intercept typing, a dropdown, or editable content.
 */
export function InspectorNavigator({
  active, position, total, canPrevious, canNext, onPrevious, onNext,
}: Props) {
  useEffect(() => {
    if (!active) return
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return
      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      if (window.innerWidth < BP.desktop) return
      const target = event.target
      if (target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"], [role="combobox"]')) return
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
