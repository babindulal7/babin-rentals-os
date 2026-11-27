import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { ownsOfflineWork } from '../lib/offlineIdentity'

const ROOT = process.cwd()

describe('BSEC-25 (P1 Batch 9): Offline & Synchronization — Isolation, Fail-Closed Custody, Idempotency & Purge', () => {
  let db: PGlite
  let branchId: string
  let clientId: string
  let ownerId: string
  let bookingId: string

  beforeAll(async () => {
    db = await PGlite.create({ extensions: { pgcrypto, btree_gist } })
    await db.exec(fs.readFileSync(path.join(ROOT, 'supabase/pglite-prelude.sql'), 'utf8'))

    const migrationsDir = path.join(ROOT, 'supabase/migrations')
    for (const file of fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
      await db.exec(fs.readFileSync(path.join(migrationsDir, file), 'utf8'))
    }

    await db.exec('reset role;')
    branchId = (await db.query<{ id: string }>('select id from public.branches order by created_at limit 1;')).rows[0]!.id
    clientId = (await db.query<{ id: string }>('select id from public.clients order by created_at limit 1;')).rows[0]!.id
    ownerId = (
      await db.query<{ id: string }>(`select id from public.users where primary_role = 'Owner' limit 1;`)
    ).rows[0]!.id

    await db.query(`select set_config('app.current_user_id', $1, false);`, [ownerId])
    const bRes = await db.query<{ id: string }>(
      `insert into public.bookings (
         client_uuid, booking_no, client_id, branch_id, stage,
         pickup_at, return_at, delivery_type, deposit_required, created_by, updated_by
       ) values (
         gen_random_uuid(), '250101', $1, $2, 'Quote',
         '2027-09-01 10:00:00+00', '2027-09-02 10:00:00+00', 'Client Pickup', 0, $3, $3
       ) returning id;`,
      [clientId, branchId, ownerId]
    )
    bookingId = bRes.rows[0]!.id
  }, 120_000)

  afterAll(async () => {
    await db?.close()
  })

  it('BSEC-25-01: enforces IndexedDB actor & environment isolation via ownsOfflineWork', () => {
    const idA = { actorId: 'user-a', environment: 'https://staging.example.supabase.co' }
    const idB = { actorId: 'user-b', environment: 'https://staging.example.supabase.co' }
    const idOtherEnv = { actorId: 'user-a', environment: 'https://other.example.supabase.co' }

    expect(ownsOfflineWork({ actorId: 'user-a', environment: idA.environment }, idA)).toBe(true)
    expect(ownsOfflineWork({ actorId: 'user-a', environment: idA.environment }, idB)).toBe(false)
    expect(ownsOfflineWork({ actorId: 'user-a', environment: idA.environment }, idOtherEnv)).toBe(false)
    expect(ownsOfflineWork({}, idA)).toBe(false)
  })

  it('BSEC-25-02: custody transitions stay fail-closed online (queueOnFailure: false) per R-40', () => {
    const dataAccess = fs.readFileSync(path.join(ROOT, 'src/lib/dataAccess.ts'), 'utf8')
    expect(dataAccess).toContain('queueOnFailure')

    const failClosedFiles = [
      'src/actions/cases/createCase.ts',
      'src/actions/intel/writeIntel.ts',
      'src/actions/payments/refundPayment.ts',
      'src/actions/finance/settleDeposit.ts',
    ]
    for (const rel of failClosedFiles) {
      const src = fs.readFileSync(path.join(ROOT, rel), 'utf8')
      expect(src).toContain('queueOnFailure: false')
    }
  })

  it('BSEC-25-03: syncEngine guards against session switches and offlineQueue checks actor ownership', () => {
    const syncEngine = fs.readFileSync(path.join(ROOT, 'src/lib/syncEngine.ts'), 'utf8')
    expect(syncEngine).toContain('Session changed during sync')

    const offlineQueue = fs.readFileSync(path.join(ROOT, 'src/lib/offlineQueue.ts'), 'utf8')
    expect(offlineQueue).toContain('ownsOfflineWork')
  })

  it('BSEC-25-04: client_uuid idempotency prevents duplicate transactions on network retry', async () => {
    await db.exec('reset role;')
    await db.query(`select set_config('app.current_user_id', $1, false);`, [ownerId])
    const retryUuid = 'e0000000-0000-4000-8000-000000002504'

    await db.query(
      `insert into public.booking_notes (client_uuid, booking_id, note_type, body, visibility, created_by)
       values ($1, $2, 'Booking', 'Offline sync retry note', 'all_staff', $3);`,
      [retryUuid, bookingId, ownerId]
    )

    // Replaying the same client_uuid must be rejected by the unique index (zero duplicate rows)
    await expect(
      db.query(
        `insert into public.booking_notes (client_uuid, booking_id, note_type, body, visibility, created_by)
         values ($1, $2, 'Booking', 'Offline sync retry note', 'all_staff', $3);`,
        [retryUuid, bookingId, ownerId]
      )
    ).rejects.toThrow(/unique|duplicate key/i)

    const countRes = await db.query<{ c: number }>(
      `select count(*)::int as c from public.booking_notes where client_uuid = $1;`,
      [retryUuid]
    )
    expect(countRes.rows[0]!.c).toBe(1)
  })

  it('BSEC-25-05: purges device read caches and floor scans on staff switch / sign-out', () => {
    const devicePurge = fs.readFileSync(path.join(ROOT, 'src/lib/devicePurge.ts'), 'utf8')
    expect(devicePurge).toContain('clearAllFloorScans')
    expect(devicePurge).toContain('caches.delete')
    expect(devicePurge).toContain('localStore')
  })
})
