import React from 'react'
import Icon from '../../components/ui/Icon'
import { useTodayAttention, type TodayAttentionState } from './useTodayAttention'
import type { AttentionTask } from './attentionModel'
import './needs-attention.css'

export interface NeedsAttentionProps {
  onOpenTask: (task: AttentionTask) => void
  onViewAll?: (exceptionParam?: string) => void
  /** Optional state override for testing or external hoisting */
  state?: TodayAttentionState
}

function taskButtonLabel(task: AttentionTask): string {
  switch (task.kind) {
    case 'overdue_return':
      return 'Return'
    case 'late_pickup_booked':
      return 'Pack'
    case 'late_pickup_packed':
      return 'Handover'
  }
}

function taskButtonClass(task: AttentionTask): string {
  switch (task.kind) {
    case 'overdue_return':
      return 'needs-attention-btn needs-attention-btn--return press tap'
    case 'late_pickup_booked':
      return 'needs-attention-btn needs-attention-btn--pack press tap'
    case 'late_pickup_packed':
      return 'needs-attention-btn needs-attention-btn--handover press tap'
  }
}

export function NeedsAttention({ onOpenTask, onViewAll, state: injectedState }: NeedsAttentionProps) {
  const hookState = useTodayAttention()
  const { tasks, totalCount, loading, error, isOffline, refresh, truncated } = injectedState ?? hookState

  const displayedTasks = tasks.slice(0, 3)
  const hasCritical = tasks.some((t) => t.severity === 'critical')
  const hasHigh = tasks.some((t) => t.severity === 'high')

  const panelModifier = hasCritical
    ? 'needs-attention-panel--has-critical'
    : hasHigh
      ? 'needs-attention-panel--has-high-only'
      : tasks.length === 0 && !loading && !error
        ? 'needs-attention-panel--clean'
        : ''

  // Determine targeted Operations queue exception parameter
  const allReturns = tasks.length > 0 && tasks.every((t) => t.kind === 'overdue_return')
  const allLatePickups = tasks.length > 0 && tasks.every((t) => t.kind === 'late_pickup_booked' || t.kind === 'late_pickup_packed')
  const targetException = allReturns ? 'overdue_end' : allLatePickups ? 'overdue_start' : undefined

  return (
    <section
      className={`needs-attention-panel ${panelModifier}`}
      aria-labelledby="needs-attention-heading"
      data-testid="needs-attention-panel"
    >
      <div className="needs-attention-header">
        <div className="needs-attention-header__left">
          <h2 id="needs-attention-heading" className="needs-attention-title">
            <Icon name="alert_triangle" size={17} style={{ color: hasCritical ? 'var(--danger)' : 'var(--warn)' }} />
            Needs Attention
          </h2>

          {totalCount > 0 && (
            <span
              className={`needs-attention-badge-count font-mono tabular-nums ${
                hasCritical ? 'needs-attention-badge-count--critical' : 'needs-attention-badge-count--high'
              }`}
              aria-label={`${totalCount} exceptions needing attention`}
            >
              {totalCount}
            </span>
          )}

          <span className="needs-attention-meta">
            · Kathmandu · 60s live
          </span>

          {isOffline && (
            <span className="needs-attention-offline-tag" role="status">
              <Icon name="clock" size={12} />
              Offline · Cached
            </span>
          )}
        </div>

        {totalCount > 0 && onViewAll && (
          <button
            type="button"
            className="needs-attention-view-all press tap"
            onClick={() => onViewAll(targetException)}
          >
            View all in Operations <Icon name="arrow_right" size={13} />
          </button>
        )}
      </div>

      {loading && tasks.length === 0 && (
        <div className="needs-attention-skeleton" role="status" aria-label="Loading attention items">
          <div className="needs-attention-skeleton__item" />
          <div className="needs-attention-skeleton__item" />
        </div>
      )}

      {error && (
        <div className="needs-attention-error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={refresh} className="needs-attention-retry-btn press tap">
            <Icon name="refresh" size={13} /> Retry
          </button>
        </div>
      )}

      {!loading && !error && tasks.length === 0 && (
        <div className="needs-attention-empty" data-testid="needs-attention-empty">
          <span className="needs-attention-empty__icon">
            <Icon name="check" size={14} />
          </span>
          <span>No urgent exceptions right now</span>
        </div>
      )}

      {displayedTasks.length > 0 && (
        <div className="needs-attention-grid">
          {displayedTasks.map((task) => (
            <article
              key={task.key}
              className={`needs-attention-card needs-attention-card--${task.severity}`}
              data-testid={`needs-attention-card-${task.bookingNo}`}
            >
              <div className="needs-attention-card__body">
                <div className="needs-attention-card__row1">
                  <span className="needs-attention-card__booking-no font-mono tabular-nums">
                    #{task.bookingNo}
                  </span>

                  <span className={`needs-attention-pill needs-attention-pill--${task.severity}`}>
                    {task.kind === 'overdue_return' ? (
                      <>
                        <Icon name="return_arrow" size={11} /> Overdue Return
                      </>
                    ) : task.kind === 'late_pickup_booked' ? (
                      <>
                        <Icon name="package" size={11} /> Late Pickup · Pack
                      </>
                    ) : (
                      <>
                        <Icon name="truck" size={11} /> Late Pickup · Handover
                      </>
                    )}
                  </span>

                  {task.deliveryType && (
                    <span className="needs-attention-card__delivery">
                      · {task.deliveryType}
                    </span>
                  )}
                </div>

                <div className="needs-attention-card__row2">
                  <span className="needs-attention-card__client" title={task.clientName || 'Client'}>
                    {task.clientName || 'Standard Client'}
                  </span>
                </div>

                <div className="needs-attention-card__row3">
                  <Icon name="clock" size={11} />
                  <span>{task.detail}</span>
                </div>
              </div>

              <div className="needs-attention-card__action">
                <button
                  type="button"
                  className={taskButtonClass(task)}
                  onClick={() => onOpenTask(task)}
                  aria-label={`${taskButtonLabel(task)} booking ${task.bookingNo}`}
                >
                  {taskButtonLabel(task)}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {(totalCount > displayedTasks.length || truncated) && (
        <div className="needs-attention-footer">
          <span>
            Showing top {displayedTasks.length} of {totalCount} exceptions.
          </span>
          {onViewAll && (
            <button
              type="button"
              className="needs-attention-footer__link press tap"
              onClick={() => onViewAll(targetException)}
            >
              View all in Operations →
            </button>
          )}
        </div>
      )}
    </section>
  )
}
