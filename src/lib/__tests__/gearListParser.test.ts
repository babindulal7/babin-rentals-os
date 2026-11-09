/**
 * **T3-12 — the paste-list engine's evidence.**
 *
 * The card's acceptance bar is measured here, not asserted in prose: *"the parser has tests
 * for 20 real-shaped lists (quantities before/after, `x2`, `2pcs`, Nepali digits, emoji
 * bullets); 80%+ of lines in the samples auto-match"*.
 *
 * The twenty lists below are written the way clients actually send them — bullet glyphs,
 * emoji, keycap-numbered notes exports, quantities on either side, "2pcs", Devanagari
 * digits, product names that end in numbers. **Six of the sixty-five lines are meant to
 * fail**, and they are here on purpose: a suite where everything matches proves nothing
 * about the lines a real operator will meet. `notFound` and `several` are the matcher
 * being honest, and they are asserted as such.
 */

import { describe, expect, it } from 'vitest'
import {
  foldNepaliDigits,
  matchGearLine,
  matchGearList,
  normaliseGearText,
  parseGearList,
  summariseGearMatches,
  type GearMatchCandidate,
} from '../gearListParser'

/* ── The catalogue, shaped exactly like `EquipmentResult` ────────────────── */

/**
 * `haystack` mirrors `equipmentResultsFrom`: `[name, category, brand, assetCode]`, already
 * lower-cased. The matcher must work against the field the Add Item panel already builds,
 * or the panel would have to maintain a second search index that could drift from it.
 */
function candidate(name: string, brand: string, code: string, category: string): GearMatchCandidate {
  return {
    id: code,
    name,
    haystack: [name, category, brand, code].map((s) => s.toLowerCase()),
    group: category,
  }
}

const CATALOGUE: readonly GearMatchCandidate[] = [
  candidate('Sony FX3 Camera Body', 'Sony', 'CAM-001', 'Camera Bodies'),
  candidate('Sony FX30 Camera Body', 'Sony', 'CAM-002', 'Camera Bodies'),
  candidate('Sony A7S III Camera Body', 'Sony', 'CAM-003', 'Camera Bodies'),
  candidate('Blackmagic Pocket 6K Pro', 'Blackmagic', 'CAM-004', 'Camera Bodies'),
  candidate('Sony 24-70mm f/2.8 GM Lens', 'Sony', 'LEN-001', 'Lenses'),
  candidate('Sony 70-200mm f/2.8 GM Lens', 'Sony', 'LEN-002', 'Lenses'),
  candidate('Sigma 18-35mm f/1.8 Art Lens', 'Sigma', 'LEN-003', 'Lenses'),
  candidate('Aputure LS 600x Pro Light', 'Aputure', 'LGT-001', 'Lighting'),
  candidate('Aputure 300x Light', 'Aputure', 'LGT-002', 'Lighting'),
  candidate('Aputure Nova P300c', 'Aputure', 'LGT-003', 'Lighting'),
  candidate('Amaran F22c Flexible Light', 'Aputure', 'LGT-004', 'Lighting'),
  candidate('Litepanels Astra 6x', 'Litepanels', 'LGT-005', 'Lighting'),
  candidate('Godox SL60W Light', 'Godox', 'LGT-006', 'Lighting'),
  candidate('DJI Ronin RS3 Pro Gimbal', 'DJI', 'GIM-001', 'Gimbals'),
  candidate('DJI Mavic 3 Drone', 'DJI', 'DRN-001', 'Drones'),
  candidate('V-Mount Battery 190Wh', 'Generic', 'BAT-001', 'Batteries'),
  candidate('V-Mount Battery 98Wh', 'Generic', 'BAT-002', 'Batteries'),
  candidate('Sennheiser MKH 416 Microphone', 'Sennheiser', 'AUD-001', 'Audio'),
  candidate('Rode Wireless GO II Kit', 'Rode', 'AUD-002', 'Audio'),
  candidate('Manfrotto 504X Tripod', 'Manfrotto', 'SUP-001', 'Support'),
  candidate('Kupo C-Stand', 'Kupo', 'SUP-002', 'Support'),
  candidate('Matthews Apple Box Set', 'Matthews', 'SUP-003', 'Support'),
  candidate('Sandbag 15kg', 'Generic', 'SUP-004', 'Support'),
  candidate('SmallHD 702 Touch Monitor', 'SmallHD', 'MON-001', 'Monitors'),
  candidate('Atomos Ninja V Recorder', 'Atomos', 'REC-001', 'Recorders'),
]

