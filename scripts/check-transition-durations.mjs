#!/usr/bin/env node
/**
 * scripts/check-transition-durations.mjs — Babin Rentals OS
 *
 * Ruling G-8, Card 3 Step 4:
 * Enforces tokenized motion durations across src/.
 * Disallows literal duration values (e.g. 150ms, 0.2s) in CSS transitions outside theme.css.
 * All transitions must use token variables: --dur-fast, --dur, --dur-theme, --dur-drawer, --ease.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'src')

let filesChecked = 0
let violations = 0

function walk(dir) {
  const entries = readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'archive' || entry.name === 'node_modules' || entry.name === 'marketing') continue
      walk(full)
    } else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts') || entry.name.endsWith('.css')) {
      if (entry.name === 'theme.css') continue
      checkFile(full)
    }
  }
}

function checkFile(filePath) {
  filesChecked++
  const content = readFileSync(filePath, 'utf8')
  const lines = content.split('\n')
  const rel = relative(ROOT, filePath).replace(/\\/g, '/')

  lines.forEach((line, idx) => {
    // Only inspect transition properties or styles
    if (!/transition\s*[:=]/i.test(line)) return

    // Match raw time literals like 120ms, 0.15s, .2s that are NOT inside var(--dur...)
    // Pattern matches numbers followed by ms or s in transition strings
    const transitionPart = line.match(/transition\s*[:=]\s*['"]?([^'";\n]+)['"]?/i)
    if (!transitionPart) return

    const val = transitionPart[1]
    // Strip var(--...) expressions to see if any naked durations remain
    const withoutVars = val.replace(/var\(--[^)]+\)/g, '')

    // Check if naked timing literal exists: e.g. 100ms, 0.2s, .15s
    const bareTimingMatch = withoutVars.match(/\b\d+(\.\d+)?(ms|s)\b|\b\.\d+(ms|s)\b/i)
    if (bareTimingMatch) {
      console.error(`[LINT-TRANSITION] ${rel}:${idx + 1} has untokenized duration '${bareTimingMatch[0]}': ${line.trim()}`)
      violations++
    }
  })
}

walk(SRC)

if (violations > 0) {
  console.error(`\n❌ Failed: ${violations} untokenized transition duration(s) found. Use --dur-fast, --dur, --dur-theme, --dur-drawer, or --ease.`)
  process.exit(1)
} else {
  console.log(`✓ Transition Durations: ${filesChecked} files checked, 0 violations. All transitions properly tokenized.`)
  process.exit(0)
}
