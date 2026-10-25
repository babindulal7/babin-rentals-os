import { Button } from '../../components/ui/Page'
import type { useOperationEvidence } from './useOperationEvidence'

export function OperationEvidenceStatus({ status, id }: { status: ReturnType<typeof useOperationEvidence>; id?: string }) {
  return <div {...(id ? { id } : {})}>
    <p role={status.error ? 'alert' : 'status'} style={{ margin: '6px 0', color: status.error ? 'var(--danger-text)' : 'var(--muted)' }}>
      {status.error ?? (status.evidence
        ? `${status.evidence.files} saved booking photo(s). Photo upload is unavailable in this workspace; local counters cannot satisfy evidence requirements.`
        : 'Verifying saved booking evidence…')}
    </p>
    <Button onClick={status.refresh}>Refresh saved evidence</Button>
  </div>
}
