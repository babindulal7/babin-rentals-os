import { MODULE_CATALOGUES_EN, MODULE_CATALOGUES_NE } from '../i18n/catalogues'
import approvals from '../i18n/review-approvals.json'
import release from '../i18n/release-readiness.json'

interface Approval {
  english: string
  nepali: string
  reviewedBy: string
  reviewedAt: string
}
interface ReleaseEvidence {
  approvedBy: string | null
  approvedAt: string | null
  modules: Record<string, {
    conversionComplete: boolean
    layoutCheckedBy: string | null
    layoutCheckedAt: string | null
  }>
}

function dated(by: string | null | undefined, at: string | null | undefined): boolean {
  return Boolean(by?.trim() && at && /^\d{4}-\d{2}-\d{2}$/.test(at)
    && Number.isFinite(Date.parse(at)) && new Date(at).toISOString().slice(0, 10) === at)
}

/** RULING 2026-11-05: the entire staff app must earn activation, including owner approval. */
export function evaluateLanguageReadiness(
  english: Record<string, Record<string, string>>,
  nepali: Record<string, Record<string, string>>,
  evidence: { entries: Record<string, Approval> },
  acceptance: ReleaseEvidence,
): { ready: boolean; pendingModules: string[] } {
  const modules = Object.keys(english)
  const pendingModules = modules.filter(name => {
    const moduleEvidence = acceptance.modules[name]
    if (!moduleEvidence?.conversionComplete || !dated(moduleEvidence.layoutCheckedBy, moduleEvidence.layoutCheckedAt)) return true
    const keys = Object.keys(english[name] ?? {})
    return keys.length === 0 || keys.some(key => {
      const text = nepali[name]?.[key]
      const approved = evidence.entries[key]
      return !text?.trim() || !approved || approved.english !== english[name]?.[key]
        || approved.nepali !== text || !dated(approved.reviewedBy, approved.reviewedAt)
    })
  })
  return {
    ready: modules.length > 0 && pendingModules.length === 0 && dated(acceptance.approvedBy, acceptance.approvedAt),
    pendingModules,
  }
}

export function canEnable(lang: 'en' | 'ne', moduleName?: string): boolean {
  if (lang === 'en') return true
  if (moduleName && !MODULE_CATALOGUES_EN[moduleName]) return false
  return evaluateLanguageReadiness(MODULE_CATALOGUES_EN, MODULE_CATALOGUES_NE, approvals, release).ready
}

export const NEPALI_UNAVAILABLE = 'Nepali will be available after all staff screens have been reviewed and checked.'
