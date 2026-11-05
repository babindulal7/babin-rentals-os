/**
 * **T3-12 — "Paste list": read a WhatsApp gear list into lines, quantities and matches (W1, W9).**
 *
 * Most bookings arrive as a message from the client:
 *
 * ```
 * FX3 x2
 * 24-70 GM
 * 2 Aputure 600x
 * V-mount x6 🔋
 * ```
 *
 * This module turns that text into one record per line, with the quantity the client wrote,
 * and matches each line against the catalogue. **It is a pure text engine**: no DOM, no
 * network, no AI service (Law 16 — matching is plain text search over names, aliases and
 * asset codes, exactly as the card requires). Everything it decides is explainable by
 * reading the score it produced, which is why it lives in `src/lib/` and is unit-tested.
 *
 * ## What it deliberately does NOT do
 *
 * - **It never adds anything to a booking.** The card (W9) is explicit: *nothing is added
 *   until staff confirm*. This module produces a **preview**; the caller owns the confirm
 *   tap and the single write that follows it.
 * - **It never states a price.** Every field here is a name, an id, a count or a
 *   confidence — there is no money in this file at all, so a money-blind role cannot be
 *   leaked a figure by it (Law 6). The caller decides whether to render `ratePaisa` that
 *   it already holds.
 * - **It never guesses.** A line with no good candidate is `notFound`; two candidates that
 *   score the same are `several` and a person picks. A silent wrong guess is worse than a
 *   question — it puts the wrong lens on a client's booking.
 *
 * ## The two judgement calls, stated because they are real trade-offs
 *
 * 1. **A leading bare number is a quantity; a leading number with `.` or `)` is list
 *    numbering.** The card's own sample (`2 Aputure 600x`) means *two* 600x lamps, so
 *    `"2 Aputure"` → quantity 2. But a numbered list pasted from Notes (`"1. FX3"`,
 *    `"2. 24-70"`) means *first* and *second*, and reading those as quantities would put
 *    two of the second item on the booking. `2.` / `2)` / `2️⃣`-as-ordinal therefore read
 *    as numbering. `2 x`, `2x`, `x2`, `2 pcs`, `2 Aputure` read as a quantity.
 * 2. **Digits inside a name are part of the name.** `24-70`, `600x`, `A7S III`, `FX3` and
 *    `1024GB` must survive tokenisation, or the matcher cannot tell a 24-70 from a 70-200.
 *    Only the *quantity token* is removed, never digits in general. The same bound makes
 *    it safe: a quantity must be 1–99, so `600x` cannot be "600 of them".
 * 3. **A bare trailing number is not a quantity.** `1 x2`, `1 2x` and `1 2 pcs` are read,
 *    but `Mavic 3` is not "three Mavics" — real names end in numbers, and this is the
 *    only reading that cannot silently inflate a booking. Asserted, with the product it
 *    protects, in the unit suite.
 */

/* ── Nepali digits ───────────────────────────────────────────────────────── */

/**
 * Devanagari digits, folded to ASCII before any number is read.
 *
 * Staff and clients type quantities in either script — `"२ FX3"` is as common as
 * `"2 FX3"` — and a quantity that silently reads as `NaN` would put one unit on the
 * booking when the client asked for two. `String.prototype.normalize` does not do this
 * (it is a script difference, not a compatibility form), so the ten digits are mapped
 * explicitly.
 */
const NEPALI_DIGITS: Readonly<Record<string, string>> = {
  '\u0966': '0',
  '\u0967': '1',
  '\u0968': '2',
  '\u0969': '3',
  '\u096A': '4',
  '\u096B': '5',
  '\u096C': '6',
  '\u096D': '7',
  '\u096E': '8',
  '\u096F': '9',
}

/** Fold Devanagari digits to ASCII. Everything else is left exactly as typed. */
export function foldNepaliDigits(text: string): string {
  let out = ''
  for (const ch of text) out += NEPALI_DIGITS[ch] ?? ch
  return out
}

/* ── Bullets, emoji and list numbering ───────────────────────────────────── */

/**
 * Bullet glyphs a client's message may start a line with. Stripped before reading the
 * quantity, so `"• 2 V-mount"` reads the same as `"2 V-mount"`.
 */
const BULLETS = /^[\s\u2022\u00B7\u2023\u25AA\u25CF\u25CB\u25B8\u25BA\u2192\u27A4>*\u2043\u2013\u2014-]+/

