import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compareCutoverSnapshots } from './compare-cutover-snapshots.mjs'

const row = (entity, externalId, fields = {}) => ({ entity, externalId, fields })

test('compares by entity and external ID and reports counts without field values', () => {
  const source = [
    row('product', 'p1', { slug: 'camera', pricing: { days: 3, paisa: 120000 } }),
    row('client', 'p1', { email: 'private@example.test' }),
    row('seasonal_rule', 's1', { endsAt: '2027-01-01' }),
  ]
  const os = [
    row('product', 'p1', { pricing: { paisa: 120000, days: 3 }, slug: 'camera' }),
    row('seasonal_rule', 's1', { endsAt: '2027-01-02' }),
    row('bundle', 'b1'),
  ]
  const report = compareCutoverSnapshots(source, os)
  assert.deepEqual(report.rows.map(item => item.status), ['unchanged', 'new', 'updated', 'osOnly'])
  assert.deepEqual(report.counts.seasonal_rule, { new: 0, updated: 1, unchanged: 0, conflict: 0, osOnly: 0 })
  assert.doesNotMatch(JSON.stringify(report), /private@example|120000/)
})

test('duplicates on either side are conflicts even when their fields agree', () => {
  const client = row('client', 'c1')
  const bundle = row('bundle', 'b1')
  const report = compareCutoverSnapshots([client, client], [bundle, bundle])
  assert.deepEqual(report.rows.map(item => item.status), ['conflict', 'conflict'])
})

test('rejects malformed rows instead of classifying them as new', () => {
  assert.throws(() => compareCutoverSnapshots([row('product', '')], []), /Booqable snapshot row 1/)
  assert.throws(() => compareCutoverSnapshots([], [row('product', 'p1', [])]), /OS snapshot row 1/)
})

test('compares bundle membership and pricing steps as normalized fields', () => {
  const source = [
    row('bundle', 'b1', { members: [{ externalId: 'p1', quantity: 2 }] }),
    row('pricing_structure', 'r1', { steps: [{ days: 3, paisa: 50000 }] }),
  ]
  const os = [
    row('bundle', 'b1', { members: [{ externalId: 'p1', quantity: 1 }] }),
    row('pricing_structure', 'r1', { steps: [{ days: 3, paisa: 50000 }] }),
  ]
  const report = compareCutoverSnapshots(source, os)
  assert.deepEqual(report.rows.map(item => item.status), ['updated', 'unchanged'])
})

test('identifies changed, added and removed field names without exposing values', () => {
  const report = compareCutoverSnapshots([
    row('client', 'c1', { name: 'Private new name', email: 'private@example.test',
      address: { city: 'Private new city' }, phone: 'Private unchanged phone' }),
  ], [
    row('client', 'c1', { name: 'Private old name', company: 'Private old company',
      address: { city: 'Private old city' }, phone: 'Private unchanged phone' }),
  ])
  assert.deepEqual(report.rows, [{ entity: 'client', externalId: 'c1', status: 'updated',
    changedFields: ['address', 'company', 'email', 'name'] }])
  assert.doesNotMatch(JSON.stringify(report), /Private|private@example/)
})
