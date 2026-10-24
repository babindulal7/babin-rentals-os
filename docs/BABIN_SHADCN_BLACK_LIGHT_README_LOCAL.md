# Babin Rentals OS — Local Black + Light Theme (preset `b1avaxO6a`)

**Deliverable:** Local-only patch + source files + automated regression test.  
**GitHub:** No push, no merge, no PR, no remote change is needed.  
**Supabase:** No database, migration, RLS, environment, or production change.

## What the theme changes

The shadcn preset's **Rhea / olive / emerald / blue-chart** visual direction is adapted to Babin Rentals' existing CSS-token architecture. It introduces:

- **Light:** olive-tinted near-white canvas, white cards, calm green-neutral table/input/hover surfaces.
- **Black:** near-black canvas, dark green-neutral cards/sidebars, readable pale text.
- **Emerald:** subtle focus, hover and auxiliary accent treatments.

This is a **theme-token integration**, not an installation of all shadcn components. Existing blue booking/primary actions and other status semantics, Tabler icons, self-hosted typefaces, Nepali/BS display, high-contrast and glass finishes stay untouched. All React behavior and database logic are unchanged.

## Apply to your existing LOCAL repository

1. Open your **local** `babin-rentals-os` folder in Antigravity/terminal.
2. Protect uncommitted changes first: check `git status --short`. If dirty, commit/stash your own work before switching; never discard anything automatically.
3. Make a local work branch:

```bash
git switch -c local/shadcn-b1avaxO6a-black-light
```

4. Download and place `BABIN_SHADCN_BLACK_LIGHT_LOCAL.patch` somewhere accessible locally. From the repository root:

```bash
git apply --check /path/to/BABIN_SHADCN_BLACK_LIGHT_LOCAL.patch
git apply /path/to/BABIN_SHADCN_BLACK_LIGHT_LOCAL.patch
```

> If `git apply --check` fails, **stop**. Your local `src/main.tsx` or target files may already contain these changes or diverge. Do not force it. An agent should compare the three supplied files and adapt **only** the import and intended new files while retaining your newer work. Do not run the entire shadcn preset directly over Babin's existing theme.

### Run local checks

```bash
npm run typecheck
npx vitest run src/lib/__tests__/preset-black-light.test.ts
npm run check:contrast
npm test
npm run lint
npm run build
npm run dev:mock
```

For a complete verification pass, also run `npm run check:pglite` and `npm run check:lifecycle` **against disposable local test stores only**, not live Supabase. The test runner and dependency installation must be configured locally; no commands have been executed against your machine by ChatGPT.

### Review (desktop, iPad, phone)

| Surface | Verify |
|---|---|
| Today pickup/return dashboard | Exact pickup/return states, status colour semantics, no overflow |
| Booking operations | Packing, handover, return, Reset, scan focus, confirmations and signatures |
| Add Client / Equipment / Bundle | Field contrast, save/cancel placement, validation and draft protection |
| Manage Inventory | Serial and stock statuses, blocked/damaged/lost indicators |
| Membership | Read-only and unavailable actions remain honest, no fake save |
| Reports & Finance | Reconciled numbers, charts, dates, money-blind roles, CSV/export controls |
| Calendar & settings | Dialogs, header, side nav, responsive sheets and keyboard focus |
| Themes | Switch **standard** Light -> Dark -> Light, then check preexisting Glass and High Contrast unchanged |

Maintain responsive breakpoints **768 / 1280**, minimum **44px** touch targets (larger for operational actions), semantic colours for statuses, keyboard/screen-reader access, and no fake data.

### Local commit only (after checks and review)

```bash
git diff --stat
git add src/main.tsx src/styles/preset-black-light.css src/lib/__tests__/preset-black-light.test.ts
git commit -m "feat(theme): local black-light b1avaxO6a adaptation"
```

**Do not run `git push`.** The local branch is intended for review, not deployment.

### Rollback

Before a commit, from a clean patch application:

```bash
git apply --reverse /path/to/BABIN_SHADCN_BLACK_LIGHT_LOCAL.patch
```

Check for other local changes before reversing. After committing, the appropriate rollback is a **local** `git revert <commit>` after reviewing the diff.

## Coding agent instruction (copy-paste)

> In the existing **local** Babin Rentals OS workspace only, apply `BABIN_SHADCN_BLACK_LIGHT_LOCAL.patch` on a new local branch. First inspect `AGENTS.md`, newest `RULINGS-*`, `src/styles/theme.css`, `src/lib/theme.tsx`, and `src/main.tsx`. Do not push, deploy, merge, run hosted migrations, change live Supabase, replace the old theme CSS, or bulk-install shadcn. Preserve all rental, return, QC, booking, finance, role, mobile and accessibility contracts. Verify typecheck, the new palette test, contrast, unit tests and build. Check desktop (>=1280), tablet (768–1279), phone (<768) and high-contrast/glass regression. Record results honestly; commit locally only after tests and visual review, with no push.

## Files

- `BABIN_SHADCN_BLACK_LIGHT_LOCAL.patch` — apply to existing local repo.
- `src/styles/preset-black-light.css` — standalone palette overlay.
- `src/lib/__tests__/preset-black-light.test.ts` — contrast and scope tests.

**Note:** This bundle was prepared in ChatGPT's temporary environment. It does not install itself into your PC, iPad, or phone. You or your local agent need to apply it to your own local repository.
