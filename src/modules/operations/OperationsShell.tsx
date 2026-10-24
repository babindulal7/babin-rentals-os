import { formatAdDateTime } from '../../lib/bs'
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Button } from '../../components/ui/Page'
import type { IconName } from '../../components/ui/Icon'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { Modal } from '../../components/ui/Modal'
import { LoadingSkeleton } from '../../components/ui/StateViews'
import { JOB_ORDER, BOOKING_STATUS, JOBS, type BookingStatus, type JobName } from '../../lib/workflow'
import { entryStepFor, stepWriteGate, stepDotState } from '../../lib/operationsShell'
import { fetchFloorBooking, type FloorBooking } from '../../lib/queries/bookings'
import { fetchOperationTaskFacts, type OperationTaskFacts } from '../../lib/queries/operationTaskFacts'
import { DomainEvents, EVENT_TYPES } from '../../events/eventBus'
import { FLOOR_TWO_COLUMN_MIN, FloorNarrowContext } from './floorPanelContext'
import { RentalMoreActions } from '../rentals/actions/RentalMoreActions'
import { useViewport } from '../../lib/device'
import './operationsShell.css'

const PackingWorkspace = lazy(() => import('../rentals/PackingWorkspace'))
const HandoverWorkspace = lazy(() => import('../rentals/HandoverWorkspace'))
const ReturnWorkspace = lazy(() => import('../rentals/ReturnWorkspace'))
const ResetWorkspace = lazy(() => import('../rentals/ResetWorkspace'))

const LABEL: Record<JobName, string> = {
  Pack: 'Packing',
  Handover: 'Handover',
  Return: 'Return & Inspection',
  Reset: 'Cleaning & Reset',
}

const STEP_LABEL: Record<JobName, string> = {
  Pack: 'Pack', Handover: 'Hand', Return: 'Return', Reset: 'Reset',
}

/* One icon per stage (8 Oct 2026, RULINGS-2026-10-08.md). A stage that is not
   open yet shows a single lock instead — the label used to carry a 🔒 emoji
   beside the lock icon, so locked stages showed two padlocks. */
const STEP_ICON: Record<JobName, IconName> = {
  Pack: 'package',
  Handover: 'truck',
  Return: 'return_arrow',
  Reset: 'sparkles',
}

const PREV_JOB: Partial<Record<JobName, JobName>> = {
  Handover: 'Pack',
  Return: 'Handover',
  Reset: 'Return',
}

const NEXT_JOB: Partial<Record<JobName, JobName>> = {
  Pack: 'Handover',
  Handover: 'Return',
  Return: 'Reset',
}

const STATUS_AFTER: Record<JobName, BookingStatus> = {
  Pack: 'Packed',
  Handover: 'On Rent',
  Return: 'Returned',
  Reset: 'Returned',
}

export interface WorkspaceActions {
  canComplete: boolean
  dispatching: boolean
  complete: () => void
  isDirty: boolean
  label?: string
  error?: string | null
  /** First requirement still unmet, shown beside a disabled Confirm so the operator need not hunt for it. */
  blockedReason?: string | null
}

export interface OperationsShellProps {
  bookingNo: string
  bookingStatus: BookingStatus
  isOpen: boolean
  onClose: () => void
  initialJob?: JobName
  /** `modal` (default) is the full-screen sheet; `panel` docks beside the queue at desktop width. */
  layout?: 'modal' | 'panel'
  /** Reports unsaved work so a host that can swap the booking can ask first. */
  onDirtyChange?: (dirty: boolean) => void
  onBusyChange?: (busy: boolean) => void
  progress?: Partial<Record<JobName, { done: number; total: number }>>
}

