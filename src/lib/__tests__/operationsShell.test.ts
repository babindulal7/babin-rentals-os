import { describe, expect, it } from 'vitest'
import { stepWriteGate, stepDotState, entryStepFor } from '../operationsShell'
import type { BookingStatus } from '../workflow'

describe('operationsShell pure state machines', () => {
  describe('stepWriteGate', () => {
    it('allows Pack at Booked stage', () => {
      const gate = stepWriteGate('Pack', 'Booked')
      expect(gate.allowed).toBe(true)
      expect(gate.reason).toBeNull()
    })

    it('allows Handover at Packed stage', () => {
      const gate = stepWriteGate('Handover', 'Packed')
      expect(gate.allowed).toBe(true)
      expect(gate.reason).toBeNull()
    })

    it('allows Return at On Rent stage', () => {
      const gate = stepWriteGate('Return', 'On Rent')
      expect(gate.allowed).toBe(true)
      expect(gate.reason).toBeNull()
    })

    it('allows Reset at Returned stage', () => {
      const gate = stepWriteGate('Reset', 'Returned')
      expect(gate.allowed).toBe(true)
      expect(gate.reason).toBeNull()
    })

    it('blocks forward stages before their prerequisite status', () => {
      const gate = stepWriteGate('Handover', 'Booked')
      expect(gate.allowed).toBe(false)
      expect(gate.reason).toContain('opens once this booking reaches Packed')
    })

    it('blocks backward stages that are already completed', () => {
      const gate = stepWriteGate('Pack', 'On Rent', '2026-10-24 10:00', 'Ramesh')
      expect(gate.allowed).toBe(false)
      expect(gate.reason).toContain('Pack closed 2026-10-24 10:00 by Ramesh.')
    })

    it('handles non-operational stages gracefully without throwing', () => {
      const cancelledGate = stepWriteGate('Pack', 'Cancelled')
      expect(cancelledGate.allowed).toBe(false)
      expect(cancelledGate.reason).toContain('Operations cannot run on Cancelled bookings.')

      const unknownGate = stepWriteGate('Pack', 'InvalidStage' as unknown as BookingStatus)
      expect(unknownGate.allowed).toBe(false)
      expect(unknownGate.reason).toContain('Operations cannot run on InvalidStage bookings.')
    })
  })

  describe('stepDotState', () => {
    it('returns blocked for forward stages', () => {
      expect(stepDotState('Handover', 'Booked', { done: 0, total: 10 })).toBe('blocked')
    })

    it('returns done for completed backward stages', () => {
      expect(stepDotState('Pack', 'Packed', { done: 10, total: 10 })).toBe('done')
    })

    it('returns not-started, in-progress, or done for active stage based on progress', () => {
      expect(stepDotState('Pack', 'Booked', { done: 0, total: 5 })).toBe('not-started')
      expect(stepDotState('Pack', 'Booked', { done: 2, total: 5 })).toBe('in-progress')
      expect(stepDotState('Pack', 'Booked', { done: 5, total: 5 })).toBe('done')
    })

    it('returns blocked for invalid status without throwing', () => {
      expect(stepDotState('Pack', 'Cancelled', { done: 0, total: 5 })).toBe('blocked')
    })
  })

  describe('entryStepFor', () => {
    it('maps stages to their entry job correctly', () => {
      expect(entryStepFor('Booked')).toBe('Pack')
      expect(entryStepFor('Packed')).toBe('Handover')
      expect(entryStepFor('On Rent')).toBe('Return')
      expect(entryStepFor('Returned')).toBe('Reset')
      expect(entryStepFor('Closed')).toBe('Reset')
      expect(entryStepFor('Draft')).toBeNull()
      expect(entryStepFor('Quote')).toBeNull()
    })
  })
})
