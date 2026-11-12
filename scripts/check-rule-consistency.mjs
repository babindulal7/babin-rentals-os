#!/usr/bin/env node
/**
 * `node scripts/check-rule-consistency.mjs` — read-only guard for the rule documents.
 *
 * It checks only things that are objectively comparable, so it cannot be argued with and does not need a
 * rewrite when the wording of a rule changes:
 *
 *   1. The 15 build-time-authority rows (B-1…B-7, N-1…N-8) in docs/PERMISSIONS.md §15 are byte-identical
 *      to the copy in CLAUDE.md that §15.5 requires ("copy verbatim").
 *   2. Every command in scripts/run-gates.mjs appears in the gate list in docs/plans/README.md, and every
 *      `npm run <script>` gate is named in AGENTS.md. This is what catches a gate added to CI but forgotten
 *      in the docs (`test:local-api-guards` was missing from both on 4 Nov 2026).
 *   3. The relative Markdown links in the two files the 4 Nov audit added resolve.
 *
 * Nothing is written, no network is used, and it is deliberately NOT part of ci.yml or `npm run gates`
 * (run-gates.mjs fails closed on any change to the CI command list). Exit 0 = consistent, 1 = not.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => readFileSync(join(root, rel), 'utf8').replace(/\r\n/g, '\n')

const failures = []
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail ? `\n        ${detail}` : ''}`)
  if (!ok) failures.push(label)
}

// 1 ── the mirrored authority rows -------------------------------------------------------------
const ruleRows = (text) => text.split('\n').filter((line) => /^\| \*\*(B|N)-\d+\*\* \|/.test(line))
const permRows = ruleRows(read('docs/PERMISSIONS.md'))
const claudeRows = ruleRows(read('CLAUDE.md'))
check(permRows.length === 15, `PERMISSIONS.md §15 has 15 B/N rows`, `found ${permRows.length}`)
check(claudeRows.length === permRows.length, `CLAUDE.md carries the same number of B/N rows`, `${claudeRows.length} vs ${permRows.length}`)
const drifted = permRows.filter((row, i) => row !== claudeRows[i])
check(drifted.length === 0, `CLAUDE.md B/N rows are byte-identical to PERMISSIONS.md`, drifted[0]?.slice(0, 90))

// 2 ── gate list vs docs ------------------------------------------------------------------------
const { GATES, commandText } = await import(pathToFileURL(join(root, 'scripts/run-gates.mjs')).href)
const plansReadme = read('docs/plans/README.md')
const agents = read('AGENTS.md')
// `npm test` is the documented spelling of `npm run test`.
const spellings = (gate) => {
  const text = commandText(gate)
  return text === 'npm run test' ? ['npm test', 'npm run test'] : [text]
}
for (const gate of GATES) {
  const text = commandText(gate)
  check(spellings(gate).some((s) => plansReadme.includes(s)), `docs/plans/README.md lists "${text}"`)
}
for (const gate of GATES.filter((g) => g.command === 'npm')) {
  const script = gate.args[1]
  if (script === 'test') continue // covered by the `npm test` mention
  check(agents.includes(script), `AGENTS.md names the "${script}" gate`)
}

// 3 ── links in the files this audit added -------------------------------------------------------
for (const rel of ['docs/AGENT_WORKFLOW.md', 'docs/audits/RULE_CONFLICT_AUDIT_2026-11-04.md']) {
  const base = dirname(join(root, rel))
  const links = [...read(rel).matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1])
  const broken = links
    .filter((href) => !/^(https?:|mailto:|#)/.test(href))
    .map((href) => decodeURIComponent(href.split('#')[0]))
    .filter((target) => target && !existsSync(resolve(base, target)))
  check(broken.length === 0, `${rel}: relative links resolve (${links.length} links)`, broken.join(', '))
}

console.log(failures.length === 0 ? '\nConsistent.' : `\n${failures.length} check(s) failed.`)
process.exitCode = failures.length === 0 ? 0 : 1