const only = (name: string): readonly GearMatchCandidate[] => {
  const found = CATALOGUE.filter((c) => c.name === name)
  expect(found, `fixture is missing "${name}"`).toHaveLength(1)
  return found
}

/* ── Quantities ──────────────────────────────────────────────────────────── */

describe('quantities', () => {
  const qty = (line: string) => {
    const parsed = parseGearList(line)
    expect(parsed, `"${line}" produced no line`).toHaveLength(1)
    return parsed[0]!
  }

  it('reads the quantity before the name', () => {
    expect(qty('2 Aputure 600x').quantity).toBe(2)
    expect(qty('2 Aputure 600x').item).toBe('Aputure 600x')
  })

  it('reads x2 and 2x and ×2 after the name', () => {
    expect(qty('FX3 x2').quantity).toBe(2)
    expect(qty('FX3 2x').quantity).toBe(2)
    expect(qty('FX3 \u00D72').quantity).toBe(2)
    expect(qty('V-mount 190 x 6').quantity).toBe(6)
  })

  it('reads a number with a unit word on either side', () => {
    expect(qty('FX3 2pcs').quantity).toBe(2)
    expect(qty('2 pcs FX3').quantity).toBe(2)
    expect(qty('C-stand 4 nos').quantity).toBe(4)
    expect(qty('2 sets apple box').quantity).toBe(2)
  })

  it('reads Devanagari digits like ASCII ones', () => {
    expect(qty('\u0968 FX3').quantity).toBe(2) // २ FX3
    expect(qty('FX3 \u0968x').quantity).toBe(2) // FX3 २x
    expect(qty('\u0969 \u0935\u093F-\u092E\u093E\u0909\u0902\u091F').quantity).toBe(3) // ३ वि-माउंट
  })

  it('does not read a list ordinal as a quantity', () => {
    // "2. FX3" is the second item, not two FX3s. Asserted because reading it as a
    // quantity would put a second unit on a client's booking.
    for (const line of ['2. FX3', '2) FX3', '3. Sony FX30']) {
      const parsed = qty(line)
      expect(parsed.quantity, line).toBe(1)
      expect(parsed.quantityStated, line).toBe(false)
    }
  })

  it('does not read a model number as a quantity', () => {
    // The card's own sample ends in "600x"; a lamp's model number must survive intact.
    const aputure = qty('Aputure 600x')
    expect(aputure.quantity).toBe(1)
    expect(aputure.item).toBe('Aputure 600x')

    // A trailing bare number is never a quantity — "Mavic 3" is one drone.
    const mavic = qty('DJI Mavic 3')
    expect(mavic.quantity).toBe(1)
    expect(mavic.item).toBe('DJI Mavic 3')
  })

  it('keeps the name when a quantity is cut out of it', () => {
    // "Aputure 600x x2" — the trailing x2 is the quantity, the lamp's 600x is not.
    const line = qty('Aputure 600x x2')
    expect(line.quantity).toBe(2)
    expect(line.item).toBe('Aputure 600x')
  })

  it('refuses an implausible count rather than inventing units', () => {
    // A pasted phone number must not become a booking of 98 units.
    expect(qty('9800000000').quantity).toBe(1)
    expect(qty('9800000000').quantityStated).toBe(false)
  })

  it('defaults to one and says the line did not state it', () => {
    const parsed = qty('Sony FX3')
    expect(parsed.quantity).toBe(1)
    expect(parsed.quantityStated).toBe(false)
  })
})

/* ── Bullets, emoji and blank lines ──────────────────────────────────────── */

