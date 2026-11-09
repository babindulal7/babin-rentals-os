import { useState, useEffect, useRef, useMemo } from 'react'
import Icon from '../../../components/ui/Icon'
import { Card, Button } from '../../../components/ui/Page'
import { LoadingSkeleton, ErrorBanner, EmptyState } from '../../../components/ui/StateViews'
import { useAuth } from '../../../lib/auth'
import { canManageMessageTemplates } from '../../../lib/rbac'
import {
  useMessageTemplates,
  useMessageTemplateHistory,
} from '../../../lib/queries/messageTemplates'
import {
  saveMessageTemplate,
  restoreMessageTemplate,
} from '../../../actions/settings/messageTemplates'
import { toBs, formatBs, formatAd } from '../../../lib/bs'

const SAMPLE_BOOKING_CONTEXT: Record<string, string> = {
  client_name: 'Aarav Sharma',
  booking_number: 'BK-2026-0842',
  pickup_date: '2026-11-10',
  pickup_time: '10:00 AM NPT',
  return_date: '2026-11-14',
  return_time: '06:00 PM NPT',
  equipment_list: '1x Sony FX6 Cinema Package, 2x Sony 160GB CFexpress Type A, 1x Miller Compass 25 Tripod',
  action_url: 'https://rentals.babin.com/r/BK-2026-0842',
  portal_url: 'https://rentals.babin.com/portal',
  company_name: 'Babin Rentals Pvt. Ltd.',
  company_phone: '+977 9801234567',
  company_email: 'ops@babinrentals.com',
  amount_due: 'Rs 35,000',
  due_date: '2026-11-12',
  pay_url: 'https://rentals.babin.com/pay/INV-2026-0412',
  invoice_number: 'INV-2026-0412',
  bank_details: 'Nabil Bank A/C: 01200175001234 (Babin Rentals Pvt Ltd)',
  validity_days: '7',
  contact_name: 'Babin Dulal',
  unsubscribe_url: 'https://rentals.babin.com/unsubscribe?token=sample-tok',
  company_address: 'Putalisadak, Kathmandu, Nepal',
  dispatcher_name: 'Bikash Thapa',
  technician_name: 'Ramesh Adhikari',
  jurisdiction: 'Kathmandu, Nepal',
}

function interpolateTemplate(text: string, context: Record<string, string>): string {
  return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    return context[key] !== undefined ? context[key] : `{{${key}}}`
  })
}

