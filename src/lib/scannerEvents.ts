/**
 * Lightweight scanner event dispatchers and constants.
 * Extracted from ScannerFab to allow components like BottomBar and CommandPalette
 * to dispatch scanner toggle and item card events without eagerly bundling ScannerFab
 * and its heavy scanner dependencies into the critical-path main shell chunk.
 */

export const SCANNER_TOGGLE_EVENT = 'br:scanner:toggle'

/** Open or close the single Scanner from anywhere. */
export function toggleScanner(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SCANNER_TOGGLE_EVENT))
  }
}

export const ITEM_CARD_OPEN_EVENT = 'br:item-card:open'

/** Opens the rich item card for any equipment barcode, QR, serial, or asset code (T2-14, W91). */
export function openItemCard(code: string): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(ITEM_CARD_OPEN_EVENT, { detail: { code } }))
  }
}
