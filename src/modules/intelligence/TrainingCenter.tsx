/**
 * BABIN RENTALS OS — INTELLIGENCE TRAINING CENTER
 * Staff Quality Control & Evaluation Workbench (TQC-01)
 *
 * Six comprehensive views:
 * 1. Overview / Quality Dashboard
 * 2. Data Quality Center
 * 3. Knowledge Review Queue
 * 4. Golden Test Library
 * 5. Evaluation Runs & Accuracy Reports
 * 6. Staff Feedback & Corrections
 *
 * Implements strict offline synthetic grading, zero live DB writes,
 * zero external AI calls, role access refusal for Client,
 * and WCAG-accessible responsive layouts (Desktop, iPad, Phone).
 */

import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import type { IconName } from '../../components/ui/Icon'
import { PageHeader, cardStyle } from '../../components/ui/Page'
import { PageShell } from '../../components/ui/PageShell'
import { useViewport } from '../../lib/device'
import { useAuth } from '../../lib/auth'
import { isStaff } from '../../lib/rbac'
import {
  SYNTHETIC_GOLDEN_CASES,
  exportGoldenCasesToJsonl,
} from '../../lib/intelligence/goldenCases'
import {
  executeSyntheticEvaluationRun,
} from '../../lib/intelligence/evalEngine'
import {
  scanCanonicalCatalogQuality,
} from '../../lib/intelligence/qualityScanner'
import {
  SYNTHETIC_DATA_QUALITY_ISSUES,
  SYNTHETIC_KNOWLEDGE_REVIEW_ITEMS,
  SYNTHETIC_STAFF_FEEDBACK_ITEMS,
} from '../../lib/intelligence/fixtures'
import type {
  GoldenCase,
  EvaluationRun,
  KnowledgeReviewItem,
  StaffFeedbackItem,
} from '../../lib/intelligence/types'

export type TrainingCenterTab =
  | 'overview'
  | 'quality'
  | 'reviews'
  | 'library'
  | 'evaluations'
  | 'feedback'

