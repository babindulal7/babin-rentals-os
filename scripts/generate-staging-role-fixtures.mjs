import { writeFileSync } from 'node:fs'

const STAGING_ROLES = ['Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse', 'Technician', 'Accounts', 'Driver', 'Client']
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

const manifest = { productId, roles }
writeFileSync('docs/verification/STAGING_ROLE_FIXTURES.json', JSON.stringify(manifest, null, 2), 'utf8')
console.log('Successfully wrote docs/verification/STAGING_ROLE_FIXTURES.json')
