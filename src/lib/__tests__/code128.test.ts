import { describe, it, expect } from 'vitest'
import { generateCode128Svg } from '../code128'

describe('Code 128 (Subset B) Barcode Generator', () => {
  it('generates a valid SVG barcode', () => {
    const svg = generateCode128Svg('CAM-RED-001', 30)
    expect(svg).toContain('<svg')
    expect(svg).toContain('viewBox="0 0')
    expect(svg).toContain('<rect')
    expect(svg).toContain('</svg>')
  })

  it('handles empty input gracefully', () => {
    const svg = generateCode128Svg('')
    expect(svg).toBe('<svg></svg>')
  })

  it('strips non-printable ASCII characters safely', () => {
    const svgClean = generateCode128Svg('FX3-001', 40)
    const svgWithControl = generateCode128Svg('FX3\x00-001\x1F', 40)
    expect(svgWithControl).toBe(svgClean)
  })
})
