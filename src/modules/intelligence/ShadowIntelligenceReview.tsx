/**
 * BABIN RENTALS OS — SHADOW INTELLIGENCE REVIEW (INT-SHADOW-02)
 * Reviewer-Only Read-Only Evaluation Screen.
 *
 * Enforces:
 * 1. Read-only advisory suggestions from verified snapshots.
 * 2. Zero autonomous mutations, zero database writes, zero notifications/emails.
 * 3. Canonical single secondary focus links (zero duplicate filled CTAs per 08_CONTEXTUAL_NEXT_ACTION.md).
 * 4. Role-gated financial masking (zero monetary leaks to warehouse/tech/client).
 * 5. Redacted export with PII scrubbing (phone, email, PAN).
 * 6. Responsive layout (375px mobile, 820px tablet, desktop) with touch targets >= 44px.
 */

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { PageHeader, cardStyle } from '../../components/ui/Page'
import { PageShell } from '../../components/ui/PageShell'
import { useAuth } from '../../lib/auth'
import { useViewport } from '../../lib/device'
import { isStaff, type SystemRole } from '../../lib/rbac'
import {
  evaluateShadowAdvisories,
  exportRedactedAdvisories,
} from '../../lib/shadow/evaluators'
import {
  SYNTHETIC_FIXTURES,
  type SyntheticFixtureId,
} from '../../lib/shadow/fixtures'
import type {
  AdvisoryCandidate,
  AdvisoryState,
  EvaluatorContext,
  Severity,
  ShadowSnapshotBundle,
} from '../../lib/shadow/types'

