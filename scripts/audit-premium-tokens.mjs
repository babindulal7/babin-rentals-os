// Report new presentation literals without rewriting source or guessing exceptions.
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const reference = process.argv[2] ?? '7af2870a'
const diff = execFileSync('git', ['diff', '--unified=0', reference, '--', 'src'], { encoding:'utf8', maxBuffer:10_000_000 })
const findings = []
let file = '', line = 0
const property = /\b(padding(?:[A-Z][a-z]+|-[a-z]+)?|gap|borderRadius|border-radius|boxShadow|box-shadow|fontSize|font-size|zIndex|z-index)\s*:\s*([^;}\n]+)/g
for (const text of diff.split('\n')) {
  if (text.startsWith('+++ b/')) { file = text.slice(6).trim(); continue }
  const hunk = text.match(/^@@.*\+(\d+)/)
  if (hunk) { line = Number(hunk[1]); continue }
  if (!text.startsWith('+') || text.startsWith('+++')) continue
  for (const match of text.matchAll(property)) {
    const value = match[2].trim()
    if (/var\(--/.test(value) || /^(?:['"]?0['"]?|none|inherit|transparent|undefined)[,;]?$/.test(value)) continue
    findings.push({file,line,property:match[1],value,review:'Review context; use a semantic token or document an existing geometry exception.'})
  }
  line++
}
const result = {reference,generatedAt:new Date().toISOString(),scope:'Added presentation declarations in src only; not a palette replacement or automatic fixer.',findings}
const out = path.resolve('docs/verification/premium-design/design-token-audit.json')
fs.mkdirSync(path.dirname(out), {recursive:true})
fs.writeFileSync(out, JSON.stringify(result,null,2)+'\n')
console.log(`${findings.length} new literal declarations require review. ${out}`)
