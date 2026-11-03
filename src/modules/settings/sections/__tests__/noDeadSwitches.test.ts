import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// T1-16 regression test: Settings may not show an apparent On/Off security or
// notification control without a real persistence path. Read only project
// source; no connection to live Supabase, browser localStorage or device APIs.
const sectionSource = readFileSync('src/modules/settings/sections/System.tsx', 'utf8')
const fieldRowSource = readFileSync('src/modules/settings/sections/shared.tsx', 'utf8')
const financeSource = readFileSync('src/modules/settings/sections/Financial.tsx', 'utf8')

const unbuilt: ReadonlyArray<readonly [string, string]> = [
  ['Return reminders', 'T5-07'],
  ['Payment reminders', 'T5-08'],
  ['Low stock alerts', 'T3-30'],
  ['Daily digest', 'T5-04'],
  ['Two-factor authentication', 'T1-17'],
  ['Shared-device screen lock', 'T1-15'],
]

describe('T1-16: Settings controls must tell the truth', () => {
  it.each(unbuilt)('%s is inert and names its implementing task %s', (label, task) => {
    const fieldLine = sectionSource.split('\n').find(line => line.includes(`label: '${label}'`))
    expect(fieldLine, `Missing field: ${label}`).toBeDefined()
    expect(fieldLine).toContain('readOnlyWhy:')
    expect(fieldLine).toContain('Not built yet')
    expect(fieldLine).toContain(task)
    expect(fieldLine).not.toMatch(/\bon\s*:/)
    expect(fieldLine).not.toMatch(/\bsettingKey\s*:/)
  })

  it('rejects the original local-only switch shape and renders an inert NotBuilt marker', () => {
    expect(fieldRowSource).not.toMatch(/^\s*on\?:\s*boolean/m)
    expect(fieldRowSource).not.toMatch(/function Switch\(/)
    expect(fieldRowSource).not.toMatch(/f\.on\s*!==/)
    expect(fieldRowSource).toContain('f.readOnlyWhy && !f.settingKey && f.value === undefined')
    expect(fieldRowSource).toContain('<NotBuilt why={f.readOnlyWhy} />')
  })

  it('labels the legacy allow-overbooking switch as device-only and read-only', () => {
    expect(financeSource).toMatch(/label: 'Allow overbooking',[\s\S]*?readOnlyWhy: 'This device only/)
    expect(financeSource).toContain('T2-23')
    expect(financeSource).toContain("readOnlyWhy: 'This device only")
    expect(financeSource).not.toContain("on: false")
  })
})
