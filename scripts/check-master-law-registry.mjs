#!/usr/bin/env node
// Read-only structural check of the proposed master registry. Does not prove legal or runtime compliance.
// Run: node scripts/check-master-law-registry.mjs [--self-test]
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

function validateRegistry(source) {
  const errors = []
  const section = (n, next) => {
    const start = new RegExp('^## ' + n + '\\. ', 'm').exec(source)
    const end = new RegExp('^## ' + next + '\\. ', 'm').exec(source)
    if (!start || !end || end.index <= start.index) {
      errors.push('Missing or misordered registry section ' + n)
      return ''
    }
    return source.slice(start.index, end.index)
  }
  const rows = (n, next, pattern) => section(n, next).split('\n').map(line => {
    const cells = line.split('|').slice(1, -1).map(cell => cell.trim())
    return pattern.test(cells[0] || '') ? cells : null
  }).filter(Boolean)
  const core = rows(2, 3, /^[A-Z]+-\d+$/)
  const permissions = rows(3, 4, /^[A-Z]+-\d+$/)
  const tasks = rows(5, 6, /^RC-\d+$/)
  const unique = (values, label) => {
    if (new Set(values).size !== values.length) errors.push('Duplicate ' + label)
  }
  const exact = (values, expected, label) => {
    unique(values, label)
    if (values.length !== expected.length || expected.some(v => !values.includes(v))) errors.push('Missing or unexpected ' + label)
  }
  unique(core.map(row => row[0]), 'core stable identifier')
  unique(permissions.map(row => row[0]), 'permission stable identifier')
  exact(core.map(row => row[1]), Array.from({length: 16}, (_, i) => 'Law ' + (i+1)), 'legacy product law')
  const aliases = []
  for (const row of permissions) {
    const m = /^(both|PRODUCT|PERMISSIONS) P(\d+)$/.exec(row[1] || '')
    if (!m) { errors.push('Malformed permission alias: ' + row[1]); continue }
    for (const sourceName of m[1] === 'both' ? ['PRODUCT', 'PERMISSIONS'] : [m[1]]) aliases.push(sourceName + ' P' + m[2])
  }
  exact(aliases, ['PRODUCT','PERMISSIONS'].flatMap(s => Array.from({length:10}, (_, i) => s + ' P' + (i+1))), 'source-qualified permission alias')
  exact(tasks.map(row => row[0]), Array.from({length:14}, (_, i) => 'RC-' + String(i+1).padStart(2, '0')), 'repair track')
  for (const row of [...core, ...permissions, ...tasks]) {
    if (row.some(cell => cell.length === 0)) errors.push('Empty field in ' + row[0])
  }
  for (const row of tasks) {
    if (row.length !== 4 || !/^P[01]$/.test(row[1])) errors.push('Invalid priority or acceptance row ' + row[0])
  }
  return errors
}

const source = readFileSync(fileURLToPath(new URL('../docs/MASTER_LAW_REGISTRY.md', import.meta.url)), 'utf8')
const errors = validateRegistry(source)
if (process.argv.includes('--self-test')) {
  assert.deepEqual(errors, [], 'Baseline registry must be structurally valid')
  for (const [before, after] of [
    ['| RC-14 |', '| RC-13 |'],
    ['PRODUCT P8', 'PRODUCT P9'],
    ['| Law 16 |', '| Law 15 |'],
  ]) {
    assert.ok(source.includes(before), 'Mutation fixture is stale: ' + before)
    assert.ok(validateRegistry(source.replace(before, after)).length > 0, 'Guard missed: ' + before)
  }
  console.log('PASS: structural guard mutation tests')
}
for (const error of errors) console.error('FAIL: ' + error)
if (!errors.length) console.log('PASS: registry identifiers, aliases and repair rows')
process.exitCode = errors.length ? 1 : 0
