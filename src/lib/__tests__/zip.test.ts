import { describe, it, expect } from 'vitest'
import { createZip, crc32 } from '../zip'
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import os from 'os'

describe('createZip (zero-dependency PKZIP generator)', () => {
  it('calculates correct CRC-32 for sample strings', () => {
    const encoder = new TextEncoder()
    expect(crc32(encoder.encode('123456789'))).toBe(0xcbf43926)
    expect(crc32(encoder.encode(''))).toBe(0)
  })

  it('generates a standard zip archive that unpacks cleanly with unzip -t', () => {
    const zipBytes = createZip([
      {
        filename: 'sales_register_2083-04.csv',
        data: 'Date (BS),Date (AD),Invoice No,Buyer Name,Buyer PAN,Total Amount\n2083-04-01,2026-07-16,INV-001,Client A,123456789,11300.00\n',
      },
      {
        filename: 'summary.txt',
        data: 'Summary of accounts for Shrawan 2083.\nAll figures verified to the paisa.\n',
      },
      {
        filename: 'invoices/INV-001.txt',
        data: 'Simulated invoice PDF/text\n',
      },
    ])

    expect(zipBytes.length).toBeGreaterThan(100)
    // Check PK\x03\x04 at start
    expect(zipBytes[0]).toBe(0x50)
    expect(zipBytes[1]).toBe(0x4b)
    expect(zipBytes[2]).toBe(0x03)
    expect(zipBytes[3]).toBe(0x04)

    // Write to a temp file to run standard unzip test
    const tmpPath = path.join(os.tmpdir(), `test-zip-${Date.now()}.zip`)
    try {
      fs.writeFileSync(tmpPath, Buffer.from(zipBytes))
      const res = execSync(`unzip -t "${tmpPath}"`, { encoding: 'utf-8' })
      expect(res).toContain('No errors detected')
      expect(res).toContain('sales_register_2083-04.csv')
      expect(res).toContain('summary.txt')
      expect(res).toContain('invoices/INV-001.txt')
    } finally {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath)
    }
  })
})