/**
 * Emoji and pictographs, by code-point range.
 *
 * Deliberately **not** `\p{Emoji}` — that class also matches `#`, `*` and the ASCII
 * digits, because those are Emoji-capable. Stripping them would eat the quantities and
 * the `*` bullets this very function exists to remove.
 */
const EMOJI_RANGES =
  /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{1F1E6}-\u{1F1FF}]/gu

/**
 * The invisible code points a pasted emoji leaves behind: the variation selector, the
 * zero-width joiner and the keycap mark.
 *
 * Kept out of the range class above on purpose. A character class matches one code point,
 * so putting the joiner and selector inside it does not describe an emoji sequence — it
 * describes "any of these single points", which is exactly the misleading class
 * `no-misleading-character-class` warns about. As alternations the intent is literal.
 */
const EMOJI_JOINERS = /\uFE0F|\u200D|\u20E3/gu

/** A keycap ordinal (`1️⃣`) is list numbering, never a quantity — see judgement call 1. */
const KEYCAP_ORDINAL = /^(\d)\uFE0F?\u20E3\s*/

/* ── Quantities ──────────────────────────────────────────────────────────── */

/**
 * `2x`, `×2`, `2×` — the multiplier form, on either side of the name.
 *
 * The number must be 1–99 **or it is not a quantity at all**. That bound is the whole
 * reason `Aputure 600x` survives: a lamp called "600x" ends in exactly the shape a
 * quantity looks like, and reading its model number as "600 units" would both invent a
 * quantity and delete the only word that identifies the lamp.
 */
const MULTIPLIER_BEFORE = /(?:^|\s)[x\u00D7]\s*(\d{1,3})(?=\s|$)/
const MULTIPLIER_AFTER = /(?:^|\s)(\d{1,3})\s*[x\u00D7](?=\s|$)/

/**
 * `2 pcs`, `3 nos`, `2 sets` — a number with a unit word, before or after the name.
 *
 * `FX3 2pcs` is as common in a WhatsApp list as `2 FX3`, and without this the "2pcs"
 * would stay glued to the name and the line would not match the FX3 at all.
 */
const NUMBER_WITH_UNIT =
  /(?:^|\s)(\d{1,3})\s*(pcs|pc|pieces?|nos|no|units?|sets?|packs?|pkt|boxes?|qty)\b/i

export interface ParsedGearLine {
  /** 1-based position among the pasted lines, so the preview can say "line 4". */
  readonly lineNo: number
  /** The line exactly as pasted, so the preview shows what the person wrote. */
  readonly raw: string
  /** The item text: bullets, quantity and units removed. Empty for a blank line. */
  readonly item: string
  /** Units the client asked for. 1 when the line states no quantity. */
  readonly quantity: number
  /** True when the line carried a quantity, so the UI can show `×2` only when it was written. */
  readonly quantityStated: boolean
}

/**
 * Split pasted text into lines and read each one's quantity.
 *
 * Blank lines are dropped — a WhatsApp paste is full of them, and a blank row in the
 * preview would be an empty question. Order is preserved; nothing is deduplicated here
 * (two identical lines may genuinely be two separate lines on the booking, and merging
 * them is a decision for the person confirming).
 */
export function parseGearList(text: string): ParsedGearLine[] {
  const out: ParsedGearLine[] = []
  const lines = foldNepaliDigits(text).split(/\r?\n/)

  lines.forEach((raw, i) => {
    let rest = raw.trim()
    if (rest === '') return

    // Bullets first, then a keycap ordinal (`1️⃣`), then any remaining emoji.
    rest = rest.replace(BULLETS, '')
    rest = rest.replace(KEYCAP_ORDINAL, '')
    rest = rest.replace(EMOJI_RANGES, ' ').replace(EMOJI_JOINERS, '')
    rest = rest.trim()
    if (rest === '') return

    const read = readQuantity(rest)
    out.push({
      lineNo: i + 1,
      raw: raw.trim(),
      item: read.item,
      quantity: read.quantity,
      quantityStated: read.stated,
    })
  })

  return out
}

/**
 * A plausible quantity, or `null` when the number is something else.
 *
 * The bound is the guard against a typo becoming a booking: a pasted phone number, a
 * price or a model number must not read as "600 units". Anything outside 1–99 is not a
 * quantity — the caller then leaves the digits **in the item text**, where a person sees
 * them, instead of deleting them and inventing a count.
 */
function qtyFrom(raw: string | undefined): number | null {
  if (raw === undefined) return null
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n) || n < 1 || n > 99) return null
  return n
}

