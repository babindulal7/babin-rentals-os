/**
 * T0-11: One local, fail-fast equivalent of the CI verification commands.
 * No external services or deployments are invoked here. Database checks use isolated local PGlite only.
 * Drift against .github/workflows/ci.yml is a hard error, never a silent skip.
 */
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// Keep this ordered list identical to the run: verification steps in ci.yml.
// The npm ci setup step and artifact uploads are intentionally not local gates.
export const GATES = Object.freeze([
  { label: 'Typecheck', command: 'npm', args: ['run', 'typecheck'] },
  { label: 'Lint source', command: 'npm', args: ['run', 'lint'] },
  { label: 'Local API verification safety guards', command: 'npm', args: ['run', 'test:local-api-guards'] },
  { label: 'Test (offline mock backend)', command: 'npm', args: ['run', 'test'], mock: true },
  { label: 'Migrations build from scratch', command: 'npm', args: ['run', 'check:pglite'] },
  { label: 'Booking and invoice financial integrity', command: 'node', args: ['scripts/test-booking-financial-integrity.mjs'] },
  { label: 'Authenticated security and branch-Reset regressions', command: 'npm', args: ['run', 'check:security'] },
  { label: 'Lifecycle', command: 'npm', args: ['run', 'check:lifecycle'] },
  { label: 'Record sections, equipment lifecycle and membership RPC contracts', command: 'npm', args: ['run', 'test:server-contracts'] },
  { label: 'Verified partial serial and quantity Return reservations', command: 'npm', args: ['run', 'test:partial-return'] },
  { label: 'PROGRESS.md carries Completion and Remaining', command: 'npm', args: ['run', 'lint:progress'] },
  { label: 'Completion receipt integrity', command: 'node', args: ['--test', 'scripts/test-receipt.test.mjs'] },
  { label: 'Page shell design invariants', command: 'npm', args: ['run', 'lint:shell'] },
  { label: 'Staff UI contains no developer notes', command: 'npm', args: ['run', 'lint:ui-copy'] },
  { label: 'Contrast (WCAG AA, light + dark)', command: 'npm', args: ['run', 'check:contrast'] },
  { label: 'Build', command: 'npm', args: ['run', 'build'] },
  { label: 'Coverage (offline mock backend)', command: 'npm', args: ['run', 'test:coverage'], mock: true, coverage: true },
])

export function commandText(gate) {
  return `${gate.command} ${gate.args.join(' ')}`
}

/** Require an exact match, including order, with each CI job's `run:` lines. */
export function assertMatchesCi(workflow, gates = GATES) {
  // Fail closed on any multiline or unexpected command, rather than guess at YAML.
  const allRuns = [...workflow.matchAll(/^        run:\s*(.*?)\s*$/gm)]
    .map(match => match[1].trim())
    .filter(cmd => cmd !== '|' && cmd !== '>-')

  if (allRuns.length === 0 || allRuns[0] !== 'npm ci') {
    throw new Error('CI drift: expected npm ci setup before the verification gates')
  }
  const jobs = []
  let current = null
  for (const cmd of allRuns) {
    if (cmd === 'npm ci') {
      if (current) jobs.push(current)
      current = []
    } else if (current) {
      current.push(cmd)
    }
  }
  if (current) jobs.push(current)

  const expected = gates.map(commandText)
  for (let j = 0; j < jobs.length; j++) {
    const actual = jobs[j]
    if (actual.length !== expected.length) {
      throw new Error(`CI drift in job ${j + 1}: ${actual.length} verification commands in ci.yml, ${expected.length} in run-gates.mjs`)
    }
    for (let i = 0; i < expected.length; i++) {
      if (actual[i] !== expected[i]) {
        throw new Error(`CI drift at gate ${i + 1} (job ${j + 1}): CI has "${actual[i]}"; local has "${expected[i]}"`)
      }
    }
  }
  return true
}

export function selectedGates(quick = false, gates = GATES) {
  return gates.filter(gate => !quick || !gate.coverage)
}

/** Injectable executor permits fail-fast tests without executing application code. */
export async function runSequence(gates, execute, now = () => Date.now()) {
  const results = []
  for (const gate of gates) {
    const start = now()
    let code = 1
    try {
      code = await execute(gate)
    } catch (error) {
      console.error(`[gates] ${gate.label}: ${error instanceof Error ? error.message : String(error)}`)
    }
    results.push({ label: gate.label, code, ms: Math.max(0, now() - start) })
    if (code !== 0) break
  }
  return results
}

function spawnGate(gate) {
  return new Promise((resolve, reject) => {
    // On Windows npm is a .cmd shim; the shell flag is required there, and
    // commands/arguments are the fixed, audited literals above (never user input).
    const isNpm = gate.command === 'npm'
    const cmd = isNpm ? (process.platform === 'win32' ? 'npm.cmd' : 'npm') : process.execPath
    const env = { ...process.env }
    if (gate.mock) {
      // Defense in depth. T0-10's test runner also forces these values.
      env.VITE_DATA_SOURCE = 'mock'
      env.VITE_SUPABASE_URL = 'http://mock.invalid'
      env.VITE_SUPABASE_ANON_KEY = 'mock-anon-key'
      env.VITE_DEV_AUTH_BYPASS = 'false'
    }
    const child = spawn(cmd, gate.args, {
      cwd: root,
      env,
      stdio: 'inherit',
      windowsHide: true,
      shell: isNpm && process.platform === 'win32',
    })
    child.once('error', reject)
    child.once('close', (code, signal) => resolve(code ?? (signal ? 1 : 1)))
  })
}

export async function main(argv = process.argv.slice(2)) {
  if (argv.some(arg => arg !== '--quick' && arg !== '--help') || argv.filter(arg => arg === '--quick').length > 1) {
    console.error('Usage: npm run gates [-- --quick]')
    return 2
  }
  if (argv.includes('--help')) {
    console.log('Usage: npm run gates [-- --quick]\nFull checks mirror CI; --quick skips coverage only.')
    return 0
  }

  try {
    assertMatchesCi(readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8'))
  } catch (error) {
    console.error(`[gates] ${error instanceof Error ? error.message : String(error)}`)
    return 2
  }

  const quick = argv.includes('--quick')
  const steps = selectedGates(quick)
  console.log(`[gates] ${quick ? 'QUICK: coverage skipped (not a full release gate)' : 'FULL'} · ${steps.length} steps · CI order verified`)
  const results = await runSequence(steps, async (gate) => {
    console.log(`\n[gates] ${gate.label} → ${commandText(gate)}`)
    return spawnGate(gate)
  })
  console.log('\n[gates] Results')
  for (const item of results) {
    console.log(`  ${item.code === 0 ? 'PASS' : 'FAIL'}  ${item.label}  ${(item.ms / 1000).toFixed(1)}s`)
  }
  if (quick) console.log('  SKIP  Coverage (offline mock backend)  (--quick)')
  const passed = results.length === steps.length && results.every(item => item.code === 0)
  if (!passed) console.error(`[gates] STOPPED on failure; ${steps.length - results.length} further step(s) not run`)
  console.log(`[gates] ${passed ? (quick ? 'QUICK PASS (coverage unverified)' : 'PASS') : 'FAIL'}`)
  return passed ? 0 : 1
}

// Importing this module from node:test never starts the full suite.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main()
}
