import { describe, it, expect } from 'vitest'
import { validateKitSafety } from '../safetyValidator'

describe('Rental Intelligence RI-10: Safety Validator Engine', () => {
  it('passes tripod rig within 70% headroom ceiling (35% <= 70%)', () => {
    const report = validateKitSafety(
      [
        { name: 'Sony FX3A Cinema Body', weightGrams: 715 },
        { name: 'Sigma 24-70mm f/2.8 DG DN II Art', weightGrams: 745 },
        { name: 'SmallRig 99Wh V-Mount Battery', weightGrams: 540 },
        { name: 'Accsoon M7 Monitor', weightGrams: 480 },
      ],
      {
        targetId: 'TRIPOD-TEST-01',
        supportType: 'tripod',
        supportRatingKg: 10.0, // 2.48kg on 10kg = 24.8% <= 70%
      },
    )

    expect(report.isSafe).toBe(true)
    expect(report.overallEvidenceState).toBe('supported')
    expect(report.blockingReasons.length).toBe(0)
    const tripodAdv = report.advices.find((a) => a.id.includes('tripod'))
    expect(tripodAdv).toBeDefined()
    expect(tripodAdv?.explanation).toContain('well within safe 70%')
  })

  it('rejects tripod when rig payload exceeds 70% safe limit (RI-A11)', () => {
    const report = validateKitSafety(
      [
        { name: 'RED Komodo-X 6K Cinema Package', weightGrams: 2200 },
        { name: 'CHIOPT 28-85mm Cinema Zoom', weightGrams: 2800 },
        { name: '15mm Rods & Heavy Lens Support Bracket', weightGrams: 400 },
        { name: 'SmallRig 99Wh V-Mount Battery', weightGrams: 540 },
        { name: 'Accsoon M7 Wireless Monitor', weightGrams: 480 },
        { name: 'Matte Box and Follow Focus', weightGrams: 800 },
      ],
      {
        targetId: 'TRIPOD-TEST-02',
        supportType: 'tripod',
        supportRatingKg: 8.0, // Total = 7.22kg > 5.6kg (70% of 8kg)
      },
    )

    expect(report.isSafe).toBe(false)
    expect(report.overallEvidenceState).toBe('needs_verification')
    expect(report.blockingReasons.length).toBeGreaterThan(0)
    expect(report.blockingReasons[0]).toContain('exceeds safe 70% threshold')
    const tripodAdv = report.advices.find((a) => a.id.includes('tripod'))
    expect(tripodAdv?.severity).toBe('urgent')
  })

  it('passes gimbal when dynamic motor load is within 85% limit', () => {
    const report = validateKitSafety(
      [
        { name: 'Sony FX3A Cinema Body', weightGrams: 715 },
        { name: 'Samyang V-AF 35mm Prime', weightGrams: 280 },
      ],
      {
        targetId: 'GIMBAL-TEST-01',
        supportType: 'gimbal',
        supportRatingKg: 3.0, // 0.995kg on 3.0kg RS3 = 33% <= 85%
      },
    )

    expect(report.isSafe).toBe(true)
    expect(report.blockingReasons.length).toBe(0)
  })

  it('rejects gimbal when rig payload exceeds 85% dynamic motor strain ceiling (RI-A11)', () => {
    const report = validateKitSafety(
      [
        { name: 'Sony FX3A Cinema Body', weightGrams: 715 },
        { name: 'Sony FE 70-200mm f/2.8 GM II', weightGrams: 1045 },
        { name: 'SmallRig Full Camera Cage', weightGrams: 220 },
        { name: 'Accsoon M7 Monitor', weightGrams: 480 },
        { name: '99Wh V-Mount Battery', weightGrams: 540 },
      ],
      {
        targetId: 'GIMBAL-TEST-02',
        supportType: 'gimbal',
        supportRatingKg: 3.0, // Total = 3.0kg = 100% > 85%
      },
    )

    expect(report.isSafe).toBe(false)
    expect(report.blockingReasons.some((r) => r.includes('Gimbal payload'))).toBe(true)
    const gimbalAdv = report.advices.find((a) => a.id.includes('gimbal'))
    expect(gimbalAdv?.severity).toBe('urgent')
    expect(gimbalAdv?.explanation).toContain('MOTOR STRAIN WARNING')
  })

  it('enforces hard block on Ronin 4D mounted on external gimbal (RI-A10)', () => {
    const report = validateKitSafety(
      [
        { name: 'DJI Ronin 4D 6K Cinema System' },
        { name: 'DJI RS 4 Pro Gimbal Stabilizer' },
      ],
      { targetId: 'RONIN-BLOCK-01' },
    )

    expect(report.isSafe).toBe(false)
    expect(report.overallEvidenceState).toBe('blocked')
    const roninAdv = report.advices.find((a) => a.id.includes('ronin-block'))
    expect(roninAdv).toBeDefined()
    expect(roninAdv?.evidenceState).toBe('blocked')
    expect(roninAdv?.explanation).toContain('HARD BLOCK')
  })

  it('enforces hard block on CHIOPT heavy zoom without 15mm rods/support bracket (RI-A10)', () => {
    const report = validateKitSafety(
      [
        { name: 'CHIOPT 28-85mm Cinema Zoom' },
        { name: 'Sony FX3A Cinema Body' },
      ],
      { targetId: 'CHIOPT-BLOCK-01' },
    )

    expect(report.isSafe).toBe(false)
    expect(report.overallEvidenceState).toBe('blocked')
    const chioptAdv = report.advices.find((a) => a.id.includes('chiopt-support'))
    expect(chioptAdv?.evidenceState).toBe('blocked')
    expect(chioptAdv?.explanation).toContain('HARD BLOCK')
    expect(report.suggestedAdditions.some((s) => s.displayName.includes('15mm Rods'))).toBe(true)
  })

  it('suggests PL mount adapter when PL lenses are mounted to Sony E / Canon RF bodies', () => {
    const report = validateKitSafety(
      [
        { name: 'NiSi Athena Cine Prime Set (PL)' },
        { name: 'Sony FX3A Cinema Body' },
      ],
      { targetId: 'PL-ADAPT-01' },
    )

    const plAdv = report.advices.find((a) => a.id.includes('pl-adapter'))
    expect(plAdv).toBeDefined()
    expect(plAdv?.severity).toBe('review')
    expect(plAdv?.explanation).toContain('PL-Mount cinema optics selected for mirrorless body')
  })

  it('validates electrical load on single 230V 15A socket passes for 720W Aputure 600x', () => {
    const report = validateKitSafety(
      [{ name: 'Aputure LS 600x Pro', powerWatts: 720 }],
      {
        targetId: 'PWR-SAFE-01',
        circuitAmps: 15,
        circuitVoltage: 230,
      },
    )

    expect(report.isSafe).toBe(true)
    expect(report.totalPowerWatts).toBe(720)
    expect(report.blockingReasons.length).toBe(0)
  })

  it('blocks electrical overload when total draw exceeds 2,760W safe continuous threshold (RI-A12)', () => {
    const report = validateKitSafety(
      [
        { name: 'Aputure LS 600x Pro', quantity: 3, powerWatts: 720 }, // 2160W
        { name: 'Aputure 400x', quantity: 2, powerWatts: 450 }, // 900W -> Total 3060W > 2760W
      ],
      {
        targetId: 'PWR-OVERLOAD-01',
        circuitAmps: 15,
        circuitVoltage: 230,
      },
    )

    expect(report.isSafe).toBe(false)
    expect(report.overallEvidenceState).toBe('blocked')
    expect(report.totalPowerWatts).toBe(3060)
    const overloadAdv = report.advices.find((a) => a.id.includes('electrical-overload'))
    expect(overloadAdv).toBeDefined()
    expect(overloadAdv?.evidenceState).toBe('blocked')
    expect(overloadAdv?.explanation).toContain('ELECTRICAL OVERLOAD BLOCKED')
  })

  it('warns on domestic home circuit when lighting draw exceeds 920W 5A limit', () => {
    const report = validateKitSafety(
      [{ name: 'Aputure 400x Bi-Color', quantity: 3, powerWatts: 450 }], // 1350W > 920W
      {
        targetId: 'DOMESTIC-PWR-01',
        environment: 'domestic_home',
      },
    )

    const domesticAdv = report.advices.find((a) => a.id.includes('domestic-power'))
    expect(domesticAdv).toBeDefined()
    expect(domesticAdv?.severity).toBe('review')
    expect(domesticAdv?.explanation).toContain('DOMESTIC CIRCUIT WARNING')
  })

  it('enforces 2x 10kg sandbag tipping counterweight rule for heavy COB light heads', () => {
    const report = validateKitSafety(
      [{ name: 'Aputure LS 600x Pro' }],
      { targetId: 'SANDBAG-TEST-01' },
    )

    const sandbagAdv = report.advices.find((a) => a.id.includes('sandbags'))
    expect(sandbagAdv).toBeDefined()
    expect(sandbagAdv?.severity).toBe('review')
    expect(sandbagAdv?.suggestedAdditions?.[0]?.displayName).toContain('10kg Heavy Sandbags')
  })

  it('applies cold weather derating in -10°C Mustang high-altitude conditions', () => {
    const report = validateKitSafety(
      [{ name: 'Sony FX3A Cinema Body' }],
      {
        targetId: 'COLD-WEATHER-01',
        environment: 'cold_high_altitude',
      },
    )

    const coldAdv = report.advices.find((a) => a.id.includes('cold-weather'))
    expect(coldAdv).toBeDefined()
    expect(coldAdv?.explanation).toContain('COLD WEATHER DERATING (-10°C Mustang profile)')
    expect(coldAdv?.explanation).toContain('40%')
  })

  it('emits critical SDI power connection sequence warning for RED Komodo bodies', () => {
    const report = validateKitSafety(
      [
        { name: 'RED Komodo 6K Cinema Body' },
        { name: 'Accsoon M7 Wireless Monitor (SDI)' },
      ],
      { targetId: 'SDI-POWER-SEQ-01' },
    )

    const sdiAdv = report.advices.find((a) => a.id.includes('sdi-ground-loop'))
    expect(sdiAdv).toBeDefined()
    expect(sdiAdv?.severity).toBe('info')
    expect(sdiAdv?.explanation).toContain('CRITICAL POWER SEQUENCE (RED Komodo 12G-SDI)')
  })
})