describe('bullets and blank lines', () => {
  it('strips the bullet glyphs a message arrives with', () => {
    for (const raw of ['\u2022 FX3', '\u00B7 FX3', '- FX3', '* FX3', '\u2192 FX3', '> FX3']) {
      const parsed = parseGearList(raw)
      expect(parsed[0]?.item, raw).toBe('FX3')
    }
  })

  it('strips emoji, including the ones a client puts mid-line', () => {
    expect(parseGearList('\uD83D\uDD39 Sony FX30').at(0)?.item).toBe('Sony FX30')
    expect(parseGearList('\u2705 FX3').at(0)?.item).toBe('FX3')
    expect(parseGearList('V-mount x6 \uD83D\uDD0B').at(0)?.item).toBe('V-mount')
    expect(parseGearList('V-mount x6 \uD83D\uDD0B').at(0)?.quantity).toBe(6)
  })

  it('drops blank lines and keeps the pasted order and line numbers', () => {
    const parsed = parseGearList('FX3\n\n   \n24-70 GM\n')
    expect(parsed.map((l) => l.item)).toEqual(['FX3', '24-70 GM'])
    expect(parsed.map((l) => l.lineNo)).toEqual([1, 4])
    expect(parsed.map((l) => l.raw)).toEqual(['FX3', '24-70 GM'])
  })

  it('keeps the raw text so the preview can show what the person wrote', () => {
    const parsed = parseGearList('  \u2022 2 Aputure 600x  ')
    expect(parsed[0]?.raw).toBe('\u2022 2 Aputure 600x')
  })
})

/* ── Normalisation, which the alias writer also stores ───────────────────── */

describe('normaliseGearText', () => {
  it('folds Nepali digits and case', () => {
    expect(foldNepaliDigits('\u0967\u0968\u0969')).toBe('123')
    expect(normaliseGearText('Sony  FX3')).toBe('sony fx3')
  })

  it('is the same string a saved alias would be compared against', () => {
    // The alias writer stores `normaliseGearText(typed)` and the matcher compares
    // `normaliseGearText(pasted)`. If these ever diverged, "the next paste matches better"
    // would be false — so the contract is pinned here.
    const typed = '  Sony FX-3  '
    const pasted = 'SONY fx 3'
    expect(normaliseGearText(pasted)).toBe(normaliseGearText(typed))
  })

  it('strips emoji rather than turning them into words', () => {
    expect(normaliseGearText('FX3 \uD83C\uDFA5 x2')).toBe('fx3 x2')
  })
})

/* ── Matching, and the difference between an answer and a guess ──────────── */

describe('matching', () => {
  const match = (line: string, pool: readonly GearMatchCandidate[] = CATALOGUE) => {
    const parsed = parseGearList(line)
    expect(parsed).toHaveLength(1)
    return matchGearLine(parsed[0]!, pool)
  }

  it('matches an exact name with full confidence', () => {
    const m = match('Sony FX3 Camera Body')
    expect(m.kind).toBe('matched')
    expect(m.best?.id).toBe('CAM-001')
    expect(m.best?.score).toBe(1)
  })

  it('matches a saved alias at full confidence', () => {
    // What a staff correction produces: the alias is stored against the product.
    const withAlias: readonly GearMatchCandidate[] = only('Sony 24-70mm f/2.8 GM Lens').map((c) => ({
      ...c,
      aliases: ['2470 gm', 'the kit lens'],
    }))
    expect(match('2470 gm', withAlias).kind).toBe('matched')
    expect(match('2470 gm', withAlias).best?.score).toBe(1)
    expect(match('the kit lens', withAlias).best?.id).toBe('LEN-001')
  })

  it('matches the shorthand an operator types', () => {
    expect(match('24-70 GM').best?.id).toBe('LEN-001')
    expect(match('MKH 416').best?.id).toBe('AUD-001')
    expect(match('Nova P300c').best?.id).toBe('LGT-003')
  })

  it('asks rather than picks when two lights answer the same word', () => {
    // A bare "light" is a question. Silently choosing a lamp would price the booking wrong.
    const m = match('light')
    expect(m.kind).toBe('several')
    expect(m.options.length).toBeGreaterThan(1)
    expect(m.options.every((o) => o.score >= 0.62)).toBe(true)
  })

  it('asks when two batteries answer the same word', () => {
    expect(match('V-mount').kind).toBe('several')
  })

  it('answers when the client names which one', () => {
    expect(match('V-mount 190').best?.id).toBe('BAT-001')
    expect(match('V-mount 98').best?.id).toBe('BAT-002')
  })

  it('says not found instead of matching one shared word', () => {
    // We own Sonys. "Sony something we do not own" is not a Sony camera.
    for (const line of ['Sony drone', 'go pro hero 12', 'easyrig', 'boom pole']) {
      expect(match(line).kind, line).toBe('notFound')
    }
  })

  it('never returns a money field, so a money-blind role cannot be leaked a price', () => {
    // Law 6. The engine carries ids, names and scores — nothing else. The panel decides
    // whether to print the rate it already holds.
    const m = match('FX3 x2')
    expect(Object.keys(m.best ?? {}).sort()).toEqual(['id', 'name', 'score'])
    expect(JSON.stringify(m)).not.toMatch(/paisa|rate|price|rs\b/i)
  })

  it('carries the quantity through to the match, so the confirm step cannot lose it', () => {
    expect(match('3 V-mount 190').line.quantity).toBe(3)
    expect(match('3 V-mount 190').best?.id).toBe('BAT-001')
  })
})

