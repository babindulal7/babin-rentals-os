# Universal header action positions — 14 October 2026

**Owner request:** A button of the same type stays in the same place on every page. No second header, no additional toolbar row, and no increase in the 64px global header height.

## Authoritative single-row layout

The application shell uses **one** `src/components/shell/Header.tsx`. All page metadata arrives through `PageHeader` and `WorkspaceProvider`; `PageHeader` does not render a duplicate header when in the shell.

Desktop (right-anchored, after Page Title and Search):

| Slot | Content | Width contract | Behavior |
|---|---|---|---|
| 1. Secondary | Optional Export/Save Draft and other contextual verbs | Flexible; **to the left of all fixed slots** | Maximum two visible; extra actions go to More |
| 2. Filters | The existing `FilterButton` / `WorkspaceHeaderActions` portal | 44px | One persistent location on every list page |
| 3. Add | Typed Add dropdown or `GlobalAddMenu` | 156px desktop / 106px tablet | Preserves permission gates and creation flows |
| 4. More | Overflow menu(s), including page-owned menus | 44px | Secondary functions stay accessible without moving primary |
| 5. Primary | Confirm, Save, Create, Record Payment | 184px desktop / 160px tablet | Fixed location immediately before global chrome |

The order in the DOM is **secondary, filters, add, more, primary**. Secondary labels or absent actions do not move the four fixed action slots. Empty desktop slots reserve position; no fake, disabled button appears.

Phone (<768px): same semantic ordering but invisible empty controls consume no space; button hit areas remain >=44px and the primary position is compact (56px). Add reduces to its icon with an accessible label; primary truncates long text and retains its accessible name. Phone search has one fixed trailing `data-header-slot=search` location before the avatar, regardless of whether the page provides a contextual query or uses global search. It cannot turn into a second permanent header row.

## Compatible APIs

- Preferred new screens: `<PageHeader actionsConfig={[...]}/>` — typed `priority: 'primary' | 'secondary' | 'overflow' | 'add'` with permissions and dynamic stage rules.
- Existing screens using `<PageHeader actions={<PageActions ... />}/>` are partitioned by the shell into the same action slots, instead of rendering their whole action bar after Save. Excess secondary actions are placed in the More menu.
- Unstructured legacy actions are recognized by `variant='primary'` and placed in the primary slot; other actions become secondary/overflow.
- Portaled pages: `WorkspaceHeaderActions` (filters), `WorkspaceHeaderSecondaryActions`, `WorkspaceHeaderAddActions` (create), `WorkspaceHeaderMoreActions`, `WorkspaceHeaderRightActions` (primary only), `WorkspaceHeaderPhoneSearchActions`. Each slot is owned by the one global header.
- New Rental was converted from one three-button portal to three separate typed locations, retaining all click handlers, disabled rules and the draft/confirm paths.
- Rentals List now places the New Rental creation action in **Add**, not Save/Confirm. This suppresses the generic Add fallback while the page owns that slot and restores it upon unmount.

## Do not

- Add a standalone PageHeader under the shell.
- Render a Save/Confirm control in the filter or More slot.
- Put a second primary button in the visible header.
- Increase `--header-h` or let action containers wrap.
- Use absolute screen coordinates for click targets. The exact slot anchors are stable *within each viewport band*, with smaller screens collapsing appropriately.
- Introduce hidden or dummy buttons simply to reserve space.

## Validation

Run `npm run typecheck`, `npm test`, `npm run check:pglite`, `npm run check:lifecycle`, and `npm run build`. Component regression: `src/components/shell/__tests__/headerButtonPositions.test.tsx`. Conduct responsive browser smoke checks at **360, 390, 768, 1024, 1280 and 1440px** on Today, Rentals, New Rental, Inventory, Clients, Operations, Finance and Settings. Check touch target size, no clipped Save actions, submenu visibility, and no duplicate header. These browser checks are **not** certified by component-only unit tests.

**Rollback:** Revert this branch's Header, workspace portal/context, shell CSS and NewRental changes. No database migration is involved.
