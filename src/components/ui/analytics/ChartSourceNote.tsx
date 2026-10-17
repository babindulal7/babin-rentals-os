import type { AnalyticsContext, Provenance } from '../../../lib/analytics/contracts'

interface ChartSourceNoteProps {
  context: AnalyticsContext
  extraNote?: string
}

function provenanceLabel(p: Provenance): { text: string; badgeClass: string } {
  switch (p) {
    case 'actual':
      return { text: 'Actual data', badgeClass: 'analytics-badge--actual' }
    case 'derived':
      return { text: 'Derived computation', badgeClass: 'analytics-badge--derived' }
    case 'scenario':
      return { text: 'Illustrative scenario', badgeClass: 'analytics-badge--scenario' }
  }
}

export function ChartSourceNote({ context, extraNote }: ChartSourceNoteProps) {
  const badge = provenanceLabel(context.provenance)

  return (
    <footer className="analytics-source-note" aria-label="Data source provenance and audit metadata">
      <div className="analytics-source-note__header">
        <span className={`analytics-badge ${badge.badgeClass}`}>{badge.text}</span>
        <span className="analytics-source-note__source">
          Source: {context.sourceLabel} · Date basis: {context.dateBasis}
        </span>
      </div>

      <div className="analytics-source-note__details">
        <span>
          Period: {context.fromAd} to {context.toAd}
        </span>
        {context.generatedAtIso && (
          <span>Snapshot: {context.generatedAtIso.replace('T', ' ').slice(0, 16)} UTC</span>
        )}
      </div>

      {context.incompleteReason && (
        <div role="status" className="analytics-source-note__warning">
          <strong>Notice:</strong> {context.incompleteReason}
        </div>
      )}

      {extraNote && <p className="analytics-source-note__extra">{extraNote}</p>}
    </footer>
  )
}
