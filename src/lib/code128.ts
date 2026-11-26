/**
 * **Code 128 (Subset B) Barcode Generator**
 *
 * Lightweight, zero-dependency SVG barcode generator for thermal labels and
 * equipment asset tags. Renders purely as numeric SVG vectors.
 */

// Code 128B pattern table (values 0..106)
// Each pattern is an array of 6 bar/space widths that sum to 11 modules
const CODE128_PATTERNS: string[] = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213', // 0..9
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132', // 10..19
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211', // 20..29
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313', // 30..39
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331', // 40..49
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111', // 50..59
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214', // 60..69
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111', // 70..79
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141', // 80..89
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141', // 90..99
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112', // 100..106 (106 is STOP)
]

const START_B = 104
const STOP = 106

/**
 * Generates an SVG barcode string for Code 128 (Subset B)
 */
export function generateCode128Svg(text: string, height = 40): string {
  const clean = text.replace(/[^\x20-\x7E]/g, '')
  if (!clean) return '<svg></svg>'

  const values: number[] = [START_B]
  let checkSum = START_B

  for (let i = 0; i < clean.length; i++) {
    const codeVal = clean.charCodeAt(i) - 32
    values.push(codeVal)
    checkSum += codeVal * (i + 1)
  }

  const checkDigit = checkSum % 103
  values.push(checkDigit)
  values.push(STOP)

  let patternStr = ''
  for (const val of values) {
    patternStr += CODE128_PATTERNS[val] || '212222'
  }

  // Draw bars
  let x = 0
  let isBar = true
  const rects: string[] = []

  for (let i = 0; i < patternStr.length; i++) {
    const width = parseInt(patternStr[i] || '1', 10)
    if (isBar) {
      rects.push(`<rect x="${x}" y="0" width="${width}" height="${height}" fill="#000000" />`)
    }
    x += width
    isBar = !isBar
  }

  const totalWidth = x
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${height}" width="100%" height="${height}" preserveAspectRatio="none">${rects.join('')}</svg>`
}