/**
 * Read the quantity out of one line and return what is left.
 *
 * **Order decides correctness here**, so it is fixed and tested:
 *
 * 1. list numbering (`2.`) is stripped before anything else, or `"2. FX3"` would read as
 *    two FX3s;
 * 2. `x2` is read before `2x`, so `"Aputure 600x x2"` takes the *2* the client wrote and
 *    leaves the lamp's own `600x` alone;
 * 3. every candidate quantity must be 1–99, so model numbers (`600x`, `A7S`, `24-70`)
 *    never become counts.
 *
 * A **bare trailing number is deliberately not a quantity.** Real catalogue names end in
 * numbers — "DJI Mavic 3", "Aputure 300x", "Atomos Ninja V" — and reading the last word
 * of a product name as a count would put three Mavics on a booking when the client asked
 * for one. The "after" forms that *are* unambiguous (`x2`, `2x`, `2 pcs`) are all read.
 * See judgement call 3 in the file header.
 */
function readQuantity(line: string): { item: string; quantity: number; stated: boolean } {
  let rest = line

  // 1. `2.` / `2)` — list numbering, not a quantity.
  const ordinal = rest.match(/^(\d{1,3})\s*[.)]\s+/)
  if (ordinal) rest = rest.slice(ordinal[0].length)

  // 2. `x2` / `×2`, anywhere — "Aputure 600x x2".
  const before = rest.match(MULTIPLIER_BEFORE)
  const beforeQty = qtyFrom(before?.[1])
  if (before && beforeQty !== null) {
    return { item: cleanItem(rest.replace(before[0], ' ')), quantity: beforeQty, stated: true }
  }

  // 3. `2x` / `2×` — "V-mount 2x". Ignores `600x`, whose 600 fails the 1–99 bound.
  const after = rest.match(MULTIPLIER_AFTER)
  const afterQty = qtyFrom(after?.[1])
  if (after && afterQty !== null) {
    return { item: cleanItem(rest.replace(after[0], ' ')), quantity: afterQty, stated: true }
  }

  // 4. `2 pcs` / `3 nos` / `2 sets`, before or after the name.
  const unit = rest.match(NUMBER_WITH_UNIT)
  const unitQty = qtyFrom(unit?.[1])
  if (unit && unitQty !== null) {
    return { item: cleanItem(rest.replace(unit[0], ' ')), quantity: unitQty, stated: true }
  }

  // 5. A bare leading number — "2 Aputure 600x" (the card's own sample).
  const leading = rest.match(/^(\d{1,3})\s+(.*)$/)
  const leadingQty = qtyFrom(leading?.[1])
  if (leading && leadingQty !== null && leading[2]) {
    return { item: cleanItem(leading[2]), quantity: leadingQty, stated: true }
  }

  return { item: cleanItem(rest), quantity: 1, stated: false }
}

/** Collapse the whitespace left behind when a quantity token is cut out. */
function cleanItem(text: string): string {
  return text.replace(/\s{2,}/g, ' ').replace(/^[\s,;:]+|[\s,;:]+$/g, '').trim()
}

/* ── Matching ────────────────────────────────────────────────────────────── */

/**
 * What the matcher needs to know about one catalogue entry.
 *
 * Structural on purpose: `EquipmentResult` and `BundleResult` both already satisfy it
 * (`id`, `name`, `haystack`), so the panel passes them straight through, and the unit
 * tests build fixtures without importing a module from `src/modules/`. `aliases` are the
 * strings staff taught us on earlier pastes (T3-12 item 3, `product_aliases`).
 */
export interface GearMatchCandidate {
  readonly id: string
  readonly name: string
  /** Pre-lowered searchable strings — the same field the Add Item panel already searches. */
  readonly haystack: readonly string[]
  /** Extra spellings learned from staff corrections. Matched like a name. */
  readonly aliases?: readonly string[] | undefined
  /**
   * The shelf this candidate sits on — `EquipmentResult.category` in the panel.
   *
   * It decides only between *near-equal* answers. Two lamps in the same category scoring
   * within a hair of each other is a real "which one did you mean?"; the same gap across
   * categories usually means the top one is simply right. Without it, a bare "light"
   * would silently pick whichever lamp happened to sort first.
   */
  readonly group?: string | undefined
}

export type GearMatchKind = 'matched' | 'several' | 'notFound'

export interface GearMatchOption {
  readonly id: string
  readonly name: string
  /** 0–1. Higher is better; 1 is an exact normalised match. */
  readonly score: number
}

