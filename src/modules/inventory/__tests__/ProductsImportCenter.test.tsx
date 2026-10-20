// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import ProductsImportCenter from '../ProductsImportCenter'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'usr-1', email: 'owner@babinrentals.com', role: 'Owner' },
    role: 'Owner',
    capabilities: [],
  }),
}))

vi.mock('../../../lib/network', () => ({ useNetwork: () => true }))

vi.mock('../../../lib/supabase', () => ({
  newClientUuid: () => `00000000-0000-4000-8000-00000000000${Math.floor(Math.random() * 9)}`,
}))

vi.mock('../../../lib/queries/inventory', () => ({
  listInventoryCategories: vi.fn().mockResolvedValue([
    { id: 'c-1', name: 'Cameras', code: 'camera' },
    { id: 'c-2', name: 'Audio', code: 'audio' },
  ]),
  listProductImportCorpus: vi.fn().mockResolvedValue([]),
}))

vi.mock('../../../lib/queries/warehouses', () => ({
  useWarehouses: () => ({
    rows: [{ id: 'w-1', name: 'Central Camera Vault' }],
    loading: false,
    error: null,
    refetch: vi.fn(),
  }),
}))

vi.mock('../../../actions/inventory/importProducts', () => ({
  importProducts: vi.fn(),
}))

vi.mock('../../../components/ui/RecordWorkspace', () => ({
  useUnsavedRecord: vi.fn(),
}))

const { importProducts } = await import('../../../actions/inventory/importProducts')

const SAMPLE = [
  'Product Name,Category,Brand,Model,Tracking Mode,Quantity,Serial Numbers,Daily Rate,Description,Internal Notes',
  'Rode NTG5,Audio,Rode,NTG5,Quantity,3,,2500,Shotgun microphone,Covers included',
].join('\r\n')

function csvFile(text: string): File {
  return new File([text], 'products.csv', { type: 'text/csv' })
}

/**
 * BQ-407's contract, at the screen level: nothing commits until the mandatory
 * dry-run has rendered every row, and the operator can see why.
 */
describe('ProductsImportCenter (BQ-407)', () => {
  let host: HTMLDivElement | null = null
  let root: Root | null = null

  beforeEach(() => {
    vi.clearAllMocks()
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(() => {
    if (root) {
      act(() => {
        root!.unmount()
      })
    }
    if (host && host.parentNode) host.parentNode.removeChild(host)
    root = null
    host = null
  })

  async function render() {
    await act(async () => {
      root!.render(
        <MemoryRouter>
          <ProductsImportCenter embedded />
        </MemoryRouter>,
      )
    })
    await flush()
  }

  /** Flush the mock-promise chain: categories effect → corpus effect → re-render. */
  async function flush(times = 4) {
    for (let i = 0; i < times; i++) {
      await act(async () => {
        await Promise.resolve()
      })
    }
  }

  async function upload(text: string) {
    const input = host!.querySelector('input[type="file"]') as HTMLInputElement
    expect(input).not.toBeNull()
    const file = csvFile(text)
    Object.defineProperty(file, 'text', { value: async () => text })
    Object.defineProperty(input, 'files', { configurable: true, value: [file] })
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }))
      await Promise.resolve()
    })
  }

  it('renders the four-step flow for a role that may import', async () => {
    await render()
    expect(host!.textContent).toContain('Upload a CSV, map its columns, review the dry-run')
    expect(host!.textContent).toContain('1 · Choose a file')
    expect(host!.textContent).toContain('Sample CSV')
  })

  it('runs the mandatory dry-run: a valid row shows Ready and enables the commit', async () => {
    await render()
    await upload(SAMPLE)
    await flush()
    expect(host!.textContent).toContain('products.csv')
    // The mapping table appears with the guessed targets.
    expect((host!.querySelector('select') as HTMLSelectElement).value).not.toBe('skip')
    // The preview renders the row's dry-run verdict.
    expect(host!.textContent).toContain('Ready')
    expect(commitButton()).toBeDefined()
    expect(commitButton()!.disabled).toBe(false)
  })

  it('shows the per-row error instead of committing when the dry-run refuses', async () => {
    await render()
    await upload(SAMPLE.replace('Audio', 'Drones'))
    await flush()
    expect(host!.textContent).toContain('not recognized')
    const commit = commitButton()
    expect(commit).toBeDefined()
    expect(commit!.disabled).toBe(true)
  })

  function commitButton(): HTMLButtonElement | undefined {
    return Array.from(host!.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('as Drafts'),
    ) as HTMLButtonElement | undefined
  }

  it('blocks the commit while the duplicate check has not finished, then shows duplicates', async () => {
    const { listProductImportCorpus } = await import('../../../lib/queries/inventory')
    let release: ((rows: unknown[]) => void) | undefined
    ;(listProductImportCorpus as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise((resolve) => { release = resolve }),
    )
    await render()
    await upload(SAMPLE)
    await flush()
    // While the catalogue read is in flight: '—' and no commit.
    expect(host!.textContent).toContain('checking the catalogue…')
    const commit = commitButton()
    expect(commit).toBeDefined()
    expect(commit!.disabled).toBe(true)
    // Once the corpus lands empty, the row is Ready and the commit opens.
    await act(async () => {
      release!([])
      await Promise.resolve()
    })
    await flush()
    expect(commitButton()!.disabled).toBe(false)
  })

  it('commits the ready rows as Drafts through the import action', async () => {
    ;(importProducts as ReturnType<typeof vi.fn>).mockResolvedValue({
      outcomes: [{ rowIndex: 0, status: 'saved', productId: 'p-1', assetCode: 'EQ000001' }],
    })
    await render()
    await upload(SAMPLE)
    await flush()
    const commit = commitButton()!
    expect(commit.disabled).toBe(false)
    await act(async () => {
      commit.click()
    })
    expect(importProducts).toHaveBeenCalledTimes(1)
    const call = (importProducts as ReturnType<typeof vi.fn>).mock.calls[0]!
    expect(call[0].rows).toHaveLength(1)
    expect(call[0].rows[0].values.tracking).toBe('Quantity')
    expect(call[1]).toMatchObject({ userId: 'usr-1', role: 'Owner' })
    expect(host!.textContent).toContain('Saved as EQ000001')
  })

  it('shows the serial-home picker only when a serialised row is ready', async () => {
    await render()
    await upload(SAMPLE)
    await flush()
    expect(host!.textContent).not.toContain('Where do the imported serialised units land?')
    await upload(
      [
        'Product Name,Category,Brand,Model,Tracking Mode,Quantity,Serial Numbers,Daily Rate,Description,Internal Notes',
        'Sony FX3,Cameras,Sony,FX3,Serialised,,SN-1; SN-2,3500,Full-frame cinema camera,',
      ].join('\r\n'),
    )
    await flush()
    expect(host!.textContent).toContain('Where do the imported serialised units land?')
    // No warehouse named → the commit stays closed with the reason visible.
    expect(host!.textContent).toContain('Choose a warehouse and name a rack')
  })
})
