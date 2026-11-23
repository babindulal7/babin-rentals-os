import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { verifyStaging, inspectStagingPrivileges, STAGING_ROLES } from './verify-staging-readonly.mjs'

const PROJECT_REF = 'klhmsrunqrdxjudyhnkm'
const BASE_URL = `https://${PROJECT_REF}.supabase.co`
const FIXTURES_PATH = resolve('docs/verification/STAGING_ROLE_FIXTURES.json')

const anonKey = process.env.BABIN_STAGING_ANON_KEY || process.argv[2]
const dbUrl = process.env.BABIN_STAGING_DB_URL || process.argv[3]
if (!anonKey) {
  console.error('Usage: node scripts/run-staging-readonly-suite.mjs <STAGING_ANON_KEY>')
  console.error('Or set BABIN_STAGING_ANON_KEY in environment.')
  process.exit(1)
}

const fixtures = JSON.parse(readFileSync(FIXTURES_PATH, 'utf8'))

console.log(`Authenticating all 9 staging roles against ${BASE_URL}...`)
const tokens = {}

for (const role of STAGING_ROLES) {
  const email = `staging-${role.toLowerCase()}@babinrentals.test`
  const password = process.env[`BABIN_STAGING_PASSWORD_${role.toUpperCase()}`] || process.env.BABIN_STAGING_SYNTHETIC_PASSWORD
  if (!password) {
    console.error(`Missing password for role ${role}. Set BABIN_STAGING_PASSWORD_${role.toUpperCase()} or BABIN_STAGING_SYNTHETIC_PASSWORD in environment.`)
    process.exit(1)
  }
  
  const res = await fetch(`${BASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'apikey': anonKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email, password })
  })

  if (!res.ok) {
    const errText = await res.text()
    console.error(`Authentication failed for role ${role} (${email}): status ${res.status}`, errText)
    process.exit(1)
  }

  const data = await res.json()
  tokens[role] = data.access_token
  console.log(`✓ Authenticated role: ${role} (${data.user.id})`)
}

console.log('\nAll 9 roles authenticated successfully. Running read-only verification suite...\n')

const configuration = {
  reference: PROJECT_REF,
  url: BASE_URL,
  key: anonKey,
  tokens,
  manifest: FIXTURES_PATH
}

const report = await verifyStaging(
  configuration,
  fixtures,
  fetch,
  dbUrl ? () => inspectStagingPrivileges(configuration, dbUrl) : undefined
)

console.log('------------------------------------------------------------')
console.log(`STAGING VERIFICATION RESULT: ${report.status}`)
console.log('------------------------------------------------------------')
for (const check of report.checks) {
  const symbol = check.status === 'PASS' ? '✓' : check.status === 'FAIL' ? '✗' : '?'
  console.log(`  ${symbol} [${check.status}] ${check.name}`)
}

const directory = resolve('artifacts/staging-verification', new Date().toISOString().replace(/[:.]/g, '-'))
mkdirSync(directory, { recursive: true })
const metadata = { ...report, at: new Date().toISOString(), environment: 'isolated staging', mode: 'GET requests and read-only SQL only' }
writeFileSync(resolve(directory, 'REPORT.json'), JSON.stringify(metadata, null, 2))
writeFileSync(resolve(directory, 'REPORT.md'), `# Staging verification: ${report.status}\n\n${metadata.at}\n\n${report.checks.map((check) => `- ${check.status}: ${check.name}`).join('\n')}\n`)

console.log(`\nArtifact written to: ${directory}`)
process.exit(report.status === 'PASS' ? 0 : 2)
