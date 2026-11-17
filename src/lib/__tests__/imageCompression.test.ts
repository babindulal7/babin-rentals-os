import { describe, it, expect } from 'vitest'
import {
  calculateTargetDimensions,
  compressionDimensionSteps,
  compressEvidencePhoto,
  isHeicImage,
  resolveMaxBytes,
  MAX_EVIDENCE_DIMENSION,
  DAMAGE_PHOTO_MAX_BYTES,
  STANDARD_PHOTO_MAX_BYTES,
} from '../imageCompression'

describe('calculateTargetDimensions', () => {
  it('returns unchanged dimensions if within maxDimension', () => {
    expect(calculateTargetDimensions(800, 600, 1600)).toEqual({ width: 800, height: 600 })
    expect(calculateTargetDimensions(1600, 1200, 1600)).toEqual({ width: 1600, height: 1200 })
    expect(calculateTargetDimensions(1200, 1600, 1600)).toEqual({ width: 1200, height: 1600 })
  })

  it('scales down landscape images so width equals maxDimension', () => {
    const res = calculateTargetDimensions(3200, 2400, 1600)
    expect(res.width).toBe(1600)
    expect(res.height).toBe(1200)
  })

  it('scales down portrait images so height equals maxDimension', () => {
    const res = calculateTargetDimensions(2400, 4800, 1600)
    expect(res.width).toBe(800)
    expect(res.height).toBe(1600)
  })

  it('handles square images proportionally', () => {
    const res = calculateTargetDimensions(4000, 4000, 1600)
    expect(res.width).toBe(1600)
    expect(res.height).toBe(1600)
  })

  it('uses default MAX_EVIDENCE_DIMENSION = 1600', () => {
    expect(MAX_EVIDENCE_DIMENSION).toBe(1600)
    const res = calculateTargetDimensions(3200, 1600)
    expect(res.width).toBe(1600)
    expect(res.height).toBe(800)
  })
})

describe('compressionDimensionSteps', () => {
  it('never increases a standard photo beyond its initial 1600px cap', () => {
    expect(compressionDimensionSteps(1600)).toEqual([1600, 1400, 1200])
  })

  it('keeps the higher-resolution damage first attempt and steps downward', () => {
    expect(compressionDimensionSteps(2560)).toEqual([2560, 1800, 1600, 1400, 1200])
  })

  it('does not upscale small source limits and refuses invalid dimension caps', () => {
    expect(compressionDimensionSteps(900)).toEqual([900])
    expect(() => compressionDimensionSteps(0)).toThrow(/positive finite/)
    expect(() => compressionDimensionSteps(Number.NaN)).toThrow(/positive finite/)
  })
})

describe('W27 Photo Rules — size caps, HEIC, and fallback', () => {
  it('identifies HEIC images by MIME type or file extension', () => {
    const heicMime = new Blob(['sample'], { type: 'image/heic' })
    const heifMime = new Blob(['sample'], { type: 'image/heif' })
    const heicFile = new File(['sample'], 'photo.HEIC', { type: '' })
    const jpegFile = new File(['sample'], 'photo.jpg', { type: 'image/jpeg' })

    expect(isHeicImage(heicMime)).toBe(true)
    expect(isHeicImage(heifMime)).toBe(true)
    expect(isHeicImage(heicFile)).toBe(true)
    expect(isHeicImage(jpegFile)).toBe(false)
  })

  it('resolves correct maxBytes for damage (<= 10MB) vs other photos (<= 3MB) per W27', () => {
    expect(DAMAGE_PHOTO_MAX_BYTES).toBe(10 * 1024 * 1024)
    expect(STANDARD_PHOTO_MAX_BYTES).toBe(3 * 1024 * 1024)

    expect(resolveMaxBytes({ isDamage: true })).toBe(10 * 1024 * 1024)
    expect(resolveMaxBytes({ isDamage: false })).toBe(3 * 1024 * 1024)
    expect(resolveMaxBytes({})).toBe(3 * 1024 * 1024)
    expect(resolveMaxBytes({ maxBytes: 5000 })).toBe(5000)
  })

  it('refuses an oversized JPEG when no image decoder is available instead of truncating it', async () => {
    const photo = new Blob([new Uint8Array(12 * 1024 * 1024)], { type: 'image/jpeg' })
    await expect(compressEvidencePhoto(photo, { isDamage: false })).rejects.toThrow(/not saved/i)
    await expect(compressEvidencePhoto(photo, { isDamage: true })).rejects.toThrow(/not saved/i)
  })

  it('refuses HEIC without a decoder instead of relabelling raw bytes as JPEG', async () => {
    const heic = new Blob(['raw heic camera bytes'], { type: 'image/heic' })
    await expect(compressEvidencePhoto(heic)).rejects.toThrow(/not saved/i)
  })

  it('refuses even a small JPEG without canvas because EXIF stripping cannot be guaranteed', async () => {
    const photo = new Blob(['fake jpeg bytes'], { type: 'image/jpeg' })
    await expect(compressEvidencePhoto(photo)).rejects.toThrow(/not saved/i)
  })

})
