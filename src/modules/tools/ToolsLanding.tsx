import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import type { IconName } from '../../components/ui/Icon'
import { PageHeader, cardStyle } from '../../components/ui/Page'
import { FilterButton, FilterDrawer } from '../../components/ui/FilterDrawer'
import { Select } from '../../components/ui/Select'
import { PageShell } from '../../components/ui/PageShell'
import { useViewport } from '../../lib/device'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { isMoneySurface, getToolsStatus } from '../../lib/queries/tools'
import { useTranslation } from '../../lib/i18n'
import DepreciationCalculator from './DepreciationCalculator'
import PricingCalculator from './PricingCalculator'
import CineTools from '../settings/Tools'
import LateFeeCalculator from './LateFeeCalculator'

/**
 * **Tools — Integrated Workbench**
 *
 * All calculators are integrated directly within this screen via tabs:
 * Overview · Depreciation · Pricing · Cinematography
 *
 * No external links or shortcut bounces to standalone pages.
 */

export type ToolsTab = 'overview' | 'depreciation' | 'pricing' | 'cinematography' | 'latefee' | 'qr' | 'bundle' | 'coupons'

interface ToolCard {
  label: string
  hint: string
  icon: IconName
  tab: ToolsTab
  to: string
  unbuilt?: boolean
}

interface ToolGroup {
  heading: string
  desktopColumns: number
  note?: string
  cards: ToolCard[]
}