/* ── The twenty real-shaped lists ────────────────────────────────────────── */

/**
 * Each list is one client's message. The comment says what shape it covers, so a
 * regression tells you which real-world message it broke.
 */
const SAMPLE_LISTS: readonly { readonly shape: string; readonly lines: readonly string[] }[] = [
  {
    shape: 'the card\u2019s own sample \u2014 quantity before, xN after',
    lines: ['FX3 x2', '24-70 GM', '2 Aputure 600x', 'V-mount 190 x6'],
  },
  {
    shape: 'emoji bullets, and one item we do not own',
    lines: ['\uD83D\uDD39 Sony FX30 body', '\uD83D\uDD39 DJI Ronin RS3 Pro', '\uD83D\uDD39 GoPro Hero 12'],
  },
  {
    shape: 'a Notes export with keycap ordinals (1\u20E3 is numbering, not a count)',
    lines: ['1\uFE0F\u20E3 Sony A7S III', '2\uFE0F\u20E3 Sigma 18-35', '3\uFE0F\u20E3 SmallHD 702'],
  },
  {
    shape: 'quantities typed in Devanagari digits',
    lines: ['\u0968 FX3', '3 V-mount 190', '2 Aputure 600x'],
  },
  {
    shape: '"2pcs" / "1 pc" / "2 nos" after the name',
    lines: ['FX3 2pcs', '24-70 1 pc', 'Sennheiser 416 2 nos'],
  },
  {
    shape: 'a generic word that must ask rather than pick',
    lines: ['Aputure light', 'Amaran F22c', 'Godox SL60W'],
  },
  {
    shape: 'product names that end in a number',
    lines: ['DJI Mavic 3', 'DJI RS3 Pro', 'V-mount 98'],
  },
  {
    shape: 'support gear with a C-stand and a weighted sandbag',
    lines: ['4 C-stand', '2 apple box', 'sandbag 15'],
  },
  {
    shape: 'audio kit, plus a boom pole we do not stock',
    lines: ['Rode wireless go 2', 'MKH 416', 'Boom pole'],
  },
  {
    shape: 'shorthand brands, plus an Easyrig we do not own',
    lines: ['Blackmagic 6K', 'Atomos Ninja', 'Easyrig'],
  },
  {
    shape: 'model numbers as the whole line',
    lines: ['600x Pro', '300x', 'Nova P300c'],
  },
  {
    shape: 'a full shoot list, eight lines',
    lines: [
      'Sony FX3',
      'Sony FX30',
      '24-70 GM',
      '70-200 GM',
      '2 Aputure 600x',
      'Amaran F22c',
      'V-mount 190 x4',
      'V-mount 98 x2',
    ],
  },
  {
    shape: 'the 4x / 2x suffix form',
    lines: ['V-mount 190 4x', 'Sennheiser 416 2x', 'C-stand 6x'],
  },
  {
    shape: 'stray punctuation and doubled spaces',
    lines: ['FX3   x 2', ', 24-70 GM .', '\u2022 Sony FX30'],
  },
  {
    shape: 'a bare "light" and a light stand we do not own',
    lines: ['light', 'light stand'],
  },
  {
    shape: 'xN on every line, including a recorder',
    lines: ['Sony FX3 2x', 'FX30 1x', '24-70 2x', 'Atomos Ninja V'],
  },
  {
    shape: 'a tripod named two ways',
    lines: ['Manfrotto tripod', 'Manfrotto 504X'],
  },
  {
    shape: 'xN with an audio kit',
    lines: ['Sennheiser 416 x2', 'Rode wireless go', 'SmallHD 702 x1'],
  },
  {
    shape: 'expendables with xN',
    lines: ['Sandbag x4', 'Apple box x2'],
  },
  {
    shape: '2x before the name, mixed with xN after',
    lines: ['2x V-mount 190', 'Amaran F22c x2', '1x Nova P300c', 'Godox SL60W'],
  },
]

