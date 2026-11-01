import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { GATES, assertMatchesCi, commandText, runSequence, selectedGates, main } from './run-gates.mjs'

test('local verification list mirrors every CI gate and its order', () => {
  const yml = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')
  assert.equal(assertMatchesCi(yml), true)
  assert.equal(GATES.length, 16)
  assert.equal(commandText(GATES[12]), 'npm run lint:ui-copy')
})

test('CI drift rejects a removed UI-copy gate (never silently skip)', () => {
  const yml = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')
  assert.throws(() => assertMatchesCi(yml.replace('        run: npm run lint:ui-copy', '        run: npm run lint')), /CI drift/)
})

test('--quick skips only coverage and preserves all other gates', () => {
  const full = selectedGates(false)
  const quick = selectedGates(true)
  assert.equal(full.length, 16)
  assert.equal(quick.length, 15)
  assert.equal(quick.every((step, index) => step === full[index]), true)
  assert.equal(full[15].coverage, true)
})

test('first failed gate stops execution; later gates are not executed', async () => {
  const calls = []
  let clock = 0
  const results = await runSequence(GATES, async (gate) => {
    calls.push(gate.label)
    clock += 1500
    return calls.length === 3 ? 5 : 0
  }, () => clock)
  assert.equal(results.length, 3)
  assert.equal(results[2].code, 5)
  assert.equal(results[2].ms, 1500)
  assert.deepEqual(calls, GATES.slice(0, 3).map(g => g.label))
})

test('an executor exception also blocks subsequent gates', async () => {
  const calls = []
  const results = await runSequence(GATES, async (gate) => {
    calls.push(gate.label)
    throw new Error('mocked process spawn error')
  })
  assert.equal(results.length, 1)
  assert.equal(results[0].code, 1)
  assert.equal(calls.length, 1)
})

test('unknown flags are rejected before running any tasks', async () => {
  assert.equal(await main(['--not-allowed']), 2)
  assert.equal(await main(['--quick', '--quick']), 2)
})
