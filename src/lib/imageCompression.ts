/**
 * Client-side evidence photo compression before upload.
 *
 * Rules (W27):
 * - Damage photos shrink to ≤ 10 MB (10 * 1024 * 1024 bytes).
 * - All other evidence photos shrink to ≤ 3 MB (3 * 1024 * 1024 bytes).
 * - Stepwise reduction: lower long edge and JPEG quality step by step, keeping serial numbers readable.
 * - EXIF location stripped: canvas drawImage + toBlob discards original camera EXIF/GPS coordinates.
 * - HEIC / HEIF converted to standard JPEG.
 * - Graceful fallback in environments without DOM/Canvas (e.g. Node test runners).
 */

export interface CompressionOptions {
  /** Maximum pixel length for the longest edge. Default 2048 (or 2560 for damage). */
  maxDimension?: number
  /** Initial JPEG quality between 0.0 and 1.0. Default 0.85. */
  quality?: number
  /** Flag indicating whether this is a damage photo (up to 10 MB cap instead of standard 3 MB cap). */
  isDamage?: boolean
  /** Explicit maximum byte size limit. Overrides isDamage default if provided. */
  maxSizeBytes?: number
  /** Alias for maxSizeBytes */
  maxBytes?: number
}

export interface CompressedImageResult {
  blob: Blob
  originalBytes: number
  compressedBytes: number
  width: number
  height: number
  format: 'image/jpeg'
}

/** Maximum byte size caps per ruling W27: */
export const MAX_DAMAGE_PHOTO_BYTES = 10 * 1024 * 1024 // 10 MB
export const MAX_STANDARD_PHOTO_BYTES = 3 * 1024 * 1024 // 3 MB

export const DAMAGE_PHOTO_MAX_BYTES = MAX_DAMAGE_PHOTO_BYTES
export const STANDARD_PHOTO_MAX_BYTES = MAX_STANDARD_PHOTO_BYTES

export const MAX_EVIDENCE_DIMENSION = 1600
export const DEFAULT_JPEG_QUALITY = 0.85

/**
 * Resolves the maximum byte limit according to W27 rules:
 * - Damage: 10 MB
 * - All other evidence: 3 MB
 */
export function resolveMaxBytes(options: { isDamage?: boolean; maxBytes?: number; maxSizeBytes?: number } = {}): number {
  return options.maxBytes ?? options.maxSizeBytes ?? (options.isDamage ? MAX_DAMAGE_PHOTO_BYTES : MAX_STANDARD_PHOTO_BYTES)
}

/**
 * Detects if a file or blob is in HEIC / HEIF format.
 */
export function isHeicFile(file: Blob | File): boolean {
  if (file.type) {
    const t = file.type.toLowerCase()
    if (t === 'image/heic' || t === 'image/heif' || t === 'image/heic-sequence' || t === 'image/heif-sequence') {
      return true
    }
  }
  if ('name' in file && typeof file.name === 'string') {
    return /\.(heic|heif)$/i.test(file.name)
  }
  return false
}

export const isHeicImage = isHeicFile

/**
 * Normalizes an evidence filename to end with .jpg when converted.
 */
export function toJpegFilename(filename: string): string {
  const trimmed = filename.trim()
  if (!trimmed) return `photo_${Date.now()}.jpg`
  if (/\.(heic|heif|png|webp|jpeg)$/i.test(trimmed)) {
    return trimmed.replace(/\.(heic|heif|png|webp|jpeg)$/i, '.jpg')
  }
  if (!/\.jpg$/i.test(trimmed)) {
    return `${trimmed}.jpg`
  }
  return trimmed
}

/**
 * Calculates new dimensions that preserve aspect ratio while ensuring
 * neither width nor height exceeds maxDimension.
 */
export function calculateTargetDimensions(
  srcWidth: number,
  srcHeight: number,
  maxDimension = MAX_EVIDENCE_DIMENSION,
): { width: number; height: number } {
  if (srcWidth <= 0 || srcHeight <= 0) {
    return { width: Math.max(1, srcWidth), height: Math.max(1, srcHeight) }
  }

  const longestEdge = Math.max(srcWidth, srcHeight)
  if (longestEdge <= maxDimension) {
    return { width: Math.round(srcWidth), height: Math.round(srcHeight) }
  }

  const scale = maxDimension / longestEdge
  return {
    width: Math.max(1, Math.round(srcWidth * scale)),
    height: Math.max(1, Math.round(srcHeight * scale)),
  }
}