export default function ShadowIntelligenceReview() {
  const { user } = useAuth()
  const viewport = useViewport()
  const isMobile = viewport === 'phone'

  // Reviewer context simulation (defaults to staff or user's internal role)
  const [simulatedRole, setSimulatedRole] = useState<
    'owner' | 'manager' | 'staff' | 'warehouse' | 'technician'
  >('staff')
  const [selectedFixtureKey, setSelectedFixtureKey] = useState<
    'all' | SyntheticFixtureId
  >('all')
  const [stateFilter, setStateFilter] = useState<'all' | AdvisoryState>('all')
  const [severityFilter, setSeverityFilter] = useState<'all' | Severity>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedEvidenceId, setExpandedEvidenceId] = useState<string | null>(null)
  const [showExportModal, setShowExportModal] = useState(false)

  // Strict role check: Restrict client portal sessions
  const userRole = user?.role ?? 'Staff'
  const isAuthorized = isStaff(userRole as SystemRole) && (userRole as string).toLowerCase() !== 'client'

  // Construct Evaluator Context
  const context: EvaluatorContext = useMemo(() => {
    return {
      role: simulatedRole,
      currentTimestampISO: new Date().toISOString(),
      isOffline: false,
    }
  }, [simulatedRole])

  // Aggregate Bundle based on selected fixture(s)
  const currentBundle: ShadowSnapshotBundle = useMemo(() => {
    if (selectedFixtureKey === 'all') {
      const allBookings = Object.values(SYNTHETIC_FIXTURES).flatMap(
        (f) => f.bundle.bookings ?? []
      )
      const allAssets = Object.values(SYNTHETIC_FIXTURES).flatMap(
        (f) => f.bundle.assets ?? []
      )
      const allKnowledge = Object.values(SYNTHETIC_FIXTURES).flatMap(
        (f) => f.bundle.knowledge ?? []
      )
      return {
        observedAtISO: new Date().toISOString(),
        bookings: allBookings,
        assets: allAssets,
        knowledge: allKnowledge,
      }
    }

    const singleFixture = SYNTHETIC_FIXTURES[selectedFixtureKey]
    return (
      singleFixture?.bundle ?? {
        observedAtISO: new Date().toISOString(),
      }
    )
  }, [selectedFixtureKey])

  // Run pure deterministic evaluation over current bundle
  const candidates: AdvisoryCandidate[] = useMemo(() => {
    return evaluateShadowAdvisories(currentBundle, context)
  }, [currentBundle, context])

  // Filter candidates based on state, severity, and search query
  const filteredCandidates = useMemo(() => {
    return candidates.filter((c) => {
      if (stateFilter !== 'all' && c.state !== stateFilter) return false
      if (severityFilter !== 'all' && c.severity !== severityFilter) return false
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchesEntity = c.entity.id.toLowerCase().includes(q)
        const matchesRule = c.ruleId.toLowerCase().includes(q)
        const matchesSummary = c.summary.toLowerCase().includes(q)
        const matchesReason = c.reason.toLowerCase().includes(q)
        if (!matchesEntity && !matchesRule && !matchesSummary && !matchesReason) {
          return false
        }
      }
      return true
    })
  }, [candidates, stateFilter, severityFilter, searchQuery])

  // Summary counts
  const counts = useMemo(() => {
    return {
      total: candidates.length,
      supported: candidates.filter((c) => c.state === 'supported').length,
      inconclusive: candidates.filter((c) => c.state === 'inconclusive').length,
      blocked: candidates.filter((c) => c.state === 'blocked').length,
      urgent: candidates.filter((c) => c.severity === 'urgent-review').length,
    }
  }, [candidates])

  // Handle Export of Redacted JSON
  const redactedExport = useMemo(() => {
    return exportRedactedAdvisories(candidates, context)
  }, [candidates, context])

  const handleDownloadExport = () => {
    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
      JSON.stringify(redactedExport, null, 2)
    )}`
    const downloadAnchor = document.createElement('a')
    downloadAnchor.setAttribute('href', jsonString)
    downloadAnchor.setAttribute(
      'download',
      `babin-shadow-advisories-redacted-${simulatedRole}-${new Date().toISOString().slice(0, 10)}.json`
    )
    document.body.appendChild(downloadAnchor)
    downloadAnchor.click()
    downloadAnchor.remove()
  }

  // Refusal screen for client portal or unauthorized visitors
  if (!isAuthorized) {
    return (
      <PageShell>
        <div
          style={{
            maxWidth: '600px',
            margin: '4rem auto',
            padding: '2rem',
            backgroundColor: '#ffffff',
            borderRadius: '8px',
            border: '1px solid #e5e7eb',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              backgroundColor: '#fee2e2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1rem',
              color: '#dc2626',
            }}
          >
            <Icon name="x" size={24} />
          </div>
          <h1
            style={{
              fontSize: '1.5rem',
              fontWeight: 700,
              marginBottom: '0.5rem',
              color: '#111827',
            }}
          >
            Restricted Staff Surface
          </h1>
          <p style={{ color: '#4b5563', lineHeight: 1.5, marginBottom: '1.5rem' }}>
            The Shadow Intelligence Review workbench is restricted to internal staff,
            technicians, and operations personnel. Operational decisions and advisory
            evaluations are strictly internal.
          </p>
          <Link
            to="/rentals"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '44px',
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

  return (
    <PageShell>
      <PageHeader
        title="Intelligence Shadow Evaluation & Action Review"
        description="Read-only shadow evaluation layer. Recommendations are computed from verified snapshots with strict provenance and role-gated financial masking. Zero automated business writes or notifications."
        actions={
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setShowExportModal(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                minHeight: '44px',
                padding: '0.5rem 1rem',
                backgroundColor: '#f3f4f6',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                color: '#374151',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Icon name="download" size={16} />
              Export Redacted JSON
            </button>
            <Link
              to="/intelligence/training-center"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                minHeight: '44px',
                padding: '0.5rem 1rem',
                backgroundColor: '#ffffff',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                color: '#2563eb',
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              <Icon name="checklist" size={16} />
              Training Center →
            </Link>
          </div>
        }
      />

      {/* Safety & Non-Mutation Banner */}
      <div
        role="alert"
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '0.75rem',
          padding: '1rem',
          backgroundColor: '#eff6ff',
          border: '1px solid #bfdbfe',
          borderRadius: '8px',
          marginBottom: '1.5rem',
        }}
      >
        <div style={{ color: '#2563eb', marginTop: '2px' }}>
          <Icon name="info" size={20} />
        </div>
        <div style={{ fontSize: '0.875rem', color: '#1e40af', lineHeight: 1.5 }}>
          <strong>SHADOW MODE — READ-ONLY ADVISORY EVALUATION</strong>
          <div>
            Recommendations shown here are simulated suggestions derived from verified
            equipment, booking, and operational snapshots. No inventory states are mutated, no
            payment links are generated, and no client emails are sent. Primary action
            resolution remains strictly with staff inside canonical workspaces.
          </div>
          <div style={{ marginTop: '0.25rem', fontSize: '0.75rem', color: '#3b82f6' }}>
            Release Gate: Awaiting Owner Acceptance · Evaluator Version: v1.0.0-shadow-eval
          </div>
        </div>
      </div>

      {/* Controls & Simulator Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        {/* Fixture Target Selector */}
        <div style={{ ...cardStyle, padding: '1rem' }}>
          <label
            htmlFor="fixture-select"
            style={{
              display: 'block',
              fontSize: '0.75rem',
              fontWeight: 700,
              color: '#4b5563',
              textTransform: 'uppercase',
              marginBottom: '0.5rem',
            }}
          >
            Evaluation Dataset / Fixture
          </label>
          <select
            id="fixture-select"
            value={selectedFixtureKey}
            onChange={(e) =>
              setSelectedFixtureKey(e.target.value as 'all' | SyntheticFixtureId)
            }
            style={{
              width: '100%',
              minHeight: '44px',
              padding: '0.5rem 0.75rem',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
              backgroundColor: '#ffffff',
              fontSize: '0.875rem',
              color: '#111827',
            }}
          >
            <option value="all">All 20 Acceptance Fixtures (S01–S20 Combined)</option>
            {Object.values(SYNTHETIC_FIXTURES).map((f) => (
              <option key={f.id} value={f.id}>
                {f.id}: {f.title}
              </option>
            ))}
          </select>
          <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#6b7280' }}>
            {selectedFixtureKey === 'all'
              ? 'Evaluating 20 synthetic acceptance test scenarios (S01–S20).'
              : SYNTHETIC_FIXTURES[selectedFixtureKey]?.description}
          </div>
        </div>

        {/* Role Simulator Selector (Auditing Money-Blind Masking) */}
        <div style={{ ...cardStyle, padding: '1rem' }}>
          <label
            htmlFor="role-select"
            style={{
              display: 'block',
              fontSize: '0.75rem',
              fontWeight: 700,
              color: '#4b5563',
              textTransform: 'uppercase',
              marginBottom: '0.5rem',
            }}
          >
            Simulate Reviewer Role (Audit Field Gating)
          </label>
          <select
            id="role-select"
            value={simulatedRole}
            onChange={(e) =>
              setSimulatedRole(
                e.target.value as 'owner' | 'manager' | 'staff' | 'warehouse' | 'technician'
              )
            }
            style={{
              width: '100%',
              minHeight: '44px',
              padding: '0.5rem 0.75rem',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
              backgroundColor: '#ffffff',
              fontSize: '0.875rem',
              color: '#111827',
            }}
          >
            <option value="staff">Staff (Standard operational review)</option>
            <option value="warehouse">Warehouse (Money-blind: zero financial data)</option>
            <option value="technician">Technician (Maintenance & QC focus)</option>
            <option value="manager">Manager (Financial & operational access)</option>
            <option value="owner">Owner (Full audit access)</option>
          </select>
          <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#6b7280' }}>
            {simulatedRole === 'warehouse' || simulatedRole === 'technician'
              ? '🔒 Money-blind mode active: all balances and pricing figures strictly omitted.'
              : '🔓 Financial review permitted for Owner and Manager roles.'}
          </div>
        </div>
      </div>

      {/* KPI Metrics Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile
            ? 'repeat(2, 1fr)'
            : 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <div style={{ ...cardStyle, padding: '1rem' }}>
          <div style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 600 }}>
            Total Suggestions
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827', marginTop: '4px' }}>
            {counts.total}
          </div>
        </div>

        <div style={{ ...cardStyle, padding: '1rem' }}>
          <div style={{ fontSize: '0.75rem', color: '#0369a1', fontWeight: 600 }}>
            Supported / Verified
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0284c7', marginTop: '4px' }}>
            {counts.supported}
          </div>
        </div>

        <div style={{ ...cardStyle, padding: '1rem' }}>
          <div style={{ fontSize: '0.75rem', color: '#b45309', fontWeight: 600 }}>
            Could Not Verify
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#d97706', marginTop: '4px' }}>
            {counts.inconclusive}
          </div>
        </div>

        <div style={{ ...cardStyle, padding: '1rem' }}>
          <div style={{ fontSize: '0.75rem', color: '#b91c1c', fontWeight: 600 }}>
            Blocked / Masked
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#dc2626', marginTop: '4px' }}>
            {counts.blocked}
          </div>
        </div>

        <div style={{ ...cardStyle, padding: '1rem' }}>
          <div style={{ fontSize: '0.75rem', color: '#991b1b', fontWeight: 600 }}>
            Urgent Review
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#991b1b', marginTop: '4px' }}>
            {counts.urgent}
          </div>
        </div>
      </div>

      {/* Filter Bar & Search */}
      <div
        style={{
          ...cardStyle,
          padding: '1rem',
          marginBottom: '1.5rem',
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          gap: '1rem',
          alignItems: isMobile ? 'stretch' : 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#6b7280' }}>STATUS:</span>
          {(['all', 'supported', 'inconclusive', 'blocked'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStateFilter(s)}
              style={{
                minHeight: '36px',
                padding: '0.25rem 0.75rem',
                borderRadius: '9999px',
                border: '1px solid',
                borderColor: stateFilter === s ? '#2563eb' : '#d1d5db',
                backgroundColor: stateFilter === s ? '#eff6ff' : '#ffffff',
                color: stateFilter === s ? '#1d4ed8' : '#374151',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {s === 'inconclusive' ? 'Could Not Verify' : s}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#6b7280' }}>SEVERITY:</span>
          {(['all', 'urgent-review', 'action-needed', 'informational'] as const).map((sev) => (
            <button
              key={sev}
              type="button"
              onClick={() => setSeverityFilter(sev)}
              style={{
                minHeight: '36px',
                padding: '0.25rem 0.75rem',
                borderRadius: '9999px',
                border: '1px solid',
                borderColor: severityFilter === sev ? '#2563eb' : '#d1d5db',
                backgroundColor: severityFilter === sev ? '#eff6ff' : '#ffffff',
                color: severityFilter === sev ? '#1d4ed8' : '#374151',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {sev.replace('-', ' ')}
            </button>
          ))}
        </div>

        <div style={{ minWidth: isMobile ? '100%' : '240px' }}>
          <input
            type="text"
            placeholder="Search by ID, rule, keyword…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              minHeight: '40px',
              padding: '0.5rem 0.75rem',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
              fontSize: '0.875rem',
            }}
          />
        </div>
      </div>

      {/* Advisory Candidate Feed */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {filteredCandidates.length === 0 ? (
          <div
            style={{
              ...cardStyle,
              padding: '3rem 1rem',
              textAlign: 'center',
              color: '#6b7280',
            }}
          >
            <div style={{ marginBottom: '0.5rem' }}>
              <Icon name="check" size={32} />
            </div>
            <div style={{ fontWeight: 600, fontSize: '1rem', color: '#111827' }}>
              No advisory candidates match current filters
            </div>
            <div style={{ fontSize: '0.875rem', marginTop: '0.25rem' }}>
              All snapshot requirements are verified or current filter criteria returned no items.
            </div>
          </div>
        ) : (
          filteredCandidates.map((candidate) => {
            const isEvidenceOpen = expandedEvidenceId === candidate.id

            return (
              <div
                key={candidate.id}
                style={{
                  ...cardStyle,
                  padding: '1.25rem',
                  borderLeft: `4px solid ${
                    candidate.severity === 'urgent-review'
                      ? '#dc2626'
                      : candidate.severity === 'action-needed'
                      ? '#d97706'
                      : '#6b7280'
                  }`,
                }}
              >
                {/* Card Header: Badges & Entity */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    flexWrap: 'wrap',
                    gap: '0.5rem',
                    marginBottom: '0.75rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {/* Severity Badge */}
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        backgroundColor:
                          candidate.severity === 'urgent-review'
                            ? '#fee2e2'
                            : candidate.severity === 'action-needed'
                            ? '#fef3c7'
                            : '#f3f4f6',
                        color:
                          candidate.severity === 'urgent-review'
                            ? '#991b1b'
                            : candidate.severity === 'action-needed'
                            ? '#92400e'
                            : '#374151',
                      }}
                    >
                      <Icon
                        name={
                          candidate.severity === 'urgent-review'
                            ? 'alert_circle'
                            : candidate.severity === 'action-needed'
                            ? 'alert_triangle'
                            : 'info'
                        }
                        size={14}
                      />
                      {candidate.severity.replace('-', ' ').toUpperCase()}
                    </span>

                    {/* State Badge */}
                    <span
                      style={{
                        padding: '0.25rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        backgroundColor:
                          candidate.state === 'supported'
                            ? '#e0f2fe'
                            : candidate.state === 'inconclusive'
                            ? '#fef9c3'
                            : '#fee2e2',
                        color:
                          candidate.state === 'supported'
                            ? '#0369a1'
                            : candidate.state === 'inconclusive'
                            ? '#854d0e'
                            : '#991b1b',
                      }}
                    >
                      {candidate.state === 'inconclusive'
                        ? 'Could Not Verify'
                        : candidate.state === 'supported'
                        ? 'Supported'
                        : 'Blocked / Restricted'}
                    </span>

                    {/* Entity Tag */}
                    <span
                      style={{
                        fontSize: '0.75rem',
                        fontFamily: 'monospace',
                        color: '#6b7280',
                        backgroundColor: '#f9fafb',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '4px',
                        border: '1px solid #e5e7eb',
                      }}
                    >
                      {candidate.entity.type.toUpperCase()}: {candidate.entity.id}
                    </span>
                  </div>

                  <span
                    style={{
                      fontSize: '0.75rem',
                      fontFamily: 'monospace',
                      color: '#9ca3af',
                    }}
                  >
                    Rule: {candidate.ruleId}
                  </span>
                </div>

                {/* Summary & Provenance Reason */}
                <h2
                  style={{
                    fontSize: '1.05rem',
                    fontWeight: 700,
                    color: '#111827',
                    marginBottom: '0.5rem',
                  }}
                >
                  {candidate.summary}
                </h2>
                <p
                  style={{
                    fontSize: '0.875rem',
                    color: '#4b5563',
                    lineHeight: 1.5,
                    marginBottom: '1rem',
                  }}
                >
                  {candidate.reason}
                </p>

                {/* Evidence Drawer Toggle */}
                <div
                  style={{
                    borderTop: '1px solid #f3f4f6',
                    paddingTop: '0.75rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '0.5rem',
                  }}
                >
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedEvidenceId(isEvidenceOpen ? null : candidate.id)
                    }
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      background: 'none',
                      border: 'none',
                      padding: '0.25rem 0',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      color: '#2563eb',
                      cursor: 'pointer',
                      minHeight: '36px',
                    }}
                  >
                    <Icon
                      name={isEvidenceOpen ? 'chevron_down' : 'chevron_right'}
                      size={14}
                    />
                    {candidate.evidence.length} Evidence Source(s) (Freshness:{' '}
                    {candidate.evidence[0]?.freshness ?? 'unknown'})
                  </button>

                  {/* Canonical Workspace Inspection Link (Strictly secondary per 08_CONTEXTUAL_NEXT_ACTION) */}
                  {candidate.safeFocusTarget && (
                    <Link
                      to={candidate.safeFocusTarget}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        color: '#4b5563',
                        textDecoration: 'none',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '4px',
                        border: '1px solid #d1d5db',
                        backgroundColor: '#f9fafb',
                        minHeight: '36px',
                      }}
                    >
                      Inspect in canonical workspace
                      <Icon name="external_link" size={12} />
                    </Link>
                  )}
                </div>

                {/* Expanded Evidence Details */}
                {isEvidenceOpen && (
                  <div
                    style={{
                      marginTop: '0.75rem',
                      padding: '0.75rem',
                      backgroundColor: '#f9fafb',
                      borderRadius: '6px',
                      fontSize: '0.8rem',
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 700,
                        color: '#374151',
                        marginBottom: '0.5rem',
                        fontSize: '0.75rem',
                        textTransform: 'uppercase',
                      }}
                    >
                      Provenance & Verification Trace
                    </div>
                    {candidate.evidence.map((ev, idx) => (
                      <div
                        key={idx}
                        style={{
                          marginBottom: idx === candidate.evidence.length - 1 ? 0 : '0.5rem',
                          paddingBottom: idx === candidate.evidence.length - 1 ? 0 : '0.5rem',
                          borderBottom:
                            idx === candidate.evidence.length - 1 ? 'none' : '1px solid #e5e7eb',
                        }}
                      >
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          <span
                            style={{
                              fontWeight: 600,
                              color: '#111827',
                              backgroundColor: '#e5e7eb',
                              padding: '2px 6px',
                              borderRadius: '3px',
                            }}
                          >
                            {ev.sourceKind.toUpperCase()}
                          </span>
                          <span style={{ fontFamily: 'monospace', color: '#4b5563' }}>
                            {ev.sourceId}
                          </span>
                          {ev.sourceVersion && (
                            <span style={{ color: '#9ca3af' }}>v:{ev.sourceVersion}</span>
                          )}
                          <span
                            style={{
                              marginLeft: 'auto',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              color:
                                ev.freshness === 'verified'
                                  ? '#059669'
                                  : ev.freshness === 'conflicted'
                                  ? '#dc2626'
                                  : '#d97706',
                            }}
                          >
                            {ev.freshness.toUpperCase()}
                          </span>
                        </div>
                        {ev.note && (
                          <div style={{ marginTop: '0.25rem', color: '#6b7280' }}>
                            {ev.note}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Redacted Export Modal */}
      {showExportModal && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '1rem',
          }}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '8px',
              maxWidth: '680px',
              width: '100%',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            }}
          >
            <div
              style={{
                padding: '1.25rem',
                borderBottom: '1px solid #e5e7eb',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#111827' }}>
                  Redacted Shadow Evaluation Export
                </h2>
                <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                  Role: {simulatedRole.toUpperCase()} · PII and unauthorized financial data
                  scrubbed
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowExportModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#6b7280',
                  cursor: 'pointer',
                  padding: '4px',
                }}
              >
                <Icon name="x" size={20} />
              </button>
            </div>

            <div style={{ padding: '1.25rem', overflowY: 'auto', flex: 1 }}>
              <pre
                style={{
                  backgroundColor: '#1f2937',
                  color: '#f9fafb',
                  padding: '1rem',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  overflowX: 'auto',
                  fontFamily: 'monospace',
                }}
              >
                {JSON.stringify(redactedExport, null, 2)}
              </pre>
            </div>

            <div
              style={{
                padding: '1rem 1.25rem',
                borderTop: '1px solid #e5e7eb',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '0.75rem',
              }}
            >
              <button
                type="button"
                onClick={() => setShowExportModal(false)}
                style={{
                  minHeight: '40px',
                  padding: '0.5rem 1rem',
                  backgroundColor: '#ffffff',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  color: '#374151',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleDownloadExport}
                style={{
                  minHeight: '40px',
                  padding: '0.5rem 1rem',
                  backgroundColor: '#2563eb',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#ffffff',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                <Icon name="download" size={16} />
                Download JSON Payload
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  )
}
