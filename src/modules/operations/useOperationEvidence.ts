import { useCallback, useEffect, useState } from 'react'
import { fetchOperationEvidence, type OperationEvidence } from '../../lib/queries/operationEvidence'

export function useOperationEvidence(bookingId: string | null) {
  const [evidence, setEvidence] = useState<OperationEvidence | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const refresh = useCallback(() => setRevision(value => value + 1), [])
  useEffect(() => {
    let active = true
    setEvidence(null)
    setError(null)
    if (bookingId) void fetchOperationEvidence(bookingId).then(result => {
      if (active) setEvidence(result)
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : 'Saved booking evidence could not be verified.')
    })
    return () => { active = false }
  }, [bookingId, revision])
  return { evidence, error, refresh }
}