/** Global modal chrome around the existing, backend-powered workspaces. */
export default function OperationsShell({
  bookingNo,
  bookingStatus,
  isOpen,
  onClose,
  initialJob,
  layout = 'modal',
  onDirtyChange,
  onBusyChange,
  progress,
}: OperationsShellProps) {
  const viewport = useViewport()
  const [expanded, setExpanded] = useState(false)
  const [job, setJob] = useState<JobName>(initialJob ?? entryStepFor(bookingStatus) ?? 'Pack')
  const [liveStatus, setLiveStatus] = useState<BookingStatus>(bookingStatus)
  const [floor, setFloor] = useState<FloorBooking | null>(null)
  const [floorLoading, setFloorLoading] = useState(true)
  const [floorError, setFloorError] = useState<string | null>(null)
  const [taskFacts, setTaskFacts] = useState<OperationTaskFacts | null>(null)
  const [taskError, setTaskError] = useState<string | null>(null)
  const [workspaceRevision, setWorkspaceRevision] = useState(0)
  const [bodyEl, setBodyEl] = useState<HTMLElement | null>(null)
  const readingFloor = useRef(false)
  const readVersion = useRef(0)
  const firstRead = useRef(true)
  const awaitingCompletion = useRef<JobName | null>(null)
  const submitLock = useRef(false)
  const [submitting, setSubmitting] = useState(false)
  const identity = useRef({ bookingNo, isOpen })
  identity.current = { bookingNo, isOpen }
  const [actions, setActions] = useState<WorkspaceActions | null>(null)
  const [pending, setPending] = useState<
    | { type: 'close' }
    | { type: 'prev'; job: JobName }
    | { type: 'switch'; job: JobName }
    | null
  >(null)

  const refreshFloor = useCallback(async () => {
    const version = ++readVersion.current
    readingFloor.current = true
    setFloorLoading(true)
    setFloorError(null)
    try {
      const data = await fetchFloorBooking(bookingNo)
      if (version !== readVersion.current || identity.current.bookingNo !== bookingNo || !identity.current.isOpen) return null
      if (!data) throw new Error('Booking could not be found. Retry booking status before confirming.')
      if (!Object.prototype.hasOwnProperty.call(BOOKING_STATUS, data.stage)) throw new Error('Booking status is unavailable. Retry booking status before confirming.')
      const status = data.stage as BookingStatus
      setFloor(data)
      setLiveStatus(status)
      if (firstRead.current && initialJob === undefined) setJob(entryStepFor(status) ?? 'Pack')
      firstRead.current = false
      setTaskFacts(null)
      setTaskError(null)
      let savedTasks: OperationTaskFacts | null = null
      try {
        const facts = await fetchOperationTaskFacts(data.id)
        if (version !== readVersion.current || identity.current.bookingNo !== bookingNo || !identity.current.isOpen) return null
        setTaskFacts(facts)
        savedTasks = facts
      } catch (error) {
        if (version !== readVersion.current) return null
        setTaskError(error instanceof Error ? error.message : 'Cleaning and QC tasks could not be verified.')
      }
      return { ...data, stage: status, taskFacts: savedTasks }
    } catch (error) {
      if (version === readVersion.current) setFloorError(error instanceof Error ? error.message : 'Booking status could not be read.')
      return null
    } finally {
      if (version === readVersion.current) {
        readingFloor.current = false
        setFloorLoading(false)
      }
    }
  }, [bookingNo, initialJob])

  useEffect(() => {
    if (!isOpen) return
    setJob(initialJob ?? entryStepFor(bookingStatus) ?? 'Pack')
    setFloor(null)
    firstRead.current = true
    awaitingCompletion.current = null
    submitLock.current = false
    setSubmitting(false)
    setPending(null)
    void refreshFloor()
    return () => { readVersion.current += 1 }
    // Status notifications must not discard an operator's pending marks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingNo, initialJob, isOpen, refreshFloor])

  const busy = submitting || !!actions?.dispatching
  useEffect(() => {
    onBusyChange?.(busy)
    return () => onBusyChange?.(false)
  }, [busy, onBusyChange])
  useEffect(() => {
    if (!actions?.error) return
    submitLock.current = false
    setSubmitting(false)
  }, [actions?.error])

  useEffect(() => {
    if (!isOpen || !actions?.isDirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [actions?.isDirty, isOpen])



  // Universal close action (top-right X, Esc, or Stage 1 Close button)
  const requestClose = useCallback(() => {
    if (busy) return
    if (actions?.isDirty) {
      setPending({ type: 'close' })
    } else {
      onClose()
    }
  }, [actions?.isDirty, busy, onClose])

  // Navigation back to previous operation
  const requestPrev = useCallback(() => {
    if (busy || awaitingCompletion.current) return
    const prev = PREV_JOB[job]
    if (!prev) {
      requestClose()
      return
    }
    if (actions?.isDirty) {
      setPending({ type: 'prev', job: prev })
    } else {
      setActions(null)
      setJob(prev)
    }
  }, [actions?.isDirty, busy, job, requestClose])

  // Switching stages via tab click
  const requestJob = useCallback(
    (nextJob: JobName) => {
      if (busy || awaitingCompletion.current) return
      if (nextJob === job) return
      if (actions?.isDirty) {
        setPending({ type: 'switch', job: nextJob })
      } else {
        setActions(null)
        setJob(nextJob)
      }
    },
    [actions?.isDirty, busy, job],
  )

  // Keyboard navigation: 1-4 jumps between unlocked stages, / focuses scanner
  const handleBlockerJump = useCallback(() => {
    if (!bodyEl) return
    const target =
      bodyEl.querySelector<HTMLElement>(
        '[data-blocker-target], [aria-invalid="true"], #handover-receiver-sig, #handover-warehouse-sig, #return-receiver-sig, #return-warehouse-sig'
      ) ||
      bodyEl.querySelector<HTMLElement>(
        '.floor-scanner-input, #operations-command-input'
      )
    if (target) {
      if (typeof target.scrollIntoView === 'function') {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
      if ('focus' in target && typeof target.focus === 'function') {
        target.focus({ preventScroll: true })
      }
    }
  }, [bodyEl])

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || e.ctrlKey || e.altKey || e.metaKey || readingFloor.current || pending) return
      const target = e.target instanceof Element ? e.target : null
      const dialog = target?.closest('[role="dialog"], [role="alertdialog"]')
      if (dialog && (!bodyEl || !dialog.contains(bodyEl))) return
      const tagName = target?.tagName?.toLowerCase()
      if (tagName === 'input' || tagName === 'textarea' || tagName === 'select' || target?.closest('[contenteditable]:not([contenteditable="false"])')) {
        return
      }

      if (e.key === '/') {
        const scanInput = bodyEl?.querySelector<HTMLInputElement>(
          '.floor-scanner-input, #operations-command-input'
        )
        if (scanInput) {
          e.preventDefault()
          scanInput.focus()
          scanInput.select?.()
          return
        }
      }

      if (['1', '2', '3', '4'].includes(e.key)) {
        const stageIndex = parseInt(e.key, 10) - 1
        const candidate = JOB_ORDER[stageIndex]
        if (candidate) {
          const currentOrder = BOOKING_STATUS[liveStatus]?.order ?? 0
          const candidateOrder = BOOKING_STATUS[JOBS[candidate].runsAt]?.order ?? 0
          const isBlocked = currentOrder < candidateOrder
          if (!isBlocked) {
            e.preventDefault()
            requestJob(candidate)
          }
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, liveStatus, requestJob, bodyEl, pending])

  const isDirty = !!actions?.isDirty
  useEffect(() => {
    onDirtyChange?.(isDirty)
    return () => onDirtyChange?.(false)
  }, [isDirty, onDirtyChange])

  // Panel layout has no Modal to own Esc, so it listens itself.
  useEffect(() => {
    if (!isOpen || layout !== 'panel') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      const t = e.target instanceof Element ? e.target : null
      if (t?.closest('[role="dialog"], [role="alertdialog"]')) return
      requestClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, layout, requestClose])

  // Progression upon successful confirmation
  const completed = useCallback(async () => {
    if (readingFloor.current) return
    awaitingCompletion.current = job
    const next = NEXT_JOB[job]
    const targetStatus = STATUS_AFTER[job]

    // A committed session can still be a partial return. Read the persisted
    // stage before offering the next operation or emitting its completion event.
    const latest = await refreshFloor()
    if (identity.current.bookingNo !== bookingNo || !identity.current.isOpen) return
    if (!latest) {
      setSubmitting(false)
      return
    }
    awaitingCompletion.current = null
    submitLock.current = false
    setSubmitting(false)
    setActions(null)
    setWorkspaceRevision((revision) => revision + 1)
    if (job === 'Reset' && (!latest.taskFacts || latest.taskFacts.total === 0 || latest.taskFacts.resetDone !== latest.taskFacts.total || latest.taskFacts.problems > 0)) return
    if (job === 'Return') void DomainEvents.emit(EVENT_TYPES.INVENTORY_RETURNED, { bookingNo })
    if (BOOKING_STATUS[latest.stage].order < BOOKING_STATUS[targetStatus].order) return

    // Emit domain event for the completed stage
    if (job === 'Pack') {
      void DomainEvents.emit(EVENT_TYPES.RENTAL_PACKED, { bookingNo })
      void DomainEvents.emit(EVENT_TYPES.INVENTORY_PACKED, { bookingNo })
    } else if (job === 'Handover') {
      void DomainEvents.emit(EVENT_TYPES.RENTAL_HANDED_OVER, { bookingNo })
      void DomainEvents.emit(EVENT_TYPES.RENTAL_PICKED_UP, { bookingNo })
    } else if (job === 'Return') {
      void DomainEvents.emit(EVENT_TYPES.RENTAL_RETURNED, { bookingNo })
    } else if (job === 'Reset') {
      void DomainEvents.emit(EVENT_TYPES.RENTAL_RESET_COMPLETED, { bookingNo })
    }

    if (next) {
      setJob(next)
    } else {
      onClose()
    }
  }, [job, bookingNo, refreshFloor, onClose])

  const currentGate = stepWriteGate(job, liveStatus)
  const currentJobOrder = BOOKING_STATUS[liveStatus]?.order ?? 0
  const jobRunsAtOrder = BOOKING_STATUS[JOBS[job].runsAt]?.order ?? 0
  const resetDone = currentJobOrder >= BOOKING_STATUS.Returned.order && !!taskFacts && taskFacts.total > 0 && taskFacts.resetDone === taskFacts.total && taskFacts.problems === 0
  const isCurrentJobCompleted = job === 'Reset' ? resetDone : currentJobOrder > jobRunsAtOrder

  // Left and Right footer button labels
  const leftLabel = job === 'Pack' ? 'Close' : `← ${LABEL[PREV_JOB[job]!]}`
  const rightLabel = busy
    ? 'Saving…'
    : isCurrentJobCompleted
      ? 'Completed ✓'
      : job === 'Pack'
        ? 'Confirm Packing & Next'
        : job === 'Handover'
          ? 'Confirm Handover & Next'
          : job === 'Return'
            ? 'Confirm Return session'
            : 'Confirm Reset'

  // RULING 2026-10-14 (R14-5): say what is still needed beside a disabled Confirm; the gates themselves are unchanged.
  const blockedHint = !isCurrentJobCompleted && actions && !actions.canComplete && !actions.dispatching ? (actions.blockedReason ?? null) : null

  /* RULING 2026-10-14 (R14-6): a toast sits bottom-right, exactly over the footer's Confirm button. Lift it to just above the
     footer — measured, because the footer is taller on a phone (hint + two stacked buttons) than on
     a desktop — while a job is open. */
  const [footerEl, setFooterEl] = useState<HTMLElement | null>(null)
  useEffect(() => {
    if (!isOpen || !footerEl) return
    const lift = () => {
      const top = footerEl.getBoundingClientRect().top
      document.documentElement.style.setProperty('--toast-bottom', `${Math.max(20, Math.round(window.innerHeight - top + 12))}px`)
    }
    lift()
    window.addEventListener('resize', lift)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(lift)
    observer?.observe(footerEl)
    return () => {
      window.removeEventListener('resize', lift)
      observer?.disconnect()
      document.documentElement.style.removeProperty('--toast-bottom')
    }
  }, [isOpen, footerEl])

  /* RULING 2026-10-14 (R14-8): the room the workspace actually has, not the window's width: the dock is always narrow, and a
     tablet held upright gives the full-screen sheet ~780px, which a list-plus-rail layout cannot
     use. Narrow → the one-column layout. Width 0 (no layout engine) says nothing, so it is ignored. */
  const [narrow, setNarrow] = useState(layout === 'panel')
  useLayoutEffect(() => {
    if (layout === 'panel') {
      setNarrow(true)
      return
    }
    if (!bodyEl) return
    const measure = () => {
      const width = bodyEl.getBoundingClientRect().width
      if (width > 0) setNarrow(width < FLOOR_TWO_COLUMN_MIN)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(bodyEl)
    return () => observer.disconnect()
  }, [layout, bodyEl])

  const workspaceProps = useMemo(
    () => ({
      bookingNo,
      embedded: true,
      onCancel: requestClose,
      onConfirmSuccess: completed,
      onRegisterActions: setActions,
    }),
    [bookingNo, completed, requestClose],
  )

  const workspace =
    job === 'Pack' ? (
      <PackingWorkspace key={`${bookingNo}:Pack:${workspaceRevision}`} {...workspaceProps} />
    ) : job === 'Handover' ? (
      <HandoverWorkspace key={`${bookingNo}:Handover:${workspaceRevision}`} {...workspaceProps} />
    ) : job === 'Return' ? (
      <ReturnWorkspace key={`${bookingNo}:Return:${workspaceRevision}`} {...workspaceProps} />
    ) : (
      <ResetWorkspace key={`${bookingNo}:Reset:${workspaceRevision}`} {...workspaceProps} />
    )

  const discardDialog = (
      <ConfirmDialog
        isOpen={pending !== null}
        onClose={() => setPending(null)}
        onConfirm={() => {
          const choice = pending
          setPending(null)
          setActions(null)
          if (choice?.type === 'switch') setJob(choice.job)
          else if (choice?.type === 'prev') setJob(choice.job)
          else if (choice?.type === 'close') onClose()
        }}
        title={
          pending?.type === 'close'
            ? 'Discard unsaved operations work?'
            : 'You have unsaved changes.'
        }
        description={
          pending?.type === 'close'
            ? 'You have changes that have not been saved.'
            : pending?.type === 'prev'
              ? `Discard changes and go back to ${LABEL[pending.job]}?`
              : 'Discard them and switch operations?'
        }
        cancelLabel={pending?.type === 'close' ? 'Keep Editing' : 'Stay Here'}
        confirmLabel={
          pending?.type === 'close'
            ? 'Discard Changes'
            : pending?.type === 'prev'
              ? 'Discard & Go Back'
              : 'Discard & Switch'
        }
        variant="danger"
      />
  )

  const title = `Operations · ${bookingNo}${floor?.clientName ? ` · ${floor.clientName}` : ''}`
  const subtitle = `${LABEL[job]} · Status: ${liveStatus}`
  const footerNode = (
          <div
            ref={setFooterEl}
            className="operations-shell__footer"

          >
            {blockedHint && (
              <p role="status" className="operations-shell__blocked">
                Still needed: {blockedHint}{' '}
                <button
                  type="button"
                  className="operations-shell__blocked-jump"
                  onClick={handleBlockerJump}
                  aria-label={`Jump to ${blockedHint}`}
                >
                  (Jump)
                </button>
              </p>
            )}
            <div
              className="operations-shell__actions"
            >
              <Button
                variant="secondary"
                onClick={requestPrev}
                disabled={floorLoading || busy}
                style={{ minHeight: 'var(--tap)' }}
              >
                {leftLabel}
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  if (submitLock.current || readingFloor.current || floorError || !floor || floor.isCancelled || floor.isClosed || !currentGate.allowed || !actions?.canComplete) return
                  submitLock.current = true
                  setSubmitting(true)
                  try { actions.complete() } catch (error) {
                    submitLock.current = false
                    setSubmitting(false)
                    setFloorError(error instanceof Error ? error.message : 'The operation could not be started. Retry before continuing.')
                  }
                }}
                disabled={floorLoading || !!floorError || !floor || floor.isCancelled || floor.isClosed || !currentGate.allowed || (job === 'Reset' && (!taskFacts || !!taskError)) || isCurrentJobCompleted || !actions?.canComplete || busy || !!awaitingCompletion.current}
                style={{ minHeight: 56, whiteSpace: 'normal' }}
              >
                {rightLabel}
              </Button>
            </div>
          </div>
  )
  const bodyNode = (
    <>
        <nav
          aria-label="Operation stage"
          className="operations-shell__stages"
        >
          {JOB_ORDER.map((candidate) => {
            const gate = stepWriteGate(candidate, liveStatus)
            const selected = candidate === job
            const currentOrder = BOOKING_STATUS[liveStatus]?.order ?? 0
            const candidateOrder = BOOKING_STATUS[JOBS[candidate].runsAt]?.order ?? 0
            const isCompleted = candidate === 'Reset' ? resetDone : currentOrder > candidateOrder
            const isBlocked = currentOrder < candidateOrder
            const measured = progress?.[candidate]
            const state = stepDotState(candidate, liveStatus, measured ?? { done: 0, total: 1 })
            const stateLabel =
              candidate === 'Reset' && resetDone ? 'Done' : candidate === 'Reset' && currentOrder > candidateOrder ? 'Read only' :
              gate.allowed && !measured
                ? 'Open'
                : state === 'not-started'
                  ? 'Not started'
                  : state === 'in-progress'
                    ? 'In progress'
                    : state === 'done'
                      ? 'Done'
                      : 'Not open yet'

            const countStr = measured ? ` ${measured.done}/${measured.total}` : ''

            return (
              <Button
                key={candidate}
                size="sm"
                variant="secondary"
                className="operations-shell__stage"
                aria-label={`${LABEL[candidate]} · ${stateLabel}${countStr}`}
                aria-current={selected ? 'step' : undefined}
                disabled={isBlocked || floorLoading || busy || !!awaitingCompletion.current}
                title={!gate.allowed ? gate.reason ?? undefined : undefined}
                onClick={() => requestJob(candidate)}
                icon={isCompleted ? 'check' : isBlocked ? 'lock' : STEP_ICON[candidate]}
                style={{ minHeight: 64, padding: '8px', whiteSpace: 'normal', border: `1px solid ${selected ? 'var(--primary)' : 'var(--btn-secondary-border)'}`, ...(selected ? { background: 'var(--nav-active-bg)' } : {}) }}

              >
                <span className="operations-shell__stage-name">{STEP_LABEL[candidate]}</span>
                <span className="operations-shell__stage-sep"> · </span>
                <span className="operations-shell__stage-state">{stateLabel}{countStr}</span>
              </Button>
            )
          })}
        </nav>

        {taskFacts && taskFacts.total > 0 && (job === 'Return' || job === 'Reset') && <p role="status" className="operations-shell__task-facts">Cleaning pending: {taskFacts.cleaningPending} · QC pending: {taskFacts.qcPending} · Reset complete: {taskFacts.resetDone}/{taskFacts.total}{taskFacts.problems > 0 ? ` · Issues: ${taskFacts.problems}` : ''}</p>}
        {taskError && <p role="alert">{taskError} <Button variant="secondary" onClick={() => { void refreshFloor() }}>Retry task records</Button></p>}

        {floorError && (
          <div style={{ marginBottom: 12 }}>
            <p role="alert" style={{ color: 'var(--danger-text)' }}>{floorError}</p>
            <Button disabled={floorLoading} onClick={() => { if (awaitingCompletion.current) void completed(); else void refreshFloor() }}>
              Retry booking status
            </Button>
          </div>
        )}

        {floor && (
          <details className="operations-shell__details">
            <summary>Booking details</summary>
            <div className="operations-shell__facts">
              {floor.project && <span><strong>Project</strong> {floor.project}</span>}
              {floor.pickupAtAd && <span><strong>Pickup</strong> {formatAdDateTime(floor.pickupAtAd)}</span>}
              {floor.returnAtAd && <span><strong>Return</strong> {formatAdDateTime(floor.returnAtAd)}</span>}
              {floor.deliveryType && <span><strong>Delivery</strong> {floor.deliveryType}</span>}
              <span><strong>Lines</strong> {floor.lines.length}</span>
              {!busy && !actions?.isDirty ? <RentalMoreActions compact ariaLabel="Booking actions" booking={{ id: floor.id, bookingNo, clientName: floor.clientName, stage: liveStatus, isCancelled: floor.isCancelled, isClosed: floor.isClosed, isPackingInProgress: floor.lines.some(line => line.units.some(unit => unit.packed)) }} onActionCompleted={() => { void refreshFloor(); onClose() }} /> : <span>Save or discard current work before using booking actions.</span>}
            </div>
          </details>
        )}

        {!currentGate.allowed && (
          <p
            role="status"
            style={{
              margin: '0 0 12px',
              color: 'var(--muted)',
              fontSize: 'var(--t-meta)',
            }}
          >
            {job === 'Reset' && liveStatus === 'Closed' ? 'This booking is Closed. Saved Reset tasks are read-only here.' : currentGate.reason}
          </p>
        )}

        <Suspense fallback={<LoadingSkeleton type="card" label={`Loading ${LABEL[job]}…`} />}>
          {workspace}
        </Suspense>
    </>
  )

  if (layout === 'panel') {
    if (!isOpen) return null
    return (
      <>
        <section className="operations-shell__panel" aria-label={title}>
          <header className="operations-shell__panel-head">
            <div style={{ minWidth: 0 }}>
              <h2 className="operations-shell__panel-title">{title}</h2>
              <p className="operations-shell__panel-sub">{subtitle}</p>
            </div>
            <Button variant="ghost" icon="close" aria-label="Close panel (Esc)" onClick={requestClose} style={{ minHeight: 'var(--tap)' }}>Close</Button>
          </header>
          <div className="operations-shell__panel-body"><FloorNarrowContext.Provider value={narrow}><div ref={setBodyEl}>{bodyNode}</div></FloorNarrowContext.Provider></div>
          <footer className="operations-shell__panel-foot">{footerNode}</footer>
        </section>
        {discardDialog}
      </>
    )
  }

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={requestClose}
        size="full"
        className="operations-shell__modal"
        surfaceStyle={viewport === 'desktop' ? { maxWidth: expanded ? '100vw' : 1320, width: expanded ? '100vw' : '96vw', height: expanded ? '100dvh' : 'min(94dvh, 920px)', maxHeight: expanded ? '100dvh' : '94dvh', ...(expanded ? {borderRadius:0} : {}) } : undefined}
        contentStyle={{padding:12}}
        headerActions={viewport === 'desktop' ? <Button variant="ghost" onClick={() => setExpanded(value => !value)} aria-label={expanded ? 'Contain operations workspace' : 'Expand operations workspace'}>{expanded ? 'Contain' : 'Expand'}</Button> : undefined}
        fill
        title={title}
        subtitle={subtitle}
        footer={footerNode}
      >
        <FloorNarrowContext.Provider value={narrow}>
          <div ref={setBodyEl}>{bodyNode}</div>
        </FloorNarrowContext.Provider>
      </Modal>

      {discardDialog}
    </>
  )
}

