/** A new full-suite attempt invalidates old green evidence before Vitest starts. */
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beginVerification, finishVerification, testReceipt } from './test-receipt.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const coverage = args.includes('--coverage')
const outputArgument = args.find(arg => arg.startsWith('--outputFile='))
const output = outputArgument?.slice('--outputFile='.length) ?? join(root, 'artifacts', `test-run-${Date.now()}.json`)
mkdirSync(dirname(output), { recursive: true })
writeFileSync(output, '{}')
const command = `npm run ${coverage ? 'test:coverage' : 'test'}${args.length ? ` -- ${args.join(' ')}` : ''}`
const start = beginVerification(root, command, `local Vitest; data source=${process.env.VITE_DATA_SOURCE ?? 'default'}`)
const receiptPath = join(root, '.test-result.json')
writeFileSync(receiptPath, JSON.stringify(start, null, 2))
const reporting = args.includes('--reporter=json') ? []
  : args.some(arg => arg.startsWith('--reporter')) ? ['--reporter=json'] : ['--reporter=default', '--reporter=json']
const outputArgs = outputArgument ? [] : [`--outputFile=${output}`]
const child = spawn(process.execPath, [join(root, 'node_modules/vitest/vitest.mjs'), 'run', ...args, ...reporting, ...outputArgs], {
  cwd: root, env: process.env, stdio: 'inherit', windowsHide: true,
})
let code = await new Promise(resolve => { child.on('error', error => { console.error(error); resolve(1) }); child.on('close', code => resolve(code ?? 1)) })
const context = finishVerification(start, root, code === 0)
try {
  const receipt = testReceipt(JSON.parse(readFileSync(output, 'utf8')), code, start.sourceHash,
    context.sourceChanged ? 'changed' : start.sourceHash, context.at, context)
  writeFileSync(receiptPath, JSON.stringify(receipt, null, 2))
  if (coverage) writeFileSync(join(root, '.coverage-result.json'), JSON.stringify(receipt, null, 2))
} catch (error) {
  console.error(`Full suite did not produce valid evidence: ${error.message}`)
  writeFileSync(receiptPath, JSON.stringify({ ...context, valid: false, success: false }, null, 2))
  code = code || 1
}
process.exitCode = code