export function TextsPane() {
  const { user } = useAuth()
  const role = user?.role
  const authorized = canManageMessageTemplates(role ?? 'Client')

  const { templates, loading, error, reload } = useMessageTemplates()
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'email' | 'document'>('all')
  const [search, setSearch] = useState('')

  // Editor form state
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [saveLoading, setSaveLoading] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  const textAreaRef = useRef<HTMLTextAreaElement>(null)

  // Filter templates
  const filteredTemplates = useMemo(() => {
    return templates.filter((t) => {
      if (categoryFilter !== 'all' && t.category !== categoryFilter) return false
      if (!search.trim()) return true
      const q = search.toLowerCase().trim()
      return (
        t.name.toLowerCase().includes(q) ||
        t.template_key.toLowerCase().includes(q) ||
        (t.description && t.description.toLowerCase().includes(q))
      )
    })
  }, [templates, categoryFilter, search])

  // Select initial template
  useEffect(() => {
    if (!selectedKey && filteredTemplates.length > 0 && filteredTemplates[0]) {
      setSelectedKey(filteredTemplates[0].template_key)
    }
  }, [selectedKey, filteredTemplates])

  const selectedTemplate = useMemo(() => {
    return templates.find((t) => t.template_key === selectedKey) || null
  }, [templates, selectedKey])

  // History hook
  const {
    history,
    loading: historyLoading,
    reload: reloadHistory,
  } = useMessageTemplateHistory(selectedKey)

  // Update editor fields when selected template changes
  useEffect(() => {
    if (selectedTemplate) {
      setSubject(selectedTemplate.subject || '')
      setBody(selectedTemplate.body || '')
      setSaveSuccess(null)
      setSaveError(null)
    }
  }, [selectedTemplate])

  // Insert placeholder chip into textarea
  const insertPlaceholder = (ph: string) => {
    const textarea = textAreaRef.current
    const token = `{{${ph}}}`
    if (!textarea) {
      setBody((prev) => prev + token)
      return
    }

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const nextBody = body.substring(0, start) + token + body.substring(end)
    setBody(nextBody)

    // Restore focus and cursor position after insertion
    setTimeout(() => {
      textarea.focus()
      const nextPos = start + token.length
      textarea.setSelectionRange(nextPos, nextPos)
    }, 0)
  }

  // Handle Save
  const handleSave = async () => {
    if (!selectedTemplate || !user) return
    setSaveLoading(true)
    setSaveError(null)
    setSaveSuccess(null)

    try {
      const res = await saveMessageTemplate(
        {
          templateKey: selectedTemplate.template_key,
          subject: selectedTemplate.category === 'email' ? subject : null,
          body,
        },
        {
          userId: user.id,
          role: user.role,
          isOnline: true,
        },
      )

      await reload()
      await reloadHistory()
      setSaveSuccess(`Version ${res.template.version} saved successfully!`)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaveLoading(false)
    }
  }

  // Handle Restore
  const handleRestore = async (version: number) => {
    if (!selectedTemplate || !user) return
    setSaveLoading(true)
    setSaveError(null)
    setSaveSuccess(null)

    try {
      const res = await restoreMessageTemplate(
        {
          templateKey: selectedTemplate.template_key,
          targetVersion: version,
        },
        {
          userId: user.id,
          role: user.role,
          isOnline: true,
        },
      )

      await reload()
      await reloadHistory()
      setSaveSuccess(`Version ${version} restored as new active version ${res.template.version} (append-only)!`)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaveLoading(false)
    }
  }

  // Gated Restricted State (B20)
  if (!authorized) {
    return (
      <div className="card" style={{ padding: 'var(--sp-xl)', textAlign: 'center' }}>
        <Icon name="lock" size={36} style={{ color: 'var(--muted)', margin: '0 auto var(--sp-md)' }} />
        <h3 style={{ fontSize: 'var(--t-title)', marginBottom: 'var(--sp-xs)' }}>Access Restricted</h3>
        <p style={{ color: 'var(--text2)', maxWidth: 500, margin: '0 auto' }}>
          Settings ▸ Texts is restricted to <strong>Owner</strong> and <strong>Admin</strong> (B20). Your role ({role ?? 'Guest'}) does not have permission to view or edit message templates.
        </p>
      </div>
    )
  }

  if (loading) {
    return <LoadingSkeleton type="card" label="Loading message and document texts…" />
  }

  if (error) {
    return <ErrorBanner title="Could not load templates" message={error} />
  }

  return (
    <div className="texts-control-root" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      {/* Top Filter Bar */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 'var(--sp-sm)',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', gap: 'var(--sp-xs)' }} role="group" aria-label="Category filter">
          <Button
            variant={categoryFilter === 'all' ? 'primary' : 'ghost'}
            onClick={() => setCategoryFilter('all')}
            style={{ minHeight: 44 }}
          >
            All Texts ({templates.length})
          </Button>
          <Button
            variant={categoryFilter === 'email' ? 'primary' : 'ghost'}
            onClick={() => setCategoryFilter('email')}
            style={{ minHeight: 44 }}
          >
            Client Emails ({templates.filter((t) => t.category === 'email').length})
          </Button>
          <Button
            variant={categoryFilter === 'document' ? 'primary' : 'ghost'}
            onClick={() => setCategoryFilter('document')}
            style={{ minHeight: 44 }}
          >
            Document Footers & Terms ({templates.filter((t) => t.category === 'document').length})
          </Button>
        </div>

        <div style={{ position: 'relative', minWidth: 240 }}>
          <input
            type="text"
            className="input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search templates or placeholders…"
            aria-label="Search message templates"
            style={{ minHeight: 44, width: '100%', paddingLeft: 32 }}
          />
          <span style={{ position: 'absolute', left: 10, top: 13, color: 'var(--muted)', pointerEvents: 'none' }}>
            <Icon name="search" size={16} />
          </span>
        </div>
      </div>

      {/* Main Two-Column Layout */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(280px, 340px) 1fr',
          gap: 'var(--sp-md)',
          alignItems: 'start',
        }}
      >
        {/* Left Column: Template List */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--sp-xs)',
            maxHeight: '75vh',
            overflowY: 'auto',
          }}
        >
          {filteredTemplates.length === 0 ? (
            <EmptyState title="No templates found" description="Try a different search term or category filter." />
          ) : (
            filteredTemplates.map((tmpl) => {
              const isSelected = tmpl.template_key === selectedKey
              return (
                <button
                  key={tmpl.id}
                  type="button"
                  onClick={() => setSelectedKey(tmpl.template_key)}
                  className="tap"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    gap: 4,
                    padding: '12px 14px',
                    borderRadius: 'var(--r-md)',
                    border: `1px solid ${isSelected ? 'var(--primary)' : 'var(--border)'}`,
                    background: isSelected ? 'var(--card2)' : 'var(--surface-1)',
                    textAlign: 'left',
                    minHeight: 56,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  aria-pressed={isSelected}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                    <span style={{ fontWeight: 600, fontSize: 'var(--t-body)', color: 'var(--text)' }}>
                      {tmpl.name}
                    </span>
                    <span
                      className="badge badge-neutral"
                      style={{
                        fontSize: '0.72rem',
                        textTransform: 'uppercase',
                        padding: '2px 6px',
                      }}
                    >
                      v{tmpl.version}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                    <span style={{ textTransform: 'capitalize' }}>{tmpl.category}</span>
                    <span>·</span>
                    <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.75rem' }}>
                      {tmpl.template_key}
                    </span>
                  </div>
                  {tmpl.description && (
                    <div
                      style={{
                        fontSize: '0.8rem',
                        color: 'var(--muted)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        width: '100%',
                      }}
                    >
                      {tmpl.description}
                    </div>
                  )}
                </button>
              )
            })
          )}
        </div>

        {/* Right Column: Template Editor */}
        {selectedTemplate ? (
          <Card>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
              {/* Template Title & Status */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--sp-sm)' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-xs)' }}>
                    <h3 style={{ fontSize: 'var(--t-title)', fontWeight: 700, margin: 0 }}>
                      {selectedTemplate.name}
                    </h3>
                    <span className="badge badge-success" style={{ fontWeight: 600 }}>
                      v{selectedTemplate.version} (Active)
                    </span>
                  </div>
                  <p style={{ color: 'var(--text2)', margin: '4px 0 0 0', fontSize: 'var(--t-meta)' }}>
                    {selectedTemplate.description}
                  </p>
                </div>

                <div style={{ display: 'flex', gap: 'var(--sp-xs)' }}>
                  <Button
                    variant="ghost"
                    onClick={() => setShowPreview(!showPreview)}
                    style={{ minHeight: 44 }}
                    icon="eye"
                  >
                    {showPreview ? 'Hide Preview' : 'Preview with Booking'}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => setShowHistory(!showHistory)}
                    style={{ minHeight: 44 }}
                    icon="clock"
                  >
                    {showHistory ? 'Hide History' : 'Version History'}
                  </Button>
                </div>
              </div>

              {/* Legal Notice Banner for Documents (Law 7) */}
              {selectedTemplate.category === 'document' && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 'var(--sp-sm)',
                    padding: '10px 14px',
                    borderRadius: 'var(--r-sm)',
                    border: '1px solid var(--border)',
                    background: 'var(--card2)',
                    fontSize: 'var(--t-meta)',
                    color: 'var(--text2)',
                  }}
                >
                  <Icon name="lock" size={16} style={{ flexShrink: 0, marginTop: 2, color: 'var(--primary)' }} />
                  <div>
                    <strong>Legal Notice:</strong> Tax invoice number, PAN, and VAT lines are immutable and generated automatically by the financial engine. Only supplementary terms, notes, and instructions are editable here.
                  </div>
                </div>
              )}

              {/* Success / Error Banners */}
              {saveSuccess && (
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: 'var(--r-sm)',
                    background: 'rgba(34, 197, 94, 0.1)',
                    border: '1px solid rgba(34, 197, 94, 0.3)',
                    color: '#15803d',
                    fontSize: 'var(--t-body)',
                  }}
                >
                  {saveSuccess}
                </div>
              )}
              {saveError && <ErrorBanner title="Save Failed" message={saveError} />}

              {/* Subject Field (Email only) */}
              {selectedTemplate.category === 'email' && (
                <div>
                  <label
                    htmlFor="template-subject"
                    style={{ display: 'block', fontWeight: 600, marginBottom: 4, fontSize: 'var(--t-meta)' }}
                  >
                    Email Subject Line
                  </label>
                  <input
                    id="template-subject"
                    type="text"
                    className="input"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    style={{ minHeight: 44, width: '100%' }}
                    placeholder="e.g. Your gear booking {{booking_number}} is confirmed"
                  />
                </div>
              )}

              {/* Body Textarea */}
              <div>
                <label
                  htmlFor="template-body"
                  style={{ display: 'block', fontWeight: 600, marginBottom: 4, fontSize: 'var(--t-meta)' }}
                >
                  Template Wording Body
                </label>
                <textarea
                  id="template-body"
                  ref={textAreaRef}
                  className="input"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={8}
                  style={{
                    width: '100%',
                    fontFamily: 'var(--font-sans)',
                    fontSize: 'var(--t-body)',
                    lineHeight: 1.5,
                    padding: 10,
                  }}
                  placeholder="Enter template body text…"
                />
              </div>

              {/* Placeholder Chips Bar */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontWeight: 600, fontSize: 'var(--t-meta)', color: 'var(--text)' }}>
                    Allowed Placeholders (Click to insert):
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                    Amounts are server-filled only; never hardcoded
                  </span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {selectedTemplate.allowed_placeholders.map((ph) => (
                    <button
                      key={ph}
                      type="button"
                      onClick={() => insertPlaceholder(ph)}
                      className="tap"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '6px 12px',
                        minHeight: 44,
                        borderRadius: 'var(--r-sm)',
                        border: '1px solid var(--border)',
                        background: 'var(--surface-2)',
                        color: 'var(--primary)',
                        fontFamily: 'var(--font-mono, monospace)',
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                      }}
                      title={`Click to insert {{${ph}}}`}
                    >
                      <span>+</span>
                      <span>{`{{${ph}}}`}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: 'var(--sp-sm)', justifyContent: 'flex-end', paddingTop: 'var(--sp-xs)' }}>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setSubject(selectedTemplate.subject || '')
                    setBody(selectedTemplate.body || '')
                    setSaveSuccess(null)
                    setSaveError(null)
                  }}
                  style={{ minHeight: 44 }}
                  disabled={saveLoading}
                >
                  Discard Edits
                </Button>
                <Button
                  variant="primary"
                  onClick={handleSave}
                  style={{ minHeight: 44 }}
                  disabled={saveLoading}
                  icon="check"
                >
                  {saveLoading ? 'Saving New Version…' : 'Save New Version'}
                </Button>
              </div>

              {/* Live Booking Preview Box */}
              {showPreview && (
                <div
                  style={{
                    marginTop: 'var(--sp-sm)',
                    padding: 'var(--sp-md)',
                    borderRadius: 'var(--r-md)',
                    background: 'var(--card2)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <Icon name="eye" size={16} style={{ color: 'var(--primary)' }} />
                    <span style={{ fontWeight: 600, fontSize: 'var(--t-body)' }}>
                      Preview with Real Booking (Aarav Sharma · BK-2026-0842)
                    </span>
                  </div>
                  {selectedTemplate.category === 'email' && (
                    <div style={{ marginBottom: 8, paddingBottom: 6, borderBottom: '1px dashed var(--border)' }}>
                      <strong style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>Subject: </strong>
                      <span style={{ fontWeight: 600 }}>{interpolateTemplate(subject, SAMPLE_BOOKING_CONTEXT)}</span>
                    </div>
                  )}
                  <div
                    style={{
                      whiteSpace: 'pre-wrap',
                      fontSize: 'var(--t-body)',
                      lineHeight: 1.6,
                      color: 'var(--text)',
                      background: 'var(--surface-1)',
                      padding: 12,
                      borderRadius: 'var(--r-sm)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    {interpolateTemplate(body, SAMPLE_BOOKING_CONTEXT)}
                  </div>
                </div>
              )}

              {/* Version History Drawer */}
              {showHistory && (
                <div
                  style={{
                    marginTop: 'var(--sp-sm)',
                    padding: 'var(--sp-md)',
                    borderRadius: 'var(--r-md)',
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                    <Icon name="clock" size={16} style={{ color: 'var(--primary)' }} />
                    <span style={{ fontWeight: 600, fontSize: 'var(--t-body)' }}>
                      Version History ({history.length} versions)
                    </span>
                  </div>

                  {historyLoading ? (
                    <p style={{ color: 'var(--muted)', fontSize: 'var(--t-meta)' }}>Loading versions…</p>
                  ) : history.length === 0 ? (
                    <p style={{ color: 'var(--muted)', fontSize: 'var(--t-meta)' }}>No history found.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {history.map((ver) => {
                        const date = new Date(ver.created_at)
                        const bs = toBs(date)
                        const dateStr = `${bs ? formatBs(bs) : ''} · ${formatAd(date)}`
                        return (
                          <div
                            key={ver.id}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              padding: '10px 12px',
                              borderRadius: 'var(--r-sm)',
                              background: ver.is_active ? 'var(--card)' : 'var(--surface-1)',
                              border: `1px solid ${ver.is_active ? 'var(--primary)' : 'var(--border)'}`,
                            }}
                          >
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ fontWeight: 700, fontSize: 'var(--t-body)' }}>
                                  Version {ver.version}
                                </span>
                                {ver.is_active && (
                                  <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>
                                    Current Active
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: '0.8rem', color: 'var(--text2)', marginTop: 2 }}>
                                Created: {dateStr}
                              </div>
                              <div
                                style={{
                                  fontSize: '0.78rem',
                                  color: 'var(--muted)',
                                  marginTop: 4,
                                  maxHeight: 40,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                }}
                              >
                                {ver.body.slice(0, 120)}…
                              </div>
                            </div>

                            {!ver.is_active && (
                              <Button
                                variant="ghost"
                                onClick={() => handleRestore(ver.version)}
                                disabled={saveLoading}
                                style={{ minHeight: 44, flexShrink: 0 }}
                                icon="refresh"
                              >
                                Restore this version
                              </Button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  )
}
export default TextsPane
