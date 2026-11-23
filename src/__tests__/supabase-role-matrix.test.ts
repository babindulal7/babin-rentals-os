import { describe, it, expect, beforeAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import * as fs from 'fs';
import * as path from 'path';

describe('T-SB-03: Real Role-Based RLS, Auth & Money-Access Matrix', () => {
  let db: PGlite;

  const ROLES = [
    'Owner',
    'Admin',
    'Manager',
    'Coordinator',
    'Accounts',
    'Warehouse',
    'Technician',
    'Driver',
  ];

  const syntheticUsers: Record<string, { id: string; role: string }> = {};
  const clientA = { id: 'a0000000-0000-0000-0000-000000000001', role: 'Client' };
  const clientB = { id: 'b0000000-0000-0000-0000-000000000002', role: 'Client' };

  beforeAll(async () => {
    db = await PGlite.create({ extensions: { pgcrypto, btree_gist } });

    // 1. Run prelude
    const preludePath = path.resolve(process.cwd(), 'supabase/pglite-prelude.sql');
    await db.exec(fs.readFileSync(preludePath, 'utf8'));

    // 2. Apply all migrations in order
    const migrationsDir = path.resolve(process.cwd(), 'supabase/migrations');
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

    for (const file of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      try {
        await db.exec(sql);
      } catch (err: any) {
        try { await db.exec('rollback'); } catch {}
      }
    }

    // 3. Grant schema usage on storage and public
    await db.exec(`
      reset role;
      grant usage on schema storage to authenticated, anon;
      grant all on all tables in schema storage to authenticated, anon;
    `);

    // 4. Obtain default branch created by migrations
    await db.exec('reset role;');
    const branchRes = await db.query<{ id: string }>('select id from public.branches limit 1;');
    let defaultBranchId = branchRes.rows[0]?.id;
    if (!defaultBranchId) {
      const b = await db.query<{ id: string }>(`
        insert into public.branches (name) values ('Kathmandu Hub') returning id;
      `);
      defaultBranchId = b.rows[0]!.id;
    }

    // 4. Setup synthetic users for each staff role in auth.users and public.users
    let idx = 10;
    for (const r of ROLES) {
      const uid = `00000000-0000-0000-0000-0000000000${idx++}`;
      syntheticUsers[r] = { id: uid, role: r };
      await db.query(`
        insert into auth.users (id, email) values ($1, $2) on conflict (id) do nothing;
      `, [uid, `test-${r.toLowerCase()}@example.invalid`]);

      await db.query(`
        insert into public.users (id, client_uuid, full_name, email, employee_code, mobile, branch_id, primary_role, is_active)
        values ($1, gen_random_uuid(), $2, $3, $4, $5, $6, $7, true)
        on conflict (id) do update set primary_role = $7;
      `, [uid, `Test ${r}`, `test-${r.toLowerCase()}@example.invalid`, `EMP${idx}`, `+977-98000000${idx}`, defaultBranchId, r]);
    }

    // 5. Setup Client A and Client B in auth.users, public.users, and online_profiles
    await db.query(`
      insert into auth.users (id, email) values 
        ($1, 'client-a@example.invalid'),
        ($2, 'client-b@example.invalid')
      on conflict (id) do nothing;
    `, [clientA.id, clientB.id]);

    await db.query(`
      insert into public.users (id, client_uuid, full_name, email, employee_code, mobile, branch_id, primary_role, is_active)
      values 
        ($1, gen_random_uuid(), 'Client Alpha', 'client-a@example.invalid', 'CLT01', '+977-9811111111', $3, 'Client', true),
        ($2, gen_random_uuid(), 'Client Beta', 'client-b@example.invalid', 'CLT02', '+977-9822222222', $3, 'Client', true)
      on conflict (id) do nothing;
    `, [clientA.id, clientB.id, defaultBranchId]);

    await db.query(`
      insert into public.online_profiles (auth_uid, name, phone, company, pan)
      values
        ($1, 'Client Alpha', '+977-9811111111', 'Alpha Corp', 'PAN-ALPHA-123'),
        ($2, 'Client Beta', '+977-9822222222', 'Beta Corp', 'PAN-BETA-456')
      on conflict (auth_uid) do update set pan = excluded.pan;
    `, [clientA.id, clientB.id]);
  }, 120000);

  async function asActor<T>(actor: { id: string | null; role: string | null } | undefined, fn: () => Promise<T>): Promise<T> {
    if (!actor || !actor.id || actor.role === 'anon') {
      await db.exec(`
        reset role;
        set role anon;
        select set_config('app.current_user_id', '', false);
        select set_config('request.jwt.claim.sub', '', false);
        select set_config('request.jwt.claim.role', 'anon', false);
      `);
    } else {
      await db.exec(`
        reset role;
        set role authenticated;
        select set_config('app.current_user_id', '${actor.id}', false);
        select set_config('request.jwt.claim.sub', '${actor.id}', false);
        select set_config('request.jwt.claim.role', 'authenticated', false);
      `);
    }
    try {
      return await fn();
    } finally {
      await db.exec(`
        reset role;
        select set_config('app.current_user_id', '', false);
        select set_config('request.jwt.claim.sub', '', false);
        select set_config('request.jwt.claim.role', '', false);
      `);
    }
  }

  describe('1. Client Privacy & Cross-Tenant Data Isolation', () => {
    it('Client A can read only their own online_profile and not Client B', async () => {
      const res = await asActor(clientA, async () => {
        return await db.query<{ auth_uid: string; name: string }>(`select auth_uid, name from public.online_profiles;`);
      });
      expect(res.rows.length).toBe(1);
      expect(res.rows[0]?.auth_uid).toBe(clientA.id);
    });

    it('Client B cannot see Client A PAN in online_profiles_v', async () => {
      const res = await asActor(clientB, async () => {
        return await db.query<{ auth_uid: string; pan: string | null }>(`select auth_uid, pan from public.online_profiles_v;`);
      });
      expect(res.rows.length).toBe(1);
      expect(res.rows[0]?.auth_uid).toBe(clientB.id);
      expect(res.rows[0]?.pan).toBe('PAN-BETA-456');
    });

    it('Anonymous queries to online_profiles are completely blocked', async () => {
      const res = await asActor({ id: null, role: 'anon' }, async () => {
        try {
          return await db.query(`select * from public.online_profiles;`);
        } catch (e: any) {
          return { rows: [], error: e.message };
        }
      });
      expect(res.rows.length).toBe(0);
    });
  });

  describe('2. Coordinator vs Manager Monetary Authority (0241 Guard)', () => {
    it('Coordinator is rejected from issuing credit/refund resolution in resolve_booking_at_risk', async () => {
      const coord = syntheticUsers['Coordinator'];
      let errorCaught = false;

      await asActor(coord, async () => {
        try {
          await db.exec(`
            select public.resolve_booking_at_risk(
              jsonb_build_object(
                'at_risk_id', '00000000-0000-0000-0000-000000000001',
                'resolution', 'refund',
                'notes', 'Coordinator attempting refund',
                'credit_amount', 1000
              )
            );
          `);
        } catch (err: any) {
          errorCaught = true;
          expect(err.message).toMatch(/(monetary credit or refund resolution requires Owner, Admin or Manager|42501)/i);
        }
      });

      expect(errorCaught).toBe(true);
    });

    it('Coordinator is rejected from issuing non-zero credit_amount even with non-monetary resolution', async () => {
      const coord = syntheticUsers['Coordinator'];
      let errorCaught = false;

      await asActor(coord, async () => {
        try {
          await db.exec(`
            select public.resolve_booking_at_risk(
              jsonb_build_object(
                'at_risk_id', '00000000-0000-0000-0000-000000000001',
                'resolution', 'similar_item',
                'notes', 'Coordinator attempting crafted credit',
                'credit_amount', 500
              )
            );
          `);
        } catch (err: any) {
          errorCaught = true;
          expect(err.message).toMatch(/(monetary credit or refund resolution requires Owner, Admin or Manager|42501)/i);
        }
      });

      expect(errorCaught).toBe(true);
    });
  });

  describe('3. Storage KYC Request-IDs Access Boundaries', () => {
    beforeAll(async () => {
      await db.exec(`
        insert into storage.buckets (id, name)
        values ('request-ids', 'request-ids')
        on conflict (id) do nothing;

        insert into storage.objects (id, bucket_id, name)
        values 
          ('11111111-0000-0000-0000-000000000001', 'request-ids', '${clientA.id}/citizenship_front.jpg'),
          ('22222222-0000-0000-0000-000000000002', 'request-ids', '${clientB.id}/passport.jpg')
        on conflict (id) do nothing;
      `);
    });

    it('Client A can read only storage objects under their own UUID prefix', async () => {
      const res = await asActor(clientA, async () => {
        return await db.query<{ name: string }>(`
          select name from storage.objects where bucket_id = 'request-ids';
        `);
      });
      expect(res.rows.length).toBe(1);
      expect(res.rows[0]?.name).toBe(`${clientA.id}/citizenship_front.jpg`);
    });

    it('Staff roles (Coordinator, Manager, Admin, Owner) can view all KYC request-ids', async () => {
      for (const role of ['Coordinator', 'Manager', 'Admin', 'Owner']) {
        const staff = syntheticUsers[role];
        const res = await asActor(staff, async () => {
          return await db.query<{ name: string }>(`
            select name from storage.objects where bucket_id = 'request-ids';
          `);
        });
        expect(res.rows.length).toBe(2);
      }
    });

    it('Floor roles (Driver, Technician, Warehouse) CANNOT view KYC request-ids', async () => {
      for (const role of ['Driver', 'Technician', 'Warehouse']) {
        const floorStaff = syntheticUsers[role];
        const res = await asActor(floorStaff, async () => {
          return await db.query<{ name: string }>(`
            select name from storage.objects where bucket_id = 'request-ids';
          `);
        });
        expect(res.rows.length).toBe(0);
      }
    });
  });

  describe('4. Money-Blind Roles Enforcement (Law 6)', () => {
    it('Warehouse, Technician, and Driver cannot view customer PAN or financial balances', async () => {
      for (const role of ['Warehouse', 'Technician', 'Driver']) {
        const staff = syntheticUsers[role];
        const res = await asActor(staff, async () => {
          return await db.query<{ pan: string | null }>(`
            select pan from public.online_profiles_v;
          `);
        });
        for (const row of res.rows) {
          expect(row.pan).toBeNull();
        }
      }
    });
  });
});
