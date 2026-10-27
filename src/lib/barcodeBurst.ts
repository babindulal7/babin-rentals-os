import { useEffect, useRef } from 'react'

/**
 * Hardware Barcode Scanner Burst Detector (T2-09, S14, W25, W72)
 *
 * iPad-compatible Bluetooth and USB scanners in HID (keyboard wedge) mode
 * transmit characters in a rapid burst (< 50ms per key) followed by Enter.
 *
 * This module:
 * 1. Distinguishes high-speed scanner bursts from human manual typing.
 * 2. Intercepts the scan globally on floor screens even if input lost focus (focus trap).
 * 3. Prevents double submits / duplicate triggers within a cooldown window.
 * 4. Ensures 50+ consecutive serial scans without missed or doubled strokes.
 */

export interface BarcodeBurstConfig {
  /** Callback fired with the trimmed scanned barcode string */
  onScan: (code: string) => void
  /** Minimum characters to qualify as a valid barcode (default: 3) */
  minChars?: number | undefined
  /** Maximum inter-character delay in ms to qualify as scanner burst (default: 50ms) */
  maxIntervalMs?: number | undefined
  /** Duplicate scan suppression window in ms to prevent double submit (default: 1200ms) */
  cooldownMs?: number | undefined
  /** Whether the global listener is currently enabled (default: true) */
  enabled?: boolean | undefined
  /** Whether to prevent default Enter form submit on valid burst (default: true) */
  preventDefaultOnScan?: boolean | undefined
  /** Target HTML input element to focus or sync when a burst begins */
  targetInputRef?: { current: HTMLInputElement | null } | undefined
}

interface ResolvedBarcodeBurstConfig {
  onScan: (code: string) => void
  minChars: number
  maxIntervalMs: number
  cooldownMs: number
  enabled: boolean
  preventDefaultOnScan: boolean
  targetInputRef?: { current: HTMLInputElement | null } | undefined
}

export class BarcodeBurstDetector {
  private buffer: Array<{ char: string; timestamp: number }> = []
  private lastScanCode: string | null = null
  private lastScanTime = 0
  private config: ResolvedBarcodeBurstConfig

  constructor(config: BarcodeBurstConfig) {
    this.config = {
      onScan: config.onScan,
      minChars: config.minChars ?? 3,
      maxIntervalMs: config.maxIntervalMs ?? 50,
      cooldownMs: config.cooldownMs ?? 1200,
      enabled: config.enabled ?? true,
      preventDefaultOnScan: config.preventDefaultOnScan ?? true,
      ...(config.targetInputRef ? { targetInputRef: config.targetInputRef } : {}),
    }
  }

  public updateConfig(newConfig: Partial<BarcodeBurstConfig>): void {
    if (newConfig.onScan !== undefined) this.config.onScan = newConfig.onScan
    if (newConfig.minChars !== undefined) this.config.minChars = newConfig.minChars
    if (newConfig.maxIntervalMs !== undefined) this.config.maxIntervalMs = newConfig.maxIntervalMs
    if (newConfig.cooldownMs !== undefined) this.config.cooldownMs = newConfig.cooldownMs
    if (newConfig.enabled !== undefined) this.config.enabled = newConfig.enabled
    if (newConfig.preventDefaultOnScan !== undefined) this.config.preventDefaultOnScan = newConfig.preventDefaultOnScan
    if (newConfig.targetInputRef !== undefined) this.config.targetInputRef = newConfig.targetInputRef
  }