describe('the twenty real-shaped lists', () => {
  const allLines = SAMPLE_LISTS.flatMap((l) => l.lines)

  it('is twenty lists of real-shaped text', () => {
    expect(SAMPLE_LISTS).toHaveLength(20)
    expect(allLines.length).toBeGreaterThanOrEqual(40)
  })

  it('parses every single line and loses none', () => {
    for (const list of SAMPLE_LISTS) {
      const parsed = parseGearList(list.lines.join('\n'))
      expect(parsed, list.shape).toHaveLength(list.lines.length)
      for (const line of parsed) {
        expect(line.raw, list.shape).not.toBe('')
        expect(line.item, `${list.shape} \u2192 "${line.raw}"`).not.toBe('')
        expect(line.quantity, `${list.shape} \u2192 "${line.raw}"`).toBeGreaterThanOrEqual(1)
      }
    }
  })

  it('auto-matches 80% or more of the lines across the samples', () => {
    // The card's bar. Measured over all twenty lists at once, misses included: the six
    // lines that are genuinely absent from the catalogue or genuinely ambiguous count
    // against the rate, which is what makes the number mean something.
    const matches = SAMPLE_LISTS.flatMap((l) => matchGearList(parseGearList(l.lines.join('\n')), CATALOGUE))
    const summary = summariseGearMatches(matches)

    // Printed so the measured figure is in the gate output, not only in the assertion.
    console.log(
      `[T3-12] ${summary.matched}/${summary.total} lines auto-matched ` +
        `(${(summary.autoMatchRate * 100).toFixed(1)}%) · ${summary.several} ambiguous · ${summary.notFound} not found`,
    )

    expect(summary.total).toBe(allLines.length)
    expect(summary.matched + summary.several + summary.notFound).toBe(summary.total)
    // Reported in the assertion message so the failing number is the measured one.
    expect(
      summary.autoMatchRate,
      `${summary.matched}/${summary.total} lines matched (${summary.several} ambiguous, ${summary.notFound} not found)`,
    ).toBeGreaterThanOrEqual(0.8)
  })

  it('keeps every unmatched line visible with the text the client wrote', () => {
    for (const list of SAMPLE_LISTS) {
      const parsed = parseGearList(list.lines.join('\n'))
      const matches = matchGearList(parsed, CATALOGUE)
      for (const m of matches) {
        // Nothing is ever silently dropped from the preview.
        expect(m.line.raw).not.toBe('')
        if (m.kind === 'notFound') expect(m.options.length).toBeLessThanOrEqual(3)
        if (m.kind === 'several') expect(m.options.length).toBeGreaterThan(1)
        if (m.kind === 'matched') expect(m.best?.id).toBeTruthy()
      }
    }
  })

  it('reads the quantity on every line the client wrote one on', () => {
    const expected: readonly [string, number][] = [
      ['FX3 x2', 2],
      ['2 Aputure 600x', 2],
      ['V-mount 190 x6', 6],
      ['FX3 2pcs', 2],
      ['24-70 1 pc', 1],
      ['Sennheiser 416 2 nos', 2],
      ['4 C-stand', 4],
      ['2 apple box', 2],
      ['V-mount 190 x4', 4],
      ['V-mount 190 4x', 4],
      ['Sennheiser 416 2x', 2],
      ['C-stand 6x', 6],
      ['Sony FX3 2x', 2],
      ['2x V-mount 190', 2],
      ['Amaran F22c x2', 2],
      ['1x Nova P300c', 1],
      ['Sandbag x4', 4],
      ['\u0968 FX3', 2],
    ]
    for (const [line, want] of expected) {
      const parsed = parseGearList(line)
      expect(parsed[0]?.quantity, line).toBe(want)
      expect(parsed[0]?.quantityStated, line).toBe(true)
    }
  })
})
