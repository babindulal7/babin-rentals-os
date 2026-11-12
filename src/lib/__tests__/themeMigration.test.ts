import { describe, it, expect } from 'vitest'
import { migrateThemeMode } from '../theme'

describe('migrateThemeMode (RULING 2026-11-10: G-2 Glass removal)', () => {
  it('migrates legacy glass to dark', () => {
    expect(migrateThemeMode('glass')).toBe('dark')
  })

  it('migrates legacy glass-light to light', () => {
    expect(migrateThemeMode('glass-light')).toBe('light')
  })

  it('preserves high-contrast, dark, light, and system', () => {
    expect(migrateThemeMode('high-contrast')).toBe('high-contrast')
    expect(migrateThemeMode('dark')).toBe('dark')
    expect(migrateThemeMode('light')).toBe('light')
    expect(migrateThemeMode('system')).toBe('system')
  })

  it('defaults unknown or missing values to light', () => {
    expect(migrateThemeMode(null)).toBe('light')
    expect(migrateThemeMode('unknown')).toBe('light')
  })
})
