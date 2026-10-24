import { useRef, useState } from 'react'
import { Menu } from '@base-ui/react/menu'
import Icon, { type IconName } from '../../components/ui/Icon'
import { Drawer, DrawerTrigger, DrawerPopup, DrawerHeader, DrawerTitle, DrawerDescription, DrawerPanel } from '../../components/ui/cossDrawer'
import { stepWriteGate } from '../../lib/operationsShell'
import { useViewport } from '../../lib/device'
import type { BookingStatus, JobName } from '../../lib/workflow'
import { useOperationsWorkspace } from '../operations/OperationsWorkspaceContext'
import { useAuth } from '../../lib/auth'
import { canPerformOp, type OperationName } from '../../lib/rbac'
import './booking-operations-menu.css'

const OPERATIONS: ReadonlyArray<{ job: JobName; label: string; icon: IconName }> = [
  { job: 'Pack', label: 'Packing', icon: 'box' },
  { job: 'Handover', label: 'Handover', icon: 'truck' },
  { job: 'Return', label: 'Return & Inspection', icon: 'return_arrow' },
  { job: 'Reset', label: 'Cleaning & Reset', icon: 'refresh' },
]
export interface BookingOperationsMenuProps {
  bookingNo?: string
  bookingStatus?: BookingStatus
  unavailable?: string | null
  primary?: boolean
  compact?: boolean
}
/** Responsive actions composition; the canonical provider and workspaces own execution. */
export default function BookingOperationsMenu({ bookingNo, bookingStatus, unavailable = null, primary = false, compact = false }: BookingOperationsMenuProps) {
  const [open, setOpen] = useState(false)
  const phone = useViewport() === 'phone'
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const selected = useRef<JobName | null>(null)
  const { openOperations } = useOperationsWorkspace()
  const { user } = useAuth()
  const choices = OPERATIONS.map(operation => {
    const roleAllowed = user ? canPerformOp(user.role, operation.job.toLowerCase() as OperationName) : false
    const gate = bookingStatus ? stepWriteGate(operation.job, bookingStatus) : null
    const reason = unavailable ?? (!bookingNo ? 'Save and confirm this booking before starting operations.'
      : !bookingStatus ? 'Booking status is still loading. Retry before starting operations.'
      : !roleAllowed ? `Your role (${user?.role ?? 'not signed in'}) does not have permission to perform ${operation.label}.`
      : gate && !gate.allowed ? gate.reason : null)
    return { ...operation, reason }
  })
  const select = (job: JobName, reason: string | null) => {
    if (reason || !bookingNo || !bookingStatus) return
    selected.current = job
    setOpen(false)
  }
  const afterOpenChange = (isOpen: boolean) => {
    if (isOpen || !selected.current || !bookingNo || !bookingStatus) return
    const job = selected.current
    selected.current = null
    // The next modal must remember the real opener, not a removed menu item.
    triggerRef.current?.focus({ preventScroll: true })
    openOperations(bookingNo, bookingStatus, job)
  }
  const trigger = <button ref={triggerRef} type="button" className={`booking-operations__trigger${primary ? ' booking-operations__trigger--primary' : ''}`} aria-label="Operations" title={compact ? 'Operations' : undefined}>
    {compact ? <Icon name="checklist" size={18} /> : <>Operations<Icon name="chevron_down" size={15} /></>}
  </button>
  const content = (label: string, icon: IconName, reason: string | null) => <>
    <Icon name={icon} size={19} />
    <span className="booking-operations__copy"><span className="booking-operations__name">{label}</span>{reason && <span className="booking-operations__reason">{reason}</span>}</span>
  </>
  if (phone) return <Drawer position="bottom" open={open} onOpenChange={setOpen} onOpenChangeComplete={afterOpenChange}>
    <DrawerTrigger render={trigger} />
    <DrawerPopup finalFocus={() => selected.current ? false : triggerRef.current}>
      <DrawerHeader><DrawerTitle>Operations</DrawerTitle><DrawerDescription>{bookingNo ? `Choose an operation for ${bookingNo}.` : 'Save the booking to start operations.'}</DrawerDescription></DrawerHeader>
      <DrawerPanel>{choices.map(({ job, label, icon, reason }) => <button type="button" key={job} className="booking-operations__item" aria-disabled={reason !== null} title={reason ?? undefined} onClick={() => select(job, reason)}>{content(label, icon, reason)}</button>)}</DrawerPanel>
    </DrawerPopup>
  </Drawer>
  return <Menu.Root open={open} onOpenChange={setOpen} onOpenChangeComplete={afterOpenChange}>
    <Menu.Trigger render={trigger} />
    <Menu.Portal><Menu.Positioner sideOffset={6} align="end" className="booking-operations__positioner">
      <Menu.Popup aria-label="Operations" className="booking-operations__popup" finalFocus={() => selected.current ? false : triggerRef.current}>
        {choices.map(({ job, label, icon, reason }) => <Menu.Item key={job} className="booking-operations__item" disabled={reason !== null} aria-label={reason ? `${label}. Unavailable: ${reason}` : label} title={reason ?? undefined} onClick={() => select(job, reason)}>{content(label, icon, reason)}</Menu.Item>)}
      </Menu.Popup>
    </Menu.Positioner></Menu.Portal>
  </Menu.Root>
}
