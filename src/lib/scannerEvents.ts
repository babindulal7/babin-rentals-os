/**
 * Lightweight scanner event dispatchers and constants.
 * No ZXing imports: this module is safe in the initial app bundle.
 *
 * ScannerFab loads through React.lazy. During a slow network load, the bottom
 * bar can dispatch an action before the component has attached its listeners.
 * Retain the pending intent and consume it exactly once at first registration.
 */
export const SCANNER_TOGGLE_EVENT = 'br:scanner:toggle'
export const ITEM_CARD_OPEN_EVENT = 'br:item-card:open'

let scannerToggleSubscribers = 0
let pendingToggleParity = false
let itemCardSubscribers = 0
let pendingItemCode: string | null = null

/** Open or close the single scanner. Early taps preserve toggle parity. */
export function toggleScanner(): void {
  if (typeof window === 'undefined') return
  if (scannerToggleSubscribers === 0) {
    pendingToggleParity = !pendingToggleParity
    return
  }
  window.dispatchEvent(new CustomEvent(SCANNER_TOGGLE_EVENT))
}

/** Subscribe after lazy module mount and replay at most one effective toggle. */
export function registerScannerToggleListener(listener: EventListener): () => void {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(SCANNER_TOGGLE_EVENT, listener)
  scannerToggleSubscribers++
  if (pendingToggleParity) {
    pendingToggleParity = false
    listener(new CustomEvent(SCANNER_TOGGLE_EVENT))
  }
  return () => {
    window.removeEventListener(SCANNER_TOGGLE_EVENT, listener)
    scannerToggleSubscribers = Math.max(0, scannerToggleSubscribers - 1)
  }
}

/** Open the rich item card for a barcode, QR, serial or asset code. */
export function openItemCard(code: string): void {
  if (typeof window === 'undefined' || !code.trim()) return
  if (itemCardSubscribers === 0) {
    // Last scan wins while the scanner chunk is still loading.
    pendingItemCode = code
    return
  }
  window.dispatchEvent(new CustomEvent(ITEM_CARD_OPEN_EVENT, { detail: { code } }))
}

/** Register the lazy card consumer and replay the most recent pending scan. */
export function registerItemCardListener(listener: EventListener): () => void {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(ITEM_CARD_OPEN_EVENT, listener)
  itemCardSubscribers++
  if (pendingItemCode !== null) {
    const code = pendingItemCode
    pendingItemCode = null
    listener(new CustomEvent(ITEM_CARD_OPEN_EVENT, { detail: { code } }))
  }
  return () => {
    window.removeEventListener(ITEM_CARD_OPEN_EVENT, listener)
    itemCardSubscribers = Math.max(0, itemCardSubscribers - 1)
  }
}