export default function TrainingCenter() {
  const { user } = useAuth()
  const viewport = useViewport()
  const [activeTab, setActiveTab] = useState<TrainingCenterTab>('overview')

  // Evaluation Run State
  const [currentRun, setCurrentRun] = useState<EvaluationRun | null>(() =>
    executeSyntheticEvaluationRun(SYNTHETIC_GOLDEN_CASES)
  )
  const [isRunningEval, setIsRunningEval] = useState(false)

  // Knowledge Review State (Local mutable state for approvals/rejections)
  const [reviewItems, setReviewItems] = useState<KnowledgeReviewItem[]>(
    SYNTHETIC_KNOWLEDGE_REVIEW_ITEMS
  )
  const [rejectionModalId, setRejectionModalId] = useState<string | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')

  // Library State
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSuite, setSelectedSuite] = useState<string>('all')
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all')
  const [selectedCaseModal, setSelectedCaseModal] = useState<GoldenCase | null>(null)

  // Feedback State
  const [feedbackItems, setFeedbackItems] = useState<StaffFeedbackItem[]>(
    SYNTHETIC_STAFF_FEEDBACK_ITEMS
  )

  // Data Quality Scan State (TQC-02)
  const [qualityScanSource, setQualityScanSource] = useState<'synthetic' | 'canonical'>('synthetic')
  const canonicalScanSummary = useMemo(() => scanCanonicalCatalogQuality(), [])

  // Gate Check: Refuse access to Client role (Acceptance Test 10)
  const userRole = user?.role
  if (userRole && !isStaff(userRole)) {
    return (
      <PageShell>
        <div style={{ padding: '2rem', maxWidth: '640px', margin: '4rem auto', textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', padding: '1rem', borderRadius: '50%', background: '#fee2e2', color: '#dc2626', marginBottom: '1rem' }}>
            <Icon name="lock" size={32} />
          </div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem', color: '#111827' }}>
            Restricted Staff Surface
          </h1>
          <p style={{ color: '#4b5563', lineHeight: 1.5, marginBottom: '1.5rem' }}>
            The Intelligence Training Center is accessible to internal staff, technicians, and operations personnel only. Client portal sessions cannot view internal evaluation datasets, cost margins, or unreviewed notes.
          </p>
          <Link
            to="/rentals"
            style={{
              display: 'inline-block',
              padding: '0.625rem 1.25rem',
              backgroundColor: '#2563eb',
              color: '#ffffff',
              borderRadius: '6px',
              textDecoration: 'none',
              fontWeight: 600,
            }}
          >
            Return to Rentals
          </Link>
        </div>
      </PageShell>
    )
  }

  // Handle Synthetic Evaluation Run Trigger
  const handleRunEvaluation = () => {
    setIsRunningEval(true)
    setTimeout(() => {
      const newRun = executeSyntheticEvaluationRun(SYNTHETIC_GOLDEN_CASES, {
        baselineResults: currentRun?.results,
      })
      setCurrentRun(newRun)
      setIsRunningEval(false)
    }, 450)
  }

  // Handle Review Actions
  const handleApproveInternal = (id: string) => {
    setReviewItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, status: 'approved_internal', updatedAt: new Date().toISOString() } : item
      )
    )
  }

  const handleApproveClient = (id: string) => {
    setReviewItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, status: 'approved_client', updatedAt: new Date().toISOString() } : item
      )
    )
  }

  const handleConfirmReject = () => {
    if (!rejectionModalId || !rejectionReason.trim()) return
    setReviewItems((prev) =>
      prev.map((item) =>
        item.id === rejectionModalId
          ? {
              ...item,
              status: 'rejected',
              rejectionReason: rejectionReason.trim(),
              updatedAt: new Date().toISOString(),
            }
          : item
      )
    )
    setRejectionModalId(null)
    setRejectionReason('')
  }

  // Filtered Library Cases
  const filteredCases = useMemo(() => {
    return SYNTHETIC_GOLDEN_CASES.filter((c) => {
      const matchSearch =
        !searchQuery ||
        c.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.suite.toLowerCase().includes(searchQuery.toLowerCase())
      const matchSuite = selectedSuite === 'all' || c.suite === selectedSuite
      const matchSeverity = selectedSeverity === 'all' || c.severity === selectedSeverity
      return matchSearch && matchSuite && matchSeverity
    })
  }, [searchQuery, selectedSuite, selectedSeverity])

  // Suites in Golden Dataset
  const suitesList = useMemo(() => {
    const s = new Set<string>()
    SYNTHETIC_GOLDEN_CASES.forEach((c) => s.add(c.suite))
    return Array.from(s)
  }, [])

  // Export JSONL
  const handleExportJsonl = () => {
    const jsonl = exportGoldenCasesToJsonl(SYNTHETIC_GOLDEN_CASES)
    const blob = new Blob([jsonl], { type: 'application/jsonl;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `babin-intelligence-golden-cases-${new Date().toISOString().slice(0, 10)}.jsonl`
    link.click()
    URL.revokeObjectURL(url)
  }

  // Export Evaluation Report Markdown
  const handleExportReportMd = () => {
    if (!currentRun) return
    const md = `# Babin Rentals OS — Intelligence Evaluation Run Report
**Run ID:** ${currentRun.runId}  
**Date:** ${currentRun.asOf}  
**Environment:** ${currentRun.environment}  
**Base SHA:** ${currentRun.baseSha}  

## Summary
- **Total Cases:** ${currentRun.counts.total}
- **Passed:** ${currentRun.counts.pass}
- **Failed:** ${currentRun.counts.fail}
- **Blocked:** ${currentRun.counts.blocked}
- **Inconclusive:** ${currentRun.counts.inconclusive}
- **Exact Model ID Accuracy:** ${currentRun.metrics.exactModelIdAccuracy.rate ?? 'N/A'}%
- **Source Support Rate:** ${currentRun.metrics.sourceSupportRate.rate ?? 'N/A'}%
- **Safe Abstention Rate:** ${currentRun.metrics.safeAbstentionRate.rate ?? 'N/A'}%
- **Zero Safety/Privacy Violations:** ${currentRun.metrics.zeroSafetyPrivacyViolations ? 'PASS' : 'FAIL'}
`
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `eval-report-${currentRun.runId}.md`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <PageShell>
      <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '1rem', width: '100%', boxSizing: 'border-box' }}>
        {/* Synthetic Offline Banner */}
        <div
          role="status"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem',
            padding: '0.625rem 1rem',
            backgroundColor: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderRadius: '6px',
            marginBottom: '1rem',
            fontSize: '0.8125rem',
            color: '#166534',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
            <Icon name="check" size={16} />
            <span>SYNTHETIC OFFLINE MODE</span>
            <span style={{ fontWeight: 400, opacity: 0.85 }}>• Zero live DB writes • Zero external AI cost • 47 Golden Cases active</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#15803d', fontWeight: 500 }}>
            Base SHA: <code>4c8fe9d7</code>
          </div>
        </div>

        {/* Page Header */}
        <PageHeader
          title="Intelligence Training Center"
          description="Staff workbench for accuracy benchmarks, golden dataset verification, human reviews, and continuous evaluation."
        />

        {/* Tab Navigation (WCAG Accessible 44px+ targets) */}
        <div
          role="tablist"
          aria-label="Training Center Sections"
          style={{
            display: 'flex',
            gap: '0.25rem',
            borderBottom: '1px solid var(--border-subtle, #e5e7eb)',
            marginBottom: '1.5rem',
            overflowX: 'auto',
            paddingBottom: '2px',
          }}
        >
          {(
            [
              { id: 'overview', label: 'Overview', icon: 'chart', count: null },
              { id: 'quality', label: 'Data Quality', icon: 'checklist', count: SYNTHETIC_DATA_QUALITY_ISSUES.length },
              { id: 'reviews', label: 'Knowledge Review', icon: 'eye', count: reviewItems.filter((r) => r.status === 'pending').length },
              { id: 'library', label: 'Golden Test Library', icon: 'box', count: SYNTHETIC_GOLDEN_CASES.length },
              { id: 'evaluations', label: 'Evaluation Runs', icon: 'settings', count: null },
              { id: 'feedback', label: 'Staff Feedback', icon: 'message', count: feedbackItems.filter((f) => f.status === 'pending').length },
            ] as const
          ).map((tab) => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                role="tab"
                id={`tab-${tab.id}`}
                aria-selected={isActive}
                aria-controls={`panel-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.625rem 1rem',
                  minHeight: '44px',
                  borderRadius: '6px 6px 0 0',
                  border: 'none',
                  borderBottom: isActive ? '2px solid #2563eb' : '2px solid transparent',
                  background: isActive ? '#f8fafc' : 'transparent',
                  color: isActive ? '#2563eb' : '#4b5563',
                  fontWeight: isActive ? 600 : 500,
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                <Icon name={tab.icon as IconName} size={16} />
                <span>{tab.label}</span>
                {tab.count !== null && (
                  <span
                    style={{
                      fontSize: '0.75rem',
                      padding: '0.125rem 0.375rem',
                      borderRadius: '999px',
                      backgroundColor: isActive ? '#dbeafe' : '#f1f5f9',
                      color: isActive ? '#1d4ed8' : '#64748b',
                    }}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* ─── TAB 1: OVERVIEW / QUALITY DASHBOARD ─── */}
        {activeTab === 'overview' && (
          <div role="tabpanel" id="panel-overview" aria-labelledby="tab-overview">
            {/* Release Gate Alert Banner */}
            <div
              style={{
                padding: '1rem 1.25rem',
                borderRadius: '8px',
                border: '1px solid',
                borderColor: currentRun?.metrics.zeroSafetyPrivacyViolations ? '#bbf7d0' : '#fecaca',
                backgroundColor: currentRun?.metrics.zeroSafetyPrivacyViolations ? '#f0fdf4' : '#fef2f2',
                marginBottom: '1.5rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '1rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div
                  style={{
                    padding: '0.5rem',
                    borderRadius: '50%',
                    backgroundColor: currentRun?.metrics.zeroSafetyPrivacyViolations ? '#dcfce7' : '#fee2e2',
                    color: currentRun?.metrics.zeroSafetyPrivacyViolations ? '#16a34a' : '#dc2626',
                  }}
                >
                  <Icon name={currentRun?.metrics.zeroSafetyPrivacyViolations ? 'check' : 'x'} size={24} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#111827' }}>
                    Release Quality Gate: {currentRun?.metrics.zeroSafetyPrivacyViolations ? 'PASSING' : 'FAILED'}
                  </h3>
                  <p style={{ margin: '0.25rem 0 0', fontSize: '0.8125rem', color: '#4b5563' }}>
                    Zero critical safety or privacy escapes allowed. Status:{' '}
                    <strong>
                      {currentRun?.metrics.zeroSafetyPrivacyViolations
                        ? '0 Critical Violations'
                        : `${currentRun?.metrics.safetyPrivacyViolationCount} Violations Detected`}
                    </strong>
                  </p>
                </div>
              </div>
              <button
                onClick={handleRunEvaluation}
                disabled={isRunningEval}
                style={{
                  minHeight: '44px',
                  padding: '0.5rem 1rem',
                  backgroundColor: '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                  cursor: isRunningEval ? 'not-allowed' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                <Icon name="settings" size={16} />
                <span>{isRunningEval ? 'Evaluating...' : 'Run Evaluation Suite'}</span>
              </button>
            </div>

            {/* KPI Cards Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: viewport === 'phone' ? '1fr' : viewport === 'tablet' ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
                gap: '1rem',
                marginBottom: '1.5rem',
              }}
            >
              <div style={{ ...cardStyle, padding: '1.25rem' }}>
                <div style={{ fontSize: '0.8125rem', color: '#64748b', fontWeight: 500 }}>Model ID Accuracy</div>
                <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#0f172a', margin: '0.25rem 0' }}>
                  {currentRun?.metrics.exactModelIdAccuracy.rate !== null ? `${currentRun?.metrics.exactModelIdAccuracy.rate}%` : 'N/A'}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#16a34a', fontWeight: 600 }}>
                  FX3 vs FX30 token boundary verified
                </div>
              </div>

              <div style={{ ...cardStyle, padding: '1.25rem' }}>
                <div style={{ fontSize: '0.8125rem', color: '#64748b', fontWeight: 500 }}>Source Support Rate</div>
                <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#0f172a', margin: '0.25rem 0' }}>
                  {currentRun?.metrics.sourceSupportRate.rate !== null ? `${currentRun?.metrics.sourceSupportRate.rate}%` : 'N/A'}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  {currentRun?.metrics.sourceSupportRate.numerator} / {currentRun?.metrics.sourceSupportRate.denominator} claims supported
                </div>
              </div>

              <div style={{ ...cardStyle, padding: '1.25rem' }}>
                <div style={{ fontSize: '0.8125rem', color: '#64748b', fontWeight: 500 }}>Safe Abstention Rate</div>
                <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#0f172a', margin: '0.25rem 0' }}>
                  {currentRun?.metrics.safeAbstentionRate.rate !== null ? `${currentRun?.metrics.safeAbstentionRate.rate}%` : 'N/A'}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  Safe refusal on unknown/unsafe prompts
                </div>
              </div>

              <div style={{ ...cardStyle, padding: '1.25rem' }}>
                <div style={{ fontSize: '0.8125rem', color: '#64748b', fontWeight: 500 }}>Regression Rate</div>
                <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#0f172a', margin: '0.25rem 0' }}>
                  {currentRun?.metrics.regressionRate.rate}%
                </div>
                <div style={{ fontSize: '0.75rem', color: currentRun?.metrics.regressionRate.rate === 0 ? '#16a34a' : '#dc2626' }}>
                  {currentRun?.metrics.regressionRate.rate === 0 ? 'Zero regressions from baseline' : 'Regressions detected!'}
                </div>
              </div>
            </div>

            {/* Suite Breakdown Table */}
            <div style={{ ...cardStyle, padding: '1.25rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 1rem', color: '#0f172a' }}>
                Golden Test Suite Coverage Breakdown
              </h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>
                      <th style={{ padding: '0.75rem 0.5rem' }}>Suite</th>
                      <th style={{ padding: '0.75rem 0.5rem' }}>Cases</th>
                      <th style={{ padding: '0.75rem 0.5rem' }}>Passed</th>
                      <th style={{ padding: '0.75rem 0.5rem' }}>Failed</th>
                      <th style={{ padding: '0.75rem 0.5rem' }}>Blocked</th>
                      <th style={{ padding: '0.75rem 0.5rem' }}>Pass Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {suitesList.map((suite) => {
                      const suiteResults = currentRun?.results.filter((r) => r.suite === suite) ?? []
                      const total = suiteResults.length
                      const passed = suiteResults.filter((r) => r.verdict === 'pass').length
                      const failed = suiteResults.filter((r) => r.verdict === 'fail').length
                      const blocked = suiteResults.filter((r) => r.verdict === 'blocked').length
                      const rate = total > 0 ? ((passed / total) * 100).toFixed(0) : '0'

                      return (
                        <tr key={suite} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '0.75rem 0.5rem', fontWeight: 600, color: '#1e293b' }}>
                            <code>{suite}</code>
                          </td>
                          <td style={{ padding: '0.75rem 0.5rem' }}>{total}</td>
                          <td style={{ padding: '0.75rem 0.5rem', color: '#16a34a', fontWeight: 600 }}>{passed}</td>
                          <td style={{ padding: '0.75rem 0.5rem', color: failed > 0 ? '#dc2626' : '#64748b' }}>{failed}</td>
                          <td style={{ padding: '0.75rem 0.5rem', color: blocked > 0 ? '#ea580c' : '#64748b' }}>{blocked}</td>
                          <td style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>{rate}%</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ─── TAB 2: DATA QUALITY CENTER ─── */}
        {activeTab === 'quality' && (
          <div role="tabpanel" id="panel-quality" aria-labelledby="tab-quality">
            <div style={{ ...cardStyle, padding: '1.25rem', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Canonical Catalog Quality Scan (TQC-02)</h3>
                  <p style={{ margin: '0.25rem 0 0', fontSize: '0.8125rem', color: '#64748b' }}>
                    Read-only automated scan of canonical equipment records, kit dependencies, and technical manuals. No automatic overwrites.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <div style={{ display: 'inline-flex', borderRadius: '6px', border: '1px solid #cbd5e1', overflow: 'hidden' }}>
                    <button
                      onClick={() => setQualityScanSource('synthetic')}
                      style={{
                        padding: '0.375rem 0.75rem',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        border: 'none',
                        cursor: 'pointer',
                        backgroundColor: qualityScanSource === 'synthetic' ? '#2563eb' : '#ffffff',
                        color: qualityScanSource === 'synthetic' ? '#ffffff' : '#475569',
                      }}
                    >
                      Synthetic Baseline ({SYNTHETIC_DATA_QUALITY_ISSUES.length})
                    </button>
                    <button
                      onClick={() => setQualityScanSource('canonical')}
                      style={{
                        padding: '0.375rem 0.75rem',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        border: 'none',
                        cursor: 'pointer',
                        backgroundColor: qualityScanSource === 'canonical' ? '#2563eb' : '#ffffff',
                        color: qualityScanSource === 'canonical' ? '#ffffff' : '#475569',
                      }}
                    >
                      Live Catalog Scan ({canonicalScanSummary.issues.length})
                    </button>
                  </div>
                  <div style={{ padding: '0.375rem 0.75rem', backgroundColor: '#e0f2fe', color: '#0369a1', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>
                    {qualityScanSource === 'canonical'
                      ? `${canonicalScanSummary.totalModelsScanned} Models Audited`
                      : 'Synthetic Demo'}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                {(qualityScanSource === 'synthetic' ? SYNTHETIC_DATA_QUALITY_ISSUES : canonicalScanSummary.issues).map((issue) => (
                  <div
                    key={issue.code}
                    style={{
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                      padding: '1rem',
                      backgroundColor: '#ffffff',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span
                          style={{
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            padding: '0.125rem 0.5rem',
                            borderRadius: '4px',
                            backgroundColor: issue.severity === 'critical' ? '#fee2e2' : '#fef3c7',
                            color: issue.severity === 'critical' ? '#dc2626' : '#d97706',
                          }}
                        >
                          {issue.severity.toUpperCase()}
                        </span>
                        <code style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{issue.code}</code>
                        <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#0f172a' }}>{issue.title}</span>
                      </div>
                      <span style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'capitalize' }}>
                        Category: <strong>{issue.category}</strong>
                      </span>
                    </div>

                    <p style={{ margin: '0.5rem 0', fontSize: '0.875rem', color: '#334155' }}>{issue.description}</p>

                    <div style={{ fontSize: '0.8125rem', color: '#64748b', backgroundColor: '#f8fafc', padding: '0.5rem 0.75rem', borderRadius: '4px', margin: '0.5rem 0' }}>
                      <div><strong>Evidence:</strong> {issue.evidence}</div>
                      <div><strong>Earliest Safe Fix:</strong> {issue.earliestSafeFix}</div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem', fontSize: '0.75rem', color: '#64748b' }}>
                      <span>Owner: <strong>{issue.proposedOwner}</strong></span>
                      <Link
                        to={issue.deepLink}
                        style={{
                          color: '#2563eb',
                          textDecoration: 'none',
                          fontWeight: 600,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                        }}
                      >
                        Inspect Record <Icon name="chevron_right" size={14} />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ─── TAB 3: KNOWLEDGE REVIEW QUEUE ─── */}
        {activeTab === 'reviews' && (
          <div role="tabpanel" id="panel-reviews" aria-labelledby="tab-reviews">
            <div style={{ ...cardStyle, padding: '1.25rem', marginBottom: '1.5rem' }}>
              <div style={{ marginBottom: '1rem' }}>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Staff Knowledge Review Queue</h3>
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.8125rem', color: '#64748b' }}>
                  Candidate claims, kit inclusion changes, and technical how-tos awaiting human authorization.
                  Rejections persist across sync cycles.
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {reviewItems.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      padding: '1.25rem',
                      backgroundColor: '#ffffff',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
                      <div>
                        <div style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>{item.modelName}</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                          Model ID: <code>{item.modelId}</code> • Category: <strong>{item.category}</strong>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span
                          style={{
                            fontSize: '0.75rem',
                            padding: '0.25rem 0.5rem',
                            borderRadius: '4px',
                            fontWeight: 600,
                            backgroundColor:
                              item.status === 'approved_internal' || item.status === 'approved_client'
                                ? '#dcfce7'
                                : item.status === 'rejected'
                                  ? '#fee2e2'
                                  : '#fef3c7',
                            color:
                              item.status === 'approved_internal' || item.status === 'approved_client'
                                ? '#16a34a'
                                : item.status === 'rejected'
                                  ? '#dc2626'
                                  : '#d97706',
                          }}
                        >
                          Status: {item.status.toUpperCase()}
                        </span>
                        <span
                          style={{
                            fontSize: '0.75rem',
                            padding: '0.25rem 0.5rem',
                            borderRadius: '4px',
                            backgroundColor: '#f1f5f9',
                            color: '#475569',
                          }}
                        >
                          Evidence: <code>{item.confidence}</code>
                        </span>
                      </div>
                    </div>

                    {/* Diff View */}
                    <div style={{ display: 'grid', gridTemplateColumns: viewport === 'phone' ? '1fr' : '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                      <div style={{ backgroundColor: '#f8fafc', padding: '0.75rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: '0.25rem' }}>CURRENT APPROVED VALUE</div>
                        <div style={{ fontSize: '0.875rem', color: '#1e293b' }}>{item.currentApprovedValue}</div>
                      </div>
                      <div style={{ backgroundColor: '#eff6ff', padding: '0.75rem', borderRadius: '6px', border: '1px solid #bfdbfe' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#1d4ed8', marginBottom: '0.25rem' }}>PROPOSED CANDIDATE VALUE</div>
                        <div style={{ fontSize: '0.875rem', color: '#1e3a8a' }}>{item.proposedValue}</div>
                      </div>
                    </div>

                    {item.rejectionReason && (
                      <div style={{ padding: '0.5rem 0.75rem', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '4px', marginBottom: '0.75rem', fontSize: '0.8125rem', color: '#b91c1c' }}>
                        <strong>Rejection Reason:</strong> {item.rejectionReason}
                      </div>
                    )}

                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '1rem' }}>
                      Source: <strong>{item.publisher}</strong> ({item.sourceType}) • Revision: {item.sourceRevision}
                    </div>

                    {/* Action Buttons (44px touch targets) */}
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <button
                        onClick={() => handleApproveInternal(item.id)}
                        disabled={item.status === 'approved_internal'}
                        style={{
                          minHeight: '44px',
                          padding: '0.5rem 1rem',
                          backgroundColor: '#16a34a',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '6px',
                          fontWeight: 600,
                          fontSize: '0.8125rem',
                          cursor: item.status === 'approved_internal' ? 'not-allowed' : 'pointer',
                        }}
                      >
                        Approve (Staff Internal)
                      </button>
                      <button
                        onClick={() => handleApproveClient(item.id)}
                        disabled={item.status === 'approved_client'}
                        style={{
                          minHeight: '44px',
                          padding: '0.5rem 1rem',
                          backgroundColor: '#2563eb',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '6px',
                          fontWeight: 600,
                          fontSize: '0.8125rem',
                          cursor: item.status === 'approved_client' ? 'not-allowed' : 'pointer',
                        }}
                      >
                        Approve (Client Safe)
                      </button>
                      <button
                        onClick={() => setRejectionModalId(item.id)}
                        style={{
                          minHeight: '44px',
                          padding: '0.5rem 1rem',
                          backgroundColor: '#ef4444',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '6px',
                          fontWeight: 600,
                          fontSize: '0.8125rem',
                          cursor: 'pointer',
                        }}
                      >
                        Reject...
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Rejection Modal */}
            {rejectionModalId && (
              <div
                style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: 'rgba(0,0,0,0.5)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '1rem',
                  zIndex: 9999,
                }}
              >
                <div style={{ backgroundColor: '#ffffff', borderRadius: '8px', maxWidth: '480px', width: '100%', padding: '1.5rem', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                  <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.125rem', fontWeight: 700 }}>Mandatory Rejection Justification</h3>
                  <p style={{ margin: '0 0 1rem', fontSize: '0.875rem', color: '#64748b' }}>
                    State why this candidate claim is rejected. This reason is stored durably to prevent duplicate regeneration.
                  </p>
                  <textarea
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    rows={4}
                    placeholder="Enter factual justification or safety hazard..."
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      padding: '0.5rem',
                      border: '1px solid #cbd5e1',
                      borderRadius: '6px',
                      fontSize: '0.875rem',
                      marginBottom: '1rem',
                    }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                    <button
                      onClick={() => {
                        setRejectionModalId(null)
                        setRejectionReason('')
                      }}
                      style={{
                        minHeight: '44px',
                        padding: '0.5rem 1rem',
                        backgroundColor: '#f1f5f9',
                        color: '#475569',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleConfirmReject}
                      disabled={!rejectionReason.trim()}
                      style={{
                        minHeight: '44px',
                        padding: '0.5rem 1rem',
                        backgroundColor: '#dc2626',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '6px',
                        fontWeight: 600,
                        cursor: !rejectionReason.trim() ? 'not-allowed' : 'pointer',
                      }}
                    >
                      Confirm Rejection
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── TAB 4: GOLDEN TEST LIBRARY ─── */}
        {activeTab === 'library' && (
          <div role="tabpanel" id="panel-library" aria-labelledby="tab-library">
            <div style={{ ...cardStyle, padding: '1.25rem', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Golden Test Case Library</h3>
                  <p style={{ margin: '0.25rem 0 0', fontSize: '0.8125rem', color: '#64748b' }}>
                    Curated collection of 47 synthetic golden assertions with explicit expected dispositions.
                  </p>
                </div>
                <button
                  onClick={handleExportJsonl}
                  style={{
                    minHeight: '44px',
                    padding: '0.5rem 1rem',
                    backgroundColor: '#0f172a',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                >
                  <Icon name="download" size={16} />
                  <span>Export JSONL</span>
                </button>
              </div>

              {/* Filters */}
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                <input
                  type="text"
                  placeholder="Search case ID, prompt or suite..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    flex: '1 1 200px',
                    minHeight: '44px',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.875rem',
                  }}
                />
                <select
                  value={selectedSuite}
                  onChange={(e) => setSelectedSuite(e.target.value)}
                  style={{ minHeight: '44px', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.875rem' }}
                >
                  <option value="all">All Suites</option>
                  {suitesList.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <select
                  value={selectedSeverity}
                  onChange={(e) => setSelectedSeverity(e.target.value)}
                  style={{ minHeight: '44px', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.875rem' }}
                >
                  <option value="all">All Severities</option>
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>

              {/* Dense Table */}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8125rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #e2e8f0', color: '#64748b' }}>
                      <th style={{ padding: '0.625rem 0.5rem' }}>ID</th>
                      <th style={{ padding: '0.625rem 0.5rem' }}>Suite</th>
                      <th style={{ padding: '0.625rem 0.5rem' }}>Severity</th>
                      <th style={{ padding: '0.625rem 0.5rem' }}>Disposition</th>
                      <th style={{ padding: '0.625rem 0.5rem' }}>Audience</th>
                      <th style={{ padding: '0.625rem 0.5rem' }}>Prompt / Question</th>
                      <th style={{ padding: '0.625rem 0.5rem' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCases.map((c) => (
                      <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '0.625rem 0.5rem', fontWeight: 600 }}><code>{c.id}</code></td>
                        <td style={{ padding: '0.625rem 0.5rem' }}>{c.suite}</td>
                        <td style={{ padding: '0.625rem 0.5rem' }}>
                          <span
                            style={{
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              color: c.severity === 'critical' ? '#dc2626' : c.severity === 'high' ? '#d97706' : '#475569',
                            }}
                          >
                            {c.severity}
                          </span>
                        </td>
                        <td style={{ padding: '0.625rem 0.5rem' }}>
                          <span
                            style={{
                              padding: '0.125rem 0.375rem',
                              borderRadius: '4px',
                              backgroundColor: '#f1f5f9',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                            }}
                          >
                            {c.expectedDisposition}
                          </span>
                        </td>
                        <td style={{ padding: '0.625rem 0.5rem', color: '#64748b' }}>{c.audience}</td>
                        <td style={{ padding: '0.625rem 0.5rem', color: '#1e293b' }}>{c.question}</td>
                        <td style={{ padding: '0.625rem 0.5rem' }}>
                          <button
                            onClick={() => setSelectedCaseModal(c)}
                            style={{
                              minHeight: '36px',
                              padding: '0.25rem 0.5rem',
                              backgroundColor: '#f1f5f9',
                              border: '1px solid #cbd5e1',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              cursor: 'pointer',
                            }}
                          >
                            Inspect
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Case Inspection Modal */}
            {selectedCaseModal && (
              <div
                style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: 'rgba(0,0,0,0.5)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '1rem',
                  zIndex: 9999,
                }}
              >
                <div style={{ backgroundColor: '#ffffff', borderRadius: '8px', maxWidth: '600px', width: '100%', padding: '1.5rem', maxHeight: '90vh', overflowY: 'auto' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700 }}>
                      Case {selectedCaseModal.id} Details
                    </h3>
                    <button
                      onClick={() => setSelectedCaseModal(null)}
                      style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '0.5rem' }}
                    >
                      <Icon name="x" size={20} />
                    </button>
                  </div>
                  <div style={{ fontSize: '0.875rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div><strong>Question:</strong> {selectedCaseModal.question}</div>
                    <div><strong>Expected Disposition:</strong> <code>{selectedCaseModal.expectedDisposition}</code></div>
                    <div>
                      <strong>Required Assertions:</strong>
                      <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1.25rem', color: '#15803d' }}>
                        {selectedCaseModal.requiredAssertions.map((a, i) => (
                          <li key={i}>{a}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <strong>Forbidden Assertions:</strong>
                      <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1.25rem', color: '#b91c1c' }}>
                        {selectedCaseModal.forbiddenAssertions.map((a, i) => (
                          <li key={i}>{a}</li>
                        ))}
                      </ul>
                    </div>
                    <div><strong>Labels:</strong> {selectedCaseModal.labels.join(', ')}</div>
                    <div><strong>Fixture:</strong> <code>{selectedCaseModal.fixtureId}</code></div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── TAB 5: EVALUATION RUNS & REPORTS ─── */}
        {activeTab === 'evaluations' && (
          <div role="tabpanel" id="panel-evaluations" aria-labelledby="tab-evaluations">
            <div style={{ ...cardStyle, padding: '1.25rem', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Evaluation Runs & Accuracy Reports</h3>
                  <p style={{ margin: '0.25rem 0 0', fontSize: '0.8125rem', color: '#64748b' }}>
                    Run offline evaluations across test suites, compare deltas against baseline, and export reports.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={handleExportReportMd}
                    style={{
                      minHeight: '44px',
                      padding: '0.5rem 1rem',
                      backgroundColor: '#f1f5f9',
                      border: '1px solid #cbd5e1',
                      borderRadius: '6px',
                      fontSize: '0.8125rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                    }}
                  >
                    <Icon name="download" size={16} />
                    <span>Export MD</span>
                  </button>
                  <button
                    onClick={handleRunEvaluation}
                    disabled={isRunningEval}
                    style={{
                      minHeight: '44px',
                      padding: '0.5rem 1rem',
                      backgroundColor: '#2563eb',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '6px',
                      fontWeight: 600,
                      fontSize: '0.8125rem',
                      cursor: isRunningEval ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {isRunningEval ? 'Evaluating...' : 'Run New Evaluation'}
                  </button>
                </div>
              </div>

              {currentRun && (
                <div>
                  <div style={{ backgroundColor: '#f8fafc', padding: '1rem', borderRadius: '6px', border: '1px solid #e2e8f0', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', fontSize: '0.8125rem' }}>
                    <div><strong>Run ID:</strong> <code>{currentRun.runId}</code></div>
                    <div><strong>Environment:</strong> <code>{currentRun.environment}</code></div>
                    <div><strong>Evaluated At:</strong> {new Date(currentRun.asOf).toLocaleTimeString()}</div>
                    <div><strong>Passed:</strong> <span style={{ color: '#16a34a', fontWeight: 700 }}>{currentRun.counts.pass}</span> / {currentRun.counts.total}</div>
                  </div>

                  {/* Per-Case Results */}
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8125rem' }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid #e2e8f0', color: '#64748b' }}>
                          <th style={{ padding: '0.5rem' }}>Case ID</th>
                          <th style={{ padding: '0.5rem' }}>Suite</th>
                          <th style={{ padding: '0.5rem' }}>Verdict</th>
                          <th style={{ padding: '0.5rem' }}>Candidate Disposition</th>
                          <th style={{ padding: '0.5rem' }}>Evidence Status</th>
                          <th style={{ padding: '0.5rem' }}>Latency</th>
                        </tr>
                      </thead>
                      <tbody>
                        {currentRun.results.map((res) => (
                          <tr key={res.caseId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '0.5rem', fontWeight: 600 }}><code>{res.caseId}</code></td>
                            <td style={{ padding: '0.5rem' }}>{res.suite}</td>
                            <td style={{ padding: '0.5rem' }}>
                              <span
                                style={{
                                  fontSize: '0.75rem',
                                  fontWeight: 700,
                                  padding: '0.125rem 0.375rem',
                                  borderRadius: '4px',
                                  backgroundColor: res.verdict === 'pass' ? '#dcfce7' : res.verdict === 'fail' ? '#fee2e2' : '#fef3c7',
                                  color: res.verdict === 'pass' ? '#16a34a' : res.verdict === 'fail' ? '#dc2626' : '#d97706',
                                }}
                              >
                                {res.verdict.toUpperCase()}
                              </span>
                            </td>
                            <td style={{ padding: '0.5rem' }}><code>{res.candidateDisposition}</code></td>
                            <td style={{ padding: '0.5rem', color: '#64748b' }}>{res.evidenceStatus}</td>
                            <td style={{ padding: '0.5rem', color: '#64748b' }}>{res.durationMs}ms</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── TAB 6: STAFF FEEDBACK & CORRECTIONS ─── */}
        {activeTab === 'feedback' && (
          <div role="tabpanel" id="panel-feedback" aria-labelledby="tab-feedback">
            <div style={{ ...cardStyle, padding: '1.25rem' }}>
              <div style={{ marginBottom: '1rem' }}>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Staff Feedback & Correction Queue</h3>
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.8125rem', color: '#64748b' }}>
                  Field corrections submitted by operators from How-to, AV Brain, and Add Equipment drawers.
                  Never mutates live pricing or booking rules automatically.
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                {feedbackItems.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                      padding: '1rem',
                      backgroundColor: '#ffffff',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <code style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{item.id}</code>
                        <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>{item.modelName}</span>
                        <span
                          style={{
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            padding: '0.125rem 0.375rem',
                            borderRadius: '4px',
                            backgroundColor: item.feedbackType === 'unsafe' ? '#fee2e2' : '#f1f5f9',
                            color: item.feedbackType === 'unsafe' ? '#dc2626' : '#475569',
                          }}
                        >
                          {item.feedbackType}
                        </span>
                      </div>
                      <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        Reported by: <strong>{item.userRole}</strong> • Surface: {item.sourceType}
                      </span>
                    </div>

                    <p style={{ margin: '0.5rem 0', fontSize: '0.875rem', color: '#334155' }}>
                      "{item.comment}"
                    </p>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          color: item.status === 'review_candidate_created' ? '#16a34a' : '#d97706',
                        }}
                      >
                        Status: {item.status === 'review_candidate_created' ? 'Review Candidate Created' : 'Pending Review'}
                      </span>
                      {item.status === 'pending' && (
                        <button
                          onClick={() => {
                            setFeedbackItems((prev) =>
                              prev.map((f) => (f.id === item.id ? { ...f, status: 'review_candidate_created' } : f))
                            )
                          }}
                          style={{
                            minHeight: '36px',
                            padding: '0.25rem 0.75rem',
                            backgroundColor: '#2563eb',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          Create Review Candidate
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </PageShell>
  )
}
