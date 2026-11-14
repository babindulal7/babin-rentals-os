import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import LiveTransportPlans from './LiveTransportPlans'
import { SendToRiderModal } from './SendToRiderModal'
import { useStaffBranchId } from './useStaffBranchId'
import { DateField } from '../../components/ui/DateField'
import { SignaturePad, type SignaturePadRef } from '../../components/ui/SignaturePad'
import Icon from '../../components/ui/Icon'
import type { IconName } from '../../components/ui/Icon'
import { PageHeader, PageActions, Button } from '../../components/ui/Page'
import { OverflowMenu, type OverflowMenuItem } from '../../components/ui/OverflowMenu'
import { PageShell } from '../../components/ui/PageShell'
import { PageBody } from '../../components/ui/PageBody'
import { DataTableShell } from '../../components/ui/DataTable'
import { Modal } from '../../components/ui/Modal'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { SearchInput } from '../../components/ui/SearchInput'
import { EmptyState, LoadingSkeleton } from '../../components/ui/StateViews'
import { formatMoney, rupees } from '../../lib/money'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { useViewport } from '../../lib/device'
import { useAuth } from '../../lib/auth'
import {
  canCreateDeliveryJob,
  canAssignDeliveryDriver,
  canTransitionDeliveryJob,
  canRescheduleDeliveryJob,
  canSetDeliveryRoutePosition,
  canSetClientMapPin,
  canViewDayRoute,
  canAttachDeliveryProof,
} from '../../lib/rbac'
import {
  fetchDeliveries,
  liveDeliveryReadRefusal,
  type DeliveryRecord,
  type DeliveryStatus,
} from '../../lib/queries/delivery'
import {
  createDeliveryJob,
  assignDeliveryDriver,
  transitionDeliveryJob,
  rescheduleDeliveryJob,
  setRoutePosition,
  setClientMapPin,
  getDayRoute,
  generateMapLinks,
  attachDeliveryProof,
  type DayRouteStop,
} from '../../actions/delivery'
import { buildDeliveryRescheduleAction } from '../../lib/whatsappActions'
import { useDomainEvent } from '../../events/useDomainEvent'
import { EVENT_TYPES } from '../../events/eventBus'
import { useToast } from '../../components/ui/Toast'
import { businessDayAd } from '../../lib/bs'
import { uploadEvidencePhoto } from '../../lib/evidenceStorage'
import './delivery.css'

const STATUS_BADGE_STYLE: Record<DeliveryStatus, { bg: string; color: string; border: string; icon: IconName }> = {
  Scheduled: { bg: 'var(--st-neutral-bg)', color: 'var(--st-neutral-fg)', border: '1px solid var(--border)', icon: 'timer' },
  Ready: { bg: 'var(--st-progress-bg)', color: 'var(--st-progress-fg)', border: '1px solid var(--border)', icon: 'box' },
  'In Transit': { bg: 'var(--st-out-bg)', color: 'var(--st-out-fg)', border: '1px solid var(--border)', icon: 'truck' },
  Delivered: { bg: 'var(--st-in-bg)', color: 'var(--st-in-fg)', border: '1px solid var(--border)', icon: 'check' },
  Failed: { bg: 'var(--st-danger-bg)', color: 'var(--st-danger-fg)', border: '1px solid var(--border)', icon: 'alert_circle' },
}

type ViewMode = 'table' | 'kanban'
type WorkspaceTab = 'dispatches' | 'transport' | 'route'