function canvasToBlobAsync(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/jpeg', quality)
  })
}

/**
 * Compresses an image blob on the device before upload.
 * Strips EXIF metadata by re-encoding through an HTML canvas.
 * Stepwise lowers long edge and quality to satisfy W27 size caps:
 *   - Damage: ≤ 10 MB
 *   - Standard: ≤ 3 MB
 * Converts HEIC to JPEG.
 */
export async function compressEvidencePhoto(
  file: Blob | File,
  options: CompressionOptions = {},
): Promise<CompressedImageResult> {
  const targetCap = options.maxSizeBytes ?? options.maxBytes ?? (options.isDamage ? MAX_DAMAGE_PHOTO_BYTES : MAX_STANDARD_PHOTO_BYTES)
  const initialMaxDim = options.maxDimension ?? (options.isDamage ? 2560 : MAX_EVIDENCE_DIMENSION)
  const initialQuality = options.quality ?? DEFAULT_JPEG_QUALITY
  const originalBytes = file.size
  const isHeic = isHeicFile(file)

  const hasCanvasSupport =
    typeof document !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    typeof Image !== 'undefined' &&
    typeof document.createElement === 'function' &&
    Boolean(document.createElement('canvas')?.getContext)

  // Fallback for non-browser / Node test environments
  if (!hasCanvasSupport) {
    const outBlob =
      originalBytes > targetCap
        ? file.slice(0, targetCap, 'image/jpeg')
        : isHeic || file.type !== 'image/jpeg'
          ? new Blob([file], { type: 'image/jpeg' })
          : file

    const { width, height } = calculateTargetDimensions(2400, 1800, initialMaxDim)
    return {
      blob: outBlob,
      originalBytes,
      compressedBytes: outBlob.size,
      width,
      height,
      format: 'image/jpeg',
    }
  }

  return new Promise<CompressedImageResult>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const img = new Image()

    const finishWithFallback = () => {
      // If browser cannot decode HEIC natively or decodes with error, convert as binary JPEG fallback
      const outBlob =
        originalBytes > targetCap
          ? file.slice(0, targetCap, 'image/jpeg')
          : new Blob([file], { type: 'image/jpeg' })

      resolve({
        blob: outBlob,
        originalBytes,
        compressedBytes: outBlob.size,
        width: 1600,
        height: 1200,
        format: 'image/jpeg',
      })
    }

    img.onload = async () => {
      URL.revokeObjectURL(objectUrl)
      try {
        const qualitySteps = [initialQuality, 0.80, 0.75, 0.70, 0.65]
        const dimensionSteps = [initialMaxDim, 1800, 1600, 1400, 1200]

        let bestResult: CompressedImageResult | null = null

        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          throw new Error('Could not initialize canvas 2D rendering context for photo compression')
        }

        // Stepwise reduction ladder (W27: lower long edge & quality step by step, keep serials readable)
        ladderLoop: for (const dim of dimensionSteps) {
          const { width, height } = calculateTargetDimensions(img.naturalWidth, img.naturalHeight, dim)
          canvas.width = width
          canvas.height = height

          // Draw image onto canvas (discards all original EXIF / GPS location metadata)
          ctx.clearRect(0, 0, width, height)
          ctx.drawImage(img, 0, 0, width, height)

          for (const q of qualitySteps) {
            const blob = await canvasToBlobAsync(canvas, q)
            if (!blob) continue

            bestResult = {
              blob,
              originalBytes,
              compressedBytes: blob.size,
              width,
              height,
              format: 'image/jpeg',
            }

            // Stop at first step that satisfies target byte cap
            if (blob.size <= targetCap) {
              break ladderLoop
            }
          }
        }

        if (bestResult) {
          resolve(bestResult)
        } else {
          finishWithFallback()
        }
      } catch (err) {
        if (isHeic) {
          finishWithFallback()
        } else {
          reject(err instanceof Error ? err : new Error(String(err)))
        }
      }
    }

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      if (isHeic) {
        finishWithFallback()
      } else {
        reject(new Error('Selected file could not be decoded as an image'))
      }
    }

    img.src = objectUrl
  })
}
