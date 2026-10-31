// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { OperationEvidenceStatus } from '../OperationEvidenceStatus'
import type { useOperationEvidence } from '../useOperationEvidence'

const mockCompressEvidencePhoto = vi.fn()
const mockUploadEvidencePhoto = vi.fn()
let mockUser: { id: string; email: string; role: string } | null = {
  id: '00000000-0000-0000-0000-000000000001',
  email: 'warehouse@example.com',
  role: 'Warehouse',
}

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: mockUser,
    loading: false,
  }),
}))

vi.mock('../../../lib/imageCompression', () => ({
  compressEvidencePhoto: (...args: unknown[]) => mockCompressEvidencePhoto(...args),
  DAMAGE_PHOTO_MAX_BYTES: 10 * 1024 * 1024,
  STANDARD_PHOTO_MAX_BYTES: 3 * 1024 * 1024,
  toJpegFilename: (name: string) => name.replace(/\.(heic|heif|png|webp|jpeg)$/i, '.jpg'),
}))

vi.mock('../../../lib/evidenceStorage', () => ({
  uploadEvidencePhoto: (...args: unknown[]) => mockUploadEvidencePhoto(...args),
}))

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

describe('OperationEvidenceStatus (T2-16, W27 Photo Rules)', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.clearAllMocks()
    mockUser = {
      id: '00000000-0000-0000-0000-000000000001',
      email: 'warehouse@example.com',
      role: 'Warehouse',
    }
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root.unmount()
      })
    }
    host?.remove()
    document.body.innerHTML = ''
  })

  function createMockStatus(filesCount = 0): ReturnType<typeof useOperationEvidence> {
    return {
      evidence: {
        files: filesCount,
        filesByUnit: {},
      },
      error: null,
      refresh: vi.fn(),
    }
  }

  it('renders a file input with multiple and accept including HEIC', async () => {
    const status = createMockStatus(0)

    await act(async () => {
      root.render(
        <OperationEvidenceStatus
          bookingId="00000000-0000-0000-0000-000000000002"
          stage="Packing"
          category="Packing"
          status={status}
        />,
      )
    })

    const input = host.querySelector<HTMLInputElement>('input[type="file"]')
    expect(input).not.toBeNull()
    expect(input?.hasAttribute('multiple')).toBe(true)
    expect(input?.getAttribute('accept')).toContain('.heic')
    expect(input?.getAttribute('accept')).toContain('.heif')
  })

  it('attaches three photos to one step and calls refresh on the first photo to pass gate immediately (W27)', async () => {
    let currentFiles = 0
    const refreshSpy = vi.fn(() => {
      currentFiles += 1
    })
    const status: ReturnType<typeof useOperationEvidence> = {
      evidence: {
        files: currentFiles,
        filesByUnit: {},
      },
      error: null,
      refresh: refreshSpy,
    }

    mockCompressEvidencePhoto.mockImplementation(async (file: File) => ({
      blob: new Blob(['compressed'], { type: 'image/jpeg' }),
      originalBytes: file.size,
      compressedBytes: 500_000,
      width: 1600,
      height: 1200,
      format: 'image/jpeg',
    }))
    mockUploadEvidencePhoto.mockResolvedValue({ id: 'f-1' })

    await act(async () => {
      root.render(
        <OperationEvidenceStatus
          bookingId="00000000-0000-0000-0000-000000000002"
          stage="Packing"
          category="Packing"
          status={status}
        />,
      )
    })

    const input = host.querySelector<HTMLInputElement>('input[type="file"]')!
    const file1 = new File(['image 1'], 'photo1.jpg', { type: 'image/jpeg' })
    const file2 = new File(['image 2'], 'photo2.jpg', { type: 'image/jpeg' })
    const file3 = new File(['image 3'], 'photo3.HEIC', { type: 'image/heic' })

    await act(async () => {
      // Simulate multiple selection
      Object.defineProperty(input, 'files', {
        value: [file1, file2, file3],
        writable: true,
      })
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })

    expect(mockCompressEvidencePhoto).toHaveBeenCalledTimes(3)
    expect(mockUploadEvidencePhoto).toHaveBeenCalledTimes(3)

    // Gate refreshes after each photo so gate is cleared immediately on photo 1
    expect(refreshSpy).toHaveBeenCalledTimes(3)
  })

  it('uses damage photo limit (isDamage: true) when stage or category is Damage', async () => {
    const status = createMockStatus(0)

    mockCompressEvidencePhoto.mockImplementation(async (file: File) => ({
      blob: new Blob(['compressed'], { type: 'image/jpeg' }),
      originalBytes: file.size,
      compressedBytes: 500_000,
      width: 1600,
      height: 1200,
      format: 'image/jpeg',
    }))
    mockUploadEvidencePhoto.mockResolvedValue({ id: 'f-1' })

    await act(async () => {
      root.render(
        <OperationEvidenceStatus
          bookingId="00000000-0000-0000-0000-000000000002"
          stage="Damage"
          category="Damage"
          status={status}
        />,
      )
    })

    const input = host.querySelector<HTMLInputElement>('input[type="file"]')!
    const damageFile = new File(['damage details'], 'crack.jpg', { type: 'image/jpeg' })

    await act(async () => {
      Object.defineProperty(input, 'files', {
        value: [damageFile],
        writable: true,
      })
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })

    expect(mockCompressEvidencePhoto).toHaveBeenCalledWith(
      damageFile,
      expect.objectContaining({ isDamage: true }),
    )
  })

  it('reuses the same clientUuid on retry when upload fails', async () => {
    const status = createMockStatus(0)

    mockCompressEvidencePhoto.mockImplementation(async (file: File) => ({
      blob: new Blob(['compressed'], { type: 'image/jpeg' }),
      originalBytes: file.size,
      compressedBytes: 500_000,
      width: 1600,
      height: 1200,
      format: 'image/jpeg',
    }))

    // First attempt fails
    mockUploadEvidencePhoto.mockRejectedValueOnce(new Error('Storage network timeout'))

    await act(async () => {
      root.render(
        <OperationEvidenceStatus
          bookingId="00000000-0000-0000-0000-000000000002"
          stage="Packing"
          category="Packing"
          status={status}
        />,
      )
    })

    const input = host.querySelector<HTMLInputElement>('input[type="file"]')!
    const file = new File(['image 1'], 'test.jpg', { type: 'image/jpeg' })

    await act(async () => {
      Object.defineProperty(input, 'files', {
        value: [file],
        writable: true,
      })
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })

    expect(mockUploadEvidencePhoto).toHaveBeenCalledTimes(1)
    const firstCallArgs = mockUploadEvidencePhoto.mock.calls[0]![0] as { clientUuid: string }
    const firstClientUuid = firstCallArgs.clientUuid
    expect(firstClientUuid).toBeDefined()

    // Error message and Retry button must appear
    expect(host.textContent).toContain('Storage network timeout')
    const retryBtn = Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.includes('Retry upload'))
    expect(retryBtn).toBeDefined()

    // Retry succeeds
    mockUploadEvidencePhoto.mockResolvedValueOnce({ id: 'f-1' })
    await act(async () => {
      retryBtn?.click()
    })

    expect(mockUploadEvidencePhoto).toHaveBeenCalledTimes(2)
    const secondCallArgs = mockUploadEvidencePhoto.mock.calls[1]![0] as { clientUuid: string }
    expect(secondCallArgs.clientUuid).toBe(firstClientUuid) // Must reuse exact same UUID!
  })

  it('refuses upload inline when device is offline without creating queues', async () => {
    const status = createMockStatus(0)

    const originalOnLine = navigator.onLine
    try {
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })

      await act(async () => {
        root.render(
          <OperationEvidenceStatus
            bookingId="00000000-0000-0000-0000-000000000002"
            stage="Packing"
            category="Packing"
            status={status}
          />,
        )
      })

      const input = host.querySelector<HTMLInputElement>('input[type="file"]')!
      const file = new File(['image 1'], 'offline.jpg', { type: 'image/jpeg' })

      await act(async () => {
        Object.defineProperty(input, 'files', {
          value: [file],
          writable: true,
        })
        input.dispatchEvent(new Event('change', { bubbles: true }))
      })

      expect(mockUploadEvidencePhoto).not.toHaveBeenCalled()
      expect(host.textContent).toContain('Device is offline')
    } finally {
      Object.defineProperty(navigator, 'onLine', { value: originalOnLine, configurable: true })
    }
  })
})
