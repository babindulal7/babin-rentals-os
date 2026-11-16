import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stagingConfiguration, verifyStaging, STAGING_ROLES } from './verify-staging-readonly.mjs'

const environment = {
  BABIN_STAGING_PROJECT_REF: 'isolatedtest', BABIN_STAGING_SUPABASE_URL: 'https://isolatedtest.supabase.co',
  BABIN_STAGING_ANON_KEY: 'public-placeholder', BABIN_STAGING_FIXTURES: 'fixtures.json',
  ...Object.fromEntries(STAGING_ROLES.map((role) => [`BABIN_STAGING_JWT_${role.toUpperCase()}`, `test-${role}`])),
}
test('requires an isolated project and all nine identities', () => {
  assert.equal(stagingConfiguration(environment).reference, 'isolatedtest')
  for (const change of [
    { BABIN_STAGING_PROJECT_REF: 'sxguwvgoserhdolewibb', BABIN_STAGING_SUPABASE_URL: 'https://sxguwvgoserhdolewibb.supabase.co' },
    { BABIN_STAGING_SUPABASE_URL: 'https://isolatedtest.supabase.co.evil.invalid' },
    { BABIN_STAGING_JWT_CLIENT: '' },
  ]) assert.throws(() => stagingConfiguration({ ...environment, ...change }))
})
test('missing fixtures and transport failures cannot be certified; network uses GET only', async () => {
  let reads = 0
  const report = await verifyStaging(stagingConfiguration(environment), {}, async (url, options) => {
    reads++
    assert.equal(options.method, 'GET')
    assert.equal(options.redirect, 'error')
    throw new Error('secret-token')
  })
  assert.equal(report.status, 'FAIL')
  assert.equal(reads, 3)
  assert.ok(!JSON.stringify(report).includes('secret-token'))
  assert.ok(report.checks.some((check) => check.status === 'INCOMPLETE'))
})

function createValidFixtures() {
  const productId = '10000000-0000-4000-8000-000000000001'
  const roles = {}
  for (let i = 0; i < STAGING_ROLES.length; i++) {
    const role = STAGING_ROLES[i]
    const hex = (i + 1).toString(16).padStart(12, '0')
    roles[role] = {
      userId: `a0000000-0000-4000-8000-${hex}`,
      bookingId: `b0000000-0000-4000-8000-${hex}`,
      lineId: `c0000000-0000-4000-8000-${hex}`,
      ...(role === 'Client' ? { otherBookingId: 'b0000000-0000-4000-8000-999999999999' } : {}),
      ...(role === 'Driver' ? { otherTransportId: 'd0000000-0000-4000-8000-999999999999' } : {}),
    }
  }
  return { productId, roles }
}

function mockFetchRouter(fixtures, overrides = {}) {
  const blind = new Set(['Warehouse', 'Technician', 'Driver', 'Client'])
  const tokenToRole = Object.fromEntries(
    STAGING_ROLES.map((role) => [`test-${role}`, role])
  )

  return async (urlStr, options = {}) => {
    const parsed = new URL(urlStr)
    const pathname = parsed.pathname
    const search = parsed.search
    const authHeader = options.headers?.Authorization || ''
    const token = authHeader.replace(/^Bearer\s+/, '')
    const role = tokenToRole[token] || 'anon'

    if (overrides[pathname]) {
      const res = overrides[pathname](role, search, parsed)
      if (res) return { status: res.status, json: async () => res.body }
    }

    if (pathname === '/auth/v1/user') {
      const fixture = fixtures.roles[role]
      if (fixture) {
        return { status: 200, json: async () => ({ id: fixture.userId, email: `${role.toLowerCase()}@babinrentals.test` }) }
      }
      return { status: 401, json: async () => ({ error: 'Unauthorized' }) }
    }

    if (pathname === '/rest/v1/users') {
      const fixture = fixtures.roles[role]
      if (fixture && search.includes(`id=eq.${fixture.userId}`)) {
        return { status: 200, json: async () => [{ id: fixture.userId, primary_role: role }] }
      }
      return { status: 200, json: async () => [] }
    }

    if (pathname === '/rest/v1/bookings') {
      const fixture = fixtures.roles[role]
      if (fixture && search.includes(`id=eq.${fixture.bookingId}`)) {
        return { status: 200, json: async () => [{ id: fixture.bookingId }] }
      }
      if (role === 'Client' && fixture?.otherBookingId && search.includes(`id=eq.${fixture.otherBookingId}`)) {
        // Denied: Client cannot see another client's booking
        return { status: 200, json: async () => [] }
      }
      return { status: 200, json: async () => [] }
    }

    if (pathname === '/rest/v1/booking_lines_v') {
      const fixture = fixtures.roles[role]
      if (fixture && search.includes(`id=eq.${fixture.lineId}`)) {
        const rate = blind.has(role) ? null : 150000
        return { status: 200, json: async () => [{ id: fixture.lineId, rate }] }
      }
      return { status: 200, json: async () => [] }
    }

    if (['/rest/v1/payments', '/rest/v1/invoices', '/rest/v1/security_deposits', '/rest/v1/deposit_movements'].includes(pathname)) {
      if (blind.has(role)) {
        return { status: 200, json: async () => [] }
      }
      return { status: 200, json: async () => [{ id: '00000000-0000-0000-0000-000000000001' }] }
    }

    if (pathname === '/rest/v1/products_v') {
      const daily_rate = blind.has(role) ? null : 50000
      return { status: 200, json: async () => [{ id: fixtures.productId, daily_rate }] }
    }

    if (pathname === '/rest/v1/booking_transport_v') {
      if (role === 'Driver') {
        // Other unassigned transport returns zero rows
        return { status: 200, json: async () => [] }
      }
      return { status: 200, json: async () => [{ id: '00000000-0000-0000-0003-999999999999' }] }
    }

    if (['/rest/v1/staff_directory_v', '/rest/v1/product_units_service_v', '/rest/v1/audit_logs'].includes(pathname)) {
      if (role === 'anon') {
        return { status: 200, json: async () => [] }
      }
      return { status: 200, json: async () => [{ id: '00000000-0000-0000-0000-000000000001' }] }
    }

    return { status: 404, json: async () => ({ error: 'Not found' }) }
  }
}

