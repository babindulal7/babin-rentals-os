# Black + Light preset trial — review gate

**Branch:** `feat/shadcn-b1avaxO6a-black-light`  
**Base:** `d6ee4b32fa264340a00d97971db25e598ea58bfe` (main when branched)  
**Preset:** `b1avaxO6a`  
**Scope:** palette-only adaptation, not full shadcn CLI installation  
**Status:** committed for review; **not merged, deployed, or production-verified**.

## Preset decoded from shadcn's published v2 preset definitions

- Rhea component style
- Olive base colour
- Emerald accent theme
- Blue charts
- Medium radius
- Inter body font, inherited heading font
- Lucide icon library
- Default menus with subtle accent

The OS intentionally keeps its self-hosted Outfit / Source Sans 3 / JetBrains Mono,
Tabler icons, design-system radii and existing charts, because replacing these
would conflict with current Babin rules and expand the change far beyond a
safe theme review. Olive is adopted through the neutral surface ladder;
emerald through restrained hover/focus washes; blue remains the primary
operational/status hue and blue-first chart family.

## Source changes

- `src/styles/preset-black-light.css` contains the two scoped palettes:
  `data-theme='light'` and `data-theme='dark'`, excluding
  `data-style='glass'`.
- `src/main.tsx` imports the palette after canonical `theme.css`.
- `src/lib/__tests__/preset-black-light.test.ts` locks imports, scope,
  semantic token exclusions, and AA colour contrast.

## Preserved contracts

1. **Rental and inventory lifecycle unchanged** — no modifications to
   availability, return, cleaning, QC, reset, reservation or invoice code.
2. **Money and role security unchanged** — no RLS, finance gating, RBAC or
   component actions modified.
3. **Colour meaning unchanged** — blue Booked/Reserved/Issued, orange On Rent,
   yellow Packed/Cleaning, green Returned, red Damaged/Overdue; all
   `--primary` and `--st-*` colours stay in canonical `theme.css`.
4. **Responsive unchanged** — phone below 768, iPad/tablet 768–1279,
   desktop 1280 and above. Touch targets 44/48/56 px unchanged.
5. **Fonts and accessibility unchanged** — self-hosted typography,
   Devanagari loading, high-contrast mode, reduced transparency, COSS
   dialog/drawer contracts, focus traps and screen-reader labels untouched.
6. **Glass finish unchanged** — existing glass-dark/glass-light palettes
   remain outside this trial. Switch Glass off to preview standard black/light.
7. **Data untouched** — no migration, live Supabase action, seed, deletion,
   merge, release or environment change.

## Verification evidence and limits

Static colour-math check of the committed palette evaluated **28**
body/muted/border contrast pairs. Every pair met the selected WCAG thresholds:
4.5:1 for text; 3:1 for light-theme control border. Worst tested ratio:
**3.14:1** (the border). The CSS was also checked for balanced braces
and for absence of overridden semantic tokens. This is **static validation**,
not physical visual acceptance.

### Required local test order

```bash
git fetch origin
git switch feat/shadcn-b1avaxO6a-black-light
npm ci
npm run typecheck
npx vitest run src/lib/__tests__/preset-black-light.test.ts
npm test
npm run lint
npm run check:contrast
npm run check:pglite
npm run check:lifecycle
npm run build
npm run dev:mock
```

No test, migration or build command above should target live production.
CI runs that fail before any job step executes **do not prove app tests failed**
and are not a substitute for executed local checks.

### Manual review matrix (must perform before approving merge)

| Surface | Desktop >=1280 | iPad 768–1279 | Phone <768 |
|---|---|---|---|
| Today pickup/return board | Layout, colour meanings, actions | Touch and collapsed navigation | Cards and large targets |
| Rentals + operations popup | Pack → Handover → Return → Reset | Dialog/sheet, scan targets | No clipped sticky action |
| Clients + Membership | Forms, roles, save status | Sections accessible | No horizontal overflow |
| Equipment + Bundles | Stock/unit/editor/scroll | Fields and summary rail | Serial fields readable |
| Reports + Finance | Charts/table/CSV | Report filter hierarchy | Values and data source clear |
| Calendar + Settings | Grid/contrast | Gesture targets | Dialog focus and keyboard |
| Black → Light → Black | No data/state loss | No focus loss | No white/navy flashes |

Also test warehouse high-contrast, both preexisting Glass finishes,
reduced transparency, reduced motion, keyboard navigation, and the
money-blind Warehouse/Technician/Driver view. Conduct side-by-side
screenshots with the former palette, especially floor workflows.

## Review decisions before further implementation

- Whether to retain the app's **blue action/status semantic system**
  (this branch does) or explicitly approve a separate emerald
  action token for a future **distinct** visual redesign. Never recolour
  status meaning as a side effect of a preset.
- Whether to bring shadcn Rhea UI primitives, Lucide, or Inter later.
  Those require individual accessibility, offline, and layout reviews,
  not a mass `shadcn apply` overwrite.

## Rollback

Revert the import of `src/styles/preset-black-light.css` in `src/main.tsx`.
The canonical `theme.css` remains unmodified. No database rollback.

Do not merge or deploy without Babin's separate approval.