export function DeliveryWorkspace() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('dispatches')

  if (activeTab === 'transport') {
    return (
      <div>
        <div style={{ padding: '8px 16px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Button variant="secondary" size="sm" onClick={() => setActiveTab('dispatches')}>
            ← Back to Delivery Dispatches
          </Button>
          <span style={{ fontSize: '12px', color: 'var(--text3)' }}>Viewing Transport Overview Plans</span>
        </div>
        <LiveTransportPlans />
      </div>
    )
  }

  if (activeTab === 'route') {
    return (
      <div>
        <div style={{ padding: '8px 16px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Button variant="secondary" size="sm" onClick={() => setActiveTab('dispatches')}>
            ← Back to Delivery Dispatches
          </Button>
          <span style={{ fontSize: '12px', color: 'var(--text3)' }}>Viewing Route Planner</span>
        </div>
        <RoutePlannerView />
      </div>
    )
  }

  return <ActiveDeliveryWorkspace onSwitchToTransport={() => setActiveTab('transport')} />
}

function ActiveDeliveryWorkspace({ onSwitchToTransport }: { onSwitchToTransport: () => void }) {
  const { user } = useAuth()
  const role = user?.role ?? null
  const readRefusal = liveDeliveryReadRefusal(role)
  const canMoney = useCanViewMoney()
  const isDriver = role === 'Driver'

  const [deliveries, setDeliveries] = useState<DeliveryRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [mutationError, setMutationError] = useState<string | null>(null)

  const [statusFilter, setStatusFilter] = useState<'All' | DeliveryStatus>('All')
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('table')

  const viewport = useViewport()
  const isMobile = viewport === 'phone'
  const { showSuccessToast } = useToast()

  // Permission capabilities
  const canCreate = canCreateDeliveryJob(role)
  const canAssign = canAssignDeliveryDriver(role)
  const canAttachProof = role !== null && canAttachDeliveryProof(role)

  // Modals state
  const [assignTarget, setAssignTarget] = useState<DeliveryRecord | null>(null)
  const [driverName, setDriverName] = useState('')
  const [driverPhone, setDriverPhone] = useState('')
  const [vehiclePlate, setVehiclePlate] = useState('')

  const [deliverTarget, setDeliverTarget] = useState<DeliveryRecord | null>(null)
  const [recipientName, setRecipientName] = useState('')
  const [deliveryNote, setDeliveryNote] = useState('')

  // Proof of delivery modal state (T4-03)
  const [proofTarget, setProofTarget] = useState<DeliveryRecord | null>(null)
  const [proofPhotoFile, setProofPhotoFile] = useState<File | null>(null)
  const [proofPhotoPreview, setProofPhotoPreview] = useState<string | null>(null)
  const proofSignatureRef = useRef<SignaturePadRef | null>(null)
  const [proofSubmitting, setProofSubmitting] = useState(false)
  const [proofError, setProofError] = useState<string | null>(null)

  const [failTarget, setFailTarget] = useState<DeliveryRecord | null>(null)
  const [failReason, setFailReason] = useState('')

  const [rescheduleTarget, setRescheduleTarget] = useState<DeliveryRecord | null>(null)
  const [rescheduleDate, setRescheduleDate] = useState('')
  const [rescheduleTime, setRescheduleTime] = useState('')
  const [rescheduleNotes, setRescheduleNotes] = useState('')
  const [rescheduleWaLink, setRescheduleWaLink] = useState<{ text: string; href: string | null; unavailable?: string | undefined } | null>(null)
  const [rescheduleIsSaving, setRescheduleIsSaving] = useState(false)

  const [newModalOpen, setNewModalOpen] = useState(false)
  const [newBookingId, setNewBookingId] = useState('')
  const [newBookingNo, setNewBookingNo] = useState('')
  const [newLeg, setNewLeg] = useState<'Outbound' | 'Return'>('Outbound')
  const [newDate, setNewDate] = useState(() => businessDayAd())
  const [newTime, setNewTime] = useState('10:00')
  const [newVehicle, setNewVehicle] = useState('')
  const [newRiderName, setNewRiderName] = useState('')
  const [newRiderPhone, setNewRiderPhone] = useState('')

  const [gatePassSlip, setGatePassSlip] = useState<DeliveryRecord | null>(null)
  const [riderModalTarget, setRiderModalTarget] = useState<DeliveryRecord | null>(null)

  const loadData = useCallback(() => {
    if (readRefusal) return
    setLoading(true)
    fetchDeliveries(role)
      .then((data) => {
        setDeliveries(data)
        setLoading(false)
        setFetchError(null)
      })
      .catch((err: unknown) => {
        setFetchError(err instanceof Error ? err.message : 'Deliveries unavailable')
        setLoading(false)
      })
  }, [role, readRefusal])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Realtime live domain events
  useDomainEvent(EVENT_TYPES.DELIVERY_JOB_CREATED, loadData)
  useDomainEvent(EVENT_TYPES.DELIVERY_DRIVER_ASSIGNED, loadData)
  useDomainEvent(EVENT_TYPES.DELIVERY_JOB_TRANSITIONED, loadData)
  useDomainEvent(EVENT_TYPES.RENTAL_PACKED, loadData)
  useDomainEvent(EVENT_TYPES.RENTAL_HANDED_OVER, loadData)
  useDomainEvent(EVENT_TYPES.RENTAL_CONFIRMED, loadData)
  useDomainEvent(EVENT_TYPES.DELIVERY_JOB_RESCHEDULED, loadData)

  const filtered = useMemo(() => {
    return deliveries.filter((d) => {
      if (statusFilter !== 'All' && d.status !== statusFilter) return false
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        const match =
          d.id.toLowerCase().includes(q) ||
          d.bookingNo.toLowerCase().includes(q) ||
          d.clientName.toLowerCase().includes(q) ||
          d.address.toLowerCase().includes(q) ||
          (d.neighborhood && d.neighborhood.toLowerCase().includes(q)) ||
          (d.driverName && d.driverName.toLowerCase().includes(q))
        if (!match) return false
      }
      return true
    })
  }, [deliveries, statusFilter, searchQuery])

  // KPIs
  const inTransitCount = deliveries.filter((d) => d.status === 'In Transit').length
  const readyCount = deliveries.filter((d) => d.status === 'Ready').length
  const scheduledCount = deliveries.filter((d) => d.status === 'Scheduled').length
  const deliveredCount = deliveries.filter((d) => d.status === 'Delivered').length
  const failedCount = deliveries.filter((d) => d.status === 'Failed').length
  const totalRevenue = canMoney
    ? deliveries.reduce((acc, d) => acc + (d.status === 'Delivered' ? d.deliveryFeeNpr : 0), 0)
    : 0

  // Transition Handlers
  const handleMarkReady = async (rec: DeliveryRecord) => {
    if (!user?.id || !user?.role) {
      setMutationError('User authentication required')
      return
    }
    setMutationError(null)
    try {
      await transitionDeliveryJob(
        {
          jobId: rec.id,
          expectedStatus: 'Scheduled',
          nextStatus: 'Ready',
        },
        { userId: user.id, role: user.role },
      )
      showSuccessToast(`Dispatch ${rec.id} staged Ready for transit`)
      loadData()
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : 'Failed to transition to Ready')
    }
  }

  const handleStartTransit = async (rec: DeliveryRecord) => {
    if (!user?.id || !user?.role) {
      setMutationError('User authentication required')
      return
    }
    setMutationError(null)
    try {
      await transitionDeliveryJob(
        {
          jobId: rec.id,
          expectedStatus: 'Ready',
          nextStatus: 'In Transit',
        },
        { userId: user.id, role: user.role },
      )
      showSuccessToast(`Dispatch ${rec.id} marked In Transit · Driver en route`)
      loadData()
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : 'Failed to start transit')
    }
  }

  const handleOpenDeliver = (rec: DeliveryRecord) => {
    setMutationError(null)
    setDeliverTarget(rec)
    setRecipientName(rec.recipientName || rec.clientName)
    setDeliveryNote('')
  }

  const handleConfirmDelivered = async () => {
    if (!deliverTarget) return
    if (!user?.id || !user?.role) {
      setMutationError('User authentication required')
      return
    }
    if (recipientName.trim().length < 2) {
      setMutationError('Recipient name must be at least 2 characters.')
      return
    }
    setMutationError(null)
    try {
      await transitionDeliveryJob(
        {
          jobId: deliverTarget.id,
          expectedStatus: 'In Transit',
          nextStatus: 'Delivered',
          recipient: recipientName.trim(),
          note: deliveryNote.trim() || undefined,
        },
        { userId: user.id, role: user.role },
      )
      showSuccessToast(`Dispatch ${deliverTarget.id} delivered to ${recipientName.trim()}`)
      setDeliverTarget(null)
      loadData()
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : 'Failed to confirm delivery')
    }
  }

  const handleOpenFail = (rec: DeliveryRecord) => {
    setMutationError(null)
    setFailTarget(rec)
    setFailReason('')
  }

  const handleConfirmFailed = async () => {
    if (!failTarget) return
    if (!user?.id || !user?.role) {
      setMutationError('User authentication required')
      return
    }
    if (failReason.trim().length < 10) {
      setMutationError('Failure reason must be explained in at least 10 characters.')
      return
    }
    setMutationError(null)
    try {
      await transitionDeliveryJob(
        {
          jobId: failTarget.id,
          expectedStatus: failTarget.status,
          nextStatus: 'Failed',
          note: failReason.trim(),
        },
        { userId: user.id, role: user.role },
      )
      showSuccessToast(`Dispatch ${failTarget.id} marked as Failed`)
      setFailTarget(null)
      loadData()
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : 'Failed to mark job as failed')
    }
  }

  const handleOpenAssign = (rec: DeliveryRecord) => {
    setMutationError(null)
    setAssignTarget(rec)
    setDriverName(rec.driverName ?? '')
    setDriverPhone(rec.driverPhone ?? '')
    setVehiclePlate(rec.vehiclePlate ?? '')
  }

  const handleSaveAssign = async () => {
    if (!assignTarget) return
    if (!user?.id || !user?.role) {
      setMutationError('User authentication required')
      return
    }
    if (!driverName.trim()) {
      setMutationError('Please specify a driver or courier rider name.')
      return
    }
    setMutationError(null)
    try {
      await assignDeliveryDriver(
        {
          jobId: assignTarget.id,
          riderName: driverName.trim(),
          riderPhone: driverPhone.trim() || undefined,
          vehicle: vehiclePlate.trim() || undefined,
        },
        { userId: user.id, role: user.role },
      )
      showSuccessToast(`Driver / Rider assigned to ${assignTarget.id}`)
      setAssignTarget(null)
      loadData()
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : 'Failed to assign driver')
    }
  }

  const handleOpenReschedule = (rec: DeliveryRecord) => {
    setMutationError(null)
    setRescheduleTarget(rec)
    setRescheduleDate(rec.scheduledDate || businessDayAd())
    setRescheduleTime(rec.scheduledTime || '10:00')
    setRescheduleNotes('')
    setRescheduleWaLink(null)
  }

  const handleConfirmReschedule = async () => {
    if (!rescheduleTarget) return
    if (!user?.id || !user?.role) {
      setMutationError('User authentication required')
      return
    }
    if (!rescheduleDate || !rescheduleTime) {
      setMutationError('Both a valid date and time are required to reschedule.')
      return
    }
    setMutationError(null)
    setRescheduleIsSaving(true)

    const isoTimestamp = `${rescheduleDate}T${rescheduleTime}:00+05:45`

    try {
      await rescheduleDeliveryJob(
        {
          jobId: rescheduleTarget.id,
          newScheduledAt: new Date(isoTimestamp).toISOString(),
          notes: rescheduleNotes.trim() || undefined,
        },
        { userId: user.id, role: user.role },
      )

      const oldDisplayTime = `${rescheduleTarget.scheduledDate} ${rescheduleTarget.scheduledTime}`
      const newDisplayTime = `${rescheduleDate} ${rescheduleTime}`

      const waAction = buildDeliveryRescheduleAction({
        clientName: rescheduleTarget.clientName,
        clientPhone: rescheduleTarget.clientPhone || null,
        bookingNo: rescheduleTarget.bookingNo,
        leg: rescheduleTarget.mode === 'Courier / Rider' ? 'Courier Dispatch' : 'Babin Delivery',
        oldTime: oldDisplayTime,
        newTime: newDisplayTime,
        notes: rescheduleNotes.trim() || undefined,
      })

      setRescheduleWaLink(waAction)
      showSuccessToast(`Dispatch ${rescheduleTarget.id} rescheduled to ${newDisplayTime}`)
      loadData()
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : 'Failed to reschedule delivery')
    } finally {
      setRescheduleIsSaving(false)
    }
  }

  // Proof of delivery handlers
  const handleOpenProof = (rec: DeliveryRecord) => {
    if (!role || !canAttachDeliveryProof(role)) {
      setMutationError('Your role cannot attach proof of delivery.')
      return
    }
    setMutationError(null)
    setProofTarget(rec)
    setProofPhotoFile(null)
    setProofPhotoPreview(null)
    setProofError(null)
    proofSignatureRef.current?.clear()
  }

  const handleProofPhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null
    setProofPhotoFile(file)
    if (file) {
      setProofPhotoPreview(URL.createObjectURL(file))
    } else {
      setProofPhotoPreview(null)
    }
    setProofError(null)
  }

  const handleSubmitProof = async () => {
    if (!proofTarget) return
    if (!user?.id || !user?.role) {
      setProofError('User authentication required')
      return
    }
    if (!proofPhotoFile && proofSignatureRef.current?.isEmpty()) {
      setProofError('At least one proof artifact (photo or signature) is required.')
      return
    }
    setProofSubmitting(true)
    setProofError(null)
    try {
      let photoPath: string | null = null
      let signaturePath: string | null = null

      if (proofPhotoFile) {
        const result = await uploadEvidencePhoto({
          file: proofPhotoFile,
          filename: proofPhotoFile.name,
          category: 'Pickup / Delivery',
          reference: {
            bookingId: proofTarget.bookingId ?? proofTarget.id,
            operationStage: 'Delivery',
            itemId: proofTarget.id,
          },
          userId: user?.id ?? '',
        })
        photoPath = result.storagePath
      }

      if (proofSignatureRef.current && !proofSignatureRef.current.isEmpty()) {
        const sigBlob = await new Promise<Blob | null>((resolve) => {
          proofSignatureRef.current?.toBlob(resolve, 'image/png')
        })
        if (sigBlob) {
          const result = await uploadEvidencePhoto({
            file: sigBlob,
            filename: `signature-${proofTarget.id}.png`,
            category: 'Pickup / Delivery',
            reference: {
              bookingId: proofTarget.bookingId ?? proofTarget.id,
              operationStage: 'Delivery',
              itemId: proofTarget.id,
            },
            userId: user?.id ?? '',
          })
          signaturePath = result.storagePath
        }
      }

      const requestKey = crypto.randomUUID()
      await attachDeliveryProof(
        {
          jobId: proofTarget.id,
          requestKey,
          photoPath: photoPath ?? undefined,
          signaturePath: signaturePath ?? undefined,
        },
        { userId: user.id, role: user.role },
      )

      showSuccessToast(`Proof attached to ${proofTarget.id}`)
      loadData()
      setProofTarget(null)
      setProofPhotoFile(null)
      setProofPhotoPreview(null)
      proofSignatureRef.current?.clear()
    } catch (error) {
      setProofError(error instanceof Error ? error.message : 'Failed to attach proof')
    } finally {
      setProofSubmitting(false)
    }
  }

  const handleCreateDelivery = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user?.id || !user?.role) {
      setMutationError('User authentication required')
      return
    }
    if (!newBookingId.trim() && !newBookingNo.trim()) {
      setMutationError('Please provide a valid Booking ID or Number.')
      return
    }
    setMutationError(null)
    const bookingIdentifier = newBookingId.trim() || newBookingNo.trim()
    const scheduledIso = `${newDate}T${newTime}:00Z`
    try {
      await createDeliveryJob(
        {
          bookingId: bookingIdentifier,
          leg: newLeg,
          scheduledAt: scheduledIso,
          vehicle: newVehicle.trim() || undefined,
          riderName: newRiderName.trim() || undefined,
          riderPhone: newRiderPhone.trim() || undefined,
        },
        { userId: user.id, role: user.role },
      )
      showSuccessToast('New delivery dispatch order created')
      setNewModalOpen(false)
      loadData()
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : 'Failed to create delivery dispatch')
    }
  }

  // RULING 2026-11-10: R-10.11 — Delivery screen: Job list + 1 button per job.
  // Each job row/card renders address, items, one next-step button, and the rest behind More.
  const getJobNextStep = (d: DeliveryRecord) => {
    const canReady = canTransitionDeliveryJob(role, 'Scheduled', 'Ready')
    const canTransit = canTransitionDeliveryJob(role, 'Ready', 'In Transit')
    const canDeliver = canTransitionDeliveryJob(role, 'In Transit', 'Delivered')
    const canReschedule = canRescheduleDeliveryJob(role) && d.status !== 'Delivered' && d.status !== 'Failed'
    const hasDriver = !!(d.driverId || d.driverName)

    if (d.status === 'Scheduled') {
      if (!hasDriver && canAssign) {
        return {
          label: 'Assign Driver',
          shortLabel: 'Assign',
          variant: 'secondary' as const,
          icon: 'user' as const,
          onClick: () => handleOpenAssign(d),
        }
      }
      if (canReady) {
        return {
          label: 'Stage Ready',
          shortLabel: 'Ready',
          variant: 'secondary' as const,
          icon: 'box' as const,
          onClick: () => handleMarkReady(d),
        }
      }
      if (canAssign) {
        return {
          label: 'Assign Driver',
          shortLabel: 'Assign',
          variant: 'secondary' as const,
          icon: 'user' as const,
          onClick: () => handleOpenAssign(d),
        }
      }
    }

    if (d.status === 'Ready' && canTransit) {
      return {
        label: 'Dispatch Now',
        shortLabel: 'Dispatch',
        variant: 'primary' as const,
        isPrimaryVerb: true,
        disabled: !hasDriver,
        title: !hasDriver ? 'Assign a driver before dispatching' : undefined,
        onClick: () => handleStartTransit(d),
      }
    }

    if (d.status === 'In Transit' && canDeliver) {
      return {
        label: 'Confirm Delivered ✓',
        shortLabel: 'Delivered ✓',
        variant: 'primary' as const,
        isPrimaryVerb: true,
        onClick: () => handleOpenDeliver(d),
      }
    }

    if (d.status === 'Delivered' && canAttachProof) {
      return {
        label: 'Attach Proof',
        shortLabel: 'Proof',
        variant: 'secondary' as const,
        icon: 'camera' as const,
        onClick: () => handleOpenProof(d),
      }
    }

    if (d.status === 'Failed' && canReschedule) {
      return {
        label: 'Change Time',
        shortLabel: 'Change Time',
        variant: 'secondary' as const,
        icon: 'timer' as const,
        onClick: () => handleOpenReschedule(d),
      }
    }

    return null
  }

  const getJobMoreItems = (d: DeliveryRecord, nextStepLabel?: string): OverflowMenuItem[] => {
    const canReady = canTransitionDeliveryJob(role, 'Scheduled', 'Ready')
    const canFail = canTransitionDeliveryJob(role, d.status, 'Failed')
    const canReschedule = canRescheduleDeliveryJob(role) && d.status !== 'Delivered' && d.status !== 'Failed'

    const items: OverflowMenuItem[] = [
      {
        label: 'Print Gate Pass',
        icon: 'file',
        onClick: () => setGatePassSlip(d),
      },
    ]

    if (canAssign && d.status !== 'Delivered' && d.status !== 'Failed') {
      items.push({
        label: 'Rider Link',
        icon: 'external_link',
        onClick: () => setRiderModalTarget(d),
      })
    }

    if (canAssign && d.status === 'Scheduled' && nextStepLabel !== 'Assign Driver' && nextStepLabel !== 'Assign') {
      items.push({
        label: 'Assign Driver',
        icon: 'user',
        onClick: () => handleOpenAssign(d),
      })
    }

    if (canReady && d.status === 'Scheduled' && nextStepLabel !== 'Stage Ready' && nextStepLabel !== 'Ready') {
      items.push({
        label: 'Stage Ready',
        icon: 'box',
        onClick: () => handleMarkReady(d),
      })
    }

    if (canReschedule && nextStepLabel !== 'Change Time') {
      items.push({
        label: 'Change Time',
        icon: 'timer',
        onClick: () => handleOpenReschedule(d),
      })
    }

    if (canAttachProof && d.status === 'Delivered' && nextStepLabel !== 'Attach Proof' && nextStepLabel !== 'Proof') {
      items.push({
        label: 'Attach Proof',
        icon: 'camera',
        onClick: () => handleOpenProof(d),
      })
    }

    if (canFail && (d.status === 'Scheduled' || d.status === 'Ready' || d.status === 'In Transit')) {
      items.push({
        label: 'Mark Failed',
        icon: 'alert_circle',
        onClick: () => handleOpenFail(d),
      })
    }

    return items
  }

  return (
    <PageShell
      title="Delivery & Logistics"
      header={
        <PageHeader
          title="Delivery & Logistics"
          description="Kathmandu Valley rider & vehicle dispatch, gate passes, and delivery tracking."
          search={{
            value: searchQuery,
            onChange: setSearchQuery,
            placeholder: 'Search dispatch, booking, address, rider… (press /)',
          }}
          actions={
            <PageActions
              secondary={
                <Button variant="secondary" size="sm" onClick={onSwitchToTransport}>
                  Transport Plans Overview →
                </Button>
              }
              primary={
                canCreate ? (
                  <Button variant="primary" onClick={() => setNewModalOpen(true)}>
                    <Icon name="truck" size={16} /> + New Dispatch
                  </Button>
                ) : null
              }
            />
          }
        />
      }
    >
      <PageBody error={readRefusal || fetchError}>
        {mutationError && (
          <div
            role="alert"
            style={{
              padding: 12,
              marginBottom: 16,
              borderRadius: 'var(--r-sm)',
              color: 'var(--st-danger-fg)',
              background: 'var(--st-danger-bg)',
              fontWeight: 600,
              fontSize: '13px',
            }}
          >
            {mutationError}
          </div>
        )}

        <div className="delivery-workspace">
          {/* KPI Strip */}
          <div className="delivery-kpi-grid">
            <div className="delivery-kpi-card delivery-kpi-card--transit">
              <div className="delivery-kpi-top">
                <span className="delivery-kpi-label">In Transit</span>
                <span className="delivery-kpi-icon" style={{ color: 'var(--warn-text)' }}>
                  <Icon name="truck" size={16} />
                </span>
              </div>
              <div>
                <div className="delivery-kpi-val" style={{ color: 'var(--warn-text)' }}>{inTransitCount}</div>
                <div className="delivery-kpi-sub">Active on road</div>
              </div>
            </div>

            <div className="delivery-kpi-card delivery-kpi-card--ready">
              <div className="delivery-kpi-top">
                <span className="delivery-kpi-label">Ready / Staged</span>
                <span className="delivery-kpi-icon" style={{ color: 'var(--info)' }}>
                  <Icon name="box" size={16} />
                </span>
              </div>
              <div>
                <div className="delivery-kpi-val" style={{ color: 'var(--info)' }}>{readyCount}</div>
                <div className="delivery-kpi-sub">Awaiting rider pickup</div>
              </div>
            </div>

            <div className="delivery-kpi-card delivery-kpi-card--scheduled">
              <div className="delivery-kpi-top">
                <span className="delivery-kpi-label">Scheduled</span>
                <span className="delivery-kpi-icon">
                  <Icon name="timer" size={16} />
                </span>
              </div>
              <div>
                <div className="delivery-kpi-val" style={{ color: 'var(--text)' }}>{scheduledCount}</div>
                <div className="delivery-kpi-sub">Upcoming dispatches</div>
              </div>
            </div>

            <div className="delivery-kpi-card delivery-kpi-card--delivered">
              <div className="delivery-kpi-top">
                <span className="delivery-kpi-label">Delivered</span>
                <span className="delivery-kpi-icon" style={{ color: 'var(--success-text)' }}>
                  <Icon name="check" size={16} />
                </span>
              </div>
              <div>
                <div className="delivery-kpi-val" style={{ color: 'var(--success-text)' }}>{deliveredCount}</div>
                <div className="delivery-kpi-sub">Completed handovers</div>
              </div>
            </div>

            {canMoney && (
              <div className="delivery-kpi-card delivery-kpi-card--revenue">
                <div className="delivery-kpi-top">
                  <span className="delivery-kpi-label">Delivery Revenue</span>
                  <span className="delivery-kpi-icon" style={{ color: 'var(--st-in-fg, #2ecc71)' }}>
                    <Icon name="dollar" size={16} />
                  </span>
                </div>
                <div>
                  <div className="delivery-kpi-val" style={{ color: 'var(--st-in-fg, #2ecc71)', fontSize: '22px' }}>
                    {formatMoney(rupees(totalRevenue))}
                  </div>
                  <div className="delivery-kpi-sub">Delivered fees collected</div>
                </div>
              </div>
            )}
          </div>

          {/* Toolbar & Filter Bar */}
          <div className="delivery-toolbar">
            <div className="delivery-toolbar-left">
              <SegmentedControl
                options={[
                  { id: 'All', label: 'All' },
                  { id: 'In Transit', label: 'In Transit', badge: inTransitCount > 0 ? inTransitCount : undefined },
                  { id: 'Ready', label: 'Ready', badge: readyCount > 0 ? readyCount : undefined },
                  { id: 'Scheduled', label: 'Scheduled', badge: scheduledCount > 0 ? scheduledCount : undefined },
                  { id: 'Delivered', label: 'Delivered' },
                  { id: 'Failed', label: 'Failed', badge: failedCount > 0 ? failedCount : undefined },
                ]}
                value={statusFilter}
                onChange={(val) => setStatusFilter(val as 'All' | DeliveryStatus)}
                ariaLabel="Delivery status filter"
                size="sm"
              />
            </div>

            <div className="delivery-toolbar-right">
              <div style={{ width: isMobile ? '100%' : '260px' }}>
                <SearchInput
                  value={searchQuery}
                  onChange={(val) => setSearchQuery(val)}
                  onClear={() => setSearchQuery('')}
                  placeholder="Search dispatch, booking, address, rider…"
                  aria-label="Search deliveries"
                />
              </div>

              {!isMobile && (
                <SegmentedControl
                  options={[
                    { id: 'table', label: <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Icon name="checklist" size={14} /> Table</span> },
                    { id: 'kanban', label: <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Icon name="queues" size={14} /> Dispatch Board</span> },
                  ]}
                  value={viewMode}
                  onChange={(val) => setViewMode(val as ViewMode)}
                  ariaLabel="View mode"
                  size="sm"
                />
              )}
            </div>
          </div>

          {/* Main Content: Table or Kanban Board */}
          {loading && deliveries.length === 0 ? (
            <div style={{ padding: '40px 16px' }}>
              <LoadingSkeleton rows={4} type="table" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="delivery-table-wrapper" style={{ padding: '48px 16px' }}>
              <EmptyState
                kind={searchQuery || statusFilter !== 'All' ? 'no-results' : 'nothing-yet'}
                title={searchQuery || statusFilter !== 'All' ? 'No matching deliveries' : 'No deliveries scheduled'}
                description={
                  searchQuery || statusFilter !== 'All'
                    ? 'No dispatch records matched your active search query or status filter.'
                    : isDriver
                      ? 'No delivery dispatches are currently assigned to you.'
                      : 'Dispatch records and courier runs will appear here as bookings get scheduled for delivery.'
                }
                {...(searchQuery || statusFilter !== 'All' || canCreate ? {
                  actionLabel: searchQuery || statusFilter !== 'All' ? 'Clear Filters' : '+ New Dispatch',
                  onAction: () => {
                    if (searchQuery || statusFilter !== 'All') {
                      setSearchQuery('')
                      setStatusFilter('All')
                    } else if (canCreate) {
                      setNewModalOpen(true)
                    }
                  },
                } : {})}
              />
            </div>
          ) : viewMode === 'kanban' && !isMobile ? (
            /* Kanban Board View */
            <div className="delivery-kanban-board">
              {(['Scheduled', 'Ready', 'In Transit', 'Delivered'] as const).map((colStatus) => {
                const colDeliveries = filtered.filter((d) => d.status === colStatus)
                const colBadge = STATUS_BADGE_STYLE[colStatus]
                return (
                  <div key={colStatus} className="delivery-kanban-col">
                    <div className="delivery-kanban-header">
                      <div className="delivery-kanban-col-title">
                        <span style={{ color: colBadge.color }}>
                          <Icon name={colBadge.icon} size={15} />
                        </span>
                        <span>{colStatus}</span>
                      </div>
                      <span className="delivery-kanban-col-badge">{colDeliveries.length}</span>
                    </div>

                    <div className="delivery-kanban-list">
                      {colDeliveries.length === 0 ? (
                        <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--text3)', fontSize: '12px' }}>
                          No jobs in {colStatus}
                        </div>
                      ) : (
                        colDeliveries.map((d) => {
                          const nextStep = getJobNextStep(d)
                          const moreItems = getJobMoreItems(d, nextStep?.label)

                          return (
                            <div key={d.id} className="delivery-card-item">
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div>
                                  <span className="identifier" style={{ fontWeight: 800, color: 'var(--accent2)', fontSize: '13px' }}>
                                    {d.id}
                                  </span>
                                  <div style={{ marginTop: 2 }}>
                                    <Link
                                      to={`/rentals/${d.bookingNo}`}
                                      style={{
                                        fontSize: '12px',
                                        fontWeight: 600,
                                        color: 'var(--text)',
                                        textDecoration: 'none',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 4,
                                      }}
                                    >
                                      <Icon name="truck" size={12} /> {d.bookingNo}
                                    </Link>
                                  </div>
                                </div>
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 3,
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    color: colBadge.color,
                                    background: colBadge.bg,
                                    padding: '2px 6px',
                                    borderRadius: 'var(--r-badge, 4px)',
                                    border: colBadge.border,
                                  }}
                                >
                                  <Icon name={colBadge.icon} size={11} />
                                  {d.status}
                                </span>
                              </div>

                              <div>
                                <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text)' }}>
                                  {d.clientName}
                                </div>
                                <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: 2, display: 'flex', alignItems: 'flex-start', gap: 4 }}>
                                  <span style={{ flexShrink: 0, marginTop: 1 }}><Icon name="truck" size={12} /></span>
                                  <span style={{ wordBreak: 'break-word' }}>{d.address}</span>
                                </div>
                                <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <Icon name="box" size={12} />
                                  <span>{d.items || (d.itemCount != null ? `${d.itemCount} items` : d.notes || 'Equipment package')}</span>
                                </div>
                                {d.clientPhone && (
                                  <a
                                    href={`tel:${d.clientPhone}`}
                                    style={{
                                      fontSize: '11px',
                                      color: 'var(--info)',
                                      textDecoration: 'none',
                                      display: 'inline-block',
                                      marginTop: 3,
                                    }}
                                  >
                                    📞 {d.clientPhone}
                                  </a>
                                )}
                              </div>

                              <div style={{ borderTop: '1px dashed var(--border)', paddingTop: 8, fontSize: '11px', color: 'var(--text3)' }}>
                                <div><strong>Scheduled:</strong> {d.scheduledDate} {d.scheduledTime}</div>
                                {d.notes && (
                                  <div style={{ marginTop: 3, color: d.status === 'Failed' ? 'var(--st-danger-fg)' : 'var(--text2)', background: 'var(--surface2)', padding: '2px 5px', borderRadius: 3, fontSize: '10.5px' }}>
                                    {d.status === 'Failed' ? '⚠ ' : '🕒 '}{d.notes}
                                  </div>
                                )}
                                {d.driverName ? (
                                  <div style={{ color: 'var(--text)', marginTop: 2 }}>
                                    <strong>Driver:</strong> {d.driverName} {d.vehiclePlate ? `(${d.vehiclePlate})` : ''}
                                  </div>
                                ) : (
                                  <div style={{ color: 'var(--warn-text)', marginTop: 2 }}>
                                    <em>Rider Unassigned</em>
                                  </div>
                                )}
                              </div>

                              {/* Card action footer: Job list + 1 button per job + More (R-10.11) */}
                              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8 }}>
                                {nextStep && (
                                  <Button
                                    variant={nextStep.variant}
                                    data-primary-verb={nextStep.isPrimaryVerb ? true : undefined}
                                    size="sm"
                                    style={{ flex: 1, minHeight: 44, justifyContent: 'center' }}
                                    disabled={nextStep.disabled}
                                    title={nextStep.title}
                                    onClick={nextStep.onClick}
                                  >
                                    {nextStep.icon && <Icon name={nextStep.icon} size={13} />}
                                    {nextStep.label}
                                  </Button>
                                )}
                                <OverflowMenu
                                  items={moreItems}
                                  ariaLabel={`More actions for ${d.id}`}
                                />
                              </div>
                            </div>
                          )
                        })
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : isMobile ? (
            /* Mobile Cards View */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
              {filtered.map((d) => {
                const badge = STATUS_BADGE_STYLE[d.status]
                const nextStep = getJobNextStep(d)
                const moreItems = getJobMoreItems(d, nextStep?.label)

                return (
                  <article
                    key={d.id}
                    style={{
                      background: 'var(--card)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--r-card)',
                      padding: '16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12,
                      boxShadow: 'var(--shadow-sm)',
                    }}
                  >
                    {/* Header: ID, Booking, Status Badge */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span className="identifier" style={{ fontWeight: 800, color: 'var(--accent2)', fontSize: '14px' }}>
                            {d.id}
                          </span>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              padding: '2px 8px',
                              borderRadius: 'var(--r-badge, 4px)',
                              background: badge.bg,
                              color: badge.color,
                              border: badge.border,
                              fontSize: '11.5px',
                              fontWeight: 700,
                            }}
                          >
                            <Icon name={badge.icon} size={12} />
                            {d.status}
                          </span>
                        </div>
                        <div style={{ marginTop: 4 }}>
                          <Link
                            to={`/rentals/${d.bookingNo}`}
                            style={{
                              fontSize: '13px',
                              fontWeight: 600,
                              color: 'var(--primary-text)',
                              textDecoration: 'none',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <Icon name="truck" size={13} /> {d.bookingNo}
                          </Link>
                        </div>
                      </div>
                    </div>

                    {/* Client, Address & Items */}
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text)' }}>
                        {d.clientName}
                      </div>
                      <div style={{ fontSize: '13px', color: 'var(--text2)', marginTop: 4, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                        <Icon name="truck" size={14} style={{ flexShrink: 0, marginTop: 2, color: 'var(--muted)' }} />
                        <span style={{ wordBreak: 'break-word' }}>{d.address}</span>
                      </div>
                      <div style={{ fontSize: '12.5px', color: 'var(--text3)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Icon name="box" size={13} />
                        <span>{d.items || (d.itemCount != null ? `${d.itemCount} items` : d.notes || 'Equipment package')}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
                        {d.clientPhone && (
                          <a
                            href={`tel:${d.clientPhone}`}
                            style={{
                              fontSize: '12px',
                              color: 'var(--info)',
                              textDecoration: 'none',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              fontWeight: 600,
                              minHeight: 32,
                            }}
                          >
                            <Icon name="phone" size={13} /> {d.clientPhone}
                          </a>
                        )}
                        {d.neighborhood && (
                          <span style={{ fontSize: '11px', color: 'var(--text3)', background: 'var(--surface2)', padding: '2px 6px', borderRadius: 4 }}>
                            {d.neighborhood}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Scheduled & Rider Info */}
                    <div
                      style={{
                        padding: '10px 12px',
                        background: 'var(--card2)',
                        borderRadius: 'var(--r-sm, 6px)',
                        border: '1px solid var(--border)',
                        display: 'grid',
                        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                        gap: 8,
                        fontSize: '12.5px',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '10.5px', color: 'var(--text3)', textTransform: 'uppercase', fontWeight: 600 }}>
                          Scheduled
                        </div>
                        <div style={{ fontWeight: 600, color: 'var(--text)', marginTop: 2 }}>
                          {d.scheduledDate} · {d.scheduledTime}
                        </div>
                        {d.notes && (
                          <div style={{ fontSize: '11px', color: d.status === 'Failed' ? 'var(--st-danger-fg)' : 'var(--text2)', background: 'var(--surface2)', padding: '2px 5px', borderRadius: 3, marginTop: 4 }}>
                            {d.status === 'Failed' ? '⚠ ' : '🕒 '}{d.notes}
                          </div>
                        )}
                      </div>
                      <div>
                        <div style={{ fontSize: '10.5px', color: 'var(--text3)', textTransform: 'uppercase', fontWeight: 600 }}>
                          Rider / Driver
                        </div>
                        <div style={{ fontWeight: 600, color: d.driverName ? 'var(--text)' : 'var(--warn-text)', marginTop: 2 }}>
                          {d.driverName ? `${d.driverName} ${d.vehiclePlate ? `(${d.vehiclePlate})` : ''}` : 'Unassigned'}
                        </div>
                      </div>
                    </div>

                    {/* Delivery Fee if money permitted (Law 6) */}
                    {canMoney && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px' }}>
                        <span style={{ color: 'var(--text2)' }}>Delivery Fee:</span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text)' }}>
                          {formatMoney(rupees(d.deliveryFeeNpr))}
                        </span>
                      </div>
                    )}

                    {/* Mobile Action Footer: 1 button per job + More (R-10.11) */}
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                      {nextStep && (
                        <Button
                          variant={nextStep.variant}
                          data-primary-verb={nextStep.isPrimaryVerb ? true : undefined}
                          style={{ flex: 1, minHeight: 44, justifyContent: 'center' }}
                          disabled={nextStep.disabled}
                          title={nextStep.title}
                          onClick={nextStep.onClick}
                        >
                          {nextStep.icon && <Icon name={nextStep.icon} size={13} />}
                          {nextStep.label}
                        </Button>
                      )}
                      <OverflowMenu
                        items={moreItems}
                        ariaLabel={`More actions for ${d.id}`}
                      />
                    </div>
                  </article>
                )
              })}
            </div>
          ) : (
            /* Table View */
            <div className="delivery-table-wrapper">
              <DataTableShell ariaLabel="Deliveries">
                <table className="delivery-table">
                  <thead>
                    <tr>
                      <th>DISPATCH / BOOKING</th>
                      <th>CLIENT, DESTINATION & ITEMS</th>
                      <th>SCHEDULED</th>
                      <th>RIDER / VEHICLE</th>
                      <th>STATUS</th>
                      {canMoney && <th>FEE</th>}
                      <th style={{ textAlign: 'right' }}>ACTION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((d) => {
                      const badge = STATUS_BADGE_STYLE[d.status]
                      const nextStep = getJobNextStep(d)
                      const moreItems = getJobMoreItems(d, nextStep?.label)

                      return (
                        <tr key={d.id} className="delivery-row">
                          {/* Dispatch & Booking */}
                          <td>
                            <div className="identifier" style={{ fontWeight: 800, color: 'var(--accent2)', fontSize: '13px' }}>
                              {d.id}
                            </div>
                            <Link
                              to={`/rentals/${d.bookingNo}`}
                              style={{
                                fontSize: '12px',
                                color: 'var(--text)',
                                textDecoration: 'none',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                marginTop: '3px',
                                fontWeight: 600,
                              }}
                            >
                              <Icon name="truck" size={13} /> {d.bookingNo}
                            </Link>
                          </td>

                          {/* Client, Address & Items */}
                          <td style={{ maxWidth: '320px' }}>
                            <div style={{ fontWeight: 700, color: 'var(--text)' }}>{d.clientName}</div>
                            <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: 4 }}>
                              <Icon name="truck" size={12} /> {d.address}
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: 4 }}>
                              <Icon name="box" size={12} />
                              <span>{d.items || (d.itemCount != null ? `${d.itemCount} items` : d.notes || 'Equipment package')}</span>
                            </div>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                              {d.clientPhone && (
                                <a
                                  href={`tel:${d.clientPhone}`}
                                  style={{
                                    fontSize: '11px',
                                    color: 'var(--info)',
                                    textDecoration: 'none',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 3,
                                  }}
                                >
                                  📞 {d.clientPhone}
                                </a>
                              )}
                              {d.neighborhood && (
                                <span style={{ fontSize: '10.5px', color: 'var(--text4)', background: 'var(--surface2)', padding: '1px 5px', borderRadius: 4 }}>
                                  {d.neighborhood}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Scheduled Date/Time */}
                          <td style={{ whiteSpace: 'nowrap' }}>
                            <div style={{ fontWeight: 600 }}>{d.scheduledDate}</div>
                            <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 3 }}>
                              <Icon name="timer" size={12} /> {d.scheduledTime}
                            </div>
                          </td>

                          {/* Driver / Rider */}
                          <td>
                            {d.driverName ? (
                              <div>
                                <div style={{ fontWeight: 600, color: 'var(--text)' }}>{d.driverName}</div>
                                {d.vehiclePlate && (
                                  <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: 1 }}>{d.vehiclePlate}</div>
                                )}
                                {d.driverPhone && (
                                  <a href={`tel:${d.driverPhone}`} style={{ fontSize: '11px', color: 'var(--info)', textDecoration: 'none', marginTop: 1, display: 'inline-block' }}>
                                    {d.driverPhone}
                                  </a>
                                )}
                              </div>
                            ) : canAssign ? (
                              <Button
                                type="button"
                                variant="secondary"
                                onClick={() => handleOpenAssign(d)}
                              >
                                + Assign Rider
                              </Button>
                            ) : (
                              <span style={{ fontSize: '12px', color: 'var(--text4)' }}>Unassigned</span>
                            )}
                          </td>

                          {/* Status */}
                          <td>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                padding: '4px 9px',
                                borderRadius: 'var(--r-chip)',
                                fontSize: '12px',
                                fontWeight: 700,
                                background: badge.bg,
                                color: badge.color,
                                border: badge.border,
                              }}
                            >
                              <Icon name={badge.icon} size={12} />
                              {d.status}
                            </span>
                            {d.deliveredAt && (
                              <div style={{ fontSize: '10.5px', color: 'var(--text3)', marginTop: '3px' }}>
                                at {d.deliveredAt.slice(11)}
                              </div>
                            )}
                            {d.notes && d.status === 'Failed' && (
                              <div style={{ fontSize: '10.5px', color: 'var(--st-danger-fg)', marginTop: '3px', maxWidth: 180 }}>
                                {d.notes}
                              </div>
                            )}
                          </td>

                          {/* Fee (Law 6: Hidden from Driver and Warehouse) */}
                          {canMoney && (
                            <td style={{ fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
                              {formatMoney(rupees(d.deliveryFeeNpr))}
                            </td>
                          )}

                          {/* Actions: Job list + 1 button per job + More (R-10.11) */}
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', gap: '8px', alignItems: 'center', justifyContent: 'flex-end' }}>
                              {nextStep && (
                                <Button
                                  variant={nextStep.variant}
                                  data-primary-verb={nextStep.isPrimaryVerb ? true : undefined}
                                  size="sm"
                                  disabled={nextStep.disabled}
                                  title={nextStep.title}
                                  onClick={nextStep.onClick}
                                  style={{ minHeight: 44 }}
                                >
                                  {nextStep.icon && <Icon name={nextStep.icon} size={13} />}
                                  {nextStep.label}
                                </Button>
                              )}
                              <OverflowMenu
                                items={moreItems}
                                ariaLabel={`More actions for ${d.id}`}
                              />
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </DataTableShell>
            </div>
          )}

          {/* Modal: Assign Rider / Driver */}
          {assignTarget && (
            <Modal
              isOpen
              onClose={() => setAssignTarget(null)}
              title={`Assign Driver / Rider — ${assignTarget.id}`}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
                {mutationError && <div role="alert" style={{ color: 'var(--st-danger-fg)' }}>{mutationError}</div>}
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: 'var(--r-md)',
                    background: 'var(--surface2)',
                    border: '1px solid var(--border)',
                    fontSize: '13px',
                    lineHeight: 1.5,
                  }}
                >
                  Dispatch for booking <strong>{assignTarget.bookingNo}</strong> · {assignTarget.clientName}
                  <div style={{ color: 'var(--text3)', fontSize: '12px', marginTop: 2 }}>
                    Destination: {assignTarget.address} {assignTarget.neighborhood ? `(${assignTarget.neighborhood})` : ''}
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: '6px' }}>
                    Driver / Rider Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Suman Rai (Staff Driver) or Ramesh Thapa (Courier Rider)"
                    value={driverName}
                    onChange={(e) => setDriverName(e.target.value)}
                    style={{
                      width: '100%',
                      minHeight: '44px',
                      padding: '8px 12px',
                      borderRadius: 'var(--r-btn)',
                      background: 'var(--card)',
                      border: '1px solid var(--border)',
                      color: 'var(--text)',
                      fontSize: '13.5px',
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: '6px' }}>
                    Driver Contact Phone
                  </label>
                  <input
                    type="tel"
                    inputMode="tel"
                    placeholder="+977 98..."
                    value={driverPhone}
                    onChange={(e) => setDriverPhone(e.target.value)}
                    style={{
                      width: '100%',
                      minHeight: '44px',
                      padding: '8px 12px',
                      borderRadius: 'var(--r-btn)',
                      background: 'var(--card)',
                      border: '1px solid var(--border)',
                      color: 'var(--text)',
                      fontSize: '13.5px',
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: '6px' }}>
                    Vehicle Plate / Transportation Type
                  </label>
                  <input
                    type="text"
                    value={vehiclePlate}
                    onChange={(e) => setVehiclePlate(e.target.value)}
                    placeholder="e.g. Ba 3 Cha 8821 (Scorpio Van), Hired Bike, or Own Scooter"
                    style={{
                      width: '100%',
                      minHeight: '44px',
                      padding: '8px 12px',
                      borderRadius: 'var(--r-btn)',
                      background: 'var(--card)',
                      border: '1px solid var(--border)',
                      color: 'var(--text)',
                      fontSize: '13.5px',
                    }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                  <Button variant="secondary" onClick={() => setAssignTarget(null)}>
                    Cancel
                  </Button>
                  <Button variant="primary" onClick={handleSaveAssign}>
                    Save & Assign
                  </Button>
                </div>
              </div>
            </Modal>
          )}

          {/* Modal: Confirm Delivered */}
          {deliverTarget && (
            <Modal
              isOpen
              onClose={() => setDeliverTarget(null)}
              title={`Confirm Equipment Delivery — ${deliverTarget.id}`}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
                {mutationError && <div role="alert" style={{ color: 'var(--st-danger-fg)' }}>{mutationError}</div>}
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: 'var(--r-md)',
                    background: 'var(--surface2)',
                    border: '1px solid var(--border)',
                    fontSize: '13px',
                    lineHeight: 1.5,
                  }}
                >
                  Booking <strong>{deliverTarget.bookingNo}</strong> for{' '}
                  <strong>{deliverTarget.clientName}</strong> at <strong>{deliverTarget.address}</strong>.
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: '6px' }}>
                    Received By (Name & Designation) *
                  </label>
                  <input
                    type="text"
                    required
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    placeholder="e.g. Anil Gurung (Director / Production Manager)"
                    style={{
                      width: '100%',
                      minHeight: '44px',
                      padding: '8px 12px',
                      borderRadius: 'var(--r-btn)',
                      background: 'var(--card)',
                      border: '1px solid var(--border)',
                      color: 'var(--text)',
                      fontSize: '13.5px',
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: '6px' }}>
                    Handover Notes / Verification Remarks
                  </label>
                  <textarea
                    rows={3}
                    value={deliveryNote}
                    onChange={(e) => setDeliveryNote(e.target.value)}
                    placeholder="Case seal verified intact, client signed physical delivery voucher."
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 'var(--r-btn)',
                      background: 'var(--card)',
                      border: '1px solid var(--border)',
                      color: 'var(--text)',
                      fontSize: '13px',
                      fontFamily: 'inherit',
                    }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                  <Button variant="secondary" onClick={() => setDeliverTarget(null)}>
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    data-primary-verb
                    onClick={handleConfirmDelivered}
                    disabled={recipientName.trim().length < 2}
                  >
                    Confirm Delivery ✓
                  </Button>
                </div>
              </div>
            </Modal>
          )}

          {/* Modal: Mark Failed */}
          {failTarget && (
            <Modal
              isOpen
              onClose={() => setFailTarget(null)}
              title={`Mark Delivery Failed — ${failTarget.id}`}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
                {mutationError && <div role="alert" style={{ color: 'var(--st-danger-fg)' }}>{mutationError}</div>}
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: 'var(--r-md)',
                    background: 'var(--st-danger-bg)',
                    color: 'var(--st-danger-fg)',
                    fontSize: '13px',
                    lineHeight: 1.5,
                  }}
                >
                  Marking dispatch <strong>{failTarget.id}</strong> as Failed. Delivery failure is an immutable terminal state.
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: '6px' }}>
                    Failure Reason (At least 10 characters) *
                  </label>
                  <textarea
                    rows={4}
                    required
                    value={failReason}
                    onChange={(e) => setFailReason(e.target.value)}
                    placeholder="e.g. Recipient phone switched off and shooting location gate locked after 45 minutes of waiting."
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 'var(--r-btn)',
                      background: 'var(--card)',
                      border: '1px solid var(--border)',
                      color: 'var(--text)',
                      fontSize: '13px',
                      fontFamily: 'inherit',
                    }}
                  />
                  <div style={{ fontSize: '11px', color: failReason.trim().length >= 10 ? 'var(--text3)' : 'var(--st-danger-fg)', marginTop: 4 }}>
                    {failReason.trim().length} / 10 minimum characters
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                  <Button variant="secondary" onClick={() => setFailTarget(null)}>
                    Cancel
                  </Button>
                  <Button
                    variant="danger"
                    onClick={handleConfirmFailed}
                    disabled={failReason.trim().length < 10}
                  >
                    Confirm Failure
                  </Button>
                </div>
              </div>
            </Modal>
          )}

          {/* Modal: Reschedule Delivery (T4-02, Ruling D8) */}
          {rescheduleTarget && (
            <Modal
              isOpen
              onClose={() => setRescheduleTarget(null)}
              title={`Reschedule Dispatch — ${rescheduleTarget.id}`}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
                {mutationError && <div role="alert" style={{ color: 'var(--st-danger-fg)' }}>{mutationError}</div>}

                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: 'var(--r-md)',
                    background: 'var(--surface2)',
                    border: '1px solid var(--border)',
                    fontSize: '13px',
                    lineHeight: 1.5,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, color: 'var(--text)' }}>
                    <Icon name="timer" size={14} />
                    Booking #{rescheduleTarget.bookingNo} · {rescheduleTarget.clientName}
                  </div>
                  <div style={{ color: 'var(--text3)', fontSize: '12px', marginTop: 4 }}>
                    Current schedule: <strong>{rescheduleTarget.scheduledDate} at {rescheduleTarget.scheduledTime}</strong>
                  </div>
                  <div
                    style={{
                      color: 'var(--info)',
                      fontSize: '11.5px',
                      marginTop: 6,
                      padding: '4px 8px',
                      background: 'var(--surface)',
                      borderRadius: 4,
                      border: '1px solid var(--border)',
                    }}
                  >
                    ℹ <strong>Ruling D8:</strong> Rescheduling changes the dispatch departure time only. Booking rental dates and billing remain strictly unchanged.
                  </div>
                </div>

                {!rescheduleWaLink ? (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-sm)' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text2)', marginBottom: 4 }}>
                          New Scheduled Date *
                        </label>
                        <input
                          type="date"
                          value={rescheduleDate}
                          onChange={(e) => setRescheduleDate(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '8px 10px',
                            borderRadius: 'var(--r-btn)',
                            border: '1px solid var(--border)',
                            background: 'var(--surface)',
                            color: 'var(--text)',
                            fontSize: '13px',
                            fontFamily: 'inherit',
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text2)', marginBottom: 4 }}>
                          New Scheduled Time *
                        </label>
                        <input
                          type="time"
                          value={rescheduleTime}
                          onChange={(e) => setRescheduleTime(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '8px 10px',
                            borderRadius: 'var(--r-btn)',
                            border: '1px solid var(--border)',
                            background: 'var(--surface)',
                            color: 'var(--text)',
                            fontSize: '13px',
                            fontFamily: 'inherit',
                          }}
                        />
                      </div>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text2)', marginBottom: 4 }}>
                        Reason / Notes (optional)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Client requested 2:30 PM delivery, traffic delay..."
                        value={rescheduleNotes}
                        onChange={(e) => setRescheduleNotes(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '8px 10px',
                          borderRadius: 'var(--r-btn)',
                          border: '1px solid var(--border)',
                          background: 'var(--surface)',
                          color: 'var(--text)',
                          fontSize: '13px',
                          fontFamily: 'inherit',
                        }}
                      />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-sm)', marginTop: 'var(--sp-sm)' }}>
                      <Button variant="secondary" onClick={() => setRescheduleTarget(null)}>
                        Cancel
                      </Button>
                      <Button
                        variant="primary"
                        onClick={handleConfirmReschedule}
                        disabled={rescheduleIsSaving || !rescheduleDate || !rescheduleTime}
                      >
                        {rescheduleIsSaving ? 'Rescheduling...' : 'Confirm Reschedule'}
                      </Button>
                    </div>
                  </>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', padding: '8px 0' }}>
                    <div style={{ color: 'var(--st-success-fg)', fontWeight: 600, fontSize: '14px', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>✓</span> Successfully rescheduled to {rescheduleDate} at {rescheduleTime}
                    </div>

                    <div style={{ fontSize: '12.5px', color: 'var(--text2)', lineHeight: 1.5 }}>
                      A WhatsApp draft has been prepared with the updated departure time for staff to review and send (never automatically sent):
                    </div>

                    {rescheduleWaLink.href ? (
                      <a
                        href={rescheduleWaLink.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 8,
                          padding: '10px 16px',
                          borderRadius: 'var(--r-btn)',
                          background: '#25D366',
                          color: '#ffffff',
                          textDecoration: 'none',
                          fontWeight: 600,
                          fontSize: '13.5px',
                          cursor: 'pointer',
                        }}
                      >
                        <span>💬</span> Open WhatsApp Draft ({rescheduleTarget.clientPhone || 'Client'})
                      </a>
                    ) : (
                      <div style={{ fontSize: '12px', color: 'var(--text4)', fontStyle: 'italic' }}>
                        WhatsApp draft unavailable: {rescheduleWaLink.unavailable}
                      </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--sp-sm)' }}>
                      <Button variant="secondary" onClick={() => setRescheduleTarget(null)}>
                        Done
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </Modal>
          )}

          {/* Modal: New Delivery Dispatch Order */}
          {newModalOpen && (
            <Modal
              isOpen
              onClose={() => {
                setNewModalOpen(false)
                setMutationError(null)
              }}
              title="Create New Delivery Dispatch"
            >
              <form onSubmit={handleCreateDelivery} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {mutationError && (
                  <div
                    style={{
                      padding: '10px 14px',
                      borderRadius: 'var(--r-btn)',
                      background: 'var(--st-danger-bg)',
                      color: 'var(--st-danger-fg)',
                      fontSize: '13px',
                      fontWeight: 600,
                    }}
                  >
                    {mutationError}
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: '6px' }}>
                      Booking ID / Number *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. BR-2616 or UUID"
                      value={newBookingNo}
                      onChange={(e) => {
                        setNewBookingNo(e.target.value)
                        setNewBookingId(e.target.value)
                      }}
                      style={{
                        width: '100%',
                        minHeight: '44px',
                        padding: '8px 12px',
                        borderRadius: 'var(--r-btn)',
                        background: 'var(--card)',
                        border: '1px solid var(--border)',
                        color: 'var(--text)',
                        fontSize: '13.5px',
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: '6px' }}>
                      Delivery Leg
                    </label>
                    <select
                      value={newLeg}
                      onChange={(e) => setNewLeg(e.target.value as 'Outbound' | 'Return')}
                      style={{
                        width: '100%',
                        minHeight: '44px',
                        padding: '8px 12px',
                        borderRadius: 'var(--r-btn)',
                        background: 'var(--card)',
                        border: '1px solid var(--border)',
                        color: 'var(--text)',
                        fontSize: '13.5px',
                      }}
                    >
                      <option value="Outbound">Outbound (Warehouse → Client)</option>
                      <option value="Return">Return (Client → Warehouse)</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: '6px' }}>
                      Rider / Carrier Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Suman Rai / Pathao Courier"
                      value={newRiderName}
                      onChange={(e) => setNewRiderName(e.target.value)}
                      style={{
                        width: '100%',
                        minHeight: '44px',
                        padding: '8px 12px',
                        borderRadius: 'var(--r-btn)',
                        background: 'var(--card)',
                        border: '1px solid var(--border)',
                        color: 'var(--text)',
                        fontSize: '13.5px',
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: '6px' }}>
                      Rider Contact Phone
                    </label>
                    <input
                      type="tel"
                      inputMode="tel"
                      placeholder="+977 98..."
                      value={newRiderPhone}
                      onChange={(e) => setNewRiderPhone(e.target.value)}
                      style={{
                        width: '100%',
                        minHeight: '44px',
                        padding: '8px 12px',
                        borderRadius: 'var(--r-btn)',
                        background: 'var(--card)',
                        border: '1px solid var(--border)',
                        color: 'var(--text)',
                        fontSize: '13.5px',
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: '6px' }}>
                      Vehicle / Transportation
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Ba 3 Cha 8821 (Scorpio Van), Hired Bike"
                      value={newVehicle}
                      onChange={(e) => setNewVehicle(e.target.value)}
                      style={{
                        width: '100%',
                        minHeight: '44px',
                        padding: '8px 12px',
                        borderRadius: 'var(--r-btn)',
                        background: 'var(--card)',
                        border: '1px solid var(--border)',
                        color: 'var(--text)',
                        fontSize: '13.5px',
                      }}
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: '6px' }}>
                        Date
                      </label>
                      <DateField ariaLabel="Delivery date" value={newDate} onChange={setNewDate} style={{ minHeight: 44 }} />
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: '6px' }}>
                        Time
                      </label>
                      <input
                        type="time"
                        value={newTime}
                        onChange={(e) => setNewTime(e.target.value)}
                        style={{
                          width: '100%',
                          minHeight: '44px',
                          padding: '8px 10px',
                          borderRadius: 'var(--r-btn)',
                          background: 'var(--card)',
                          border: '1px solid var(--border)',
                          color: 'var(--text)',
                          fontSize: '13px',
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                  <Button variant="secondary" onClick={() => setNewModalOpen(false)}>
                    Cancel
                  </Button>
                  <Button variant="primary" type="submit">
                    Create Dispatch Order
                  </Button>
                </div>
              </form>
            </Modal>
          )}

          {/* Modal: Gate Pass & Delivery Slip (Clean Printable Slip) */}
          {gatePassSlip && (
            <Modal isOpen onClose={() => setGatePassSlip(null)} title={`Gate Pass & Delivery Slip — ${gatePassSlip.id}`}>
              <div
                className="gatepass-print-area"
                style={{
                  background: 'var(--card)',
                  color: 'var(--text)',
                  padding: '24px',
                  borderRadius: 'var(--r-md)',
                  border: '1px solid var(--border)',
                  fontFamily: 'var(--font-id, "Outfit", sans-serif)',
                  fontSize: '13px',
                  lineHeight: 1.6,
                }}
              >
                <div style={{ textAlign: 'center', borderBottom: '2px solid var(--border)', paddingBottom: '14px', marginBottom: '18px' }}>
                  <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--accent2)', fontWeight: 800 }}>
                    Official Dispatch Document
                  </div>
                  <h2 style={{ margin: '4px 0 0', fontSize: '20px', fontWeight: 800, letterSpacing: '-0.02em' }}>BABIN RENTALS OS</h2>
                  <div style={{ fontSize: '12px', color: 'var(--text3)' }}>Kathmandu Film Equipment Hub · Tel: +977 1 4567890</div>
                  <div style={{ marginTop: '8px', fontWeight: 700, fontSize: '15px', color: 'var(--text)' }}>
                    EQUIPMENT GATE PASS & DELIVERY SLIP
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '18px' }}>
                  <div><strong>Dispatch ID:</strong> <span className="identifier">{gatePassSlip.id}</span></div>
                  <div><strong>Gate Pass No:</strong> <span className="identifier">{gatePassSlip.gatePassNo || 'GP-0499'}</span></div>
                  <div><strong>Booking Ref:</strong> <span className="identifier">{gatePassSlip.bookingNo}</span></div>
                  <div><strong>Security Seal:</strong> <span className="identifier">{gatePassSlip.packageSealNo || 'BR-SEAL-889'}</span></div>
                  <div><strong>Client:</strong> {gatePassSlip.clientName}</div>
                  <div><strong>Contact:</strong> {gatePassSlip.clientPhone}</div>
                  <div><strong>Destination:</strong> {gatePassSlip.address}</div>
                  <div><strong>Date / Time:</strong> {gatePassSlip.scheduledDate} · {gatePassSlip.scheduledTime}</div>
                  <div><strong>Carrier / Rider:</strong> {gatePassSlip.driverName || 'Unassigned'}</div>
                  <div><strong>Vehicle Plate:</strong> {gatePassSlip.vehiclePlate || 'N/A'}</div>
                </div>

                {gatePassSlip.notes && (
                  <div style={{ border: '1px dashed var(--border)', padding: '10px 12px', borderRadius: 'var(--r-xs)', marginBottom: '20px', background: 'var(--surface2)' }}>
                    <strong>Special Instructions:</strong> {gatePassSlip.notes}
                  </div>
                )}

                <div style={{ marginTop: '36px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, textAlign: 'center' }}>
                  <div>
                    <div style={{ borderBottom: '1px solid var(--border)', height: '36px' }}></div>
                    <div style={{ fontSize: '11px', marginTop: '6px', fontWeight: 600, color: 'var(--text3)' }}>Warehouse Dispatcher</div>
                  </div>
                  <div>
                    <div style={{ borderBottom: '1px solid var(--border)', height: '36px' }}></div>
                    <div style={{ fontSize: '11px', marginTop: '6px', fontWeight: 600, color: 'var(--text3)' }}>Driver / Carrier</div>
                  </div>
                  <div>
                    <div style={{ borderBottom: '1px solid var(--border)', height: '36px' }}></div>
                    <div style={{ fontSize: '11px', marginTop: '6px', fontWeight: 600, color: 'var(--text3)' }}>Receiver on Set</div>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
                <Button variant="secondary" onClick={() => setGatePassSlip(null)}>
                  Close
                </Button>
                <Button variant="primary" onClick={() => window.print()}>
                  <Icon name="download" size={15} /> Print Gate Pass ⎙
                </Button>
              </div>
            </Modal>
          )}

          {/* Modal: Proof of Delivery (T4-03) */}
          {proofTarget && (
            <Modal
              isOpen
              onClose={() => {
                setProofTarget(null)
                setProofPhotoFile(null)
                setProofPhotoPreview(null)
                proofSignatureRef.current?.clear()
                setProofError(null)
              }}
              title={`Proof of Delivery — ${proofTarget.id}`}
              size="lg"
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 700 }}>
                {proofError && (
                  <div role="alert" style={{ padding: 12, borderRadius: 'var(--r-md)', background: 'var(--st-danger-bg)', color: 'var(--st-danger-fg)', fontSize: 13 }}>
                    {proofError}
                  </div>
                )}

                <div style={{ padding: 12, borderRadius: 'var(--r-md)', background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: 13, lineHeight: 1.5 }}>
                  Attaching proof for dispatch <strong>{proofTarget.id}</strong> (Booking: {proofTarget.bookingNo})
                  <div style={{ color: 'var(--text3)', marginTop: 2 }}>
                    Client: {proofTarget.clientName} · {proofTarget.address}
                  </div>
                  <div style={{ color: 'var(--text3)', fontSize: 12, marginTop: 2 }}>
                    Delivered to: {proofTarget.recipientName ?? proofTarget.clientName} at {proofTarget.deliveredAt ?? '—'}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  {/* Photo Evidence */}
                  <fieldset style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: 12 }}>
                    <legend style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>Evidence Photo</legend>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleProofPhotoChange}
                      disabled={proofSubmitting}
                      style={{ display: 'none' }}
                      id="proof-photo-input"
                    />
                    <label
                      htmlFor="proof-photo-input"
                      style={{
                        display: 'block',
                        cursor: proofSubmitting ? 'not-allowed' : 'pointer',
                        opacity: proofSubmitting ? 0.6 : 1,
                        padding: 16,
                        border: '2px dashed var(--border)',
                        borderRadius: 'var(--r-md)',
                        textAlign: 'center',
                        background: proofPhotoPreview ? 'transparent' : 'var(--surface2)',
                      }}
                    >
                      {proofPhotoPreview ? (
                        <>
                          <img
                            src={proofPhotoPreview}
                            alt="Delivered equipment proof"
                            style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 'var(--r-sm)', marginBottom: 8 }}
                          />
                          <div style={{ fontSize: 12, color: 'var(--text2)' }}>Tap to replace</div>
                        </>
                      ) : (
                        <>
                          <Icon name="camera" size={28} style={{ color: 'var(--text3)', marginBottom: 8 }} />
                          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', marginBottom: 4 }}>Add Evidence Photo</div>
                          <div style={{ fontSize: 11, color: 'var(--text3)' }}>Tap to capture or select a photo of the delivered equipment</div>
                        </>
                      )}
                    </label>
                    {proofPhotoPreview && (
                      <button
                        type="button"
                        onClick={() => { setProofPhotoFile(null); setProofPhotoPreview(null); }}
                        disabled={proofSubmitting}
                        style={{ marginTop: 8, fontSize: 12, color: 'var(--danger-text)', background: 'none', border: 'none', cursor: proofSubmitting ? 'not-allowed' : 'pointer' }}
                      >
                        Remove photo
                      </button>
                    )}
                  </fieldset>

                  {/* Recipient Signature */}
                  <fieldset style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: 12 }}>
                    <legend style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>Recipient Signature</legend>
                    <div style={{ minHeight: 180 }}>
                      <SignaturePad
                        ref={proofSignatureRef}
                        height={180}
                        strokeColor="var(--primary)"
                        strokeWidth={2.5}
                        guideText="Recipient signs here"
                        disabled={proofSubmitting}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => proofSignatureRef.current?.clear()}
                      disabled={proofSubmitting || proofSignatureRef.current?.isEmpty()}
                      style={{ marginTop: 8, fontSize: 12, color: 'var(--danger-text)', background: 'none', border: 'none', cursor: proofSubmitting || proofSignatureRef.current?.isEmpty() ? 'not-allowed' : 'pointer' }}
                    >
                      Clear signature
                    </button>
                  </fieldset>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                  <Button variant="secondary" onClick={() => {
                    setProofTarget(null)
                    setProofPhotoFile(null)
                    setProofPhotoPreview(null)
                    proofSignatureRef.current?.clear()
                    setProofError(null)
                  }} disabled={proofSubmitting}>
                    Cancel
                  </Button>
                  <Button variant="primary" data-primary-verb onClick={handleSubmitProof} disabled={proofSubmitting}>
                    {proofSubmitting ? 'Attaching…' : 'Attach Proof'}
                  </Button>
                </div>
              </div>
            </Modal>
          )}

          {/* Modal: Send To Rider (T4-08, W49) */}
          {riderModalTarget && (
            <SendToRiderModal
              isOpen={!!riderModalTarget}
              onClose={() => setRiderModalTarget(null)}
              jobId={riderModalTarget.id}
              bookingNo={riderModalTarget.bookingNo}
              clientName={riderModalTarget.clientName}
              destination={riderModalTarget.address}
            />
          )}
        </div>
      </PageBody>
    </PageShell>
  )
}