test('full nine-role staging verification passes with compliant responses and privilege check', async () => {
  const fixtures = createValidFixtures()
  const mockFetch = mockFetchRouter(fixtures)
  const inspectPrivileges = async () => true // anon has no mutating RPC execute privileges

  const report = await verifyStaging(stagingConfiguration(environment), fixtures, mockFetch, inspectPrivileges)
  assert.equal(report.status, 'PASS')
  assert.ok(report.checks.length > 20)
  assert.ok(report.checks.every((c) => c.status === 'PASS'))
})

test('negative permissions: financial leak to Warehouse fails verification', async () => {
  const fixtures = createValidFixtures()
  // Simulate leak: Warehouse gets a non-null rate on booking_lines_v
  const mockFetch = mockFetchRouter(fixtures, {
    '/rest/v1/booking_lines_v': (role) => {
      if (role === 'Warehouse') {
        return { status: 200, body: [{ id: fixtures.roles.Warehouse.lineId, rate: 5000 }] }
      }
      return null
    },
  })
  const report = await verifyStaging(stagingConfiguration(environment), fixtures, mockFetch, async () => true)
  assert.equal(report.status, 'FAIL')
  const failedCheck = report.checks.find((c) => c.name.includes('Warehouse: line amounts suppressed'))
  assert.ok(failedCheck)
  assert.equal(failedCheck.status, 'FAIL')
})

test('negative permissions: cross-client data leak to Client fails verification', async () => {
  const fixtures = createValidFixtures()
  // Simulate leak: Client can see other booking
  const mockFetch = mockFetchRouter(fixtures, {
    '/rest/v1/bookings': (role, search) => {
      if (role === 'Client' && search.includes(fixtures.roles.Client.otherBookingId)) {
        return { status: 200, body: [{ id: fixtures.roles.Client.otherBookingId }] }
      }
      return null
    },
  })
  const report = await verifyStaging(stagingConfiguration(environment), fixtures, mockFetch, async () => true)
  assert.equal(report.status, 'FAIL')
  const failedCheck = report.checks.find((c) => c.name.includes('Client: another client booking denied'))
  assert.ok(failedCheck)
  assert.equal(failedCheck.status, 'FAIL')
})

test('negative permissions: unassigned transport leak to Driver fails verification', async () => {
  const fixtures = createValidFixtures()
  // Simulate leak: Driver gets other transport
  const mockFetch = mockFetchRouter(fixtures, {
    '/rest/v1/booking_transport_v': (role, search) => {
      if (role === 'Driver' && search.includes(fixtures.roles.Driver.otherTransportId)) {
        return { status: 200, body: [{ id: fixtures.roles.Driver.otherTransportId }] }
      }
      return null
    },
  })
  const report = await verifyStaging(stagingConfiguration(environment), fixtures, mockFetch, async () => true)
  assert.equal(report.status, 'FAIL')
  const failedCheck = report.checks.find((c) => c.name.includes('Driver: unassigned transport denied'))
  assert.ok(failedCheck)
  assert.equal(failedCheck.status, 'FAIL')
})

test('negative permissions: anon exposure of staff directory fails verification', async () => {
  const fixtures = createValidFixtures()
  // Simulate leak: anon can read staff directory
  const mockFetch = mockFetchRouter(fixtures, {
    '/rest/v1/staff_directory_v': (role) => {
      if (role === 'anon') {
        return { status: 200, body: [{ id: '00000000-0000-0000-0000-000000000001', full_name: 'Leaked Staff' }] }
      }
      return null
    },
  })
  const report = await verifyStaging(stagingConfiguration(environment), fixtures, mockFetch, async () => true)
  assert.equal(report.status, 'FAIL')
  const failedCheck = report.checks.find((c) => c.name.includes('anon: staff_directory_v denied'))
  assert.ok(failedCheck)
  assert.equal(failedCheck.status, 'FAIL')
})
