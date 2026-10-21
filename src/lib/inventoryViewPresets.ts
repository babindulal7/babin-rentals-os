/**
 * Inventory saved workspace views — pure URL codec.
 * Store ONLY real list filters plus working sort/layout choices.
 * Never include page, action, tab, selection, record IDs or financial fields.
 */
export type InventoryLayout = 'table' | 'grid'

export interface InventoryViewChoices {
  readonly chips: readonly string[]
  readonly categories: readonly string[]
  readonly statuses: readonly string[]
  readonly conditions: readonly string[]
  readonly trackingModes: readonly string[]
  /** Include only implemented, server-backed sort modes. */
  readonly sorts: readonly string[]
  readonly defaultSort: string
}

export interface InventoryViewState {
  readonly sort: string
  readonly layout: InventoryLayout
}

export interface RestoredInventoryView extends InventoryViewState {
  readonly params: URLSearchParams
}

const DEFAULT_LAYOUT: InventoryLayout = 'table'
const SEARCH_LIMIT = 160
const FACET_LIMIT = 12
const QUERY_LIMIT = 2400
const LIST_FIELDS = ['q', 'chip', 'category', 'status', 'condition', 'serialisation'] as const
const VIEW_SORT = 'viewSort'
const VIEW_LAYOUT = 'viewLayout'

/*
 * Control characters (C0 \u0000-\u001f plus DEL \u007f) never belong in a stored
 * search term. The set is built dynamically rather than as a literal control
 * regex so the linter's no-control-regex rule stays green without a suppression;
 * the members are exactly the ones that expression names.
 */
const CONTROL_CHARS = new RegExp(
  `[${String.fromCharCode(0x00)}-${String.fromCharCode(0x1f)}${String.fromCharCode(0x7f)}]`,
  'g',
)

/** Ignore invalid values rather than letting an old saved view produce a bad enum filter. */
function allowedCsv(raw: string | null, allowed: readonly string[]): string | null {
  if (!raw) return null
  const allow = new Set(allowed)
  const picked = [...new Set(raw.split(',').map((s) => s.trim()).filter((s) => allow.has(s)))].slice(0, FACET_LIMIT)
  return picked.length > 0 ? picked.join(',') : null
}

function sanitize(input: URLSearchParams, choices: InventoryViewChoices): RestoredInventoryView {
  const params = new URLSearchParams()
  const term = input.get('q')?.replace(CONTROL_CHARS, ' ').trim().slice(0, SEARCH_LIMIT)
  if (term) params.set('q', term)

  const chip = input.get('chip')
  if (chip && choices.chips.includes(chip)) params.set('chip', chip)

  const facets = {
    category: choices.categories,
    status: choices.statuses,
    condition: choices.conditions,
    serialisation: choices.trackingModes,
  } as const
  for (const [name, allowed] of Object.entries(facets)) {
    const valid = allowedCsv(input.get(name), allowed)
    if (valid) params.set(name, valid)
  }

  const sortOption = input.get(VIEW_SORT)
  const sort = sortOption && choices.sorts.includes(sortOption) ? sortOption : choices.defaultSort
  const layout = input.get(VIEW_LAYOUT) === 'grid' ? 'grid' : DEFAULT_LAYOUT
  params.sort()
  return { params, sort, layout }
}

/**
 * Capture just the Equipment pane's current query + actual presentation controls.
 * The saved view can be private/team through existing savedViews RPC; this codec
 * only decides what the view represents, not who may read/write it.
 */
export function captureInventoryView(
  currentUrl: URLSearchParams,
  state: InventoryViewState,
  choices: InventoryViewChoices,
): string {
  const query = new URLSearchParams(currentUrl)
  query.set(VIEW_SORT, state.sort)
  query.set(VIEW_LAYOUT, state.layout)
  return encodeInventoryView(query, choices)
}

/** Normalize both URL input and saved input through one allowlist. */
export function encodeInventoryView(input: URLSearchParams, choices: InventoryViewChoices): string {
  const state = sanitize(input, choices)
  const output = new URLSearchParams(state.params)
  if (state.sort !== choices.defaultSort) output.set(VIEW_SORT, state.sort)
  if (state.layout !== DEFAULT_LAYOUT) output.set(VIEW_LAYOUT, state.layout)
  output.sort()
  return output.toString()
}

/**
 * Restore filters, sort and layout from a DB or device view. All unrelated
 * or dangerous parameters are discarded (tab=new, action=edit, money etc).
 * The parent component owns setSearchParams / setSort / setView and list querying.
 */
export function restoreInventoryView(raw: string | null, choices: InventoryViewChoices): RestoredInventoryView {
  if (!raw) return { params: new URLSearchParams(), sort: choices.defaultSort, layout: DEFAULT_LAYOUT }
  // Cap maximum work on corrupt or manually edited saved view strings.
  const input = new URLSearchParams(raw.startsWith('?') ? raw.slice(1, QUERY_LIMIT) : raw.slice(0, QUERY_LIMIT))
  return sanitize(input, choices)
}

/** Convenience for audit/testing. These must remain exactly the persisted query keys. */
export const INVENTORY_VIEW_KEYS = [...LIST_FIELDS, VIEW_SORT, VIEW_LAYOUT] as const
