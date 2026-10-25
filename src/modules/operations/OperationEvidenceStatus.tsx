import { Button } from '../../components/ui/Page'
import type { useOperationEvidence } from './useOperationEvidence'

export function OperationEvidenceStatus({ status, id }: { status: ReturnType<typeof useOperationEvidence>; id?: string }) {
  return <div {...(id ? { id } : {})}>
    <p role={status.error ? 'alert' : 'status'} style={{ margin: '6px 0', color: status.error ? 'var(--danger-text)' : 'var(--muted)' }}>
      {status.error ?? (status.evidence
        /* RULING 2026-10-25: shortened. It still says upload is unavailable here and that only a saved photo counts. */
        ? `${status.evidence.files} saved booking photo(s). Upload is unavailable here; only saved photos count.`
        : 'Verifying saved booking evidence…')}
    </p>
    <Button onClick={status.refresh}>Refresh saved evidence</Button>
  </div>
}
