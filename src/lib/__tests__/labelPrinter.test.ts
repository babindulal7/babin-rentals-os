import { describe, it, expect } from 'vitest'
import { BinaryBitmap, HybridBinarizer, QRCodeReader, RGBLuminanceSource } from '@zxing/library'
import {
  generateCode128Svg,
  generateQrSvg,
  generateLabelHtml,
  LABEL_PRESETS,
  type LabelData,
} from '../labelPrinter'

describe('Asset Tag & Thermal Label Printer', () => {
  it('defines the three standard label presets', () => {
    expect(LABEL_PRESETS.standard.widthMm).toBe(50)
    expect(LABEL_PRESETS.standard.heightMm).toBe(25)
    expect(LABEL_PRESETS.case.widthMm).toBe(70)
    expect(LABEL_PRESETS.case.heightMm).toBe(35)
    expect(LABEL_PRESETS.cable.widthMm).toBe(30)
    expect(LABEL_PRESETS.cable.heightMm).toBe(15)
  })

  it('generates a valid Code 128 SVG string', () => {
    const svg = generateCode128Svg('CAM-RED-001', 30)
    expect(svg).toContain('<svg')
    expect(svg).toContain('viewBox="0 0')
    expect(svg).toContain('<rect')
    expect(svg).toContain('</svg>')
  })

  it('generates a genuine QR that ZXing decodes back to the same asset number', () => {
    const original = 'FX3-9941-SN'
    const svg = generateQrSvg(original)
    expect(svg).toContain('data-symbology="qr"')
    const dims = svg.match(/viewBox="0 0 (\d+) (\d+)"/)
    expect(dims).not.toBeNull()
    const width = Number(dims![1])
    const height = Number(dims![2])
    const pixels = new Uint8ClampedArray(width * height).fill(255)
    const rectangles = svg.matchAll(/<rect x="(\d+)" y="(\d+)" width="1" height="1"\/>/g)
    for (const match of rectangles) {
      pixels[Number(match[2]) * width + Number(match[1])] = 0
    }
    const bitmap = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(pixels, width, height)))
    expect(new QRCodeReader().decode(bitmap).getText()).toBe(original)
    expect(generateQrSvg('RS4-7712')).not.toBe(svg)
  })

  it('prints the requested real QR instead of always printing Code128', () => {
    const html = generateLabelHtml({
      assetCode: 'FX3-9941', title: 'Sony FX3', barcodeValue: 'FX3-9941', symbology: 'qr',
    }, 'case')
    expect(html).toContain('data-symbology="qr"')
    expect(html).toContain('70mm 35mm')
  })

  it('handles empty input gracefully', () => {
    const svg = generateCode128Svg('')
    expect(svg).toBe('<svg></svg>')
  })

  it('generates complete HTML document with print styling and metadata', () => {
    const data: LabelData = {
      assetCode: 'CAM-FX6-004',
      title: 'Sony FX6 Cinema Line',
      subtitle: 'Full Frame Cinema Camera',
      serialNo: '4001924',
      barcodeValue: 'CAM-FX6-004',
      orgName: 'BABIN RENTALS OS',
    }

    const html = generateLabelHtml(data, 'standard')
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('CAM-FX6-004')
    expect(html).toContain('Sony FX6 Cinema Line')
    expect(html).toContain('4001924')
    expect(html).toContain('@page')
    expect(html).toContain('50mm 25mm')
    expect(html).toContain('<svg')
  })

  it('escapes special HTML characters to prevent XSS and markup corruption', () => {
    const data: LabelData = {
      assetCode: 'CAM<1>&"TEST"',
      title: 'Camera & Rig <Ultra>',
      subtitle: 'Lens > 50mm & "Fast"',
      serialNo: 'SN<123>&',
      barcodeValue: 'BARCODE&123',
      orgName: 'BABIN & SONS <LTD>',
    }

    const html = generateLabelHtml(data, 'standard')
    expect(html).not.toContain('<Ultra>')
    expect(html).toContain('Camera &amp; Rig &lt;Ultra&gt;')
    expect(html).toContain('CAM&lt;1&gt;&amp;&quot;TEST&quot;')
    expect(html).toContain('Lens &gt; 50mm &amp; &quot;Fast&quot;')
    expect(html).toContain('BABIN &amp; SONS &lt;LTD&gt;')
  })
})
