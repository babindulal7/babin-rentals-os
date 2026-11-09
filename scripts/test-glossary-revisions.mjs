// T0-12/C-6: real local PostgreSQL proof; no hosted calls.
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const db = await PGlite.create({ extensions: { pgcrypto, btree_gist } })
try {
  await db.exec(readFileSync(path.join(root, 'supabase/pglite-prelude.sql'), 'utf8'))
  for (const file of readdirSync(path.join(root, 'supabase/migrations')).filter(file => file.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(path.join(root, 'supabase/migrations', file), 'utf8'))
  }
  const roles = ['Owner', 'Admin', 'Manager', 'Coordinator', 'Accounts', 'Warehouse', 'Technician', 'Driver', 'Client']
  const users = Object.fromEntries(roles.map((role, i) => [role, `00000000-0000-0000-0000-${String(950 + i).padStart(12, '0')}`]))
  const branch = (await db.query('select id from branches limit 1')).rows[0].id
  for (const role of roles) {
    await db.query(`insert into users(id,client_uuid,employee_code,email,full_name,mobile,primary_role,branch_id,is_active,created_by)
      values ($1,gen_random_uuid(),$2,$3,$4::text,'+9779800000000',$4::system_role,$5,true,$1)`,
    [users[role], `GL-${role}`, `${role.toLowerCase()}-gl@example.test`, role, branch])
  }
  const as = async role => {
    await db.exec('reset role')
    await db.query("select set_config('app.current_user_id',$1,false),set_config('request.jwt.claim.sub',$1,false)", [users[role] ?? ''])
    await db.exec(`set role ${role === 'anon' ? 'anon' : 'authenticated'}`)
  }
  const approve = (uuid, text, revision, key = 'msg.pending') => db.query(
    'select approve_glossary_term($1,$2,$3,$4) result', [uuid, key, text, revision])
  await as('Owner')
  assert.equal(Number((await db.query('select count(*) n from glossary_terms')).rows[0].n), 265)
  const uuid = crypto.randomUUID()
  const first = (await approve(uuid, 'पर्खँदै', 0)).rows[0].result
  assert.equal(first.created_by, users.Owner)
  assert.equal((await approve(uuid, 'पर्खँदै', 0)).rows[0].result.id, first.id)
  await assert.rejects(() => approve(uuid, 'अर्को', 0), /idempotency/)
  await assert.rejects(() => approve(crypto.randomUUID(), 'अर्को', 0), /glossary.changed/)
  for (const invalid of ['', 'x'.repeat(301), '२०', '{amount}', '{']) {
    await assert.rejects(() => approve(crypto.randomUUID(), invalid, first.revision), /glossary.(text|placeholders)/)
  }
  await assert.rejects(() => approve(crypto.randomUUID(), 'अर्को', 0, 'unknown'), /glossary.term/)
  await assert.rejects(() => db.query("insert into glossary_term_revisions(client_uuid,term_key,original_nepali,nepali,created_by) values(gen_random_uuid(),'msg.pending','विचाराधीन','अर्को',$1)", [users.Owner]), /permission denied/)
  for (const role of roles.filter(role => role !== 'Owner')) {
    await as(role)
    await assert.rejects(() => approve(crypto.randomUUID(), 'अर्को', first.revision), /glossary.role/)
    assert.equal(Number((await db.query('select count(*) n from glossary_term_revisions')).rows[0].n), role === 'Client' ? 0 : 1)
  }
  await as('anon')
  await assert.rejects(() => approve(crypto.randomUUID(), 'अर्को', first.revision), /permission denied/)
  await assert.rejects(() => db.query('select * from glossary_term_revisions'), /permission denied/)
  await as('Owner')
  const original = (await db.query("select original_nepali from glossary_terms where term_key='msg.pending'")).rows[0].original_nepali
  const restored = (await approve(crypto.randomUUID(), original, first.revision)).rows[0].result
  assert.ok(restored.revision > first.revision)
  await db.exec('reset role')
  await assert.rejects(() => db.query("update glossary_term_revisions set nepali='अर्को'"), /Law 3/)
  await assert.rejects(() => db.query('delete from glossary_term_revisions'), /Law 3/)
  const audits = (await db.query("select actor_id,module from audit_events where table_name='glossary_term_revisions'")).rows
  assert.equal(audits.length, 2)
  assert.ok(audits.every(row => row.actor_id === users.Owner && row.module === 'Settings'))
  console.log('PASS: glossary baseline, all nine roles, anon denial, idempotency, stale edits, text guards, restore history, immutability and database audit')
} finally {
  await db.close()
}
