// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AddUnitsModal } from '../modals/AddUnitsModal'
import { UpgradeTierModal } from '../../clients/modals/UpgradeTierModal'
import type { ClientRecord } from '../../../lib/queries/clients'

const mock = vi.hoisted(() => ({
  add: vi.fn(), enroll: vi.fn(), success: vi.fn(), sequence: 0, online: true,
  clientId: '10000000-0000-4000-8000-000000000001', planId: '10000000-0000-4000-8000-000000000002',
}))
vi.mock('../../../actions/inventory/manageStock', () => ({ addEquipmentUnits: mock.add }))
vi.mock('../../../actions/clients/enrollMembership', () => ({ enrollClientMembership: mock.enroll }))
vi.mock('../../../lib/auth', () => ({ useAuth: () => ({ user: { id: 'owner', role: 'Owner' } }) }))
vi.mock('../../../lib/network', () => ({ useNetwork: () => mock.online }))
vi.mock('../../../components/ui/Toast', () => ({ useToast: () => ({ showSuccessToast: mock.success }) }))
vi.mock('../../../lib/supabase', () => ({
  newClientUuid: () => `request-${++mock.sequence}`,
  supabase: { from: () => ({ select: () => ({ order: async () => ({ data: [
    { id: mock.planId, level: 'Creator', label: 'Creator', individual_discount_pct: 10, annual_fee: 1000 },
  ], error: null }) }) }) },
}))
vi.mock('../../../components/ui/Modal', () => ({ Modal: ({ isOpen, title, children, footer, onClose }: {
  isOpen: boolean; title: string; children: ReactNode; footer: ReactNode; onClose: () => void
}) => isOpen ? <section aria-label={title}><button onClick={onClose}>Close dialog</button>{children}{footer}</section> : null }))
vi.mock('../../../components/ui/Button', () => ({ Button: ({ children, onClick, disabled }: {
  children: ReactNode; onClick?: (() => void) | undefined; disabled?: boolean | undefined
}) => <button onClick={onClick} disabled={disabled}>{children}</button> }))
vi.mock('../../../components/ui/Icon', () => ({ default: () => null }))

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
let host: HTMLDivElement
let root: Root
const close = vi.fn()
const done = vi.fn()
async function render(node: ReactNode) { await act(async () => { root.render(node) }) }
function button(label: string) {
  const match = [...host.querySelectorAll('button')].find(item => item.textContent?.includes(label))
  if (!match) throw new Error(`Missing button ${label}`)
  return match
}
function stock() { return <AddUnitsModal isOpen productId="product" productName="Camera" warehouses={[{id:'warehouse',name:'Main'}]} onClose={close} onUnitsAdded={done} /> }
const client = () => ({ id: 'C-001', dbId: mock.clientId, name: 'Client', membership: 'Academy' } as unknown as ClientRecord)
async function chooseCreator() {
  const select = host.querySelector('select')!
  await act(async () => { select.value = 'Creator'; select.dispatchEvent(new Event('change',{bubbles:true})) })
}
beforeEach(() => {
  mock.add.mockReset(); mock.enroll.mockReset(); mock.success.mockReset(); mock.sequence=0; mock.online=true
  close.mockReset(); done.mockReset()
  host=document.createElement('div'); document.body.append(host); root=createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove() })

describe('stock and membership committed-request identity', () => {
  it('reuses intake key after a lost response and clears it after success', async () => {
    mock.add.mockRejectedValueOnce(new Error('Response lost')).mockResolvedValue({added_count:1,total_quantity:2})
    await render(stock())
    await act(async () => button('Confirm Add').click())
    expect(host.textContent).toContain('Response lost')
    await act(async () => button('Confirm Add').click())
    const first=mock.add.mock.calls[0]![0]
    expect(mock.add.mock.calls[1]![0].clientUuid).toBe(first.clientUuid)
    expect(mock.success).toHaveBeenCalledTimes(1)
    await act(async () => button('Confirm Add').click())
    expect(mock.add.mock.calls[2]![0].clientUuid).not.toBe(first.clientUuid)
  })
  it('refuses concurrent submissions and closing a pending intake', async () => {
    let finish: ((value: {added_count:number;total_quantity:number}) => void) | undefined
    mock.add.mockImplementation(() => new Promise(resolve => { finish=resolve }))
    await render(stock())
    await act(async () => { const submit=button('Confirm Add'); submit.click(); submit.click(); button('Close dialog').click() })
    expect(mock.add).toHaveBeenCalledTimes(1)
    expect(close).not.toHaveBeenCalled()
    await act(async () => finish?.({added_count:1,total_quantity:1}))
    expect(done).toHaveBeenCalledTimes(1)
  })
  it('refuses offline intake before calling the action', async () => {
    mock.online=false
    await render(stock())
    await act(async () => button('Confirm Add').click())
    expect(mock.add).not.toHaveBeenCalled()
    expect(host.textContent).toContain('Connect to add units')
  })
  it('uses the saved client UUID and retains tier-change key on retry', async () => {
    mock.enroll.mockRejectedValueOnce(new Error('Response lost')).mockResolvedValue({})
    await render(<UpgradeTierModal isOpen client={client()} onClose={close} onSuccess={done} />)
    await chooseCreator()
    await act(async () => button('Apply Tier Change').click())
    await act(async () => button('Apply Tier Change').click())
    expect(mock.enroll.mock.calls[0]![0].clientId).toBe(mock.clientId)
    expect(mock.enroll.mock.calls[1]![0].clientUuid).toBe(mock.enroll.mock.calls[0]![0].clientUuid)
    expect(done).toHaveBeenCalledOnce()
  })
  it('fails closed when a client has only a display code', async () => {
    const missingId={...client(),dbId:undefined} as unknown as ClientRecord
    await render(<UpgradeTierModal isOpen client={missingId} onClose={close} onSuccess={done} />)
    await chooseCreator()
    await act(async () => button('Apply Tier Change').click())
    expect(mock.enroll).not.toHaveBeenCalled()
    expect(host.textContent).toContain('Reload this client')
  })
})
