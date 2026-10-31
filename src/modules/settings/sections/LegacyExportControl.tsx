import { useState, useEffect, useCallback } from 'react'
import { Button } from '../../../components/ui/Page'
import Icon from '../../../components/ui/Icon'
import { useToast } from '../../../components/ui/Toast'
import {
  getLegacyLocalEntriesSummary,
  downloadLegacyExport,
  isLegacyExportDismissed,
  resetLegacyExportDismissal,
  type LegacyExportSummary,
} from '../../../lib/legacyLocalExport'

/**
 * Settings ▸ System control for exporting legacy device entries (T4-06, Ruling D28, Law 3).
 * Always accessible from Settings even after Today card dismissal.
 */
export function LegacyExportControl() {
  const { showSuccessToast } = useToast()
  const [summary, setSummary] = useState<LegacyExportSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)
  const [isDismissed, setIsDismissed] = useState(() => isLegacyExportDismissed())

  const loadSummary = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getLegacyLocalEntriesSummary()
      setSummary(res)
    } catch {
      setSummary(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSummary()
  }, [loadSummary])

  const handleDownload = async () => {
    setDownloading(true)
    try {
      await downloadLegacyExport()
      showSuccessToast(
        'Export file downloaded',
        'Legacy device entries packaged for Babin. Original records remain intact on this device.'
      )
    } catch (err) {
      console.error('Failed to download legacy export:', err)
    } finally {
      setDownloading(false)
    }
  }

  const handleResetDismissal = () => {
    resetLegacyExportDismissal()
    setIsDismissed(false)
    showSuccessToast('Today notice restored', 'The legacy entries card will show on Today until dismissed again.')
  }

  const count = summary?.totalCount ?? 0

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        width: '100%',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 'var(--t-meta, 13px)', color: 'var(--text2)' }}>
          {loading ? (
            <span>Scanning device storage…</span>
          ) : count > 0 ? (
            <span>
              <strong className="font-mono tabular-nums">{count}</strong> old {count === 1 ? 'entry' : 'entries'} saved on this device
            </span>
          ) : (
            <span style={{ color: 'var(--muted)' }}>No unsynced legacy entries on this device</span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {count > 0 && isDismissed && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleResetDismissal}
              style={{ fontSize: '12px', minHeight: 32 }}
            >
              Restore Today notice
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            disabled={loading || downloading || count === 0}
            onClick={() => void handleDownload()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              minHeight: 'var(--tap, 44px)',
            }}
          >
            <Icon name="download" size={15} />
            {downloading ? 'Downloading…' : 'Download file for Babin'}
          </Button>
        </div>
      </div>
      <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
        Exports JSON + CSV bundle. Data stays on this device — nothing is deleted or auto-imported (Law 3, D28).
      </div>
    </div>
  )
}
