import crypto from 'node:crypto'

export function base32Decode(base32) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = 0
  let value = 0
  const output = []
  const clean = base32.replace(/=+$/, '').toUpperCase()
  for (let i = 0; i < clean.length; i++) {
    const idx = alphabet.indexOf(clean[i])
    if (idx === -1) continue
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(output)
}

export function generateTOTP(secret, timestamp = Date.now(), timeStep = 30) {
  const key = base32Decode(secret)
  const counter = Math.floor(timestamp / 1000 / timeStep)
  const buf = Buffer.alloc(8)
  buf.writeBigUInt64BE(BigInt(counter))
  const hmac = crypto.createHmac('sha1', key).update(buf).digest()
  const offset = hmac[hmac.length - 1] & 0x0f
  const code = (
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff)
  ) % 1000000
  return code.toString().padStart(6, '0')
}

// RFC 6238 test vector at T=59s (counter=1) with key '12345678901234567890' (base32: GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ):
// Expected code is 287082
const generated = generateTOTP('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 59000)
console.log('RFC 6238 vector test:', generated, 'Expected: 287082', generated === '287082' ? 'PASS' : 'FAIL')
if (generated !== '287082') process.exit(1)