export interface GearMatch {
  readonly line: ParsedGearLine
  readonly kind: GearMatchKind
  /** The one answer for `matched`; the top pick for `several`. Absent for `notFound`. */
  readonly best?: GearMatchOption | undefined
  /** Rivals, best first. Never empty for `several`. */
  readonly options: readonly GearMatchOption[]
}

/**
 * Scores at or above this are a match. Below it, the line is shown as not found.
 *
 * 0.62 was chosen against the twenty sample lists in
 * `src/lib/__tests__/gearListParser.test.ts`: high enough that a single shared word
 * ("lens", "light") never matches on its own, low enough that a client's shorthand
 * ("24-70 GM") still finds the product. Changing it moves the measured auto-match rate,
 * which that suite asserts.
 */
const MATCH_THRESHOLD = 0.62

/** Two candidates this close are a question, not an answer — staff pick. */
const SEVERAL_EPSILON = 0.02

/**
 * The same idea across a whole shelf.
 *
 * Inside one category, answers within this much of each other are still a question — a
 * bare "light" must ask which lamp, not silently pick the first. Across categories the
 * tight epsilon applies, because there the leader is usually simply right.
 */
const SEVERAL_GROUP_SPREAD = 0.15

/** A word this short carries no product meaning ("a", "of", "and") — unless it is a number. */
const MIN_TOKEN = 2

/**
 * Normalise text for comparison: case, Nepali digits, emoji, punctuation.
 *
 * Exported because the **alias writer stores the same string this compares against**: if
 * the two ever diverged, a saved alias would never match the paste that created it — the
 * exact defect that would make the "next paste matches better" promise a lie.
 */
export function normaliseGearText(text: string): string {
  return foldNepaliDigits(text)
    .toLowerCase()
    .replace(EMOJI_RANGES, ' ')
    .replace(EMOJI_JOINERS, '')
    // The Devanagari block is kept whole, combining marks included: a matra is part of
    // the letter it sits on, so dropping it would turn "माउंट" into a different word.
    // eslint-disable-next-line no-misleading-character-class -- Devanagari kept as a range deliberately; the matras inside it are the point, not an accident
    .replace(/[^a-z0-9\u0900-\u097F]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/**
 * Words that appear in a list or a catalogue name but never identify anything.
 *
 * The list is deliberately short and boring: every word here is one a client writes
 * around the gear ("need", "we", "some") or that the catalogue writes around a name
 * ("kit", "set"). Removing meaning-bearing words is how a matcher starts guessing.
 */
const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'of',
  'a',
  'an',
  'to',
  'or',
  'pcs',
  'pc',
  'set',
  'sets',
  'kit',
  'kits',
  'need',
  'needs',
  'needed',
  'want',
  'wanted',
  'we',
  'our',
  'us',
  'own',
  'some',
  'few',
  'please',
  'pls',
  'pcs.',
])

/**
 * Measurement units that trail a number without distinguishing one product from another.
 *
 * `24-70mm` and `24-70` are the same lens; `190Wh` and `190` are the same battery. So the
 * unit is dropped from the *comparison only* (the name still renders in full).
 *
 * **`x` and `d` are not in this list, deliberately.** They are not units here — they are
 * the model marker on Aputure's bi-colour (`600x`) and daylight (`600d`) lamps, which are
 * different products at different prices. Stripping them would make two lamps identical
 * to the matcher.
 */
const NUMERIC_UNIT = /^(\d+(?:\.\d+)?)(?:mm|cm|m|kg|g|wh|w|v|ah|mah|tb|gb|mb|hz|in|ft|in\.|ft\.)$/

/** `70mm` → `70`; `600x` stays `600x`. */
function stemToken(token: string): string {
  const m = token.match(NUMERIC_UNIT)
  return m?.[1] ?? token
}

function tokenise(text: string): string[] {
  return normaliseGearText(text)
    .split(' ')
    .filter((t) => t !== '' && !STOP_WORDS.has(t) && (t.length >= MIN_TOKEN || /^\d+$/.test(t)))
    .map(stemToken)
}

/**
 * How well one candidate answers one parsed line.
 *
 * The rules, in the order they decide:
 *
 * 1. **Exact** — the normalised item equals the candidate's name or one of its haystack
 *    entries or an alias. 1.0. This is what a saved alias produces, so a correction
 *    genuinely makes the next paste certain.
 * 2. **Contained** — every token the client wrote appears in one of the candidate's
 *    strings. Scored by how much of the *candidate* those tokens cover, so "Aputure"
 *    scores lower against "Aputure 600x Pro" than "600x" does, and a two-word request
 *    scores higher than a one-word one.
 * 3. **Partial** — some tokens hit. Scored down by the fraction that missed, and capped
 *    below the threshold when only one token of several hit, so "Sony something we do not
 *    own" cannot match the Sony we do.
 */