export default function ToolsLanding() {
  const { t } = useTranslation()
  const viewport = useViewport()
  const money = useCanViewMoney()

  const groups = useMemo<ToolGroup[]>(() => {
    const raw: ToolGroup[] = [
      {
        heading: t('tools.landing.calculatorsGroup'),
        desktopColumns: 2,
        cards: [
          {
            label: t('tools.landing.depreciationLabel'),
            hint: t('tools.landing.depreciationHint'),
            icon: 'chart',
            tab: 'depreciation',
            to: '/tools/depreciation',
          },
          {
            label: t('tools.landing.pricingLabel'),
            hint: t('tools.landing.pricingHint'),
            icon: 'dollar',
            tab: 'pricing',
            to: '/tools/pricing',
          },
        ],
      },
      {
        heading: t('tools.landing.commercialGroup'),
        desktopColumns: 2,
        cards: [
          {
            label: t('tools.landing.lateFeeLabel'),
            hint: t('tools.cards.lateFeeHint'),
            icon: 'timer',
            tab: 'latefee',
            to: '/tools/latefee',
          },
        ],
      },
      {
        heading: t('tools.landing.cinematographyGroup'),
        desktopColumns: 2,
        note: t('tools.landing.cinematographyNote'),
        cards: [
          {
            label: t('tools.landing.cameraLensToolsLabel'),
            hint: t('tools.landing.cameraLensToolsHint'),
            icon: 'camera',
            tab: 'cinematography',
            to: '/tools/cinematography',
          },
        ],
      },
    ]

    if (money) return raw
    return raw.map((g) => ({
      ...g,
      cards: g.cards.filter((c) => !isMoneySurface(c.to)),
    })).filter((g) => g.cards.length > 0)
  }, [money, t])

  const [params, setParams] = useSearchParams()
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [selectedGroup, setSelectedGroup] = useState('')
  const filteredGroups = selectedGroup ? groups.filter((group) => group.heading === selectedGroup) : groups
  const visibleToolCount = filteredGroups.reduce((total, group) => total + group.cards.length, 0)

  useEffect(() => {
    void getToolsStatus()
  }, [])

  const currentTab = (params.get('tab') ?? 'overview') as ToolsTab
  const activeTab: ToolsTab = ['overview', 'depreciation', 'pricing', 'cinematography', 'latefee', 'qr', 'bundle', 'coupons'].includes(currentTab)
    ? currentTab
    : 'overview'

  const setTab = (tTab: ToolsTab) => {
    setFiltersOpen(false)
    const next = new URLSearchParams(params)
    if (tTab === 'overview') next.delete('tab')
    else next.set('tab', tTab)
    setParams(next)
  }

  const tabs: Array<{ key: ToolsTab; label: string; icon: IconName; money?: boolean }> = [
    { key: 'overview', label: t('tools.tabs.overview'), icon: 'tool' },
    ...(money
      ? [
          { key: 'depreciation' as const, label: t('tools.tabs.depreciation'), icon: 'chart' as const, money: true },
          { key: 'pricing' as const, label: t('tools.tabs.pricing'), icon: 'dollar' as const, money: true },
          { key: 'latefee' as const, label: t('tools.tabs.latefee'), icon: 'timer' as const, money: true },
        ]
      : []),
    { key: 'cinematography', label: t('tools.tabs.cinematography'), icon: 'camera' },
  ]

  // 7 Oct audit: the legacy sandbox contains invented gear/rates and does not save.
  // Keep its URL as a redirect to the real bundle registry; one supported builder.
  if (activeTab === 'bundle') return <Navigate to="/inventory?tab=bundles" replace />
  /* RULING 2026-10-18 (Babin's ruling): Tools is calculators plus the
     cinematography suite. Coupons & Promos moved to Clients (with Referral
     Codes); QR & Barcode labels moved to Inventory. Old links still land.
     Revert = restore the two tabs, their cards and render lines. */
  if (activeTab === 'coupons') return <Navigate to="/clients?tab=coupons" replace />
  if (activeTab === 'qr') return <Navigate to="/inventory/labels" replace />

  return (
    <PageShell width="full">
      <PageHeader
        icon="tool"
        title={t('tools.landing.title')}
        {...(activeTab === 'overview' ? { leading: <FilterButton onClick={() => setFiltersOpen((open) => !open)} controls="tools-filters" expanded={filtersOpen} activeCount={Number(Boolean(selectedGroup))} /> } : {})}
        description={t('tools.landing.description')}
      />
      <FilterDrawer id="tools-filters" open={filtersOpen && activeTab === 'overview'} onClose={() => setFiltersOpen(false)} resultCount={visibleToolCount} noun="tools" activeCount={Number(Boolean(selectedGroup))} onClearAll={() => setSelectedGroup('')} standardFooter onApply={() => setFiltersOpen(false)}>
        <label style={{ display: 'grid', gap: 8, fontWeight: 600 }}>{t('tools.landing.categoryLabel')}
          <Select aria-label={t('tools.landing.filterAria')} value={selectedGroup} onChange={(event) => setSelectedGroup(event.target.value)} style={{ minHeight: 44, width: '100%' }}>
            <option value="">{t('tools.landing.allCategories')}</option>
            {groups.map((group) => <option key={group.heading} value={group.heading}>{group.heading}</option>)}
          </Select>
        </label>
      </FilterDrawer>

      {/* Tabs strip */}
      <div
        role="tablist"
        aria-label={t('tools.landing.navAria')}
        style={{
          display: 'flex',
          gap: 'var(--sp-xs)',
          borderBottom: '1px solid var(--border)',
          overflowX: 'auto',
        }}
      >
        {tabs.map((tabItem) => {
          const on = activeTab === tabItem.key
          return (
            <button
              key={tabItem.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setTab(tabItem.key)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                minHeight: 44,
                height: 'auto',
                padding: '0 16px',
                border: 'none',
                borderBottom: `2px solid ${on ? 'var(--nav-active-accent)' : 'transparent'}`,
                background: 'transparent',
                color: on ? 'var(--nav-active-accent)' : 'var(--text2)',
                fontSize: 'var(--t-meta)',
                fontWeight: on ? 700 : 500,
                cursor: 'pointer',
                fontFamily: 'inherit',
                whiteSpace: 'nowrap',
                marginBottom: -1,
              }}
            >
              <Icon name={tabItem.icon} size={14} />
              {tabItem.label}
            </button>
          )
        })}
      </div>

      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-lg)' }}>
          {filteredGroups.map((group) => (
            <section key={group.heading} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
              <h2
                style={{
                  margin: 0,
                  fontSize: 'var(--t-meta)',
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'var(--text2)',
                }}
              >
                {group.heading}
              </h2>
              {group.note && (
                <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.5 }}>
                  {group.note}
                </p>
              )}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${
                    viewport === 'phone'
                      ? 1
                      : viewport === 'tablet'
                        ? Math.min(2, group.cards.length)
                        : Math.min(group.desktopColumns, group.cards.length)
                  }, minmax(0, 1fr))`,
                  gap: 'var(--sp-md)',
                }}
              >
                {group.cards.map((card) => (
                  <Link
                    key={card.tab}
                    to={card.to}
                    onClick={(e) => {
                      e.preventDefault()
                      setTab(card.tab)
                    }}
                    style={{
                      ...cardStyle,
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 12,
                      minHeight: 88,
                      padding: 14,
                      textAlign: 'left',
                      fontFamily: 'inherit',
                      cursor: 'pointer',
                      border: '1px solid var(--border)',
                      background: 'var(--card)',
                      textDecoration: 'none',
                    }}
                  >
                    <span
                      aria-hidden
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 'var(--r-sm)',
                        display: 'grid',
                        placeItems: 'center',
                        background: 'var(--select-bg)',
                        color: 'var(--select-fg)',
                        flexShrink: 0,
                      }}
                    >
                      <Icon name={card.icon} size={18} />
                    </span>
                    <span style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>
                          {card.label}
                        </span>
                      </span>
                      <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.45 }}>
                        {card.hint}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {activeTab === 'depreciation' && money && <DepreciationCalculator embedded />}
      {activeTab === 'pricing' && money && <PricingCalculator embedded />}
      {/* RULING 2026-10-13: guarded like the two above — the tab strip hid Late
          Fee, but a typed `?tab=latefee` still rendered it for the floor. */}
      {activeTab === 'latefee' && money && <LateFeeCalculator />}
      {activeTab === 'cinematography' && <CineTools embedded />}

    </PageShell>
  )
}
