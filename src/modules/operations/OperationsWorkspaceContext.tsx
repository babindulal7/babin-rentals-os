import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import type { BookingStatus, JobName } from '../../lib/workflow'
import { entryStepFor } from '../../lib/operationsShell'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import OperationsShell from './OperationsShell'

interface OpenWorkspace { bookingNo: string; bookingStatus: BookingStatus; job: JobName }
interface OperationsWorkspaceValue {
  openOperations: (bookingNo: string, bookingStatus: BookingStatus, job?: JobName) => void
  closeOperations: () => void
}
const OperationsWorkspaceContext = createContext<OperationsWorkspaceValue | null>(null)

export function OperationsWorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspace, setWorkspace] = useState<OpenWorkspace | null>(null)
  const active = useRef(workspace)
  active.current = workspace
  const dirty = useRef(false)
  const busy = useRef(false)
  const [pending, setPending] = useState<{ target: OpenWorkspace | null } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const replace = useCallback((target: OpenWorkspace | null) => {
    dirty.current = false
    setNotice(null)
    setWorkspace(target)
  }, [])
  const request = useCallback((target: OpenWorkspace | null) => {
    if (busy.current) { setNotice('An operation is being saved. Wait for its result before changing bookings.'); return }
    if (dirty.current) setPending({ target })
    else replace(target)
  }, [replace])
  const closeOperations = useCallback(() => request(null), [request])
  const openOperations = useCallback((bookingNo: string, bookingStatus: BookingStatus, selected?: JobName) => {
    const job = selected ?? entryStepFor(bookingStatus) ?? 'Pack'
    if (active.current?.bookingNo === bookingNo && active.current.job === job) return
    request({ bookingNo, bookingStatus, job })
  }, [request])
  const reportDirty = useCallback((value: boolean) => { dirty.current = value }, [])
  const reportBusy = useCallback((value: boolean) => { busy.current = value; if (!value) setNotice(null) }, [])
  const value = useMemo(() => ({ openOperations, closeOperations }), [closeOperations, openOperations])
  return <OperationsWorkspaceContext.Provider value={value}>
    {children}
    {notice && <p role="status">{notice}</p>}
    {workspace && <OperationsShell key={`${workspace.bookingNo}:${workspace.job}`} isOpen bookingNo={workspace.bookingNo} bookingStatus={workspace.bookingStatus} initialJob={workspace.job} onDirtyChange={reportDirty} onBusyChange={reportBusy} onClose={() => replace(null)} />}
    <ConfirmDialog isOpen={pending !== null} title="Discard unsaved operations work?" description={pending?.target ? `Discard the current marks and open ${pending.target.bookingNo}?` : 'Discard the current unsaved operations work and close?'} cancelLabel="Keep editing" confirmLabel="Discard changes" variant="danger" onClose={() => setPending(null)} onConfirm={() => { if (busy.current) return; const target = pending?.target ?? null; setPending(null); replace(target) }} />
  </OperationsWorkspaceContext.Provider>
}

export function useOperationsWorkspace(): OperationsWorkspaceValue {
  const value = useContext(OperationsWorkspaceContext)
  if (!value) throw new Error('useOperationsWorkspace must be used inside OperationsWorkspaceProvider')
  return value
}
