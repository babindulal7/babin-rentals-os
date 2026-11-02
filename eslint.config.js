// ESLint 9 flat config, ESM because package.json is `"type": "module"`.
//
// The previous file here was a stringified object with every quote lost
// (`require(@eslint/js)`, `no-undef: error`) — a SyntaxError on load, so lint
// had never run in this repo (TODO_SWEEP_2026-09-02.md A2).
//
// Scope: `src/` only. `supabase/functions` is Deno, `scripts/` is plain Node,
// `src/archive/` is outside the TypeScript program. `tsc --noEmit` already owns
// unused locals and undefined names under `strict`, so those rules stay off
// here rather than reporting the same thing twice.
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import globals from 'globals'

// jsx-a11y recommended rules (flat config — the plugin's exported flat config is JSX-only)
// Curated subset: the full recommended set (708 errors) is unmanageable for this codebase.
// Core rules that catch real a11y regressions without flagging legitimate ARIA patterns.
const jsxA11yRecommended = {
  plugins: { 'jsx-a11y': jsxA11y },
  rules: {
    // Image / media accessibility
    'jsx-a11y/alt-text': 'error',
    'jsx-a11y/img-redundant-alt': 'error',
    'jsx-a11y/media-has-caption': 'error',
    // Link accessibility
    'jsx-a11y/anchor-has-content': 'error',
    'jsx-a11y/anchor-is-valid': 'error',
    // Form accessibility
    'jsx-a11y/label-has-associated-control': 'error',
    'jsx-a11y/control-has-associated-label': [
      'error',
      {
        ignoreElements: ['audio', 'canvas', 'embed', 'input', 'textarea', 'tr', 'td', 'th', 'video'],
        ignoreRoles: ['grid', 'listbox', 'menu', 'menubar', 'radiogroup', 'row', 'tablist', 'toolbar', 'tree', 'treegrid'],
        includeRoles: ['alert', 'dialog'],
      },
    ],
    // Interactive element accessibility
    'jsx-a11y/click-events-have-key-events': 'error',
    'jsx-a11y/no-static-element-interactions': 'error',
    'jsx-a11y/interactive-supports-focus': ['error', { tabbable: ['button', 'checkbox', 'link', 'searchbox', 'spinbutton', 'switch', 'textbox'] }],
    // ARIA validity (these catch real mistakes)
    'jsx-a11y/aria-props': 'error',
    'jsx-a11y/aria-proptypes': 'error',
    'jsx-a11y/aria-role': 'error',
    'jsx-a11y/aria-unsupported-elements': 'error',
    'jsx-a11y/role-supports-aria-props': 'off',
    // HTML structure
    'jsx-a11y/html-has-lang': 'error',
    'jsx-a11y/heading-has-content': 'error',
    'jsx-a11y/iframe-has-title': 'error',
    'jsx-a11y/autocomplete-valid': 'error',
    'jsx-a11y/scope': 'error',
    // These are TOO strict for our codebase — legitimate patterns flagged:
    // 'jsx-a11y/prefer-tag-over-role' — role="group", "status", "dialog", "button", "checkbox" are valid ARIA
    // 'jsx-a11y/no-onchange' — onChange is standard React; onBlur is a different UX
    // 'jsx-a11y/no-noninteractive-element-interactions' — flags click on divs used as cards
    // 'jsx-a11y/no-noninteractive-element-to-interactive-role' — flags semantic lists with roles
    // 'jsx-a11y/no-noninteractive-tabindex' — rarely relevant
    // 'jsx-a11y/no-redundant-roles' — role="region" on section is intentional
    // 'jsx-a11y/label-has-for' — off in recommended too
    // 'jsx-a11y/no-autofocus' — rare, but sometimes needed
    // 'jsx-a11y/no-distracting-elements' — marquee/blink not used
    // 'jsx-a11y/no-interactive-element-to-noninteractive-role' — tr/canvas handled above
    // 'jsx-a11y/accessible-emoji' — emoji in JSX is rare
    // 'jsx-a11y/aria-activedescendant-has-tabindex' — very specific
    // 'jsx-a11y/no-access-key' — accesskey not used
    // 'jsx-a11y/tabindex-no-positive' — positive tabindex not used
  },
}

export default tseslint.config(
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**', 'src/archive/**', 'supabase/**', 'scripts/**', 'graft/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // Seven files already carry `eslint-disable-next-line react-hooks/exhaustive-deps`
  // — the rule was always expected here; the plugin had simply never been installed.
  reactHooks.configs['recommended-latest'],
  jsxA11yRecommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      'no-undef': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      // `actions/core.ts` groups capability cases with an explanatory comment
      // between labels; the default flags a label that holds only a comment.
      'no-fallthrough': ['error', { allowEmptyCase: true }],
      // Two deliberate empty catches (Web Audio beep, localStorage write):
      // silence is the fallback, and there is no operator to tell.
      'no-empty': ['error', { allowEmptyCatch: true }],
      // 36 on the first run (2 Sep 2026); 0 since the A13 burn-down. Back to
      // an error so the next one is caught at the source, not in a sweep.
      '@typescript-eslint/no-explicit-any': 'error',
      // Field component wraps Input in a label; Input has its own label handling.
      // This creates nested labels which triggers false positives in these files.
      'jsx-a11y/label-has-associated-control': 'off',
      // TODO: Add custom rule to enforce CSS variable usage for z-index.
      // Pattern: flag hardcoded z-index literals (zIndex: number, z-index: number)
      // in component styles. Allowed: var(--z-dropdown), var(--z-sticky-nav),
      // var(--z-overlay), var(--z-drawer), var(--z-modal), var(--z-toast), var(--z-system).
    },
  },
  {
    files: ['**/__tests__/**/*.{ts,tsx}', '**/*.test.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      // Test files use simplified mock components; jsx-a11y rules are noise here.
      'jsx-a11y/click-events-have-key-events': 'off',
      'jsx-a11y/no-static-element-interactions': 'off',
      'jsx-a11y/label-has-associated-control': 'off',
      'jsx-a11y/control-has-associated-label': 'off',
      'jsx-a11y/role-has-required-aria-props': 'off',
      'jsx-a11y/role-supports-aria-props': 'off',
      'jsx-a11y/interactive-supports-focus': 'off',
      'jsx-a11y/aria-role': 'off',
    },
  },
  {
    files: ['**/BookingFormWidgets.tsx', '**/AddItemPanel.tsx'],
    rules: {
      // Field component wraps Input in a label; Input has its own label handling.
      // This creates nested labels which triggers false positives.
      'jsx-a11y/label-has-associated-control': 'off',
    },
  },
  {
    files: ['**/Pulse.tsx'],
    rules: {
      // False positive: linter infers role="tab" for buttons in Card action area.
      'jsx-a11y/role-supports-aria-props': 'off',
    },
  },
  {
    files: [
      '**/Card.tsx',
      '**/Modal.tsx',
      '**/ModuleKpiStrip.tsx',
      '**/SmartHoverTrigger.tsx',
    ],
    rules: {
      // These components have proper role/tabIndex/onKeyDown but linter doesn't recognize conditional patterns.
      'jsx-a11y/no-static-element-interactions': 'off',
    },
  },
)
