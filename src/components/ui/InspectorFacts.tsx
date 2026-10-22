import type { ReactNode } from 'react'

export interface InspectorFact {
  key: string
  label: string
  value: ReactNode
  strong?: boolean
  mono?: boolean
  wide?: boolean
}

interface Props { title: string; facts: readonly InspectorFact[] }

/** Caller MUST filter sensitive/money fields before passing them as facts. */
export function InspectorFacts({ title, facts }: Props) {
  if (facts.length === 0) return null
  return (
    <section className="premium-inspector-section" aria-label={title}>
      <h3 className="premium-inspector-section__title">{title}</h3>
      <dl className="premium-inspector-facts">
        {facts.map((fact) => (
          <div className={`premium-inspector-fact${fact.wide ? ' premium-inspector-fact--wide' : ''}`} key={fact.key}>
            <dt>{fact.label}</dt>
            <dd className={`${fact.strong ? 'is-strong ' : ''}${fact.mono ? 'is-mono' : ''}`.trim()}>{fact.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
