import { describe, it, expect } from 'vitest'
import {
  calculateTargetDimensions,
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

  it('compresses a 12 MB standard phone photo to <= 3 MB (W27)', async () => {
    const twelveMbBytes = 12 * 1024 * 1024
    const largePhonePhoto = new Blob([new Uint8Array(twelveMbBytes)], { type: 'image/jpeg' })

    const result = await compressEvidencePhoto(largePhonePhoto, { isDamage: false })
    expect(result.originalBytes).toBe(twelveMbBytes)
    expect(result.compressedBytes).toBeLessThanOrEqual(STANDARD_PHOTO_MAX_BYTES)
    expect(result.blob.size).toBeLessThanOrEqual(3 * 1024 * 1024)
    expect(result.format).toBe('image/jpeg')
  })

  it('compresses a 12 MB damage photo to <= 10 MB (W27)', async () => {
    const twelveMbBytes = 12 * 1024 * 1024
    const largeDamagePhoto = new Blob([new Uint8Array(twelveMbBytes)], { type: 'image/jpeg' })

    const result = await compressEvidencePhoto(largeDamagePhoto, { isDamage: true })
    expect(result.originalBytes).toBe(twelveMbBytes)
    expect(result.compressedBytes).toBeLessThanOrEqual(DAMAGE_PHOTO_MAX_BYTES)
    expect(result.blob.size).toBeLessThanOrEqual(10 * 1024 * 1024)
    expect(result.format).toBe('image/jpeg')
  })

  it('converts HEIC photos to JPEG format with image/jpeg mime type', async () => {
    const heicBlob = new Blob(['raw heic camera bytes'], { type: 'image/heic' })
    const result = await compressEvidencePhoto(heicBlob)

    expect(result.format).toBe('image/jpeg')
    expect(result.blob.type).toBe('image/jpeg')
  })
})
