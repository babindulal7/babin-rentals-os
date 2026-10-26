import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import Icon from './Icon'

export interface SignaturePadRef {
  /** Clear all strokes from the canvas. */
  clear: () => void
  /** True when no strokes have been drawn on the canvas. */
  isEmpty: () => boolean
  /** Export drawing as a data URL (default image/png). */
  toDataURL: (type?: string) => string
  /** Export drawing as a Blob. */
  toBlob: (callback: (blob: Blob | null) => void, type?: string) => void
  /** Export drawing as a PNG File. */
  toFile: (filename?: string) => Promise<File | null>
}

export interface SignaturePadProps {
  strokeColor?: string
  strokeWidth?: number
  height?: number
  disabled?: boolean
  guideText?: string
  onDrawChange?: (hasDrawn: boolean) => void
  className?: string
  ariaLabel?: string
}

interface Point {
  x: number
  y: number
}

/**
 * High-precision canvas signature pad for finger and stylus (Apple Pencil).
 *
 * Enforces:
 * - Touch-action: none so touches draw rather than scroll the viewport.
 * - Pointer capture so strokes continue smoothly past the canvas boundary.
 * - High-DPI canvas backing using window.devicePixelRatio.
 * - Refusal of blank pad (isEmpty() check).
 * - Minimum 44px touch target on clear control (Law 15).
 */
