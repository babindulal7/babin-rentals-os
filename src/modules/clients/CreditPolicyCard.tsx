import Icon from '../../components/ui/Icon'
import { Card, Button } from '../../components/ui/Page'
import { PageBody } from '../../components/ui/PageBody'
import { Unavailable } from '../../components/ui/Unavailable'
import { formatMoney } from '../../lib/money'
import { useMembershipPlans } from '../../lib/queries/useClients'
import { TIER_TONE, STACK_NOTE } from '../../lib/queries/clients'
import { STATUS } from '../../lib/status'
import './clients.css'

/**
 * Credit policy by membership tier — read live from `membership_plans`
 * (`default_credit_limit`, `individual_discount_pct` per level). 0005's own
 * comment on that table is the rule: *"no plan value may be hardcoded in
 * application code; every read comes from this table."*
 *
 * RULING 2026-10-18: this is a business rule, so it lives in Settings ▸ Business
 * with the deposit, booking and cancellation rules (Babin's ruling). It moved
 * out of Clients ▸ Credit, which keeps the client-level figures. Money end to
 * end: Settings mounts the Business money pane only for a money-sighted role.
 * Revert = render it back inside Clients' `CreditView` and drop it from
 * `FinancialPane`.
 */
export function CreditPolicyCard() {
  const plans = useMembershipPlans()
  return (
    <Card
      title="Credit policy by membership tier"
      action={
        <Unavailable reason={/* The Manager override gate is not built yet — Foundation §10 requires an authorisation step and an immutable audit row that do not exist */ "Manager overrides are not available yet."}>
          <Button icon="flag" disabled>
            Request Override
          </Button>
        </Unavailable>
      }
    >
      <p style={{ margin: '-4px 0 12px', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
        Credit limits derive from the membership plan — nobody types a limit onto a client record. An override
        needs Manager authorisation with a reason of at least 10 characters, written to the immutable audit.
      </p>

      <PageBody
        loading={plans.loading}
        error={plans.error}
        onRetry={plans.refetch}
        hasRows={plans.rows.length > 0}
        empty={plans.isEmpty}
        noun="membership plans"
        skeleton="card"
        emptyTitle="No membership plan is on file"
        emptyMessage="`membership_plans` holds no active plan, so there is no tier, no default credit limit and no plan discount to state. The five tiers this table used to list were written into the page."
      >
        <div className="credit-policy-grid">
          {plans.rows.map((p) => (
            <div
              key={p.level}
              className="credit-policy-card"
            >
              <span
                style={{
                  display: 'inline-flex',
                  alignSelf: 'flex-start',
                  alignItems: 'center',
                  height: 19,
                  padding: '0 7px',
                  borderRadius: 5,
                  background: STATUS[TIER_TONE[p.level]].bg,
                  color: STATUS[TIER_TONE[p.level]].fg,
                  fontSize: 'var(--t-th)',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                }}
              >
                {p.label}
              </span>
              <span className="figure client-mono" style={{ fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>
                {/* null is withheld, never zero — see `MembershipPlanRow`. */}
                {p.defaultCreditLimit === null ? '—' : formatMoney(p.defaultCreditLimit)}
              </span>
              <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                {/* Null for Elite ("Negotiated") as well as for a withheld
                    figure — the two are the same value here, so neither is
                    claimed as a number. */}
                Discount{' '}
                <span className="figure client-mono">
                  {p.individualDiscountPct === null ? 'Negotiated' : `${p.individualDiscountPct}%`}
                </span>
              </span>
            </div>
          ))}
        </div>
      </PageBody>

      <p
        style={{
          margin: '12px 0 0',
          display: 'flex',
          gap: 6,
          alignItems: 'flex-start',
          fontSize: 'var(--t-meta)',
          color: 'var(--text2)',
        }}
      >
        <Icon name="info" size={13} style={{ color: 'var(--muted)', flexShrink: 0, marginTop: 1 }} />
        {/* The 25% stacking cap this line used to state was rescinded — see
            STACK_NOTE's own note in data/membership.ts. Imported rather than
            restated so the two surfaces cannot drift apart again. */}
        {STACK_NOTE}
      </p>
    </Card>
  )
}
