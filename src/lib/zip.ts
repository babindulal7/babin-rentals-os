/**
 * Minimal, zero-dependency ZIP archive generator (RFC 1950 / PKZIP 2.0 uncompressed STORE).
 * Suitable for bundling CSVs, text summaries, and PDF documents.
 */

export interface ZipFileInput {
  filename: string
  data: Uint8Array | string
  date?: Date
}

// Precomputed CRC-32 lookup table (standard IEEE 802.3 polynomial: 0xEDB88320)
const CRC_TABLE = new Uint32Array(256)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  }
  CRC_TABLE[n] = c >>> 0
}

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ (bytes[i] ?? 0)) & 0xff]! ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

/**
 * Creates a standard PKZIP 2.0 uncompressed (STORE) archive.
 */
export function createZip(files: ZipFileInput[]): Uint8Array {
  const encoder = new TextEncoder()

  interface ProcessedFile {
    filenameBytes: Uint8Array
    dataBytes: Uint8Array
    crc: number
    dosTime: number
    dosDate: number
    offset: number
  }

  const processed: ProcessedFile[] = []
  let localHeadersSize = 0

  for (const file of files) {
    const filenameBytes = encoder.encode(file.filename)
    const dataBytes =
      typeof file.data === 'string' ? encoder.encode(file.data) : file.data
    const crc = crc32(dataBytes)

    const d = file.date ?? new Date()
    const dosTime =
      (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)
    const dosDate =
      ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()

    processed.push({
      filenameBytes,
      dataBytes,
      crc,
      dosTime,
      dosDate,
      offset: 0,
    })

    // Local header: 30 bytes + filename.length + data.length
    localHeadersSize += 30 + filenameBytes.length + dataBytes.length
  }

  let centralDirSize = 0
  for (const p of processed) {
    // Central directory header: 46 bytes + filename.length
    centralDirSize += 46 + p.filenameBytes.length
  }

  // End of Central Directory: 22 bytes
  const totalSize = localHeadersSize + centralDirSize + 22
  const out = new Uint8Array(totalSize)
  const view = new DataView(out.buffer)

  let cursor = 0

  // 1. Write Local File Headers + File Data
  for (const p of processed) {
    p.offset = cursor

    // Signature: 0x04034b50 (PK\x03\x04)
    view.setUint32(cursor, 0x04034b50, true)
    cursor += 4

    // Version needed: 20
    view.setUint16(cursor, 20, true)
    cursor += 2

    // Bit flag: UTF-8 (0x0800)
    view.setUint16(cursor, 0x0800, true)
    cursor += 2

    // Compression method: 0 (STORE)
    view.setUint16(cursor, 0, true)
    cursor += 2

    // Last mod time & date
    view.setUint16(cursor, p.dosTime, true)
    cursor += 2
    view.setUint16(cursor, p.dosDate, true)
    cursor += 2

    // CRC-32
    view.setUint32(cursor, p.crc, true)
    cursor += 4

    // Compressed size
    view.setUint32(cursor, p.dataBytes.length, true)
    cursor += 4

    // Uncompressed size
    view.setUint32(cursor, p.dataBytes.length, true)
    cursor += 4

    // Filename length
    view.setUint16(cursor, p.filenameBytes.length, true)
    cursor += 2

    // Extra field length
    view.setUint16(cursor, 0, true)
    cursor += 2

    // Filename
    out.set(p.filenameBytes, cursor)
    cursor += p.filenameBytes.length

    // Data
    out.set(p.dataBytes, cursor)
    cursor += p.dataBytes.length
  }

  // 2. Write Central Directory
  const centralDirStart = cursor

  for (const p of processed) {
    // Signature: 0x02014b50 (PK\x01\x02)
    view.setUint32(cursor, 0x02014b50, true)
    cursor += 4

    // Version made by: 20
    view.setUint16(cursor, 20, true)
    cursor += 2

    // Version needed: 20
    view.setUint16(cursor, 20, true)
    cursor += 2

    // Bit flag: UTF-8 (0x0800)
    view.setUint16(cursor, 0x0800, true)
    cursor += 2

    // Compression method: 0 (STORE)
    view.setUint16(cursor, 0, true)
    cursor += 2

    // Last mod time & date
    view.setUint16(cursor, p.dosTime, true)
    cursor += 2
    view.setUint16(cursor, p.dosDate, true)
    cursor += 2

    // CRC-32
    view.setUint32(cursor, p.crc, true)
    cursor += 4

    // Compressed size
    view.setUint32(cursor, p.dataBytes.length, true)
    cursor += 4

    // Uncompressed size
    view.setUint32(cursor, p.dataBytes.length, true)
    cursor += 4

    // Filename length
    view.setUint16(cursor, p.filenameBytes.length, true)
    cursor += 2

    // Extra field length: 0
    view.setUint16(cursor, 0, true)
    cursor += 2

    // Comment length: 0
    view.setUint16(cursor, 0, true)
    cursor += 2

    // Disk number start: 0
    view.setUint16(cursor, 0, true)
    cursor += 2

    // Internal file attributes: 0
    view.setUint16(cursor, 0, true)
    cursor += 2

    // External file attributes: 0
    view.setUint32(cursor, 0, true)
    cursor += 4

    // Relative offset of local header
    view.setUint32(cursor, p.offset, true)
    cursor += 4

    // Filename
    out.set(p.filenameBytes, cursor)
    cursor += p.filenameBytes.length
  }

  // 3. Write End of Central Directory (EOCD)
  // Signature: 0x06054b50 (PK\x05\x06)
  view.setUint32(cursor, 0x06054b50, true)
  cursor += 4

  // Number of this disk: 0
  view.setUint16(cursor, 0, true)
  cursor += 2

  // Disk with start of CD: 0
  view.setUint16(cursor, 0, true)
  cursor += 2

  // Total entries on this disk
  view.setUint16(cursor, processed.length, true)
  cursor += 2

  // Total entries in CD
  view.setUint16(cursor, processed.length, true)
  cursor += 2

  // Size of CD
  view.setUint32(cursor, centralDirSize, true)
  cursor += 4

  // Offset of CD
  view.setUint32(cursor, centralDirStart, true)
  cursor += 4

  // Comment length: 0
  view.setUint16(cursor, 0, true)
  cursor += 2

  return out
}
