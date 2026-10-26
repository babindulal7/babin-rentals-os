import { describe, it, expect } from 'vitest'
import { calculateTargetDimensions, compressEvidencePhoto, MAX_EVIDENCE_DIMENSION } from '../imageCompression'

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

describe('compressEvidencePhoto fallback in Node', () => {
  it('falls back gracefully in headless test environment', async () => {
    const dummyBlob = new Blob(['fake image bytes'], { type: 'image/jpeg' })
    const result = await compressEvidencePhoto(dummyBlob)
    expect(result.originalBytes).toBe(dummyBlob.size)
    expect(result.format).toBe('image/jpeg')
    expect(result.blob).toBeDefined()
  })
})
