# Preset Manifest: shadcn/ui Preset `b1avaxO6a`

Decoded on: 24 October 2026  
Target: Babin Rentals OS Safe Local Integration Pilot  
Preset ID: `b1avaxO6a`

---

## 1. Decoded Configuration

* **Style:** `base-rhea` (Rhea style on Base UI `@base-ui/react`)
* **Base Color:** `olive` (Neutral hue: ~106°–107°)
* **Theme:** `emerald`
  * Light primary: `oklch(0.508 0.118 165.612)`
  * Dark primary: `oklch(0.432 0.095 166.913)`
* **Chart Color:** `blue` (Analytical 5-step ladder)
* **Icon Library:** `lucide` (In Babin Rentals OS, mapped to `@tabler/icons-react` per system rules)
* **Radius:** `medium` (`--radius: 0.625rem` / 10px)
  * Radius SM: `calc(var(--radius) * 0.6)` (6px)
  * Radius MD: `calc(var(--radius) * 0.8)` (8px)
  * Radius LG: `var(--radius)` (10px)
  * Radius XL: `calc(var(--radius) * 1.4)` (14px)
  * Radius 2XL: `calc(var(--radius) * 1.8)` (18px)
  * Radius 3XL: `calc(var(--radius) * 2.2)` (22px)
  * Radius 4XL: `calc(var(--radius) * 2.6)` (26px, capped at 24px in card styles)

---

## 2. Emitted CSS Tokens

### `:root` (Light Mode)
```css
:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.153 0.006 107.1);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.153 0.006 107.1);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.153 0.006 107.1);
  --primary: oklch(0.508 0.118 165.612);
  --primary-foreground: oklch(0.979 0.021 166.113);
  --secondary: oklch(0.967 0.001 286.375);
  --secondary-foreground: oklch(0.21 0.006 285.885);
  --muted: oklch(0.966 0.005 106.5);
  --muted-foreground: oklch(0.58 0.031 107.3);
  --accent: oklch(0.966 0.005 106.5);
  --accent-foreground: oklch(0.228 0.013 107.4);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.93 0.007 106.5);
  --input: oklch(0.93 0.007 106.5);
  --ring: oklch(0.737 0.021 106.9);
  --chart-1: oklch(0.809 0.105 251.813);
  --chart-2: oklch(0.623 0.214 259.815);
  --chart-3: oklch(0.546 0.245 262.881);
  --chart-4: oklch(0.488 0.243 264.376);
  --chart-5: oklch(0.424 0.199 265.638);
  --radius: 0.625rem;
}
```

### `.dark` (Dark Mode)
```css
.dark {
  --background: oklch(0.153 0.006 107.1);
  --foreground: oklch(0.988 0.003 106.5);
  --card: oklch(0.228 0.013 107.4);
  --card-foreground: oklch(0.988 0.003 106.5);
  --popover: oklch(0.228 0.013 107.4);
  --popover-foreground: oklch(0.988 0.003 106.5);
  --primary: oklch(0.432 0.095 166.913);
  --primary-foreground: oklch(0.979 0.021 166.113);
  --secondary: oklch(0.274 0.006 286.033);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.286 0.016 107.4);
  --muted-foreground: oklch(0.737 0.021 106.9);
  --accent: oklch(0.286 0.016 107.4);
  --accent-foreground: oklch(0.988 0.003 106.5);
  --destructive: oklch(0.704 0.191 22.216);
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 15%);
  --ring: oklch(0.58 0.031 107.3);
  --chart-1: oklch(0.809 0.105 251.813);
  --chart-2: oklch(0.623 0.214 259.815);
  --chart-3: oklch(0.546 0.245 262.881);
  --chart-4: oklch(0.488 0.243 264.376);
  --chart-5: oklch(0.424 0.199 265.638);
}
```

---

## 3. Inspected Preset Components

* **`Card`**: Rhea uses large rounded pill-like borders (`rounded-[min(var(--radius-4xl),24px)]`), delicate hairline rings (`ring-1 ring-foreground/5 dark:ring-foreground/10`), container query header slots (`@container/card-header`), and responsive card spacing variables (`--card-spacing`).

---

## 4. Differences from Existing Babin Rentals OS Tokens

| Domain | Babin Rentals OS Current (`theme.css`) | Preset `b1avaxO6a` | Pilot Resolution |
| :--- | :--- | :--- | :--- |
| **Primary Hue** | Brand Orange (`#f97316` / `--brand: #EA580C`) | Emerald green (`oklch(0.508 0.118 165.612)`) | Pilot-scoped only (`--rhea-primary`). Do not overwrite global `--brand`. |
| **Neutral Base** | Slate / Cool Grey (`#0f172a`, `#64748b`) | Olive warm green-gray (`oklch(0.153 0.006 107.1)`) | Scoped under `.br-preset-pilot` / `[data-ui-preset="rhea"]`. |
| **Card Radius** | `var(--radius-md, 8px)` / `var(--radius-lg, 12px)` | `rounded-[min(var(--radius-4xl),24px)]` (up to 24px) | Scoped to Rhea card components in reports pilot. |
| **Chart Palette** | Category multi-color (`#3B82F6`, `#10B981`, `#F59E0B`, `#8B5CF6`, `#EF4444`) | Blue analytical tonal ladder (`oklch(...)` 5 shades) | Applied to `InteractiveRevenueTrend` within Rhea pilot wrapper. |
| **Fonts** | Self-hosted Outfit (display), Source Sans 3 (body), JetBrains Mono (figures) | Inter Variable | **Preserved:** Babin typography rules mandate Outfit + Source Sans 3 + JetBrains Mono. Preset Inter font is NOT imported into Babin root. |
| **Icons** | `@tabler/icons-react` (2px outline) | Lucide | **Preserved:** Babin system requires `@tabler/icons-react` outline 2px. |

---

## 5. Safe Integration Strategy

1. **Namespace Isolation:** Never touch `:root`, `body`, or global `.dark` in `src/styles/theme.css`.
2. **Dedicated CSS Module:** Write all variables into `src/styles/shadcn-preset-pilot.css` scoped to `.br-preset-pilot` and `[data-ui-preset="rhea"]`.
3. **Pilot Scope:** Confined to `src/modules/reports/RevenueReport.tsx`.
4. **Contrast & Theme Invariants:** Support `light`, `dark`, `high-contrast`, and `glass` without breaking WCAG AA (tested by `npm run check:contrast`).
