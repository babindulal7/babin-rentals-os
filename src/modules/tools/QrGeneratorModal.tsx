/**
 * Equipment tag generator. QR and Code128 previews use the exact real
 * encoding functions used for printing. Never display simulated patterns.
 */
import { useMemo, useState } from 'react'
import { Card } from '../../components/ui/Page'
import { Button } from '../../components/ui/Button'
import Icon from '../../components/ui/Icon'
import { generateCode128Svg, generateQrSvg, printLabel } from '../../lib/labelPrinter'

const PRESET_ITEMS = [
  { name: 'Sony FX3 Body', serial: 'FX3-9941', category: 'Cameras' },
  { name: 'Sony FX6 Cinema', serial: 'FX6-2004', category: 'Cameras' },
  { name: 'NiSi Athena Prime 35mm', serial: 'ATH-35-08', category: 'Lenses' },
  { name: 'Aputure 600x Pro', serial: 'AP-600X-02', category: 'Lighting' },
  { name: 'DJI RS4 Pro Gimbal', serial: 'RS4-7712', category: 'Grip' },
]

export default function QrGenerator() {
  const [tagText, setTagText] = useState('FX3-9941')
  const [format, setFormat] = useState<'QR' | 'Barcode'>('QR')
  const assetCode = tagText.trim()
  const supported = assetCode.length > 0 && (format === 'QR' || /^[\\x20-\\x7E]+$/.test(assetCode))
  // Only numeric SVG geometry comes from these generators; asset text is never
  // interpolated into raw markup. A failure is shown as unavailable, not faked.
  const previewSvg = useMemo(() => {
    if (!supported) return null
    try {
      return format === 'QR' ? generateQrSvg(assetCode) : generateCode128Svg(assetCode)
    } catch {
      return null
    }
  }, [assetCode, format, supported])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
        Generate durable equipment asset tags and QR labels for cases and serial tracking.
        Works offline and encodes serial numbers for fast warehouse camera scanner recognition.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
        <div>
          <label htmlFor="qr-tag-text" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)' }}>Serial / Tag Number</label>
          <input
            id="qr-tag-text"
            type="text"
            maxLength={64}
            value={tagText}
            onChange={(e) => setTagText(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--text)',
              marginTop: '4px',
              fontFamily: 'var(--font-id, sans-serif)',
              fontVariantNumeric: 'tabular-nums',
            }}
          />

          <div style={{ marginTop: '10px' }}>
            <span style={{ fontSize: '11px', color: 'var(--text3)' }}>Quick Presets:</span>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
              {PRESET_ITEMS.map((item) => (
                <button
                  key={item.serial}
                  type="button"
                  onClick={() => setTagText(item.serial)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: 44,
                    minWidth: 44,
                    padding: '8px 12px',
                    borderRadius: 'var(--r-btn, 8px)',
                    fontSize: 'var(--t-meta, 12px)',
                    fontFamily: 'var(--font-id, inherit)',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    color: 'var(--text)',
                    cursor: 'pointer',
                  }}
                >
                  {item.serial}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: '6px' }}>
            Label Format
          </label>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {(['QR', 'Barcode'] as const).map((fmt) => (
              <button
                key={fmt}
                type="button"
                onClick={() => setFormat(fmt)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: 44,
                  padding: '8px 16px',
                  borderRadius: 'var(--r-btn, 8px)',
                  fontSize: 'var(--t-ui, 13px)',
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: format === fmt ? '1px solid var(--primary)' : '1px solid var(--border)',
                  background: format === fmt ? 'var(--select-bg)' : 'var(--surface)',
                  color: format === fmt ? 'var(--select-fg)' : 'var(--text2)',
                }}
              >
                {fmt === 'QR' ? '2D QR Code' : '1D Barcode'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Rendered Label Card */}
      <Card>
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
          <div style={{ background: '#fff', padding: '16px', borderRadius: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', textAlign: 'center' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: '#444', letterSpacing: '0.05em', marginBottom: '8px', textTransform: 'uppercase' }}>
              Babin Rentals · Asset ID
            </div>
            {previewSvg ? (
              <div
                role="img"
                aria-label={`${format === 'QR' ? 'QR code' : 'Code 128 barcode'} for ${assetCode}`}
                style={{ width: format === 'QR' ? 140 : 220, maxWidth: '100%' }}
                // Safe: generateQrSvg and generateCode128Svg produce only fixed
                // numeric rectangles from locally encoded matrices.
                dangerouslySetInnerHTML={{ __html: previewSvg }}
              />
            ) : (
              <p role="alert" style={{ fontSize: 12, color: '#942c22', maxWidth: 220 }}>
                {assetCode ? 'Cannot encode this tag in the selected format.' : 'Enter an asset ID to generate a scannable label.'}
              </p>
            )}
            <div style={{ fontSize: '13px', fontWeight: 700, fontFamily: 'var(--font-id, sans-serif)', fontVariantNumeric: 'tabular-nums', color: '#0A0A0A', marginTop: '8px' }}>
              {assetCode || 'No asset ID'}
            </div>
          </div>

          <Button
            disabled={previewSvg === null}
            onClick={() => {
              if (!previewSvg) return
              printLabel(
                {
                  assetCode,
                  title: assetCode,
                  barcodeValue: assetCode,
                  symbology: format === 'QR' ? 'qr' : 'code128',
                  orgName: 'BABIN RENTALS OS',
                },
                format === 'QR' ? 'case' : 'standard',
              )
            }}
          >
            <Icon name="download" size={14} />
            Print Tag Label
          </Button>
        </div>
      </Card>
    </div>
  )
}
