import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  STAGING_ROLES,
  createAuditPgConfig,
  evaluateSeatIdentities,
  evaluateSessionRevocation,
  evaluatePostgrestAccess,
  evaluateDatabasePrivileges,
  generateIssue304MarkdownReport,
} from './audit-issue-304-staging.mjs'

test('createAuditPgConfig strictly enables TLS server-certificate validation', () => {
  const config = createAuditPgConfig('postgresql://user:pass@staging.supabase.co:5432/postgres')
  assert.equal(config.ssl.rejectUnauthorized, true, 'rejectUnauthorized must be true')
  assert.throws(() => createAuditPgConfig(null), /Database connection URL is required/)
})

test('evaluateSeatIdentities: all 9 seats present and confirmed', () => {
  const mockRows = STAGING_ROLES.map((role, idx) => ({
    id: `a0000000-0000-4000-8000-${(idx + 1).toString(16).padStart(12, '0')}`,
    email: `staging-${role}@babinrentals.test`,
    email_confirmed_at: '2026-11-20T12:00:00Z',
    updated_at: '2026-11-22T06:00:00Z',
    last_sign_in_at: '2026-11-22T10:00:00Z',
  }))

  const result = evaluateSeatIdentities(mockRows)
  assert.equal(result.status, 'PASS')
  assert.equal(result.code, 'SEATS_PRESENT_EMAIL_CONFIRMED')
  assert.equal(result.seats.length, 9)
  assert.equal(result.missingRoles.length, 0)
  assert.equal(result.unconfirmedRoles.length, 0)
  assert.equal(result.credentialRotationStatus, 'NOT_VERIFIED', 'Credential rotation must be marked NOT_VERIFIED')
})

test('evaluateSeatIdentities: fails closed when seats are missing', () => {
  const mockRows = STAGING_ROLES.slice(0, 7).map((role, idx) => ({
    id: `a0000000-0000-4000-8000-${(idx + 1).toString(16).padStart(12, '0')}`,
    email: `staging-${role}@babinrentals.test`,
    email_confirmed_at: '2026-11-20T12:00:00Z',
  }))

  const result = evaluateSeatIdentities(mockRows)
  assert.equal(result.status, 'FAIL')
  assert.equal(result.code, 'MISSING_SEATS')
  assert.equal(result.missingRoles.length, 2)
  assert.ok(result.message.includes('Missing 2 staging seat(s)'))
})

test('evaluateSeatIdentities: fails closed when email is unconfirmed', () => {
  const mockRows = STAGING_ROLES.map((role, idx) => ({
    id: `a0000000-0000-4000-8000-${(idx + 1).toString(16).padStart(12, '0')}`,
    email: `staging-${role}@babinrentals.test`,
    email_confirmed_at: role === 'driver' ? null : '2026-11-20T12:00:00Z',
  }))

  const result = evaluateSeatIdentities(mockRows)
  assert.equal(result.status, 'FAIL')
  assert.equal(result.code, 'UNCONFIRMED_SEATS')
  assert.deepEqual(result.unconfirmedRoles, ['driver'])
})

test('evaluateSessionRevocation: active session count does not prove revocation', () => {
  const withSessions = evaluateSessionRevocation(239)
  assert.equal(withSessions.status, 'NOT_VERIFIED')
  assert.equal(withSessions.verifiedRevocation, false)
  assert.equal(withSessions.activeSessions, 239)
  assert.ok(withSessions.message.includes('Active session count alone is NOT proof of revocation'))

  const zeroSessions = evaluateSessionRevocation(0)
  assert.equal(zeroSessions.status, 'NOT_VERIFIED')
  assert.equal(zeroSessions.verifiedRevocation, false)

  const queryError = evaluateSessionRevocation(null, new Error('permission denied for table sessions'))
  assert.equal(queryError.status, 'UNKNOWN')
  assert.equal(queryError.code, 'QUERY_ERROR')
})

test('evaluatePostgrestAccess: correctly distinguishes HTTP 401/403 denial vs HTTP 200 empty array vs data leak', () => {
  // HTTP 401 is proper denial
  const res401 = evaluatePostgrestAccess(401, { message: 'Unauthorized' })
  assert.equal(res401.status, 'PASS')
  assert.equal(res401.code, 'ANON_HTTP_DENIED')

  // HTTP 403 is proper denial
  const res403 = evaluatePostgrestAccess(403, { message: 'Forbidden' })
  assert.equal(res403.status, 'PASS')
  assert.equal(res403.code, 'ANON_HTTP_DENIED')

  // HTTP 200 with [] is NOT authorization denial — it is an empty view
  const resEmpty = evaluatePostgrestAccess(200, [])
  assert.equal(resEmpty.status, 'INCOMPLETE_OR_EMPTY_VIEW')
  assert.equal(resEmpty.code, 'ANON_EMPTY_VIEW')
  assert.ok(resEmpty.message.includes('NOT an HTTP authorization rejection'))

  // HTTP 200 with rows is critical leak
  const resLeak = evaluatePostgrestAccess(200, [{ full_name: 'Babin Dulal', role: 'Owner' }])
  assert.equal(resLeak.status, 'FAIL')
  assert.equal(resLeak.code, 'ANON_DATA_EXPOSED')

  // HTTP 500 or other
  const res500 = evaluatePostgrestAccess(500, null)
  assert.equal(res500.status, 'FAIL')
  assert.equal(res500.code, 'UNEXPECTED_STATUS')
})

test('evaluateDatabasePrivileges: verifies anon select privilege is revoked', () => {
  const revoked = evaluateDatabasePrivileges({ anon_select: false, auth_select: true })
  assert.equal(revoked.status, 'PASS')
  assert.equal(revoked.code, 'ANON_PRIVILEGE_REVOKED')

  const exposed = evaluateDatabasePrivileges({ anon_select: true, auth_select: true })
  assert.equal(exposed.status, 'FAIL')
  assert.equal(exposed.code, 'ANON_PRIVILEGE_GRANTED')

  const missing = evaluateDatabasePrivileges(null)
  assert.equal(missing.status, 'UNKNOWN')
})

test('generateIssue304MarkdownReport: formats honest report without fabricated completion claims', () => {
  const auditResult = {
    project: 'klhmsrunqrdxjudyhnkm',
    seatIdentities: evaluateSeatIdentities(
      STAGING_ROLES.map((r, i) => ({
        id: `a0000000-0000-4000-8000-${(i + 1).toString(16).padStart(12, '0')}`,
        email: `staging-${r}@babinrentals.test`,
        email_confirmed_at: '2026-11-20T12:00:00Z',
      }))
    ),
    sessionRevocation: evaluateSessionRevocation(239),
    staffDirectoryPolicy: {
      databaseGrant: evaluateDatabasePrivileges({ anon_select: false, auth_select: true }),
      postgrestAnon: evaluatePostgrestAccess(401, null),
    },
  }

  const report = generateIssue304MarkdownReport(auditResult)
  assert.ok(report.includes('CREDENTIAL ROTATION & SESSION REVOCATION NOT VERIFIED (HOLD)'))
  assert.ok(report.includes('Credential Rotation:** **NOT VERIFIED.'))
  assert.ok(report.includes('Session Revocation:** **NOT VERIFIED.'))
  assert.ok(!report.includes('Status: **VERIFIED (All Read-Only Checks Green)**'))
  assert.ok(!report.includes('All 9 seats authenticate successfully'))
})
