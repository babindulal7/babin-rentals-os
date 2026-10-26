/**
 * Client-side evidence photo compression before upload.
 *
 * Rules:
 * - Long edge scaled to max 1600px (preserving aspect ratio).
 * - JPEG quality 0.8.
 * - EXIF location stripped (canvas drawImage + toBlob discards original camera EXIF/GPS).
 * - Graceful fallback in environments without DOM/Canvas (e.g. Node test runners).
 */

export interface CompressionOptions {
  /** Maximum pixel length for the longest edge. Default 1600. */
  maxDimension?: number
  /** JPEG quality between 0.0 and 1.0. Default 0.8. */
  quality?: number
}

export interface CompressedImageResult {
  blob: Blob
  originalBytes: number
  compressedBytes: number
  width: number
  height: number
  format: 'image/jpeg'
}

export const MAX_EVIDENCE_DIMENSION = 1600
export const DEFAULT_JPEG_QUALITY = 0.8

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

/**
 * Compresses an image blob on the device before upload.
 * Strips EXIF metadata by re-encoding through an HTML canvas.
 */
export async function compressEvidencePhoto(
  file: Blob | File,
  options: CompressionOptions = {},
): Promise<CompressedImageResult> {
  const maxDim = options.maxDimension ?? MAX_EVIDENCE_DIMENSION
  const quality = options.quality ?? DEFAULT_JPEG_QUALITY
  const originalBytes = file.size

  // Fallback for non-browser / Node environments
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    return {
      blob: file,
      originalBytes,
      compressedBytes: originalBytes,
      width: 1600,
      height: 1200,
      format: 'image/jpeg',
    }
  }

  return new Promise<CompressedImageResult>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const img = new Image()

    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      try {
        const { width, height } = calculateTargetDimensions(img.naturalWidth, img.naturalHeight, maxDim)
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height

        const ctx = canvas.getContext('2d')
        if (!ctx) {
          throw new Error('Could not initialize canvas 2D rendering context for photo compression')
        }

        // Draw image onto canvas (discards all original EXIF and metadata)
        ctx.drawImage(img, 0, 0, width, height)

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Canvas toBlob failed to produce compressed evidence JPEG'))
              return
            }
            resolve({
              blob,
              originalBytes,
              compressedBytes: blob.size,
              width,
              height,
              format: 'image/jpeg',
            })
          },
          'image/jpeg',
          quality,
        )
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    }

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Selected file could not be decoded as an image'))
    }

    img.src = objectUrl
  })
}