export const SignaturePad = forwardRef<SignaturePadRef, SignaturePadProps>(function SignaturePad(
  {
    strokeColor = 'var(--primary, #386af7)',
    strokeWidth = 2.5,
    height = 180,
    disabled = false,
    guideText = 'Sign above this line',
    onDrawChange,
    className,
    ariaLabel = 'Signature canvas',
  },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const strokesRef = useRef<Point[][]>([])
  const isDrawingRef = useRef(false)
  const [hasDrawnState, setHasDrawnState] = useState(false)

  const redrawStrokes = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      ctx.strokeStyle = strokeColor
      ctx.lineWidth = strokeWidth
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'

      for (const stroke of strokesRef.current) {
        if (stroke.length === 0) continue
        if (stroke.length === 1) {
          const pt = stroke[0]
          if (!pt) continue
          ctx.beginPath()
          ctx.arc(pt.x, pt.y, strokeWidth / 2, 0, Math.PI * 2)
          ctx.fillStyle = strokeColor
          ctx.fill()
          continue
        }

        ctx.beginPath()
        const first = stroke[0]
        if (!first) continue
        ctx.moveTo(first.x, first.y)
        for (let i = 1; i < stroke.length; i++) {
          const pt = stroke[i]
          if (pt) ctx.lineTo(pt.x, pt.y)
        }
        ctx.stroke()
      }
    },
    [strokeColor, strokeWidth],
  )

  const updateCanvasSize = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const rect = container.getBoundingClientRect()
    const width = rect.width > 0 ? rect.width : 480
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1

    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`

    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.scale(dpr, dpr)
      redrawStrokes(ctx)
    }
  }, [height, redrawStrokes])

  useEffect(() => {
    updateCanvasSize()
    if (typeof window === 'undefined') return

    const handleResize = () => {
      updateCanvasSize()
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [updateCanvasSize])

  const clear = useCallback(() => {
    strokesRef.current = []
    const canvas = canvasRef.current
    if (canvas) {
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
      }
    }
    setHasDrawnState(false)
    onDrawChange?.(false)
  }, [onDrawChange])

  const isEmpty = useCallback(() => {
    return (
      strokesRef.current.length === 0 ||
      strokesRef.current.every((stroke) => stroke.length === 0)
    )
  }, [])

  const toDataURL = useCallback((type = 'image/png') => {
    const canvas = canvasRef.current
    if (!canvas) return ''
    try {
      const url = canvas.toDataURL(type)
      return typeof url === 'string' ? url : ''
    } catch {
      return ''
    }
  }, [])

  const toBlob = useCallback((callback: (blob: Blob | null) => void, type = 'image/png') => {
    const canvas = canvasRef.current
    if (!canvas) {
      callback(null)
      return
    }
    if (typeof canvas.toBlob === 'function') {
      try {
        canvas.toBlob(callback, type)
        return
      } catch {
        // fallback
      }
    }
    try {
      const dataUrl = canvas.toDataURL(type)
      if (typeof dataUrl === 'string' && dataUrl.startsWith('data:')) {
        const [header, base64] = dataUrl.split(',')
        const mime = header?.match(/:(.*?);/)?.[1] || type
        const binary = atob(base64 || '')
        const array = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i)
        callback(new Blob([array], { type: mime }))
        return
      }
    } catch {
      // fallback
    }
    callback(null)
  }, [])

  const toFile = useCallback(
    async (filename = 'signature.png'): Promise<File | null> => {
      if (isEmpty()) return null
      return new Promise((resolve) => {
        toBlob((blob) => {
          if (!blob) {
            resolve(null)
            return
          }
          resolve(new File([blob], filename, { type: 'image/png' }))
        }, 'image/png')
      })
    },
    [isEmpty, toBlob],
  )

  useImperativeHandle(
    ref,
    () => ({
      clear,
      isEmpty,
      toDataURL,
      toBlob,
      toFile,
    }),
    [clear, isEmpty, toDataURL, toBlob, toFile],
  )

  const getCanvasPoint = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    }
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return
    e.preventDefault()
    e.stopPropagation()
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // safe fallback if pointer capture fails
    }

    isDrawingRef.current = true
    const pt = getCanvasPoint(e)
    strokesRef.current.push([pt])

    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (ctx) {
      ctx.strokeStyle = strokeColor
      ctx.lineWidth = strokeWidth
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      ctx.arc(pt.x, pt.y, strokeWidth / 2, 0, Math.PI * 2)
      ctx.fillStyle = strokeColor
      ctx.fill()
    }

    if (!hasDrawnState) {
      setHasDrawnState(true)
      onDrawChange?.(true)
    }
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || disabled) return
    e.preventDefault()
    e.stopPropagation()

    const pt = getCanvasPoint(e)
    const currentStroke = strokesRef.current[strokesRef.current.length - 1]
    if (!currentStroke) return

    currentStroke.push(pt)

    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx || currentStroke.length < 2) return

    const prev = currentStroke[currentStroke.length - 2]
    if (!prev) return

    ctx.beginPath()
    ctx.moveTo(prev.x, prev.y)
    ctx.lineTo(pt.x, pt.y)
    ctx.stroke()
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return
    e.preventDefault()
    e.stopPropagation()
    isDrawingRef.current = false
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // safe fallback
    }
  }

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        position: 'relative',
        width: '100%',
        borderRadius: 'var(--r-card, 8px)',
        border: '1px solid var(--border)',
        background: 'var(--input-bg, #090d16)',
        overflow: 'hidden',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={ariaLabel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{
          display: 'block',
          width: '100%',
          height: `${height}px`,
          touchAction: 'none',
          cursor: disabled ? 'not-allowed' : 'crosshair',
        }}
      />

      {/* Guide line and baseline prompt */}
      <div
        style={{
          position: 'absolute',
          bottom: 28,
          left: 20,
          right: 20,
          borderBottom: '1px dashed var(--border)',
          pointerEvents: 'none',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          paddingBottom: 4,
        }}
      >
        <span
          style={{
            fontSize: 11,
            color: 'var(--muted)',
            fontFamily: 'inherit',
            letterSpacing: '0.02em',
          }}
        >
          {guideText}
        </span>
        <span
          style={{
            fontSize: 10,
            color: 'var(--text2)',
            fontFamily: 'monospace',
          }}
        >
          ✕
        </span>
      </div>

      {/* Clear control (Law 15: minimum 44px hit floor) */}
      <div
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          display: 'flex',
          gap: 6,
        }}
      >
        <button
          type="button"
          onClick={clear}
          disabled={disabled || !hasDrawnState}
          aria-label="Clear signature"
          title="Clear signature pad"
          style={{
            minHeight: 'var(--tap, 44px)',
            minWidth: 'var(--tap, 44px)',
            height: 'var(--tap, 44px)',
            padding: '0 12px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            borderRadius: 'var(--r-xs, 6px)',
            border: '1px solid var(--border)',
            background: 'var(--card2)',
            color: hasDrawnState ? 'var(--text)' : 'var(--muted)',
            fontSize: 'var(--t-meta, 12px)',
            fontWeight: 600,
            cursor: disabled || !hasDrawnState ? 'not-allowed' : 'pointer',
            opacity: hasDrawnState ? 1 : 0.6,
            transition: 'opacity 0.15s ease',
          }}
        >
          <Icon name="x" size={14} />
          <span>Clear</span>
        </button>
      </div>
    </div>
  )
})