  /**
   * Evaluates whether a given key event forms part of a hardware scanner burst.
   * Call this from window 'keydown' event listener.
   */
  public handleKeyDown(e: KeyboardEvent): boolean {
    if (!this.config.enabled) return false

    const now = Date.now()
    const key = e.key

    // Handle terminator (Enter or Return)
    if (key === 'Enter' || key === 'Return') {
      if (this.buffer.length >= this.config.minChars) {
        // Calculate average interval between characters
        const firstTime = this.buffer[0]?.timestamp ?? now
        const totalDuration = now - firstTime
        const avgInterval = totalDuration / Math.max(1, this.buffer.length)

        if (avgInterval <= this.config.maxIntervalMs) {
          const code = this.buffer.map((b) => b.char).join('').trim()
          this.buffer = []

          if (this.config.preventDefaultOnScan) {
            e.preventDefault()
            e.stopPropagation()
          }

          // Double submit / duplicate suppression check
          if (
            this.lastScanCode &&
            this.lastScanCode.toLowerCase() === code.toLowerCase() &&
            now - this.lastScanTime < this.config.cooldownMs
          ) {
            // Suppress duplicate double scan
            return true
          }

          this.lastScanCode = code
          this.lastScanTime = now
          this.config.onScan(code)

          if (this.config.targetInputRef?.current) {
            this.config.targetInputRef.current.focus()
          }
          return true
        }
      }
      this.buffer = []
      return false
    }

    // Skip control modifier combinations (e.g. Ctrl+C, Cmd+V, Alt+Tab)
    if (e.ctrlKey || e.metaKey || e.altKey) {
      return false
    }

    // Only process single printable characters
    if (key.length === 1) {
      // If elapsed time since last character is greater than 150ms, reset buffer (user paused or typed manually)
      const lastChar = this.buffer[this.buffer.length - 1]
      if (lastChar && now - lastChar.timestamp > 150) {
        this.buffer = []
      }

      // If active element is a multi-line textarea, only trap if arrival speed is fast
      const activeEl = typeof document !== 'undefined' ? document.activeElement : null
      const isTextArea =
        typeof HTMLTextAreaElement !== 'undefined' && activeEl instanceof HTMLTextAreaElement

      this.buffer.push({ char: key, timestamp: now })

      // Focus trap: If burst started while outside an input, redirect focus
      if (this.buffer.length >= 2 && !isTextArea && this.config.targetInputRef?.current) {
        if (typeof document === 'undefined' || document.activeElement !== this.config.targetInputRef.current) {
          this.config.targetInputRef.current.focus()
        }
      }

      return false
    }

    return false
  }

  public clear(): void {
    this.buffer = []
  }

  public resetCooldown(): void {
    this.lastScanCode = null
    this.lastScanTime = 0
  }
}

/**
 * React hook to attach a global barcode burst listener (T2-09).
 */
export function useBarcodeBurst(config: BarcodeBurstConfig): {
  detector: BarcodeBurstDetector
  resetCooldown: () => void
} {
  const onScanRef = useRef(config.onScan)
  onScanRef.current = config.onScan

  const targetInputRef = config.targetInputRef

  const detectorRef = useRef<BarcodeBurstDetector | null>(null)
  if (!detectorRef.current) {
    detectorRef.current = new BarcodeBurstDetector({
      ...config,
      onScan: (code) => onScanRef.current(code),
    })
  }

  useEffect(() => {
    detectorRef.current?.updateConfig({
      ...(config.minChars !== undefined ? { minChars: config.minChars } : {}),
      ...(config.maxIntervalMs !== undefined ? { maxIntervalMs: config.maxIntervalMs } : {}),
      ...(config.cooldownMs !== undefined ? { cooldownMs: config.cooldownMs } : {}),
      ...(config.enabled !== undefined ? { enabled: config.enabled } : {}),
      ...(config.preventDefaultOnScan !== undefined ? { preventDefaultOnScan: config.preventDefaultOnScan } : {}),
      ...(targetInputRef !== undefined ? { targetInputRef } : {}),
    })
  }, [
    config.minChars,
    config.maxIntervalMs,
    config.cooldownMs,
    config.enabled,
    config.preventDefaultOnScan,
    targetInputRef,
  ])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      detectorRef.current?.handleKeyDown(e)
    }

    window.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true })
    }
  }, [])

  return {
    detector: detectorRef.current,
    resetCooldown: () => detectorRef.current?.resetCooldown(),
  }
}

