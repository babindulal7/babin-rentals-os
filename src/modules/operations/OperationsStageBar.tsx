import Icon, { type IconName } from '../../components/ui/Icon'
import { JOB_ORDER, BOOKING_STATUS, JOBS, type BookingStatus, type JobName } from '../../lib/workflow'
import { stepDotState, stepWriteGate } from '../../lib/operationsShell'
import type { OperationProgress } from './operationWorkspaceActions'

export const STAGE_LABEL: Record<JobName, string> = {
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

export interface OperationsStageBarProps {
  job: JobName
  liveStatus: BookingStatus
  /** Reset is done only when every cleaning/QC task is, which the booking status alone cannot say. */
  resetDone: boolean
  /** Progress a caller measured per stage (the queue rows). Only ever a count somebody really made. */
  measured?: Partial<Record<JobName, OperationProgress>> | undefined
  /** Live progress of the open stage, reported by its own workspace. */
  live?: OperationProgress | undefined
  disabled: boolean
  onSelect: (job: JobName) => void
}

/**
 * The four-stage progress bar that lives in the Operations header (RULING 2026-10-25).
 * Each stage is one segment: completed stages are full, the open stage fills with its
 * workspace's live count, a stage that is not open yet is empty with a lock. State is
 * never colour alone — every segment carries an icon, a name and (for the open stage) a count.
 */
export function OperationsStageBar({ job, liveStatus, resetDone, measured, live, disabled, onSelect }: OperationsStageBarProps) {
  const currentOrder = BOOKING_STATUS[liveStatus]?.order ?? 0
  return (
    <nav aria-label="Operation stage" className="operations-shell__stages">
      {JOB_ORDER.map((candidate) => {
        const gate = stepWriteGate(candidate, liveStatus)
        const selected = candidate === job
        const candidateOrder = BOOKING_STATUS[JOBS[candidate].runsAt]?.order ?? 0
        const isCompleted = candidate === 'Reset' ? resetDone : currentOrder > candidateOrder
        const isBlocked = currentOrder < candidateOrder
        const hostCount = measured?.[candidate]
        const count = selected && live ? live : hostCount
        const state = stepDotState(candidate, liveStatus, hostCount ?? { done: 0, total: 1 })
        const stateLabel =
          candidate === 'Reset' && resetDone ? 'Done' : candidate === 'Reset' && currentOrder > candidateOrder ? 'Read only' :
          gate.allowed && !hostCount
            ? 'Open'
            : state === 'not-started'
              ? 'Not started'
              : state === 'in-progress'
                ? 'In progress'
                : state === 'done'
                  ? 'Done'
                  : 'Not open yet'
        const countStr = count ? ` ${count.done}/${count.total}` : ''
        const fill = isCompleted ? 1 : isBlocked || !count || count.total <= 0 ? 0 : Math.min(1, Math.max(0, count.done / count.total))

        return (
          <button
            key={candidate}
            type="button"
            className="operations-shell__stage"
            data-state={isCompleted ? 'done' : isBlocked ? 'locked' : selected ? 'open' : 'ready'}
            aria-label={`${STAGE_LABEL[candidate]} · ${stateLabel}${countStr}`}
            aria-current={selected ? 'step' : undefined}
            disabled={isBlocked || disabled}
            title={!gate.allowed ? gate.reason ?? undefined : undefined}
            onClick={() => onSelect(candidate)}
          >
            <span className="operations-shell__stage-head">
              <Icon name={isCompleted ? 'check' : isBlocked ? 'lock' : STEP_ICON[candidate]} size={14} />
              <span className="operations-shell__stage-name">{STEP_LABEL[candidate]}</span>
              {selected && count && <span className="operations-shell__stage-count">{count.done}/{count.total}</span>}
            </span>
            <span className="operations-shell__stage-state sr-only">{stateLabel}{countStr}</span>
            <span className="operations-shell__stage-track" aria-hidden="true">
              <span className="operations-shell__stage-fill" style={{ transform: `scaleX(${fill})` }} />
            </span>
          </button>
        )
      })}
    </nav>
  )
}
