import { describe, expect, it } from 'vitest';
import {
  checkDoubleBilling,
  checkKitCompatibility,
  hasModelToken,
  isMonsoonMode,
} from './kitSafetyRules';

describe('kitSafetyRules', () => {
  it('enforces strict token boundaries for FX3 vs FX30 and baseplate vs PL', () => {
    expect(hasModelToken('Sony FX30', 'fx3a?')).toBe(false);
    expect(hasModelToken('Sony FX3A', 'fx3a?')).toBe(true);

    const baseplateKit = checkKitCompatibility(['Sony FX3A', '15mm Baseplate']);
    expect(baseplateKit.requiredAdditions).not.toContain('PL-to-E Mount Adapter');
  });

  it('blocks Ronin 4D + external gimbal, CHIOPT without rods, and Komodo media mismatches', () => {
    expect(checkKitCompatibility(['DJI Ronin 4D 6K', 'DJI RS 4 Pro']).isValid).toBe(false);
    expect(checkKitCompatibility(['CHIOPT 28-85mm', 'Sony FX3A']).isValid).toBe(false);
    expect(checkKitCompatibility(['RED Komodo-X', 'CFast 2.0']).isValid).toBe(false);
    expect(checkKitCompatibility(['RED Komodo 6K', 'CFexpress Type B']).isValid).toBe(false);
  });

  it('detects Nepal Monsoon Mode (June–September)', () => {
    expect(isMonsoonMode('2026-07-15')).toBe(true);
    expect(isMonsoonMode('2026-12-05')).toBe(false);
  });

  it('prevents §5.3 child-vs-line double-billing', () => {
    const errors = checkDoubleBilling(
      ['BRPI-SONY-FX3A-BODY', 'BRPI-FX3-TOP-HANDLE'],
      { 'BRPI-FX3-TOP-HANDLE': ['BRPI-SONY-FX3A-BODY'] },
    );
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain('DOUBLE-BILLING CONFLICT');
  });
});
