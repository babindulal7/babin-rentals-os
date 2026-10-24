/** Shared by the Operations host and its real embedded workspaces. */
export interface OperationWorkspaceActions {
  canComplete: boolean
  dispatching: boolean
  complete: () => void
  isDirty: boolean
  label?: string
  error?: string | null
  blockedReason?: string | null
  /** The workspace owns its gate ordering and the control that resolves it. */
  focusBlocker?: (scope: HTMLElement) => void
  /** Clear recoverable local drafts before the host unmounts this workspace. */
  discard?: () => void
}

/** Run after filter changes have rendered, and never fall back to an unrelated control. */
export function focusOperationTarget(scope: HTMLElement, selector: string) {
  window.setTimeout(() => {
    if (!scope.isConnected) return
    const target = scope.querySelector<HTMLElement>(selector)
    if (!target) return
    const control = target.matches('button, input, select, textarea, a[href], [tabindex]')
      ? target
      : target.querySelector<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]')
    const focus = control ?? target
    if (!control && !target.hasAttribute('tabindex')) target.tabIndex = -1
    focus.scrollIntoView?.({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' })
    focus.focus({ preventScroll: true })
  }, 0)
}