// Route Planner View (T4-09) — drag-to-reorder, Google Maps links, map pins
function RoutePlannerView() {
  const { user } = useAuth()
  const role = user?.role ?? null
  const canViewRoute = canViewDayRoute(role)
  const canSetRoute = canSetDeliveryRoutePosition(role)
  const canSetPin = canSetClientMapPin(role)
  const { branchId, error: branchError } = useStaffBranchId(user?.id)
  // Law 12: toasts are for successes only — every failure below is shown inline.
  const { showSuccessToast } = useToast()

  const [date, setDate] = useState(() => businessDayAd())
  const [loading, setLoading] = useState(false)
  const [stops, setStops] = useState<DayRouteStop[]>([])
  const [mapLinks, setMapLinks] = useState<Array<{ stops: string[]; url: string }>>([])
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [generatingLinks, setGeneratingLinks] = useState(false)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [pinModalOpen, setPinModalOpen] = useState(false)
  const [pinTarget, setPinTarget] = useState<DayRouteStop | null>(null)
  const [pinLat, setPinLat] = useState('')
  const [pinLng, setPinLng] = useState('')
  const [pinSaving, setPinSaving] = useState(false)
  const [pinError, setPinError] = useState<string | null>(null)

  const loadRoute = useCallback(async () => {
    if (!branchId || !canViewRoute) return
    setLoading(true)
    setFetchError(null)
    try {
      const day = await getDayRoute({ branchId, date })
      setStops(day.stops)
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to load route')
    } finally {
      setLoading(false)
    }
  }, [branchId, date, canViewRoute])

  // Load on arrival and whenever the date or branch changes. loadRoute is rebuilt
  // from `date`, so a date change reloads the new day rather than the one just left.
  useEffect(() => {
    void loadRoute()
  }, [loadRoute])

  const generateLinks = useCallback(async () => {
    if (!branchId) return
    setGeneratingLinks(true)
    setFetchError(null)
    try {
      const generated = await generateMapLinks({ branchId, date })
      setMapLinks(generated.links)
      showSuccessToast(`Generated ${generated.links.length} map link${generated.links.length !== 1 ? 's' : ''}`)
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to generate map links')
    } finally {
      setGeneratingLinks(false)
    }
  }, [branchId, date, showSuccessToast])

  const handleDragStart = (e: React.DragEvent, stopId: string) => {
    if (!canSetRoute) {
      e.preventDefault()
      return
    }
    setDraggingId(stopId)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault()
    if (!draggingId || draggingId === targetId) return

    const dragIndex = stops.findIndex((s) => s.id === draggingId)
    const targetIndex = stops.findIndex((s) => s.id === targetId)
    if (dragIndex === -1 || targetIndex === -1) return

    const newStops = [...stops]
    const [dragged] = newStops.splice(dragIndex, 1)
    if (!dragged) return
    newStops.splice(targetIndex, 0, dragged)

    // Update route positions
    const updatedStops = newStops.map((s, i) => ({ ...s, routePosition: i + 1 }))
    setStops(updatedStops)

    // Persist each changed position
    for (const stop of updatedStops) {
      try {
        await setRoutePosition({ jobId: stop.id, routePosition: stop.routePosition! })
      } catch {
        // Ignore individual failures; user can retry
      }
    }

    showSuccessToast('Route order updated')
  }

  const handleDragEnd = () => {
    setDraggingId(null)
  }

  const openPinModal = (stop: DayRouteStop) => {
    if (!canSetPin) return
    setPinTarget(stop)
    setPinLat(stop.mapPinLat?.toString() ?? '')
    setPinLng(stop.mapPinLng?.toString() ?? '')
    setPinError(null)
    setPinModalOpen(true)
  }

  const savePin = async () => {
    if (!pinTarget) return
    const lat = Number(pinLat)
    const lng = Number(pinLng)
    // Number('') is 0, so a blank field must be rejected before the NaN check.
    if (!pinLat.trim() || !pinLng.trim() || Number.isNaN(lat) || Number.isNaN(lng)) {
      setPinError('Please enter valid latitude and longitude')
      return
    }
    setPinSaving(true)
    setPinError(null)
    try {
      await setClientMapPin({ clientId: pinTarget.bookingId, lat, lng })
      showSuccessToast('Map pin saved')
      setPinModalOpen(false)
      void loadRoute()
    } catch (err) {
      setPinError(err instanceof Error ? err.message : 'Failed to save map pin')
    } finally {
      setPinSaving(false)
    }
  }

  if (!canViewRoute) {
    return (
      <PageShell>
        <PageHeader
          title="Route Planner"
          description={`Route for ${date}`}
          actions={
            <DateField
              ariaLabel="Route date"
              value={date}
              onChange={setDate}
              disabled={loading}
            />
          }
        />
        <PageBody>
          <EmptyState
            icon={<Icon name="lock" size={32} />}
            title="Access denied"
            description="Your role cannot view the route planner."
          />
        </PageBody>
      </PageShell>
    )
  }

  return (
    <PageShell>
      <PageHeader
        title="Route Planner"
        description={`Route for ${date}`}
        actions={
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <DateField
              ariaLabel="Route date"
              value={date}
              onChange={setDate}
              disabled={loading}
            />
            <Button
              variant="primary"
              onClick={loadRoute}
              disabled={loading}
              loading={loading}
            >
              Refresh
            </Button>
            <Button
              variant="secondary"
              onClick={generateLinks}
              disabled={generatingLinks || stops.length === 0}
              loading={generatingLinks}
            >
              Generate Map Links
            </Button>
          </div>
        }
      />
      <PageBody>
        {(branchError ?? fetchError) && (
          <div role="alert" style={{ padding: '12px', background: 'var(--st-danger-bg)', border: '1px solid var(--st-danger-border)', borderRadius: '8px', color: 'var(--st-danger-fg)', marginBottom: '16px' }}>
            {branchError ?? fetchError}
          </div>
        )}

        {mapLinks.length > 0 && (
          <div style={{ marginBottom: '16px', padding: '12px', background: 'var(--surface2)', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: '14px', fontWeight: 600 }}>Google Maps Links</h3>
            <p style={{ margin: '0 0 12px', fontSize: '12px', color: 'var(--text3)' }}>
              Tap a link to open in Google Maps. Phone browsers support up to 3 stops per link.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {mapLinks.map((link, i) => (
                <a
                  key={i}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    padding: '8px 12px',
                    background: 'var(--primary)',
                    color: 'white',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: 500,
                    textDecoration: 'none',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Link {i + 1} ({link.stops.length} stops)
                </a>
              ))}
            </div>
          </div>
        )}

        {loading ? (
          <LoadingSkeleton rows={5} type="card" label="Loading route…" />
        ) : stops.length === 0 ? (
          <EmptyState
            icon={<Icon name="truck" size={32} />}
            title="No deliveries scheduled"
            description="No active delivery jobs for this date. Check another date or create a dispatch."
          />
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
            role="list"
            aria-label="Delivery route stops"
          >
            {stops.map((stop, index) => (
              <div
                key={stop.id}
                draggable={canSetRoute}
                onDragStart={(e) => handleDragStart(e, stop.id)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, stop.id)}
                onDragEnd={handleDragEnd}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px 16px',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  opacity: draggingId === stop.id ? 0.5 : 1,
                  cursor: canSetRoute ? 'grab' : 'default',
                  transition: 'opacity var(--dur-fast)',
                }}
                role="listitem"
                aria-grabbed={draggingId === stop.id}
              >
                {/* Drag handle / position */}
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'var(--surface2)',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    fontWeight: 600,
                    fontSize: '14px',
                    color: draggingId === stop.id ? 'var(--primary)' : 'var(--text)',
                  }}
                  aria-label={`Stop ${index + 1}`}
                >
                  {index + 1}
                </div>

                {/* Status badge */}
                <div
                  style={{
                    width: '28px',
                    height: '28px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: STATUS_BADGE_STYLE[stop.status as DeliveryStatus]?.bg ?? 'var(--st-neutral-bg)',
                    color: STATUS_BADGE_STYLE[stop.status as DeliveryStatus]?.color ?? 'var(--text)',
                    border: STATUS_BADGE_STYLE[stop.status as DeliveryStatus]?.border ?? '1px solid var(--border)',
                    borderRadius: '6px',
                    fontSize: '10px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                  title={stop.status}
                >
                  <Icon name={STATUS_BADGE_STYLE[stop.status as DeliveryStatus]?.icon ?? 'timer'} size={12} />
                </div>

                {/* Client info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ fontWeight: 600, fontSize: '14px' }}>{stop.clientName}</span>
                    <span style={{ fontSize: '12px', color: 'var(--text3)' }}>{stop.bookingNo}</span>
                    <span style={{ fontSize: '12px', color: 'var(--text3)' }}>{stop.scheduledAt.slice(11, 16)}</span>
                    {stop.zoneName && (
                      <span style={{ fontSize: '11px', padding: '2px 6px', background: 'var(--surface2)', borderRadius: '4px', color: 'var(--text2)' }}>
                        {stop.zoneName}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {stop.address}, {stop.neighborhood}
                    {stop.mapPinLat && stop.mapPinLng && (
                      <> · 📍 Pinned</>
                    )}
                  </div>
                </div>

                {/* Map pin button */}
                {canSetPin && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openPinModal(stop)}
                    disabled={pinSaving}
                    title={stop.mapPinLat ? 'Edit map pin' : 'Drop map pin'}
                    aria-label={stop.mapPinLat ? 'Edit map pin' : 'Drop map pin'}
                  >
                    <Icon name={stop.mapPinLat ? 'edit' : 'plus'} size={18} />
                  </Button>
                )}

                {/* Open in Maps */}
                {stop.mapPinLat && stop.mapPinLng && (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${stop.mapPinLat},${stop.mapPinLng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      padding: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--primary)',
                      textDecoration: 'none',
                    }}
                    title="Open in Google Maps"
                    aria-label="Open in Google Maps"
                  >
                    <Icon name="external_link" size={18} />
                  </a>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Pin Modal */}
        {pinModalOpen && pinTarget && (
          <Modal
            isOpen
            onClose={() => setPinModalOpen(false)}
            title="Drop Map Pin"
            size="sm"
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <p style={{ margin: 0, fontSize: '14px', color: 'var(--text2)' }}>
                Enter coordinates for <strong>{pinTarget.clientName}</strong> ({pinTarget.address}, {pinTarget.neighborhood})
              </p>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--text3)' }}>
                Paste from Google Maps (right-click → "What's here?") or use a coordinate finder.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>
                    Latitude
                  </label>
                  <input
                    type="text"
                    value={pinLat}
                    onChange={(e) => setPinLat(e.target.value)}
                    placeholder="e.g., 27.7172"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      fontSize: '14px',
                      background: 'var(--surface)',
                      color: 'var(--text)',
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>
                    Longitude
                  </label>
                  <input
                    type="text"
                    value={pinLng}
                    onChange={(e) => setPinLng(e.target.value)}
                    placeholder="e.g., 85.3240"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      fontSize: '14px',
                      background: 'var(--surface)',
                      color: 'var(--text)',
                    }}
                  />
                </div>
              </div>
              {pinError && (
                <div role="alert" style={{ padding: '10px 12px', background: 'var(--st-danger-bg)', border: '1px solid var(--st-danger-border)', borderRadius: '8px', color: 'var(--st-danger-fg)', fontSize: '13px' }}>
                  {pinError}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                <Button variant="secondary" onClick={() => setPinModalOpen(false)}>Cancel</Button>
                <Button variant="primary" onClick={savePin} loading={pinSaving}>Save</Button>
              </div>
            </div>
          </Modal>
        )}
      </PageBody>
    </PageShell>
  )
}

export default DeliveryWorkspace
