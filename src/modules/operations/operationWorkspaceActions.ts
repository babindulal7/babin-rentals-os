/** How far this operation is, in units — the host draws it as the progress bar in its header. */
export interface OperationProgress {
  done: number
  total: number
}

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
  /** Live progress of the open operation; the host's header bar shows it, so the workspace body does not repeat it. */
  progress?: OperationProgress | undefined
}

/** Run after filter changes have rendered, and never fall back to an unrelated control. */
export function focusOperationTarget(scope: HTMLElement, selector: string) {
  const focusAfterReveal = (remaining: number) => {
    if (!scope.isConnected) return
    const target = scope.querySelector<HTMLElement>(selector)
    if (!target) {
      if (remaining > 0) window.setTimeout(() => focusAfterReveal(remaining - 1), 16)
      return
    }
    const control = target.matches('button, input, select, textarea, a[href], [tabindex]')
      ? target
      : target.querySelector<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]')
    const focus = control ?? target
    if (!control && !target.hasAttribute('tabindex')) target.tabIndex = -1
    focus.scrollIntoView?.({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' })
    focus.focus({ preventScroll: true })
  }
  window.setTimeout(() => focusAfterReveal(12), 0)
}
