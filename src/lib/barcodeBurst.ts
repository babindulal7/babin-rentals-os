import { useEffect, useLayoutEffect, useRef } from 'react'

/** Recognize HID scanner keystrokes without treating ordinary editing as a scan. */
export interface BarcodeBurstConfig {
  onScan: (code: string) => void
  minChars?: number | undefined
  maxIntervalMs?: number | undefined
  cooldownMs?: number | undefined
  enabled?: boolean | undefined
  preventDefaultOnScan?: boolean | undefined
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
    if (
      (newConfig.enabled !== undefined && newConfig.enabled !== this.config.enabled) ||
      ('targetInputRef' in newConfig && newConfig.targetInputRef !== this.config.targetInputRef) ||
      (newConfig.minChars !== undefined && newConfig.minChars !== this.config.minChars) ||
      (newConfig.maxIntervalMs !== undefined && newConfig.maxIntervalMs !== this.config.maxIntervalMs)
    ) this.clear()

    if (newConfig.onScan !== undefined) this.config.onScan = newConfig.onScan
    if (newConfig.minChars !== undefined) this.config.minChars = newConfig.minChars
    if (newConfig.maxIntervalMs !== undefined) this.config.maxIntervalMs = newConfig.maxIntervalMs
    if (newConfig.cooldownMs !== undefined) this.config.cooldownMs = newConfig.cooldownMs
    if (newConfig.enabled !== undefined) this.config.enabled = newConfig.enabled
    if (newConfig.preventDefaultOnScan !== undefined) this.config.preventDefaultOnScan = newConfig.preventDefaultOnScan
    if ('targetInputRef' in newConfig) this.config.targetInputRef = newConfig.targetInputRef
  }

  private acceptsTarget(e: KeyboardEvent): boolean {
    if (typeof document === 'undefined') return true

    const scanInput = this.config.targetInputRef?.current
    const target = e.target instanceof Element ? e.target : document.activeElement
    const dialogs = document.querySelectorAll('[aria-modal="true"], dialog[open]')
    const activeDialog = dialogs[dialogs.length - 1]
    if (activeDialog && (!scanInput || !activeDialog.contains(scanInput))) return false

    return !target?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]') || target === scanInput
  }

  public handleKeyDown(e: KeyboardEvent): boolean {
    if (
      !this.config.enabled || e.defaultPrevented || e.isComposing || e.repeat ||
      e.ctrlKey || e.metaKey || e.altKey || !this.acceptsTarget(e)
    ) {
      this.clear()
      return false
    }

    const now = Date.now()
    const key = e.key
    const lastChar = this.buffer[this.buffer.length - 1]
    if (lastChar && now - lastChar.timestamp > this.config.maxIntervalMs) this.clear()

    if (key === 'Enter' || key === 'Return') {
      if (this.buffer.length < this.config.minChars) {
        this.clear()
        return false
      }
      const code = this.buffer.map((item) => item.char).join('').trim()
      this.clear()
      if (!code) return false

      if (this.config.preventDefaultOnScan) {
        e.preventDefault()
        e.stopPropagation()
      }
      if (
        this.lastScanCode?.toLowerCase() === code.toLowerCase() &&
        now - this.lastScanTime < this.config.cooldownMs
      ) return true

      this.lastScanCode = code
      this.lastScanTime = now
      this.config.onScan(code)
      this.config.targetInputRef?.current?.focus()
      return true
    }

    if (key.length !== 1) {
      this.clear()
      return false
    }
    this.buffer.push({ char: key, timestamp: now })

    // Every buffered interval is fast; ordinary typing cannot redirect focus.
    const scanInput = this.config.targetInputRef?.current
    if (
      this.buffer.length >= this.config.minChars && scanInput &&
      (typeof document === 'undefined' || document.activeElement !== scanInput)
    ) scanInput.focus()
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
      minChars: config.minChars ?? 3,
      maxIntervalMs: config.maxIntervalMs ?? 50,
      cooldownMs: config.cooldownMs ?? 1200,
      enabled: config.enabled ?? true,
      preventDefaultOnScan: config.preventDefaultOnScan ?? true,
      targetInputRef,
    })
  }, [config.minChars, config.maxIntervalMs, config.cooldownMs, config.enabled, config.preventDefaultOnScan, targetInputRef])

  // Suspense hides a mounted floor by cleaning up layout effects, not passive effects.
  useLayoutEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => detectorRef.current?.handleKeyDown(e)
    window.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true })
      detectorRef.current?.clear()
    }
  }, [])

  return {
    detector: detectorRef.current,
    resetCooldown: () => detectorRef.current?.resetCooldown(),
  }
}
