import React from 'react'
import './module-shell.css'

export interface ModulePageShellProps {
  subHeader?: React.ReactNode
  kpiStrip?: React.ReactNode
  filterBar?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string
  style?: React.CSSProperties
}

/**
 * Standardized Module Page Shell
 * Enforces the strict 4-zone vertical operational layout:
 * - Zone 1: Sub-Header & Primary Action Bar
 * - Zone 2: 3-Card KPI Strip
 * - Zone 3: Unified Filter & Tab Bar
 * - Zone 4: Standard Data Table (or custom operational view)
 */
export const ModulePageShell: React.FC<ModulePageShellProps> = ({
  subHeader,
  kpiStrip,
  filterBar,
  children,
  footer,
  className = '',
  style,
}) => {
  return (
    <div className={`module-page-shell animate-entrance ${className}`.trim()} style={style}>
      {subHeader}
      {kpiStrip}
      {filterBar}
      <div className="module-page-shell__content" style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0, width: '100%' }}>
        {children}
      </div>
      {footer}
    </div>
  )
}
