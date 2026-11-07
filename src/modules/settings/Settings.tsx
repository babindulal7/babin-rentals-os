import { useCallback, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import './settings.css'
import Icon from '../../components/ui/Icon'
import type { IconName } from '../../components/ui/Icon'
import { Card, PageHeader, Button, SummaryRows } from '../../components/ui/Page'
import { PageShell } from '../../components/ui/PageShell'
import { PageActions } from '../../components/ui/PageActions'
import { EmptyState, ErrorBanner, LoadingSkeleton } from '../../components/ui/StateViews'
import { toBs, formatBs, formatAd, getBusinessToday } from '../../lib/bs'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { useViewport } from '../../lib/device'
import { useCompactHeader } from '../../lib/headerRoom'
import { useEditMode } from '../../lib/edit/useEditMode'
import type { FieldSpec } from '../../lib/edit/useEditMode'
import {
  SETTING_SPECS,
  SETTINGS_DEFAULTS,
  validateSetting,
  resetSettings,
  languageCodeOf,
  setUserLanguage,
} from '../../lib/settingsStore'
import { supabase } from '../../lib/supabase'
import type { SettingKey, SettingValue, SettingsRecord } from '../../lib/settingsStore'
import { saveSettings, resetSharedSettings } from '../../lib/settingsSync'
import { applyLanguage } from '../../lib/i18n'
import { canManageSettings, canManageMessageTemplates } from '../../lib/rbac'
import { useAuth } from '../../lib/auth'
import { useTheme } from '../../lib/theme'
import { useDisplayDensity } from '../../lib/displayDensity'
import {
  TABS,
  TEXTS_TAB,
  LEGACY_TAB,
  DEFAULT_TAB,
  TAB_SHORT_LABEL,
  TAB_SUMMARY,
  isTabKey,
  BRANCHES,
  BRANCH,
  SYSTEM_SUMMARY,
  SEED_ERRORS,
} from '../../lib/queries/settings'
import type { Branch, TabKey, TabDef } from '../../lib/queries/settings'
import { useSettingsLoad } from './useSettingsLoad'
import {
  DestControl,
  EditCtx,
  GoTab,
  SectionCards,
  VisibleTabs,
  controlStyle,
  downloadCsv,
  fieldValue,
} from './sections/shared'
import {
  FIELD_SECTIONS,
  FINANCIAL_SECTIONS,
  ORGANISATION_SECTIONS,
  BranchesPane,
  BranchesRail,
  FinancialPane,
  UsersPane,
  TextsPane,
  branchCsvRows,
} from './sections'

/*
 * Operating day in Kathmandu (BS + AD).
 */
const TODAY = getBusinessToday()

const TAB_CONFIG: Record<TabKey, { icon: IconName; subtitle: string }> = {
  business: {
    icon: 'briefcase',
    subtitle: 'Identity, VAT & financial policies',
  },
  people: {
    icon: 'users',
    subtitle: 'Staff directory & 9-role matrix',
  },
  branches: {
    icon: 'box',
    subtitle: 'Branches, warehouses & fleet',
  },
  system: {
    icon: 'settings',
    subtitle: 'Preferences, security & audit',
  },
  texts: {
    icon: 'file',
    subtitle: 'Email and document texts (B20)',
  },
}

export default function Settings() {
  const money = useCanViewMoney()
  const viewport = useViewport()
  const phone = viewport === 'phone'
  const desktop = viewport === 'desktop'

  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const [addOpen, setAddOpen] = useState(false)
  const [branches, setBranches] = useState<Branch[]>(BRANCHES)

  const { user } = useAuth()
  const { theme, glass, choose } = useTheme()
  const { density, setDensity } = useDisplayDensity()
  const mayEdit = canManageSettings(user?.role ?? 'Client')
  const [leaveError, setLeaveError] = useState<string | null>(null)

  const { load, reload, patch } = useSettingsLoad(user?.id)
  const settings: SettingsRecord = load.status === 'ready' ? load.settings : SETTINGS_DEFAULTS

  const onSaveSetting = useCallback(
    async (p: Record<string, unknown>) => {
      await saveSettings(p as Partial<SettingsRecord>)
      patch(p as Partial<SettingsRecord>)
      if ('language' in p) {
        setUserLanguage(user?.id, p.language as SettingValue)
        await applyLanguage(languageCodeOf(p.language as SettingValue))
        if (user?.id) {
          void supabase.auth.updateUser({ data: { language: p.language } }).catch(() => {})
        }
      }
    },
    [patch, user?.id],
  )

  const settingFields: FieldSpec[] = useMemo(
    () =>
      (Object.keys(SETTING_SPECS) as SettingKey[]).map((k) => ({
        key: k,
        validate: (v) => validateSetting(k, v as SettingValue),
      })),
    [],
  )

  const edit = useEditMode({ record: settings, fields: settingFields, onSave: onSaveSetting })

  const [searchQuery, setSearchQuery] = useState('')

  const canManageTexts = canManageMessageTemplates(user?.role ?? 'Client')

  /* Law 6 — money-only tab is removed from the strip, not disabled.
     B20 — texts tab is Owner and Admin only; Manager & floor roles denied. */
  const tabs = useMemo(() => {
    const list: TabDef[] = [...TABS, ...(canManageTexts ? [TEXTS_TAB] : [])]
    const base = list.filter((t) => money || !t.money)
    if (!searchQuery.trim()) return base
    const q = searchQuery.toLowerCase().trim()
    return base.filter((t) => {
      const conf = TAB_CONFIG[t.key]
      return (
        t.label.toLowerCase().includes(q) ||
        (conf && conf.subtitle.toLowerCase().includes(q)) ||
        TAB_SUMMARY[t.key]?.toLowerCase().includes(q)
      )
    })
  }, [money, canManageTexts, searchQuery])

  const raw = params.get('tab')
  const requested: TabKey = isTabKey(raw) ? raw : (raw !== null && LEGACY_TAB[raw]) || DEFAULT_TAB
  const active: TabKey = tabs.some((t) => t.key === requested) ? requested : DEFAULT_TAB
  const onPhoneList = phone && (raw === null || !tabs.some((t) => t.key === raw))

  const go = (tab: TabKey) => {
    const next = new URLSearchParams(params)
    if (tab === DEFAULT_TAB && !phone) next.delete('tab')
    else next.set('tab', tab)
    setParams(next)
    window.scrollTo({ top: 0 })
  }

  const toList = () => {
    const next = new URLSearchParams(params)
    next.delete('tab')
    setParams(next)
    window.scrollTo({ top: 0 })
  }

  const bs = toBs(TODAY)
  const asOf = `${bs ? formatBs(bs) : 'BS date unavailable'} · ${formatAd(TODAY)}`

  const initials = useMemo(() => {
    const name = user?.name?.trim() || 'Babin Shrestha'
    const parts = name.split(/\s+/).filter(Boolean)
    if (parts.length >= 2) {
      const p0 = parts[0] || 'B'
      const p1 = parts[parts.length - 1] || 'S'
      return `${p0[0] || 'B'}${p1[0] || 'S'}`.toUpperCase()
    }
    return (name.slice(0, 2) || 'BR').toUpperCase()
  }, [user?.name])

  const exportConfig = () => {
    const rows: string[][] = [['Section', 'Setting', 'Value']]
    const walk = (tabLabel: string, sections: readonly (typeof FINANCIAL_SECTIONS)[number][]) => {
      for (const s of sections) {
        for (const f of s.fields) {
          rows.push([`${tabLabel} · ${s.title}`, f.label, fieldValue(f, settings)])
        }
      }
    }
    for (const t of tabs) {
      const sections = FIELD_SECTIONS[t.key]
      if (sections) walk(t.label, sections)
    }
    if (money) walk('Business', FINANCIAL_SECTIONS)
    downloadCsv('babin-settings.csv', rows)
  }

  const exportBranches = () => downloadCsv('babin-branches.csv', branchCsvRows(branches, money))

  const finishEditing = () => {
    const outcome = edit.stopEditing()
    setLeaveError(
      outcome.ok
        ? null
        : `Unsaved: ${outcome.unsaved.join(', ')}. Save or cancel each before leaving edit mode.`,
    )
  }
  const discardEdits = () => {
    edit.cancelAll()
    setLeaveError(null)
  }
  const resetToDefaults = () => {
    void (async () => {
      resetSettings()
      try {
        await resetSharedSettings()
        setLeaveError(null)
      } catch (e) {
        setLeaveError(e instanceof Error ? e.message : 'Reset was refused.')
      }
      reload()
      edit.cancelAll()
    })()
  }
  const startEditing = () => { setLeaveError(null); edit.startEditing() }

  /* RULING 2026-10-15: below desktop only the one primary verb stays beside the title;
     Export, the audit log and the edit-mode extras move into More (BLOCKER-02 — the
     title measured 0px wide at both 375px and 768px, the audit link 34px tall). A phone
     also shortens the verb. Revert = drop the `compactHeader` branch below.
     RULING 2026-10-15 (zoom audit): decided by the header's own width (sidebar open at
     1280px left the title 55px). */
  const compactHeader = useCompactHeader()
  const compactHeaderActions =
    active === 'branches' && !onPhoneList ? (
      <PageActions
        primary={<Button icon="plus" variant="primary" aria-label="Add Branch" onClick={() => setAddOpen(true)}>{phone ? 'Add' : 'Add Branch'}</Button>}
        overflow={[{ label: 'Export branches', icon: 'download', onClick: exportBranches }]}
      />
    ) : (
      <PageActions
        primary={mayEdit && !onPhoneList ? (
          edit.editing
            ? <Button icon="check" variant="primary" onClick={finishEditing}>Done</Button>
            : <Button icon="tool" aria-label="Edit settings" onClick={startEditing}>{phone ? 'Edit' : 'Edit settings'}</Button>
        ) : undefined}
        overflow={[
          ...(mayEdit && !onPhoneList && edit.editing ? [
            { label: 'Discard changes', icon: 'close' as const, onClick: discardEdits },
            { label: 'Reset to defaults', icon: 'refresh' as const, onClick: resetToDefaults },
          ] : []),
          { label: 'Export config', icon: 'download', onClick: exportConfig },
          { label: 'View audit log', icon: 'checklist', onClick: () => navigate('/admin/audit') },
        ]}
      />
    )

  const headerActions =
    load.status !== 'ready' ? null : compactHeader ? compactHeaderActions : active === 'branches' && !onPhoneList ? (
      <>
        <Button icon="download" onClick={exportBranches}>
          Export
        </Button>
        <Button icon="plus" variant="primary" onClick={() => setAddOpen(true)}>
          Add Branch
        </Button>
      </>
    ) : (
      <>
        {mayEdit &&
          !onPhoneList &&
          (edit.editing ? (
            <>
              <Button icon="check" variant="primary" onClick={finishEditing}>
                Done
              </Button>
              <Button icon="close" variant="ghost" onClick={discardEdits}>
                Discard
              </Button>
              <Button icon="refresh" variant="ghost" onClick={resetToDefaults}>
                Reset to defaults
              </Button>
            </>
          ) : (
            <Button icon="tool" onClick={startEditing}>
              Edit settings
            </Button>
          ))}
        <Button icon="download" onClick={exportConfig}>
          Export config
        </Button>
        <Link to="/admin/audit" className="tap" style={{ ...controlStyle, minHeight: 44 }}>
          <Icon name="checklist" size={14} />
          View audit log
        </Link>
      </>
    )

  const activeTab = tabs.find((t) => t.key === active)

  /* ── the panel ───────────────────────────────────────────────────────── */

  const panel = (() => {
    if (requested === 'texts' && !canManageTexts) {
      return (
        <div className="card" style={{ padding: 'var(--sp-xl)', textAlign: 'center' }}>
          <Icon name="lock" size={36} style={{ color: 'var(--muted)', margin: '0 auto var(--sp-md)' }} />
          <h3 style={{ fontSize: 'var(--t-title)', marginBottom: 'var(--sp-xs)' }}>Access Restricted</h3>
          <p style={{ color: 'var(--text2)', maxWidth: 500, margin: '0 auto' }}>
            Settings ▸ Texts is restricted to <strong>Owner</strong> and <strong>Admin</strong> (B20). Your role ({user?.role ?? 'Guest'}) does not have permission to view or edit message templates.
          </p>
        </div>
      )
    }
    if (active === 'texts') {
      return <TextsPane />
    }
    if (active === 'branches') {
      return (
        <BranchesPane money={money} rows={branches} setRows={setBranches} addOpen={addOpen} setAddOpen={setAddOpen} />
      )
    }
    if (active === 'people') {
      return (
        <>
          <UsersPane />
          {FIELD_SECTIONS.people ? <SectionCards sections={FIELD_SECTIONS.people} /> : null}
        </>
      )
    }
    if (active === 'business') {
      return (
        <>
          <SectionCards sections={ORGANISATION_SECTIONS} />
          {money ? <FinancialPane /> : null}
        </>
      )
    }
    const sections = FIELD_SECTIONS[active]
    return sections ? <SectionCards sections={sections} /> : null
  })()

  const rail =
    active === 'branches' ? (
      <BranchesRail money={money} branches={branches} onAdd={() => setAddOpen(true)} onExport={exportBranches} />
    ) : null

  /* ── body, by state then by width ────────────────────────────────────── */

  const body = (() => {
    if (load.status === 'loading') {
      return (
        <LoadingSkeleton
          type="card"
          label="Loading settings — the stored values, not the defaults. Nothing on this page is shown until they arrive."
        />
      )
    }

    if (load.status === 'error') {
      return (
        <ErrorBanner
          title="Settings could not be read."
          message={
            <>
              {load.message} Until they load, this page would show the built-in defaults rather than your saved values — and a
              stale VAT rate is a wrong invoice, so nothing is rendered instead.
            </>
          }
          onRetry={reload}
        />
      )
    }

    /* Phase 6 — no RESULTS, not "nothing yet": every section exists, the search
       matched none of them. Before this the section list emptied while the
       pane went on showing the default section's fields, which read as if
       those fields were the match. */
    if (tabs.length === 0) {
      return (
        <EmptyState
          kind="no-results"
          title="No settings match this search"
          description={`No section (${TABS.filter((t) => money || !t.money).map((t) => t.label).join(', ')}) mentions “${searchQuery.trim()}”.`}
          actionLabel="Clear search"
          onAction={() => setSearchQuery('')}
        />
      )
    }

    /* PHONE — §11.1: a list of sections, each tapping through to its own screen. */
    if (onPhoneList) {
      return (
        <div className="app-settings-mobile-list">
          <div className="app-settings-mobile-section-header">APP SETTINGS</div>
          <div className="app-settings-mobile-group">
            {tabs.map((t) => {
              const conf = TAB_CONFIG[t.key]
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => go(t.key)}
                  className="app-settings-mobile-row"
                >
                  <div
                    className="app-settings-mobile-icon"
                    style={{ backgroundColor: 'var(--surface-2)', color: 'var(--primary)' }}
                  >
                    <Icon name={conf.icon} size={20} />
                  </div>
                  <div className="app-settings-mobile-text">
                    <span className="app-settings-mobile-title">{t.label}</span>
                    <span className="app-settings-mobile-desc">{TAB_SUMMARY[t.key]}</span>
                  </div>
                  <Icon name="chevron_right" size={16} className="app-settings-chevron-muted" />
                </button>
              )
            })}
          </div>
        </div>
      )
    }

    /* PHONE — one section, full screen. */
    if (phone) {
      return (
        <div className="app-settings-mobile-subpage">
          <div className="app-settings-pane">
            {panel}
            {active === 'branches' && rail && (
              <div className="app-settings-branches-rail-wrap">{rail}</div>
            )}
            {active === 'system' && (
              <Card title="System Summary">
                <SummaryRows rows={SYSTEM_SUMMARY.map((r) => ({ label: r.label, value: r.value }))} />
              </Card>
            )}
          </div>
        </div>
      )
    }

    /* DESKTOP & TABLET */
    return (
      <div className={desktop ? 'app-settings-layout' : 'app-settings-tablet-wrapper'}>
        {desktop ? (
          <nav aria-label="Settings sections" className="app-settings-sidebar settings-nav-col">
            <div className="app-settings-sidebar-header">PREFERENCES & POLICIES</div>
            {tabs.map((t) => {
              const on = t.key === active
              const conf = TAB_CONFIG[t.key]
              return (
                <button
                  key={t.key}
                  type="button"
                  aria-current={on ? 'page' : undefined}
                  onClick={() => go(t.key)}
                  className={`app-settings-nav-item settings-tab-btn ${on ? 'is-active' : ''}`}
                >
                  <div
                    className="app-settings-nav-icon-box"
                    style={{
                      backgroundColor: on ? 'var(--primary)' : 'var(--surface-2)',
                      color: on ? 'var(--btn-primary-fg, #ffffff)' : 'var(--text2)',
                    }}
                  >
                    <Icon name={conf.icon} size={16} />
                  </div>
                  <div className="app-settings-nav-text">
                    <div className="app-settings-nav-label">{t.label}</div>
                    <div className="app-settings-nav-subtitle">{conf.subtitle}</div>
                  </div>
                  <Icon name="chevron_right" size={14} className="app-settings-nav-chevron" />
                </button>
              )
            })}
          </nav>
        ) : (
          <div
            role="tablist"
            aria-label="Settings sections"
            className="app-settings-tablet-tabs settings-tab-scroll"
          >
            {tabs.map((t) => {
              const on = t.key === active
              const conf = TAB_CONFIG[t.key]
              return (
                <button
                  key={t.key}
                  role="tab"
                  type="button"
                  aria-selected={on}
                  onClick={() => go(t.key)}
                  className={`app-settings-tablet-tab settings-tab-pill ${on ? 'is-active' : ''}`}
                >
                  <div
                    className="app-settings-tablet-icon"
                    style={{
                      backgroundColor: on ? 'var(--primary)' : 'var(--surface-2)',
                      color: on ? 'var(--btn-primary-fg, #ffffff)' : 'var(--text2)',
                    }}
                  >
                    <Icon name={conf.icon} size={14} />
                  </div>
                  <span>{TAB_SHORT_LABEL[t.key]}</span>
                </button>
              )
            })}
          </div>
        )}

        <div className="app-settings-pane">
          <div className="app-settings-pane-header">
            <h2 className="app-settings-pane-title">{activeTab?.label ?? 'Overview'}</h2>
            <p className="app-settings-pane-desc">{TAB_SUMMARY[active]}</p>
          </div>

          {panel}

          {active === 'branches' && rail && (
            <div className="app-settings-branches-rail-wrap">
              {rail}
            </div>
          )}

          {active === 'system' && (
            <Card title="System Summary">
              <SummaryRows rows={SYSTEM_SUMMARY.map((r) => ({ label: r.label, value: r.value }))} />
            </Card>
          )}
        </div>
      </div>
    )
  })()

  return (
    <GoTab.Provider value={go}>
      <VisibleTabs.Provider value={tabs}>
        <EditCtx.Provider value={edit}>
          <PageShell width="settings">
            <div className="settings-v2">
              <PageHeader
                icon={phone && !onPhoneList ? undefined : 'settings'}
                title={phone && !onPhoneList ? (activeTab?.label ?? 'Settings') : 'Settings'}
                onBack={phone && !onPhoneList ? toList : undefined}
                backLabel="Back to settings"
                description="System preferences, organization profile, security, and workspace policies."
                /* On a phone the section is named by the title and back button,
                   so the badge is omitted to prevent title squeeze. */
                status={phone ? undefined : (
                  <span className="badge badge-neutral" style={{ fontWeight: 600 }}>
                    {activeTab?.label ?? 'General'}
                  </span>
                )}
                isDirty={edit.dirtyKeys.length > 0}
                search={{
                  value: searchQuery,
                  onChange: setSearchQuery,
                  onClear: () => setSearchQuery(''),
                  placeholder: 'Search settings…',
                  ariaLabel: 'Search settings',
                }}
                actions={headerActions}
              />

              {/* Inset User Profile Header (App Settings style) */}
              <div className="app-settings-profile-card">
                <div className="app-settings-profile-left">
                  <div className="app-settings-avatar-wrap">
                    <div className="app-settings-avatar" aria-hidden="true">
                      {initials}
                    </div>
                    <span className="app-settings-avatar-status" title="Active session" />
                  </div>
                  <div className="app-settings-profile-info">
                    <div className="app-settings-profile-name-row">
                      <span className="app-settings-profile-name">{user?.name || 'Babin Shrestha'}</span>
                      <span className="app-settings-role-badge">{user?.role || 'Owner'}</span>
                      <span className="app-settings-status-chip">
                        <span className="app-settings-status-dot" />
                        Active Session
                      </span>
                    </div>
                    <div className="app-settings-profile-meta">
                      <span className="app-settings-meta-item">
                        <Icon name="box" size={13} />
                        {BRANCH.name || 'Kathmandu Main Branch'}
                      </span>
                      <span className="app-settings-meta-dot">·</span>
                      <span className="app-settings-meta-item">
                        <Icon name="calendar" size={13} />
                        {asOf}
                      </span>
                      <span className="app-settings-meta-dot">·</span>
                      <span className="app-settings-meta-item">
                        <Icon name="lock" size={13} />
                        RBAC Protected
                      </span>
                    </div>
                  </div>
                </div>

                <div className="app-settings-profile-right">
                  <div className="app-settings-quick-theme" role="group" aria-label="Theme preference">
                    <button
                      type="button"
                      className={`app-settings-theme-btn tap ${theme === 'light' ? 'is-active' : ''}`}
                      aria-pressed={theme === 'light'}
                      onClick={() => choose('light')}
                      title="Switch to light theme"
                    >
                      <Icon name="sun" size={14} />
                      <span>Light</span>
                    </button>
                    <button
                      type="button"
                      className={`app-settings-theme-btn tap ${theme === 'dark' ? 'is-active' : ''}`}
                      aria-pressed={theme === 'dark'}
                      onClick={() => choose('dark')}
                      title="Switch to dark theme"
                    >
                      <Icon name="moon" size={14} />
                      <span>Dark</span>
                    </button>
                    {/* RULING 2026-10-13: Glass is a finish on Light or Dark —
                        on/off, pressed alongside the base it sits on. */}
                    <button
                      type="button"
                      className={`app-settings-theme-btn tap ${glass ? 'is-active' : ''}`}
                      aria-pressed={glass}
                      onClick={() => choose('glass')}
                      title={glass ? 'Turn the glass finish off' : 'Turn the glass finish on'}
                    >
                      <Icon name="sparkles" size={14} />
                      <span>Glass</span>
                    </button>
                  </div>

                  <div className="app-settings-quick-theme" role="group" aria-label="Display density">
                    <button
                      type="button"
                      className={`app-settings-theme-btn tap ${density === 'compact' ? 'is-active' : ''}`}
                      aria-pressed={density === 'compact'}
                      onClick={() => setDensity('compact')}
                      title="Switch to compact density"
                    >
                      <Icon name="table" size={14} />
                      <span>Compact</span>
                    </button>
                    <button
                      type="button"
                      className={`app-settings-theme-btn tap ${density === 'comfortable' ? 'is-active' : ''}`}
                      aria-pressed={density === 'comfortable'}
                      onClick={() => setDensity('comfortable')}
                      title="Switch to comfortable density"
                    >
                      <Icon name="layout" size={14} />
                      <span>Comfortable</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Errors inline */}
              {leaveError && <ErrorBanner title="Unsaved changes." message={leaveError} />}

              {edit.editing && (
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
                  <Icon name="info" size={14} style={{ flexShrink: 0, marginTop: 2, color: 'var(--muted)' }} />
                  <span>
                    Changes save to this browser and survive a reload. No <code>settings</code> table is connected yet, so they
                    do not reach other users or other devices.
                  </span>
                </div>
              )}

              {SEED_ERRORS.length > 0 && (
                <ErrorBanner
                  title="Seed data does not reconcile"
                  message={
                    <ul style={{ margin: 0, paddingLeft: 'var(--sp-lg)' }}>
                      {SEED_ERRORS.map((e) => (
                        <li key={e}>{e}</li>
                      ))}
                    </ul>
                  }
                />
              )}

              {body}

            </div>
          </PageShell>
        </EditCtx.Provider>
      </VisibleTabs.Provider>
    </GoTab.Provider>
  )
}

export { DestControl }
