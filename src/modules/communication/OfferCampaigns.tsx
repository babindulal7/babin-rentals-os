import React, { useState, useEffect, useId, useCallback } from 'react'
import { useAuth } from '../../lib/auth'
import { canManageOfferCampaigns } from '../../lib/rbac'
import {
  saveOfferCampaign,
  testOfferCampaign,
  previewOfferAudience,
  queueOfferCampaign,
  type AudienceFilter,
} from '../../actions/marketing/offerCampaigns'
import {
  fetchOfferCampaigns,
  type OfferCampaignRecord,
} from '../../lib/queries/offerCampaigns'
import Icon from '../../components/ui/Icon'

export function OfferCampaigns(): React.ReactElement {
  const { user } = useAuth()
  const role = user?.role

  // Screen states
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [campaigns, setCampaigns] = useState<OfferCampaignRecord[]>([])
  const [isOffline, setIsOffline] = useState(!navigator.onLine)

  // Composer form state
  const [subject, setSubject] = useState('')
  const [bodyMarkdown, setBodyMarkdown] = useState('')
  const [heroImageUrl, setHeroImageUrl] = useState('')
  const [ctaButtonText, setCtaButtonText] = useState('Book Gear Online')
  const [ctaButtonUrl, setCtaButtonUrl] = useState('https://book.babinrentals.com')
  const [membershipTier, setMembershipTier] = useState<string>('all')
  const [previewMode, setPreviewMode] = useState<'edit' | 'preview'>('edit')

  // Campaign workflow state
  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null)
  const [campaignStatus, setCampaignStatus] = useState<'draft' | 'test_sent' | 'queued' | 'completed'>('draft')
  const [testEmail, setTestEmail] = useState('')
  const [testSentInfo, setTestSentInfo] = useState<{ email: string; at: string } | null>(null)

  // Audience numbers
  const [audienceLoading, setAudienceLoading] = useState(false)
  const [audienceCounts, setAudienceCounts] = useState<{
    eligible: number
    optedOut: number
    noEmail: number
  } | null>(null)

  // Action submission states
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [broadcasting, setBroadcasting] = useState(false)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const subjectInputId = useId()
  const bodyInputId = useId()
  const heroInputId = useId()
  const ctaTextInputId = useId()
  const ctaUrlInputId = useId()
  const testEmailInputId = useId()
  const membershipFilterId = useId()

  // Track online/offline
  useEffect(() => {
    function onOnline() {
      setIsOffline(false)
    }
    function onOffline() {
      setIsOffline(true)
    }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  // Load campaigns
  const loadCampaigns = useCallback(async () => {
    if (!canManageOfferCampaigns(role)) {
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      setError(null)
      const data = await fetchOfferCampaigns()
      setCampaigns(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load offer campaigns.')
    } finally {
      setLoading(false)
    }
  }, [role])

  useEffect(() => {
    void loadCampaigns()
  }, [loadCampaigns])

  // Update audience preview
  const refreshAudiencePreview = useCallback(async () => {
    if (!user || !canManageOfferCampaigns(role)) return
    try {
      setAudienceLoading(true)
      const filter: AudienceFilter = {}
      if (membershipTier !== 'all') {
        filter.membership_tier = membershipTier
      }
      const res = await previewOfferAudience(
        { audienceFilter: filter },
        { userId: user.id, role: user.role, isOnline: !isOffline }
      )
      setAudienceCounts({
        eligible: res.eligible_count,
        optedOut: res.opted_out_count,
        noEmail: res.no_email_count,
      })
    } catch {
      // Fail safely without blocking the authoring form
    } finally {
      setAudienceLoading(false)
    }
  }, [user, role, isOffline, membershipTier])

  useEffect(() => {
    void refreshAudiencePreview()
  }, [refreshAudiencePreview])

  // 1. Save or Update Draft
  async function handleSaveDraft() {
    if (!user) return
    setActionError(null)
    setActionSuccess(null)
    setSaving(true)

    try {
      const filter: AudienceFilter = {}
      if (membershipTier !== 'all') {
        filter.membership_tier = membershipTier
      }

      const res = await saveOfferCampaign(
        {
          campaignId: activeCampaignId,
          clientUuid: crypto.randomUUID(),
          subject,
          bodyMarkdown,
          heroImageUrl: heroImageUrl.trim() || null,
          ctaButtonText,
          ctaButtonUrl,
          audienceFilter: filter,
        },
        { userId: user.id, role: user.role, isOnline: !isOffline }
      )

      setActiveCampaignId(res.id)
      setActionSuccess('Offer draft saved successfully.')
      void loadCampaigns()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to save offer draft.')
    } finally {
      setSaving(false)
    }
  }

  // 2. Test Send to Author
  async function handleSendTest() {
    if (!user) return
    setActionError(null)
    setActionSuccess(null)

    if (!subject.trim() || bodyMarkdown.trim().length < 10) {
      setActionError('Please provide a subject and body text before sending a test.')
      return
    }

    setTesting(true)
    try {
      let campId: string | null = activeCampaignId
      // Auto-save draft first if not yet created
      if (!campId) {
        const filter: AudienceFilter = {}
        if (membershipTier !== 'all') filter.membership_tier = membershipTier
        const saveRes = await saveOfferCampaign(
          {
            clientUuid: crypto.randomUUID(),
            subject,
            bodyMarkdown,
            heroImageUrl: heroImageUrl.trim() || null,
            ctaButtonText,
            ctaButtonUrl,
            audienceFilter: filter,
          },
          { userId: user.id, role: user.role, isOnline: !isOffline }
        )
        campId = saveRes.id
        setActiveCampaignId(campId)
      }

      if (!campId) {
        throw new Error('Failed to create campaign draft before test send.')
      }

      const res = await testOfferCampaign(
        {
          campaignId: campId,
          testEmail: testEmail.trim(),
          subject,
          bodyMarkdown,
          heroImageUrl: heroImageUrl.trim() || null,
          ctaButtonText,
          ctaButtonUrl,
        },
        { userId: user.id, role: user.role, isOnline: !isOffline }
      )

      setCampaignStatus('test_sent')
      setTestSentInfo({
        email: res.test_recipient_email,
        at: new Date(res.test_sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      })
      setActionSuccess(`Test email dispatched to ${testEmail}. Pre-flight test verified.`)
      void loadCampaigns()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Test send failed.')
    } finally {
      setTesting(false)
    }
  }

  // 3. Queue Broadcast
  async function handleQueueBroadcast() {
    if (!user || !activeCampaignId) return
    if (campaignStatus !== 'test_sent') {
      setActionError('Pre-flight test send must be completed before queueing broadcast.')
      return
    }

    if (broadcasting) return // Double-click guard (Law 8)
    setBroadcasting(true)
    setActionError(null)
    setActionSuccess(null)

    try {
      const res = await queueOfferCampaign(
        {
          campaignId: activeCampaignId,
          clientUuid: crypto.randomUUID(),
        },
        { userId: user.id, role: user.role, isOnline: !isOffline }
      )

      setCampaignStatus('queued')
      setActionSuccess(`Campaign queued for delivery to ${res.recipient_count} verified clients.`)
      void loadCampaigns()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to queue campaign broadcast.')
    } finally {
      setBroadcasting(false)
    }
  }

  // Reset form to compose fresh offer
  function handleResetForm() {
    setActiveCampaignId(null)
    setCampaignStatus('draft')
    setSubject('')
    setBodyMarkdown('')
    setHeroImageUrl('')
    setCtaButtonText('Book Gear Online')
    setCtaButtonUrl('https://book.babinrentals.com')
    setTestSentInfo(null)
    setActionSuccess(null)
    setActionError(null)
  }

  /* ── State 1: Restricted Access ────────────────────────────────────────── */
  if (!canManageOfferCampaigns(role)) {
    return (
      <div className="p-8 max-w-2xl mx-auto" role="alert">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
          <div className="w-12 h-12 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center mx-auto mb-4">
            <Icon name="shield_alert" size={24} />
          </div>
          <h2 className="text-lg font-bold text-slate-900">Access Restricted</h2>
          <p className="mt-2 text-sm text-slate-700 leading-relaxed">
            Only <strong>Owner</strong>, <strong>Admin</strong>, and <strong>Manager</strong> (B43) have authority to write and broadcast client offer emails.
          </p>
          <p className="mt-3 text-xs text-slate-500">
            Current role: <span className="font-semibold text-slate-700">{role || 'Unidentified'}</span>. Floor roles, coordinators, and clients are restricted from marketing broadcasts.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-8">
      {/* Offline Alert */}
      {isOffline && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 px-4 py-3 rounded-lg text-sm flex items-center gap-3" role="status">
          <Icon name="alert_circle" size={20} className="text-amber-600 shrink-0" />
          <div>
            <strong>Offline mode:</strong> You are currently disconnected. Campaign creation and email broadcasting require an active server connection.
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Offer Emails to Clients</h1>
            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-sky-100 text-sky-800">T5-12</span>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Compose and broadcast promotional offers to active clients with server-side consent and one-click unsubscribe.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {activeCampaignId && (
            <button
              type="button"
              onClick={handleResetForm}
              className="inline-flex items-center justify-center min-h-[44px] px-3.5 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-500"
            >
              Compose New
            </button>
          )}
          <button
            type="button"
            onClick={() => void loadCampaigns()}
            disabled={loading}
            className="inline-flex items-center justify-center min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-500"
            title="Refresh campaigns"
            aria-label="Refresh campaigns"
          >
            <Icon name="refresh" size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Notification Banners */}
      {actionSuccess && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 px-4 py-3 rounded-lg text-sm flex items-center gap-2" role="alert">
          <Icon name="check_circle" size={20} className="text-emerald-600 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}
      {actionError && (
        <div className="bg-rose-50 border border-rose-200 text-rose-900 px-4 py-3 rounded-lg text-sm flex items-center gap-2" role="alert">
          <Icon name="alert_circle" size={20} className="text-rose-600 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Grid: Composer (Left) & Audience / Pre-flight (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Composer Card */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <Icon name="mail" size={16} className="text-sky-600" />
              {activeCampaignId ? 'Edit Campaign Draft' : 'Compose Offer'}
            </h2>
            <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50">
              <button
                type="button"
                onClick={() => setPreviewMode('edit')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  previewMode === 'edit' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Write
              </button>
              <button
                type="button"
                onClick={() => setPreviewMode('preview')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  previewMode === 'preview' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Preview HTML
              </button>
            </div>
          </div>

          {previewMode === 'edit' ? (
            <div className="space-y-4">
              <div>
                <label htmlFor={subjectInputId} className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Subject Line <span className="text-rose-500">*</span>
                </label>
                <input
                  id={subjectInputId}
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. 20% Off Sony FX3 Kits This Weekend"
                  maxLength={200}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                />
                <p className="mt-1 text-xs text-slate-500 text-right">{subject.length}/200</p>
              </div>

              <div>
                <label htmlFor={bodyInputId} className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Offer Body (Markdown) <span className="text-rose-500">*</span>
                </label>
                <textarea
                  id={bodyInputId}
                  rows={6}
                  value={bodyMarkdown}
                  onChange={(e) => setBodyMarkdown(e.target.value)}
                  placeholder="Describe the offer, eligible gear, and rental terms..."
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 font-mono focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                />
                <p className="mt-1 text-xs text-slate-500">Minimum 10 characters. Plain text and markdown supported.</p>
              </div>

              <div>
                <label htmlFor={heroInputId} className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Hero Image URL (Optional)
                </label>
                <div className="relative">
                  <input
                    id={heroInputId}
                    type="url"
                    value={heroImageUrl}
                    onChange={(e) => setHeroImageUrl(e.target.value)}
                    placeholder="https://babinrentals.com/images/promo-banner.jpg"
                    className="w-full pl-9 pr-3.5 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                  <Icon name="image" size={16} className="text-slate-400 absolute left-3 top-2.5" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor={ctaTextInputId} className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    CTA Button Text
                  </label>
                  <input
                    id={ctaTextInputId}
                    type="text"
                    value={ctaButtonText}
                    onChange={(e) => setCtaButtonText(e.target.value)}
                    className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label htmlFor={ctaUrlInputId} className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    CTA Target Link
                  </label>
                  <input
                    id={ctaUrlInputId}
                    type="url"
                    value={ctaButtonUrl}
                    onChange={(e) => setCtaButtonUrl(e.target.value)}
                    className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>
            </div>
          ) : (
            /* Visual Email Preview */
            <div className="border border-slate-200 rounded-lg p-5 bg-slate-50 space-y-4 text-slate-800">
              <div className="bg-slate-900 text-white p-4 rounded-lg">
                <span className="text-xs uppercase font-bold text-sky-400">Babin Rentals</span>
                <p className="text-xs text-slate-400 mt-0.5">Professional Cinema & Audio Gear · Kathmandu</p>
              </div>
              {heroImageUrl && (
                <div className="overflow-hidden rounded-lg border border-slate-200">
                  <img src={heroImageUrl} alt="Offer hero preview" className="w-full max-h-48 object-cover" />
                </div>
              )}
              <h3 className="text-lg font-bold text-slate-900">{subject || 'Offer Subject Placeholder'}</h3>
              <div className="text-sm whitespace-pre-wrap font-sans text-slate-700 leading-relaxed">
                {bodyMarkdown || 'Offer body text will appear here.'}
              </div>
              <div>
                <span className="inline-block px-5 py-2.5 bg-sky-600 text-white font-medium text-sm rounded-lg shadow-sm">
                  {ctaButtonText || 'Book Gear Online'}
                </span>
              </div>
              <div className="pt-4 border-t border-slate-200 text-xs text-slate-500 space-y-1">
                <p>Every marketing email carries a mandatory one-click unsubscribe link (K6).</p>
                <p className="text-slate-400">List-Unsubscribe: &lt;https://app.babinrentals.com/unsubscribe?token=...&gt;</p>
              </div>
            </div>
          )}

          <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={saving || isOffline}
              className="inline-flex items-center justify-center min-h-[44px] px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:opacity-50"
            >
              {saving ? <Icon name="loader" size={16} className="animate-spin mr-2" /> : null}
              {activeCampaignId ? 'Update Draft' : 'Save Draft'}
            </button>
            <div className="text-xs text-slate-400">
              {campaignStatus === 'draft' && 'Status: Draft'}
              {campaignStatus === 'test_sent' && 'Status: Test Verified'}
              {campaignStatus === 'queued' && 'Status: Queued for Delivery'}
            </div>
          </div>
        </div>

        {/* Sidebar: Audience & Pre-flight Gate */}
        <div className="lg:col-span-5 space-y-6">
          {/* 1. Audience Filter & Counts */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <Icon name="users" size={16} className="text-sky-600" />
                Authoritative Audience
              </h3>
              <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-mono">Postgres Gate</span>
            </div>

            <div>
              <label htmlFor={membershipFilterId} className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Audience Filter
              </label>
              <select
                id={membershipFilterId}
                value={membershipTier}
                onChange={(e) => setMembershipTier(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
              >
                <option value="all">All Active Clients</option>
                <option value="Gold">Gold Members Only</option>
                <option value="Silver">Silver Members Only</option>
                <option value="Platinum">Platinum Members Only</option>
              </select>
            </div>

            {/* Authoritative Audience Stats */}
            <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 space-y-2">
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-slate-600 font-medium">Will go to:</span>
                <span className="text-lg font-bold text-slate-900 font-mono">
                  {audienceLoading ? <Icon name="loader" size={16} className="animate-spin inline" /> : `${audienceCounts?.eligible ?? 0} clients`}
                </span>
              </div>
              <div className="text-xs text-slate-500 flex justify-between pt-2 border-t border-slate-200/60">
                <span>Opted out / DND excluded:</span>
                <span className="font-mono text-slate-700 font-medium">{audienceCounts?.optedOut ?? 0}</span>
              </div>
              <div className="text-xs text-slate-500 flex justify-between">
                <span>No email on file excluded:</span>
                <span className="font-mono text-slate-700 font-medium">{audienceCounts?.noEmail ?? 0}</span>
              </div>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Recipient roster is compiled automatically from active marketing consent. Addresses that have opted out or bounced are never contacted.
            </p>
          </div>

          {/* 2. Pre-flight Test Send Gate */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <Icon name="send" size={16} className="text-sky-600" />
                Pre-Flight Test Send
              </h3>
              <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                campaignStatus === 'test_sent' || campaignStatus === 'queued'
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-amber-100 text-amber-800'
              }`}>
                {campaignStatus === 'test_sent' || campaignStatus === 'queued' ? 'Test Verified' : 'Test Required'}
              </span>
            </div>

            <p className="text-xs text-slate-600">
              The database forbids queueing an offer until a test has been dispatched and verified by the author.
            </p>

            <div>
              <label htmlFor={testEmailInputId} className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Author Test Email
              </label>
              <input
                id={testEmailInputId}
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="your.email@babinrentals.com"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>

            <button
              type="button"
              onClick={handleSendTest}
              disabled={testing || isOffline}
              className="inline-flex items-center justify-center min-h-[44px] w-full px-4 py-2 bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
            >
              {testing ? <Icon name="loader" size={16} className="animate-spin mr-2" /> : <Icon name="eye" size={16} className="mr-2" />}
              Send Test to Author
            </button>

            {testSentInfo && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center gap-2">
                <Icon name="check_circle" size={16} className="text-emerald-600 shrink-0" />
                <span>Test sent to <strong>{testSentInfo.email}</strong> at {testSentInfo.at}.</span>
              </div>
            )}
          </div>

          {/* 3. Broadcast Action Card */}
          <div className="bg-slate-900 text-white rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold flex items-center gap-2 text-white">
                <Icon name="sparkles" size={16} className="text-amber-400" />
                Queue Broadcast
              </h3>
              <span className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded">Owner · Admin · Manager</span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Dispatches offer to all eligible recipients. Sending is queued and paced to avoid provider limits and protect sender reputation.
            </p>

            <button
              type="button"
              onClick={handleQueueBroadcast}
              disabled={broadcasting || campaignStatus !== 'test_sent' || isOffline}
              className="inline-flex items-center justify-center min-h-[56px] w-full px-4 py-3 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-semibold rounded-lg shadow-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-base"
            >
              {broadcasting ? (
                <Icon name="loader" size={20} className="animate-spin mr-2" />
              ) : (
                <Icon name="send" size={20} className="mr-2" />
              )}
              {campaignStatus === 'queued'
                ? 'Campaign Queued'
                : campaignStatus === 'test_sent'
                ? `Send Offer to ${audienceCounts?.eligible ?? 0} Clients`
                : 'Send Test First to Unlock'}
            </button>

            {campaignStatus !== 'test_sent' && campaignStatus !== 'queued' && (
              <p className="text-xs text-slate-400 text-center">
                Send a test email above to enable this broadcast button.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Campaigns History */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Campaign History</h2>
          <span className="text-xs text-slate-500 font-mono">{campaigns.length} total</span>
        </div>

        {/* State 2: Loading State */}
        {loading && (
          <div className="p-8 text-center" role="status" aria-live="polite">
            <Icon name="loader" size={32} className="text-sky-600 animate-spin mx-auto mb-2" />
            <p className="text-sm text-slate-500">Loading campaign records...</p>
          </div>
        )}

        {/* State 3: Error State */}
        {!loading && error && (
          <div className="p-6 text-center" role="alert">
            <Icon name="alert_circle" size={32} className="text-rose-500 mx-auto mb-2" />
            <p className="text-sm text-rose-600">{error}</p>
          </div>
        )}

        {/* State 4: Empty State */}
        {!loading && !error && campaigns.length === 0 && (
          <div className="p-10 text-center">
            <Icon name="mail" size={40} className="text-slate-300 mx-auto mb-3" />
            <h3 className="text-base font-medium text-slate-900">No campaigns yet</h3>
            <p className="mt-1 text-sm text-slate-500 max-w-sm mx-auto">
              Draft your first marketing offer above. Test it against your email, preview the audience, and queue the broadcast.
            </p>
          </div>
        )}

        {/* Table of Campaigns */}
        {!loading && !error && campaigns.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-slate-700 text-xs font-semibold uppercase tracking-wider">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left">Subject</th>
                  <th scope="col" className="px-6 py-3 text-left">Status</th>
                  <th scope="col" className="px-6 py-3 text-right">Recipients</th>
                  <th scope="col" className="px-6 py-3 text-right">Sent</th>
                  <th scope="col" className="px-6 py-3 text-right">Unsubscribed</th>
                  <th scope="col" className="px-6 py-3 text-left">Created By</th>
                  <th scope="col" className="px-6 py-3 text-left">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {campaigns.map((c) => (
                  <tr
                    key={c.id}
                    className="hover:bg-slate-50/80 cursor-pointer transition-colors"
                    onClick={() => {
                      setActiveCampaignId(c.id)
                      setSubject(c.subject)
                      setBodyMarkdown(c.bodyMarkdown)
                      setHeroImageUrl(c.heroImageUrl || '')
                      setCtaButtonText(c.ctaButtonText)
                      setCtaButtonUrl(c.ctaButtonUrl)
                      setCampaignStatus(c.status as 'draft' | 'test_sent' | 'queued' | 'completed')
                    }}
                  >
                    <td className="px-6 py-4 font-medium text-slate-900 max-w-xs truncate">
                      {c.subject}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        c.status === 'completed'
                          ? 'bg-emerald-100 text-emerald-800'
                          : c.status === 'queued' || c.status === 'sending'
                          ? 'bg-sky-100 text-sky-800'
                          : c.status === 'test_sent'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-mono text-slate-700">
                      {c.recipientCount}
                    </td>
                    <td className="px-6 py-4 text-right font-mono text-emerald-700">
                      {c.sentCount}
                    </td>
                    <td className="px-6 py-4 text-right font-mono text-slate-500">
                      {c.unsubscribedCount}
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      {c.createdByName || 'Staff'}
                    </td>
                    <td className="px-6 py-4 text-slate-500 text-xs">
                      {new Date(c.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
