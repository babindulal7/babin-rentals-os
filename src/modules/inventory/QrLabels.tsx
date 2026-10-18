/**
 * QR & barcode labels — asset tags for equipment and cases.
 *
 * RULING 2026-10-18 (Babin's ruling): labels belong with the equipment, so the
 * generator moved here from Tools (which keeps calculators and the
 * cinematography suite). `/tools?tab=qr` redirects to this page. No money on
 * it, so every staff role that can open Inventory can print a tag.
 * Revert = route `/inventory/labels` away and restore the Tools tab.
 */
import { PageHeader } from '../../components/ui/Page'
import { PageShell } from '../../components/ui/PageShell'
import QrGenerator from '../tools/QrGeneratorModal'

export default function QrLabels() {
  return (
    <PageShell
      header={
        <PageHeader
          title="QR & Barcode Labels"
          description="Asset tags and printable labels for equipment, cases and serials."
        />
      }
    >
      <QrGenerator />
    </PageShell>
  )
}
