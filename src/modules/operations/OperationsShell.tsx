import { formatAdDateTime } from '../../lib/bs'
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Button } from '../../components/ui/Page'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { Modal } from '../../components/ui/Modal'
import { LoadingSkeleton } from '../../components/ui/StateViews'
import { JOB_ORDER, BOOKING_STATUS, JOBS, type BookingStatus, type JobName } from '../../lib/workflow'
import { entryStepFor, stepWriteGate } from '../../lib/operationsShell'
import { fetchFloorBooking, type FloorBooking } from '../../lib/queries/bookings'
import { fetchOperationTaskFacts, type OperationTaskFacts } from '../../lib/queries/operationTaskFacts'
import { DomainEvents, EVENT_TYPES } from '../../events/eventBus'
import { FLOOR_TWO_COLUMN_MIN, FloorNarrowContext } from './floorPanelContext'
import { RentalMoreActions } from '../rentals/actions/RentalMoreActions'
import { useViewport } from '../../lib/device'
import type { OperationWorkspaceActions } from './operationWorkspaceActions'
import { OperationsStageBar, STAGE_LABEL as LABEL } from './OperationsStageBar'
import './operationsShell.css'

const PackingWorkspace = lazy(() => import('../rentals/PackingWorkspace'))
const HandoverWorkspace = lazy(() => import('../rentals/HandoverWorkspace'))
const ReturnWorkspace = lazy(() => import('../rentals/ReturnWorkspace'))
const ResetWorkspace = lazy(() => import('../rentals/ResetWorkspace'))

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

export type WorkspaceActions = OperationWorkspaceActions

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
  onRegisterDiscard?: ((discard: (() => void) | null) => void) | undefined
  onJobChange?: ((job: JobName) => void) | undefined
  progress?: Partial<Record<JobName, { done: number; total: number }>> | undefined
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
  onRegisterDiscard,
  onJobChange,
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
  useEffect(() => {
    onRegisterDiscard?.(actions?.discard ?? null)
    return () => onRegisterDiscard?.(null)
  }, [actions?.discard, onRegisterDiscard])
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

  const openedBookingRef = useRef<string | null>(null)
  useEffect(() => {
    if (!isOpen) {
      openedBookingRef.current = null
      return
    }
    if (openedBookingRef.current === bookingNo) return
    openedBookingRef.current = bookingNo
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
      onJobChange?.(prev)
    }
  }, [actions?.isDirty, busy, job, onJobChange, requestClose])

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
        onJobChange?.(nextJob)
      }
    },
    [actions?.isDirty, busy, job, onJobChange],
  )

  // Keyboard navigation: 1-4 jumps between unlocked stages, / focuses scanner
  const handleBlockerJump = useCallback(() => {
    if (!bodyEl) return
    actions?.focusBlocker?.(bodyEl)
  }, [actions, bodyEl])

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
    awaitingCompletion.current = job
    const next = NEXT_JOB[job]
    const targetStatus = STATUS_AFTER[job]

    let verified = false
    try {
      // A committed session can still be a partial return. Read the persisted
      // stage before offering the next operation or emitting its completion event.
      const latest = await refreshFloor()
      if (identity.current.bookingNo !== bookingNo || !identity.current.isOpen) return
      if (!latest) return

      verified = true
      awaitingCompletion.current = null

      if (job === 'Return') void DomainEvents.emit(EVENT_TYPES.INVENTORY_RETURNED, { bookingNo })

      // For Return, a partial return leaves the stage as On Rent (< Returned).
      // Keep operator on Return workspace with fresh data.
      if (job === 'Return' && BOOKING_STATUS[latest.stage].order < BOOKING_STATUS[targetStatus].order) return

      // Verify stage reached target before advancing (for Pack, Handover)
      if (job !== 'Reset' && BOOKING_STATUS[latest.stage].order < BOOKING_STATUS[targetStatus].order) return

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
        onJobChange?.(next)
      } else {
        onClose()
      }
    } finally {
      if (verified) {
        awaitingCompletion.current = null
      }
      submitLock.current = false
      setSubmitting(false)
      setActions(null)
      setWorkspaceRevision((revision) => revision + 1)
    }
  }, [job, bookingNo, refreshFloor, onClose, onJobChange])

  const currentGate = stepWriteGate(job, liveStatus)
  const currentJobOrder = BOOKING_STATUS[liveStatus]?.order ?? 0
  const jobRunsAtOrder = BOOKING_STATUS[JOBS[job].runsAt]?.order ?? 0
  const resetDone =
    currentJobOrder >= BOOKING_STATUS.Returned.order &&
    !!taskFacts &&
    taskFacts.total > 0 &&
    taskFacts.cleaningPending === 0 &&
    taskFacts.qcPending === 0 &&
    (taskFacts.resetDone === taskFacts.total || taskFacts.problems > 0)
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
          actions?.discard?.()
          setPending(null)
          setActions(null)
          if (choice?.type === 'switch') {
            setJob(choice.job)
            onJobChange?.(choice.job)
          } else if (choice?.type === 'prev') {
            setJob(choice.job)
            onJobChange?.(choice.job)
          } else if (choice?.type === 'close') {
            onClose()
          }
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
  /* RULING 2026-10-25: the stage progress bar now sits in this header and names the open stage, so the subtitle keeps only what the
     bar cannot say — the booking's status. Revert = restore `${LABEL[job]} · ` before it and move the bar back into `bodyNode`. */
  const subtitle = `Status: ${liveStatus}`
  const stageBar = (
    <OperationsStageBar
      job={job}
      liveStatus={liveStatus}
      resetDone={resetDone}
      measured={progress}
      live={actions?.progress}
      disabled={floorLoading || busy || !!awaitingCompletion.current}
      onSelect={requestJob}
    />
  )
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
                  try {
                    const result: unknown = (actions.complete as () => unknown)()
                    if (result && typeof (result as Promise<unknown>).catch === 'function') {
                      ;(result as Promise<unknown>).catch((error: unknown) => {
                        submitLock.current = false
                        setSubmitting(false)
                        setFloorError(error instanceof Error ? error.message : 'The operation failed. Retry before continuing.')
                      })
                    }
                  } catch (error) {
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
            {stageBar}
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
        headerContent={stageBar}
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

