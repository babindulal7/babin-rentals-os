import { useState, useMemo, useEffect, useCallback } from 'react'
import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import Icon from './Icon'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { useAuth } from '../../lib/auth'
import {
  REPORT_GROUPS,
  ALL_REPORTS,
  getReportPins,
  toggleReportPin,
  isReportPinned,
  findGroupByReport,
  type ReportGroupKey,
  type ReportNavItem,
} from '../../lib/reportsNav'

export {
  REPORT_GROUPS,
  ALL_REPORTS,
  getReportPins,
  toggleReportPin,
  isReportPinned,
  findGroupByReport,
  type ReportGroupKey,
  type ReportNavItem,
}

export interface ReportFamiliesNavProps {
  current?: string
  className?: string
  style?: CSSProperties
}

const tabStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  height: 30,
  padding: '0 12px',
  borderRadius: 'var(--r-badge, 15px)',
  fontSize: 'var(--t-meta, 12px)',
  fontWeight: 600,
  textDecoration: 'none',
  whiteSpace: 'nowrap',
  transition: 'all 0.15s ease',
}

const pinBtnStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 22,
  height: 22,
  marginLeft: 4,
  padding: 0,
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  borderRadius: '50%',
  color: 'inherit',
}

export function ReportFamiliesNav({ current = 'Pulse', className, style }: ReportFamiliesNavProps) {
  const canSeeMoney = useCanViewMoney()
  const { user } = useAuth()
  const userId = user?.id ?? null

  const [pins, setPins] = useState<string[]>(() => getReportPins(userId))

  useEffect(() => {
    setPins(getReportPins(userId))
  }, [userId])

  useEffect(() => {
    const handlePinsChange = (e: Event) => {
      const detail = (e as CustomEvent<{ pins: string[] }>).detail
      if (detail?.pins) {
        setPins(detail.pins)
      } else {
        setPins(getReportPins(userId))
      }
    }
    window.addEventListener('babin-rentals:report-pins-change', handlePinsChange)
    return () => window.removeEventListener('babin-rentals:report-pins-change', handlePinsChange)
  }, [userId])

  const handleTogglePin = useCallback(
    (route: string) => {
      const next = toggleReportPin(userId, route)
      setPins(next)
    },
    [userId],
  )

  // Determine current report and its group
  const currentReport = useMemo(() => {
    const needle = current.toLowerCase().trim()
    return ALL_REPORTS.find(
      (r) =>
        r.id.toLowerCase() === needle ||
        r.label.toLowerCase() === needle ||
        r.to.toLowerCase() === needle ||
        (needle === 'dashboard' && r.id === 'pulse') ||
        (needle === 'maintenance' && r.id === 'damage-maintenance') ||
        (needle === 'finance' && r.id === 'cash-flow'),
    )
  }, [current])

  const currentGroupKey = useMemo(() => {
    return findGroupByReport(current) ?? 'rentals'
  }, [current])

  // Groups visible to this role (omits group if 0 visible reports)
  const visibleGroups = useMemo(() => {
    return REPORT_GROUPS.filter((g) => {
      const reports = ALL_REPORTS.filter((r) => r.group === g.key)
      return reports.some((r) => canSeeMoney || !r.money)
    })
  }, [canSeeMoney])

  const [selectedGroupKey, setSelectedGroupKey] = useState<ReportGroupKey>(() => {
    const defaultKey = currentGroupKey
    if (visibleGroups.some((g) => g.key === defaultKey)) {
      return defaultKey
    }
    return visibleGroups[0]?.key ?? 'rentals'
  })

  // Synchronize selected group if current changes
  useEffect(() => {
    if (visibleGroups.some((g) => g.key === currentGroupKey)) {
      setSelectedGroupKey(currentGroupKey)
    }
  }, [currentGroupKey, visibleGroups])

  // Pinned reports visible to this role
  const visiblePinnedReports = useMemo(() => {
    return ALL_REPORTS.filter((r) => pins.includes(r.to) && (canSeeMoney || !r.money))
  }, [pins, canSeeMoney])

  // Reports in currently selected group visible to this role
  const groupReports = useMemo(() => {
    return ALL_REPORTS.filter((r) => r.group === selectedGroupKey && (canSeeMoney || !r.money))
  }, [selectedGroupKey, canSeeMoney])

  return (
    <nav
      aria-label="Report families"
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--sp-xs, 8px)',
        marginTop: 'var(--sp-xs, 4px)',
        marginBottom: 'var(--sp-sm, 12px)',
        ...style,
      }}
    >
      {/* 1. Pinned Reports Strip (G-13: pinned ones show first) */}
      {visiblePinnedReports.length > 0 && (
        <div
          data-testid="pinned-reports-strip"
          aria-label="Pinned reports"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            flexWrap: 'wrap',
            paddingBottom: 4,
          }}
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 'var(--t-meta, 12px)',
              fontWeight: 700,
              color: 'var(--text2)',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              marginRight: 2,
            }}
          >
            <Icon name="pinned" size={13} style={{ color: 'var(--primary)' }} />
            Pinned:
          </span>
          {visiblePinnedReports.map((r) => {
            const isCurrent = currentReport?.id === r.id
            return (
              <div
                key={r.to}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  borderRadius: 'var(--r-badge, 14px)',
                  border: `1px solid ${isCurrent ? 'var(--nav-active-accent)' : 'var(--border)'}`,
                  background: isCurrent ? 'var(--select-bg)' : 'var(--card)',
                  color: isCurrent ? 'var(--select-fg)' : 'var(--text2)',
                  padding: '2px 4px 2px 10px',
                }}
              >
                <Link
                  to={r.to}
                  className="tap"
                  aria-current={isCurrent ? 'page' : undefined}
                  style={{
                    textDecoration: 'none',
                    color: 'inherit',
                    fontSize: 'var(--t-meta, 12px)',
                    fontWeight: isCurrent ? 700 : 500,
                  }}
                >
                  {r.label}
                </Link>
                <button
                  type="button"
                  aria-label={`Unpin ${r.label}`}
                  title={`Unpin ${r.label}`}
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    handleTogglePin(r.to)
                  }}
                  style={pinBtnStyle}
                >
                  <Icon name="close" size={11} style={{ opacity: 0.7 }} />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* 2. Five Report Groups Bar */}
      <div
        role="tablist"
        aria-label="Report groups"
        style={{
          display: 'flex',
          columnGap: 6,
          rowGap: 6,
          flexWrap: 'wrap',
          borderBottom: '1px solid var(--border)',
          paddingBottom: 8,
        }}
      >
        {visibleGroups.map((g) => {
          const isSelected = g.key === selectedGroupKey
          return (
            <button
              key={g.key}
              role="tab"
              type="button"
              aria-selected={isSelected}
              onClick={() => setSelectedGroupKey(g.key)}
              className="tap"
              style={{
                ...tabStyle,
                border: `1px solid ${isSelected ? 'var(--nav-active-accent)' : 'var(--border)'}`,
                background: isSelected ? 'var(--select-bg)' : 'var(--card)',
                color: isSelected ? 'var(--select-fg)' : 'var(--text2)',
                cursor: 'pointer',
              }}
            >
              {g.label}
            </button>
          )
        })}
      </div>

      {/* 3. Sub-strip of Reports in the Selected Group */}
      <div
        data-testid="group-reports-strip"
        role="tabpanel"
        aria-label={`${REPORT_GROUPS.find((g) => g.key === selectedGroupKey)?.label ?? ''} reports`}
        style={{
          display: 'flex',
          columnGap: 6,
          rowGap: 6,
          flexWrap: 'wrap',
          paddingTop: 4,
        }}
      >
        {groupReports.map((r) => {
          const isCurrent = currentReport?.id === r.id
          const pinned = pins.includes(r.to)
          return (
            <div
              key={r.to}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                borderRadius: 'var(--r-badge, 14px)',
                border: `1px solid ${isCurrent ? 'var(--nav-active-accent)' : 'var(--border)'}`,
                background: isCurrent ? 'var(--select-bg)' : 'var(--card)',
                color: isCurrent ? 'var(--select-fg)' : 'var(--text2)',
                padding: '2px 6px 2px 10px',
              }}
            >
              <Link
                to={r.to}
                className="tap"
                aria-current={isCurrent ? 'page' : undefined}
                style={{
                  textDecoration: 'none',
                  color: 'inherit',
                  fontSize: 'var(--t-meta, 12px)',
                  fontWeight: isCurrent ? 700 : 500,
                }}
              >
                {r.label}
              </Link>
              <button
                type="button"
                aria-label={pinned ? `Unpin ${r.label}` : `Pin ${r.label}`}
                aria-pressed={pinned}
                title={pinned ? `Unpin ${r.label}` : `Pin ${r.label}`}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  handleTogglePin(r.to)
                }}
                style={pinBtnStyle}
              >
                <Icon
                  name={pinned ? 'pinned' : 'pin'}
                  size={12}
                  style={{ color: pinned ? 'var(--primary)' : 'var(--muted)' }}
                />
              </button>
            </div>
          )
        })}
      </div>
    </nav>
  )
}
