/**
 * **Asset Tag & Thermal Label Printing Engine**
 *
 * Generates pixel-perfect thermal barcode labels for equipment, serialized units,
 * flightcases, and cables. Includes an embedded, lightweight Code 128 barcode
 * generator that outputs clean SVG vectors with zero external runtime dependencies.
 */
import { BarcodeFormat, QRCodeWriter } from '@zxing/library'

export type LabelPreset = 'standard' | 'case' | 'cable'

export interface LabelDimensions {
  widthMm: number
  heightMm: number
  name: string
  description: string
}

export const LABEL_PRESETS: Record<LabelPreset, LabelDimensions> = {
  standard: {
    widthMm: 50,
    heightMm: 25,
    name: '50mm × 25mm (2" × 1")',
    description: 'Standard equipment & camera bodies',
  },
  case: {
    widthMm: 70,
    heightMm: 35,
    name: '70mm × 35mm (Case Tag)',
    description: 'Flightcases, pelicans & kit bags',
  },
  cable: {
    widthMm: 30,
    heightMm: 15,
    name: '30mm × 15mm (Accessory Tag)',
    description: 'Cables, batteries & small accessories',
  },
}

export interface LabelData {
  assetCode: string
  title: string
  subtitle?: string | undefined
  serialNo?: string | undefined
  barcodeValue: string
  /** Selects the actual encoded symbol on the printable label. */
  symbology?: 'qr' | 'code128' | undefined
  orgName?: string | undefined
  /** Renders PARTNER ⭐ badge on thermal label (T2-24, B13) */
  isPartner?: boolean | undefined
}

import { generateCode128Svg } from './code128'
export { generateCode128Svg }

/**
 * Offline, standards-compliant QR matrix rendered as SVG. Uses the ZXing
 * encoder already installed in the app. The output is numeric SVG geometry
 * only; the original asset text is NEVER inserted as markup.
 * ZXing supplies the required quiet zone inside the encoded matrix.
 */
export function generateQrSvg(text: string, size = 120): string {
  const clean = text.trim()
  if (!clean) return '<svg></svg>'
  const matrix = new QRCodeWriter().encode(clean, BarcodeFormat.QR_CODE, size, size, new Map())
  const width = matrix.getWidth()
  const height = matrix.getHeight()
  const cells: string[] = []
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (matrix.get(x, y)) cells.push(`<rect x="${x}" y="${y}" width="1" height="1"/>`)
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" data-symbology="qr" viewBox="0 0 ${width} ${height}" width="100%" height="${size}" preserveAspectRatio="xMidYMid meet" shape-rendering="crispEdges"><rect width="${width}" height="${height}" fill="#fff"/><g fill="#000">${cells.join('')}</g></svg>`
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Generates complete printable HTML document for thermal label printing.
 */
export function generateLabelHtml(data: LabelData, preset: LabelPreset = 'standard'): string {
  const dim = LABEL_PRESETS[preset]
  const barcodeSvg = data.symbology === 'qr'
    ? generateQrSvg(data.barcodeValue, preset === 'case' ? 78 : 52)
    : generateCode128Svg(data.barcodeValue, preset === 'cable' ? 24 : 36)
  const org = data.orgName || 'BABIN RENTALS OS · KATHMANDU'

  const safeAssetCode = escapeHtml(data.assetCode)
  const safeTitle = escapeHtml(data.title)
  const safeSubtitle = data.subtitle ? escapeHtml(data.subtitle) : ''
  const safeSerialNo = data.serialNo ? escapeHtml(data.serialNo) : ''
  const safeBarcodeValue = escapeHtml(data.barcodeValue)
  const safeOrg = escapeHtml(org)

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Label — ${safeAssetCode}</title>
<style>
  @page {
    size: ${dim.widthMm}mm ${dim.heightMm}mm;
    margin: 0;
  }
  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }
  body {
    width: ${dim.widthMm}mm;
    height: ${dim.heightMm}mm;
    background: #ffffff;
    color: #000000;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    overflow: hidden;
    padding: ${preset === 'cable' ? '1.5mm 2mm' : '2.5mm 3mm'};
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    border-bottom: 1px solid #000;
    padding-bottom: 1.5px;
    margin-bottom: 2px;
  }
  .org-name {
    font-size: ${preset === 'cable' ? '6px' : '7.5px'};
    font-weight: 700;
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }
  .asset-code {
    font-family: "Courier New", Courier, monospace;
    font-size: ${preset === 'cable' ? '8px' : '10px'};
    font-weight: 900;
  }
  .title-block {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    overflow: hidden;
  }
  .title {
    font-size: ${preset === 'cable' ? '8px' : preset === 'case' ? '12px' : '10px'};
    font-weight: 800;
    line-height: 1.15;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .subtitle {
    font-size: ${preset === 'cable' ? '6.5px' : '8px'};
    color: #333;
    margin-top: 1px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .barcode-wrap {
    width: 100%;
    margin-top: 2px;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .barcode-text {
    font-family: "Courier New", Courier, monospace;
    font-size: ${preset === 'cable' ? '6.5px' : '8px'};
    font-weight: 700;
    letter-spacing: 1px;
    margin-top: 1px;
  }
  @media print {
    body {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
  }
</style>
</head>
<body>
  <div class="header">
    <span class="org-name">${safeOrg}</span>
    <span class="asset-code">${safeAssetCode}</span>
  </div>
  <div class="title-block">
    ${data.isPartner ? `<div style="display:inline-block; font-size:${preset === 'cable' ? '6px' : '7.5px'}; font-weight:900; background:#000; color:#fff; padding:1px 4px; border-radius:2px; margin-bottom:2px; letter-spacing:0.5px;">PARTNER ⭐</div>` : ''}
    <div class="title">${safeTitle}</div>
    ${safeSubtitle || safeSerialNo ? `<div class="subtitle">${safeSubtitle}${safeSerialNo ? ` · SN: ${safeSerialNo}` : ''}</div>` : ''}
  </div>
  <div class="barcode-wrap">
    ${barcodeSvg}
    <div class="barcode-text">${safeBarcodeValue}</div>
  </div>
</body>
</html>`
}

/**
 * Triggers direct browser printing for the label.
 */
export function printLabel(data: LabelData, preset: LabelPreset = 'standard'): void {
  const html = generateLabelHtml(data, preset)
  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  document.body.appendChild(iframe)

  const doc = iframe.contentWindow?.document
  if (!doc) return

  doc.open()
  doc.write(html)
  doc.close()

  iframe.contentWindow?.focus()
  setTimeout(() => {
    iframe.contentWindow?.print()
    setTimeout(() => {
      document.body.removeChild(iframe)
    }, 1000)
  }, 250)
}
