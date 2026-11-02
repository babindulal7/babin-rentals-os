import { useAuth } from '../../lib/auth'
import { canViewMoneyField, gateContext } from '../../lib/fieldGating'
import { RestrictedState } from '../../components/ui/StateViews'
import { Badge } from '../../components/ui/Badge'
import { PageHeader } from '../../components/ui/Page'
import './inventory.css'

/**
 * Deposit Setup — bulk editor for product deposit terms (T3-02).
 *
 * Lists every active product with its deposit_fixed, deposit_percent, and
 * replacement_value. Inline edit with CSV round-trip through the products
 * import dry-run machinery. Filter "no deposit set", progress counter.
 * Money roles only (Law 6).
 */

export interface DepositSetupProps {
  embedded?: boolean
  onDone?: () => void
}

export default function DepositSetup(_props: DepositSetupProps = {}) {
  const { user } = useAuth()
  const role = user?.role ?? 'Client'
  const gctx = gateContext(role)
  const canEdit = canViewMoneyField(gctx, 'booking')

  if (!canEdit) {
    return <RestrictedState reason="Deposit setup is a money role action." />
  }

  // Implementation here
  return (
    <div style={{ padding: 'var(--sp-lg)' }}>
      <PageHeader
        title="Deposit Setup"
        description="Configure per-product deposit rules. Fixed deposit wins; otherwise percent of replacement value."
        status={
          <Badge tone="primary" label="Staff fill all products before trial" variant="pill" />
        }
      >
        {/* Implementation pending */}
      </PageHeader>
    </div>
  )
}