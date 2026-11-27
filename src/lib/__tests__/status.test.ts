import { describe, it, expect } from 'vitest'
import {
  STATUS,
  STATUS_ICON,
  PAYMENT_STATUS_TONE,
  paymentStatusTone,
  jobStateChip,
} from '../status'

describe('status tokens and helpers', () => {
  it('defines tokens and icons for every StatusKey', () => {
    for (const key of Object.keys(STATUS) as Array<keyof typeof STATUS>) {
      expect(STATUS[key].bg).toBeTruthy()
      expect(STATUS[key].fg).toBeTruthy()
      expect(STATUS_ICON[key]).toBeTruthy()
    }
  })

  it('maps payment statuses to tones and falls back safely on unknown status', () => {
    expect(PAYMENT_STATUS_TONE.Received).toBe('in')
    expect(PAYMENT_STATUS_TONE.Failed).toBe('danger')
    expect(paymentStatusTone('Received')).toBe('in')
    expect(paymentStatusTone('UnknownFutureStatus')).toBe('neutral')
  })

  it('renders warning tone when a Complete job has exceptions', () => {
    const clean = jobStateChip('Complete', 0, 'missing')
    expect(clean.tone).toBe('var(--success-text)')
    expect(clean.label).toBe('Complete')

    const withExceptions = jobStateChip('Complete', 2, 'missing')
    expect(withExceptions.tone).toBe('var(--warn-text)')
    expect(withExceptions.icon).toBe('alert_triangle')
    expect(withExceptions.label).toBe('Complete · 2 missing')

    expect(jobStateChip('In Progress', 0, 'missing').tone).toBe('var(--progress-text)')
    expect(jobStateChip('Not Started', 0, 'missing').tone).toBe('var(--text2)')
  })
})
