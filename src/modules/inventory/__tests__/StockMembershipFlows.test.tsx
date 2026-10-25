// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AddUnitsModal } from '../modals/AddUnitsModal'
import { UpgradeTierModal } from '../../clients/modals/UpgradeTierModal'
import type { ClientRecord } from '../../../lib/queries/clients'

const mock = vi.hoisted(() => ({
  add: vi.fn(), change: vi.fn(), success: vi.fn(), sequence: 0, online: true, plansLoading: false,
  clientId: '10000000-0000-4000-8000-000000000001',
}))
vi.mock('../../../actions/inventory/manageStock', () => ({ addEquipmentUnits: mock.add }))
vi.mock('../../../actions/clients/changeMembership', () => ({ changeMembership: mock.change, NOTE_MAX: 500 }))
vi.mock('../../../lib/queries/useClients', () => ({
  useMembershipPlans: () => ({
    rows: mock.plansLoading ? [] : [{ level: 'Creator', label: 'Creator', individualDiscountPct: 10, defaultCreditLimit: 5_000_000, displayOrder: 1 }],
    loading: mock.plansLoading, error: null, isEmpty: false, refetch: () => {},
  }),
}))
vi.mock('../../../lib/auth', () => ({ useAuth: () => ({ user: { id: 'owner', role: 'Owner' } }) }))
vi.mock('../../../lib/network', () => ({ useNetwork: () => mock.online }))
vi.mock('../../../components/ui/Toast', () => ({ useToast: () => ({ showSuccessToast: mock.success }) }))
vi.mock('../../../lib/supabase', () => ({
  newClientUuid: () => `request-${++mock.sequence}`,
}))
vi.mock('../../../components/ui/Modal', () => ({ Modal: ({ isOpen, title, children, footer, onClose }: {
  isOpen: boolean; title: string; children: ReactNode; footer: ReactNode; onClose: () => void
}) => isOpen ? <section aria-label={title}><button onClick={onClose}>Close dialog</button>{children}{footer}</section> : null }))
vi.mock('../../../components/ui/Button', () => ({ Button: ({ children, onClick, disabled }: {
  children: ReactNode; onClick?: (() => void) | undefined; disabled?: boolean | undefined
}) => <button onClick={onClick} disabled={disabled}>{children}</button> }))
vi.mock('../../../components/ui/Page', () => ({ Button: ({ children, onClick, disabled }: {
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
  mock.add.mockReset(); mock.change.mockReset(); mock.success.mockReset(); mock.sequence=0; mock.online=true; mock.plansLoading=false
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
    mock.change.mockRejectedValueOnce(new Error('Response lost')).mockResolvedValue({})
    await render(<UpgradeTierModal isOpen client={client()} hasMembership onClose={close} onSuccess={done} />)
    await chooseCreator()
    await act(async () => button('Apply Tier Change').click())
    expect(host.textContent).toContain('Response lost')
    expect(done).not.toHaveBeenCalled()
    await act(async () => button('Apply Tier Change').click())
    const first = mock.change.mock.calls[0]![0]
    expect(first).toMatchObject({ clientDbId: mock.clientId, clientCode: 'C-001', planLevel: 'Creator' })
    expect(first).not.toHaveProperty('feePaid')
    expect(first).not.toHaveProperty('planId')
    expect(first.clientUuid).toMatch(/^[0-9a-f-]{36}$/i)
    expect(mock.change.mock.calls[1]![0].clientUuid).toBe(first.clientUuid)
    expect(done).toHaveBeenCalledExactlyOnceWith('Creator')
  })
  it('fails closed when a client has only a display code', async () => {
    const missingId={...client(),dbId:undefined} as unknown as ClientRecord
    await render(<UpgradeTierModal isOpen client={missingId} hasMembership onClose={close} onSuccess={done} />)
    await chooseCreator()
    await act(async () => button('Apply Tier Change').click())
    expect(mock.change).not.toHaveBeenCalled()
    expect(host.textContent).toContain('Reload this client')
  })
  it('waits for the live membership plans before allowing a tier change', async () => {
    mock.plansLoading = true
    await render(<UpgradeTierModal isOpen client={client()} hasMembership onClose={close} onSuccess={done} />)
    expect(host.textContent).toContain('Loading membership plans')
    expect(button('Apply Tier Change').disabled).toBe(true)
    expect(mock.change).not.toHaveBeenCalled()
    mock.plansLoading = false
    await render(<UpgradeTierModal isOpen client={client()} hasMembership onClose={close} onSuccess={done} />)
    expect(host.querySelector('select')?.value).toBe('Creator')
    expect(button('Apply Tier Change').disabled).toBe(false)
  })
  it('refuses offline tier changes before calling the action', async () => {
    mock.online = false
    await render(<UpgradeTierModal isOpen client={client()} hasMembership onClose={close} onSuccess={done} />)
    await act(async () => button('Apply Tier Change').click())
    expect(mock.change).not.toHaveBeenCalled()
    expect(host.textContent).toContain('Connect to update client membership')
  })
  it('refuses concurrent tier changes and closing while a change is pending', async () => {
    let finish: (() => void) | undefined
    mock.change.mockImplementation(() => new Promise<void>(resolve => { finish = resolve }))
    await render(<UpgradeTierModal isOpen client={client()} hasMembership onClose={close} onSuccess={done} />)
    await act(async () => {
      const submit = button('Apply Tier Change')
      submit.click()
      submit.click()
      button('Close dialog').click()
    })
    expect(mock.change).toHaveBeenCalledTimes(1)
    expect(close).not.toHaveBeenCalled()
    expect(done).not.toHaveBeenCalled()
    expect(button('Cancel').disabled).toBe(true)
    await act(async () => finish?.())
    expect(done).toHaveBeenCalledExactlyOnceWith('Creator')
    expect(close).toHaveBeenCalledOnce()
  })
})
