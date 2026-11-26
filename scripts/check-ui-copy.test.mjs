import { test } from 'node:test'
import assert from 'node:assert/strict'
import { copyViolations } from './check-ui-copy.mjs'

test('rejects developer text in JSX, attributes, templates, and copy metadata', () => {
  for (const source of ['<p>PLAN.md §4.34</p>', '<p title="Law 5">Deposit</p>', '<p>{`Use lib/money.ts ${amount}`}</p>', 'const card = { description: "Needs a schema change" }', '<p>{"TODO(decision)"}</p>']) assert.ok(copyViolations('sample.tsx', source).length > 0, source)
})
test('permits imports, import types, and comments', () => {
  const source = `import { money } from './lib/money'
    // Law 5: deposit is a liability.
    const node = <p>{value as import('./lib/money').Paisa}</p>
    const lazy = <View load={() => import('./lib/schema')} />`
  assert.equal(copyViolations('sample.tsx', source).length, 0)
})
test('permits ordinary staff copy and technical strings outside UI', () => {
  assert.equal(copyViolations('sample.tsx', '<p>Deposits are recorded separately.</p>').length, 0)
  assert.equal(copyViolations('sample.ts', "type Key = 'schema'; const path = 'lib/money.ts'").length, 0)
})

test('rejects developer text in exported staff-note constants', () => {
  assert.equal(copyViolations('copy.ts', "export const SUB_RENTAL_NOTE = 'booking_lines.line_type'").length, 1)
})

test('permits CSS hooks and comparison operands without permitting visible developer text', () => {
  assert.equal(copyViolations('sample.tsx', '<p className={ready ? "is-ok" : "is-todo"}>Ready</p>').length, 0)
  assert.equal(copyViolations('sample.tsx', '<div>{items.map(item => { const pending = item.state === "todo"; return <p>{pending ? "Required" : "Ready"}</p> })}</div>').length, 0)
  assert.equal(copyViolations('sample.tsx', '<p>{ready ? "Ready" : "TODO"}</p>').length, 1)
})

test('rejects raw JSX text in converted modules (T6-02)', () => {
  const convertedPath = 'src/modules/tools/LateFeeCalculator.tsx'
  // Raw English text in converted module is an i18n violation
  const rawSource = 'export default function View() { return <div><p>Raw text in converted module</p></div> }'
  const violations = copyViolations(convertedPath, rawSource)
  assert.ok(violations.length > 0)
  assert.ok(violations[0].text.includes('[i18n]'))

  // Using translation keys via {t(...)} passes cleanly
  const compliantSource = 'export default function View() { return <div><p>{t("tools.lateFee.ruleDescription")}</p></div> }'
  assert.equal(copyViolations(convertedPath, compliantSource).length, 0)
})

test('flags ruling codes, spec and migration references, table and view names, env variables and "customer" in rendered copy', () => {
  for (const source of [
    '<p>I am alone on shift (W43, L7)</p>',
    '<p>Pay follows Ruling D24</p>',
    '<p>Deposit Policy (O-3, B38)</p>',
    '<p>Cover from partner (T3-13)</p>',
    '<p>Stored in backup_logs</p>',
    '<p>Read from staff_directory_v</p>',
    '<p>Set VITE_DATA_SOURCE=mock to continue</p>',
    '<p>Stored at (0003:887)</p>',
    '<p>Ask the customer first</p>',
  ]) assert.ok(copyViolations('sample.tsx', source).length > 0, source)
})

test('permits CSS variables, code comments, and plain English words', () => {
  assert.equal(copyViolations('sample.tsx', '<p style={{ color: "var(--w08)" }}>Ready</p>').length, 0)
  assert.equal(copyViolations('sample.tsx', '// W43 and Ruling D24 are recorded in the migration\n<p>Ready</p>').length, 0)
  assert.equal(copyViolations('sample.tsx', '<p>Schedule the pick-up for Monday</p>').length, 0)
})
