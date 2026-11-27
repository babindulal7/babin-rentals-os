import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'

const ROOT = process.cwd()

function trackedFiles(): string[] {
  const out = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
  return out
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
}

describe('BSEC-09 (P0 Batch 3): Secrets, Credentials, Separation & CI Log Redaction', () => {
  it('BSEC-09-01: repository contains no committed .env files, private keys, or live secret tokens', () => {
    const files = trackedFiles()

    const forbiddenEnvFiles = files.filter((f) => {
      const base = path.basename(f)
      if (base === '.env.example' || base === '.env.mock' || base === '.env.mock.example') return false
      return base === '.env' || base.startsWith('.env.') || /\.(pem|p12|key)$/i.test(base)
    })
    expect(forbiddenEnvFiles).toEqual([])

    const secretPatterns: Array<{ name: string; re: RegExp }> = [
      { name: 'Private Key Header', re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ },
      { name: 'Supabase Secret Key', re: /\bsb_secret_[A-Za-z0-9_-]{20,}\b/ },
      { name: 'AWS Access Key', re: /\bAKIA[0-9A-Z]{16}\b/ },
      { name: 'GitHub PAT', re: /\b(?:ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/ },
      { name: 'Resend Live Key', re: /\bre_[A-Za-z0-9]{24,}\b/ },
    ]

    const findings: Array<{ file: string; pattern: string }> = []
    for (const rel of files) {
      if (/\.(png|jpg|jpeg|webp|woff2?|ico|pdf|rar|zip|lock)$/i.test(rel)) continue
      if (rel === 'package-lock.json' || rel === 'src/__tests__/secrets-and-credentials-hygiene.test.ts') continue
      const full = path.join(ROOT, rel)
      if (!fs.existsSync(full) || fs.statSync(full).isDirectory()) continue
      const text = fs.readFileSync(full, 'utf8')
      for (const { name, re } of secretPatterns) {
        if (re.test(text)) {
          findings.push({ file: rel, pattern: name })
        }
      }
    }
    expect(findings).toEqual([])
  })

  it('BSEC-09-02: frontend source and Vite config exclude service-role keys and disable sourcemaps', () => {
    const files = trackedFiles().filter(
      (f) =>
        (f.startsWith('src/') && !f.startsWith('src/archive/') && !/\.test\.[tj]sx?$/.test(f) && !f.includes('/__tests__/')) ||
        f === 'index.html' ||
        f === 'marketing.html'
    )

    const violations: string[] = []
    for (const rel of files) {
      const text = fs.readFileSync(path.join(ROOT, rel), 'utf8')
      if (/SUPABASE_SERVICE_ROLE_KEY|VITE_SUPABASE_SERVICE_ROLE|sb_secret_/i.test(text)) {
        violations.push(rel)
      }
    }
    expect(violations).toEqual([])

    const viteCfg = fs.readFileSync(path.join(ROOT, 'vite.config.ts'), 'utf8')
    expect(viteCfg).toMatch(/sourcemap:\s*false/)

    const siteEnv = fs.readFileSync(path.join(ROOT, 'scripts/check-site-env.mjs'), 'utf8')
    expect(siteEnv).toContain('sb_secret_|service_role')
    expect(siteEnv).toContain("payload.role !== 'anon'")
  })

  it('BSEC-09-03: staging/production guards enforce target separation and refuse production ref', () => {
    const stagingGuard = fs.readFileSync(path.join(ROOT, 'tests/e2e/staging-guard.mjs'), 'utf8')
    expect(stagingGuard).toContain('https://klhmsrunqrdxjudyhnkm.supabase.co')
    expect(stagingGuard).toContain('only the Babin staging project is permitted')

    const localApiGuard = fs.readFileSync(path.join(ROOT, 'scripts/check-local-api-access.mjs'), 'utf8')
    expect(localApiGuard).toMatch(/service_role|SAFETY BLOCK|requirePublicClientKey/i)
  })

  it('BSEC-09-04: staging credential remediation scripts do not hardcode static passwords or target production', () => {
    const remediate = fs.readFileSync(path.join(ROOT, 'scripts/remediate-staging-credentials.mjs'), 'utf8')
    expect(remediate).toContain('klhmsrunqrdxjudyhnkm')
    expect(remediate).toContain('randomBytes')
    expect(remediate).not.toMatch(/password\s*[:=]\s*['"][A-Za-z0-9!@#$%^&*]{8,}['"]/i)

    const seedUsers = fs.readFileSync(path.join(ROOT, 'scripts/e2e-seed-staging-users.mjs'), 'utf8')
    expect(seedUsers).toContain("STAGING_REF = 'klhmsrunqrdxjudyhnkm'")
    expect(seedUsers).toContain('randomBytes')
    expect(seedUsers).not.toMatch(/password\s*[:=]\s*['"][A-Za-z0-9!@#$%^&*]{8,}['"]/i)
  })

  it('BSEC-09-05: gitignore and backup/telemetry pipelines redact credentials and exclude sensitive artifacts', () => {
    const gitignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8')
    for (const required of ['.env', '.env.*', '*.local', '*.pem', '*.p12', '*.key', 'playwright/.auth/']) {
      expect(gitignore).toContain(required)
    }

    const backupScript = fs.readFileSync(path.join(ROOT, 'scripts/backup-db.mjs'), 'utf8')
    expect(backupScript).toContain("key !== 'SUPABASE_DB_URL'")
    expect(backupScript).toContain("key !== 'PGPASSWORD'")
    expect(backupScript).toContain('Connection details are suppressed')

    const siteEnv = fs.readFileSync(path.join(ROOT, 'scripts/check-site-env.mjs'), 'utf8')
    expect(siteEnv).toContain('values are not printed')
  })
})
