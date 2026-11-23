import { describe, it, expect } from 'vitest'
import {
  STORE_RULES,
  SHOOT_PLAYBOOKS,
  BUDGET_SCALING_LADDER,
  proposeRuleAmendment,
  getApplicableRules,
  getPlaybookForShootType,
  generatePlaybookAdvice,
} from '../rulesPlaybooks'

describe('Rental Intelligence RI-11: Rules & Shoot Playbooks Engine', () => {
  it('contains versioned store laws with operational guidelines', () => {
    expect(STORE_RULES.length).toBeGreaterThanOrEqual(5)
    const ruleNumbers = STORE_RULES.map((r) => r.ruleNumber)
    expect(ruleNumbers).toContain(1)
    expect(ruleNumbers).toContain(5)
    expect(ruleNumbers).toContain(10)
    expect(ruleNumbers).toContain(17)
    expect(ruleNumbers).toContain(24)
  })

  it('filters out commercial pricing rules for Warehouse and Technician on floor surfaces', () => {
    const ownerRules = getApplicableRules('Owner', 'default')
    expect(ownerRules.some((r) => r.isCommercial)).toBe(true)

    const floorRules = getApplicableRules('Warehouse', 'floor')
    expect(floorRules.every((r) => !r.isCommercial)).toBe(true)
    expect(floorRules.some((r) => r.ruleNumber === 1)).toBe(true)
    expect(floorRules.some((r) => r.ruleNumber === 24)).toBe(true)
  })

  it('contains all 4 production shoot playbooks with mandatory accessories', () => {
    expect(SHOOT_PLAYBOOKS.length).toBe(4)
    const shootTypes = SHOOT_PLAYBOOKS.map((p) => p.shootType)
    expect(shootTypes).toContain('wedding')
    expect(shootTypes).toContain('music_video')
    expect(shootTypes).toContain('documentary')
    expect(shootTypes).toContain('commercial_studio')

    const wedding = getPlaybookForShootType('wedding')
    expect(wedding).toBeDefined()
    expect(wedding?.recommendedPackage).toContain('Sony FX3A Cinema Body (Dual)')
    expect(wedding?.mandatoryAccessories).toContain('6x NP-FZ100 Batteries')
    expect(wedding?.prohibitedOrAvoid.some((p) => p.includes('Anamorphic'))).toBe(true)
  })

  it('defines the 6-Vector Budget Scaling Ladder across Low, Mid, and High-End tiers', () => {
    expect(BUDGET_SCALING_LADDER.length).toBe(7)
    const vectors = BUDGET_SCALING_LADDER.map((v) => v.vector)
    expect(vectors).toContain('Camera Body')
    expect(vectors).toContain('Optics Tier')
    expect(vectors).toContain('ND Filtration')
    expect(vectors).toContain('Power Solution')
    expect(vectors).toContain('Monitoring')
    expect(vectors).toContain('Focus Control')
    expect(vectors).toContain('Lighting')

    const cameraVector = BUDGET_SCALING_LADDER.find((v) => v.vector === 'Camera Body')
    expect(cameraVector?.lowRunAndGun).toContain('Sony A7IV')
    expect(cameraVector?.midStandardPro).toContain('Sony FX3A')
    expect(cameraVector?.highEndCinema).toContain('RED Komodo-X')
  })

  it('enforces Invariant RI-A26: staff correction strictly creates a draft pending review without modifying active catalog rules', () => {
    const proposal = proposeRuleAmendment({
      ruleOrPlaybookId: 'PLAYBOOK-WEDDING',
      proposedBy: 'Kailash (Lead Tech)',
      proposedRole: 'Technician',
      summary: 'Add Sony FX3 audio XLR handle to mandatory accessories list',
      rationale: 'Clients frequently forget that top handle provides the XLR inputs for DJI Mic.',
    })

    expect(proposal.isDraft).toBe(true)
    expect(proposal.status).toBe('draft_pending_review')
    expect(proposal.proposedBy).toBe('Kailash (Lead Tech)')
    expect(proposal.proposedRole).toBe('Technician')

    // Verify original playbook remains untouched
    const wedding = getPlaybookForShootType('wedding')
    expect(wedding?.mandatoryAccessories).not.toContain('Sony FX3 audio XLR handle')
  })

  it('generates role-safe playbook advice for booking context', () => {
    const advice = generatePlaybookAdvice('wedding', 'BK-2026-WED-01', 'Coordinator', 'default')

    expect(advice).not.toBeNull()
    expect(advice?.module).toBe('rules')
    expect(advice?.explanation).toContain('PRODUCTION PLAYBOOK (Wedding & Event Production)')
    expect(advice?.explanation).toContain('Recommended Package: Sony FX3A Cinema Body (Dual)')
    expect(advice?.explanation).toContain('Staff Advisory: Recommend Dual FX3A setup')
    expect(advice?.sourceRefs).toContain('references/shoot_playbooks_and_ladders.md')
  })

  it('strips commercial upsell advice from playbook advice for Warehouse role on floor surface', () => {
    const advice = generatePlaybookAdvice('wedding', 'BK-2026-WED-01', 'Warehouse', 'floor')

    expect(advice).not.toBeNull()
    expect(advice?.explanation).toContain('PRODUCTION PLAYBOOK (Wedding & Event Production)')
    expect(advice?.explanation).not.toContain('Staff Advisory:')
  })
})
