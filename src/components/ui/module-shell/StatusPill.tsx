import React from 'react'
import Icon, { type IconName } from '../Icon'
import './module-shell.css'

export type StatusTone = 'emerald' | 'amber' | 'red' | 'slate' | 'blue'

export interface StatusPillProps {
  label: string
  tone?: StatusTone
  icon?: IconName
  liveDot?: boolean
  className?: string
  style?: React.CSSProperties
}

const DEFAULT_ICONS: Record<StatusTone, IconName> = {
  emerald: 'check',
  amber: 'timer',
  red: 'alert_triangle',
  slate: 'file',
  blue: 'arrow_right',
}

/**
 * Unified Status Pill
 * Displays semantic color, border pill, distinct Tabler icon, and label text (Law 11).
 */
export const StatusPill: React.FC<StatusPillProps> = ({
  label,
  tone = 'slate',
  icon,
  liveDot = false,
  className = '',
  style,
}) => {
  const iconName = icon || DEFAULT_ICONS[tone]

  return (
    <span
      className={`module-status-pill module-status-pill--${tone} ${className}`.trim()}
      style={style}
    >
      {liveDot && (
        <span
          className="status-live-dot"
          aria-hidden="true"
          style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', flexShrink: 0 }}
        />
      )}
      <Icon name={iconName} size={13} style={{ flexShrink: 0 }} />
      <span>{label}</span>
    </span>
  )
}