function scoreCandidate(tokens: readonly string[], itemText: string, candidate: GearMatchCandidate): number {
  const item = normaliseGearText(itemText)
  if (item === '') return 0

  const strings = [
    candidate.name,
    ...candidate.haystack,
    ...(candidate.aliases ?? []),
  ]
    .map(normaliseGearText)
    .filter((s) => s !== '')

  if (strings.includes(item)) return 1

  let best = 0
  for (const s of strings) {
    const hay = tokenise(s)
    if (hay.length === 0) continue

    let hits = 0
    for (const t of tokens) if (hay.includes(t)) hits += 1
    if (hits === 0) continue

    const coverageOfItem = hits / tokens.length
    const coverageOfCandidate = hits / hay.length

    if (hits === tokens.length) {
      // Every word the client wrote is in this name. Reward the tighter name.
      best = Math.max(best, 0.75 + 0.24 * coverageOfCandidate)
    } else {
      // A partial hit. The cap is what stops one shared word from becoming an answer:
      // "Sony something we do not own" must not match the Sony we do own. It lifts once
      // three words in four are present, because that is a real answer with one spelling
      // difference — "Rode wireless go 2" against "Rode Wireless GO II Kit".
      const partial = 0.3 + 0.45 * coverageOfItem
      const cap = coverageOfItem >= 0.75 ? 0.7 : 0.55
      best = Math.max(best, Math.min(partial, cap))
    }
  }

  return best
}

/**
 * Match one parsed line against the catalogue.
 *
 * The returned `kind` is the whole contract of the preview:
 * - `matched`  — one clear answer; "Add all matched" may take it.
 * - `several`  — the top scores are within `SEVERAL_EPSILON`; a person picks one.
 * - `notFound` — nothing cleared the threshold; the line stays on screen as typed.
 */
export function matchGearLine(
  line: ParsedGearLine,
  candidates: readonly GearMatchCandidate[],
): GearMatch {
  const tokens = tokenise(line.item)
  if (tokens.length === 0) {
    return { line, kind: 'notFound', options: [] }
  }

  const scored = candidates
    .map((c) => ({
      id: c.id,
      name: c.name,
      score: scoreCandidate(tokens, line.item, c),
      group: c.group,
    }))
    .filter((o) => o.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))

  const top = scored[0]
  if (!top || top.score < MATCH_THRESHOLD) {
    return { line, kind: 'notFound', options: scored.slice(0, 3).map(toOption) }
  }

  const rivals = scored.filter(
    (o) =>
      o.score >= MATCH_THRESHOLD &&
      (top.score - o.score <= SEVERAL_EPSILON ||
        (top.group !== undefined && o.group === top.group && top.score - o.score <= SEVERAL_GROUP_SPREAD)),
  )

  if (rivals.length > 1) {
    return { line, kind: 'several', best: toOption(top), options: rivals.slice(0, 5).map(toOption) }
  }

  return { line, kind: 'matched', best: toOption(top), options: [toOption(top)] }
}

/** Drop the internal `group` before a candidate reaches the UI. */
function toOption(o: { id: string; name: string; score: number }): GearMatchOption {
  return { id: o.id, name: o.name, score: o.score }
}

/** Match every line of a parsed list. Order is preserved; nothing is dropped. */
export function matchGearList(
  lines: readonly ParsedGearLine[],
  candidates: readonly GearMatchCandidate[],
): GearMatch[] {
  return lines.map((line) => matchGearLine(line, candidates))
}

export interface GearMatchSummary {
  readonly total: number
  readonly matched: number
  readonly several: number
  readonly notFound: number
  /** 0–1. The card's own acceptance bar is measured on this. */
  readonly autoMatchRate: number
}

/**
 * Count what the preview will show. Used by the panel's header line ("18 of 20 lines
 * matched") and asserted in the unit suite, so the claim on screen is the measured one.
 */
export function summariseGearMatches(matches: readonly GearMatch[]): GearMatchSummary {
  let matched = 0
  let several = 0
  let notFound = 0
  for (const m of matches) {
    if (m.kind === 'matched') matched += 1
    else if (m.kind === 'several') several += 1
    else notFound += 1
  }
  const total = matches.length
  return {
    total,
    matched,
    several,
    notFound,
    autoMatchRate: total === 0 ? 0 : matched / total,
  }
}
