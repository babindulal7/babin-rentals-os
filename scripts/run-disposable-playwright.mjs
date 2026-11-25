// Disposable CI only. No hosted project or permanent credentials are used.
import { execFileSync, spawnSync } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import pg from 'pg'
import { requirePublicClientKey } from './local-api-guard.mjs'
import { verifyCancellationRace } from './test-cancellation-two-session.mjs'

const API = 'http://127.0.0.1:54321'
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
async function run() {
  if (process.env.GITHUB_ACTIONS !== 'true' || process.env.RUNNER_ENVIRONMENT !== 'github-hosted' || process.env.RUNNER_OS !== 'Linux') {
    throw new Error('Disposable auth bootstrap requires a hosted Linux CI runner')
  }
  if (process.env.DOCKER_HOST || process.env.DOCKER_CONTEXT) throw new Error('Remote Docker context refused')
  // status reads the locally running CLI project only; never call link or db push.
  const status = JSON.parse(execFileSync('supabase', ['status', '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }))
  const api = new URL(status.API_URL)
  const db = new URL(status.DB_URL)
  if (!['127.0.0.1', 'localhost'].includes(api.hostname) || api.protocol !== 'http:' || api.port !== '54321' || api.pathname !== '/' || api.search || api.hash || api.username || api.password ||
      !['127.0.0.1', 'localhost'].includes(db.hostname) || db.port !== '54322' || db.protocol !== 'postgresql:' || db.pathname !== '/postgres' || db.search || db.hash) {
    throw new Error('Non-local Supabase status refused')
  }
  const publicKey = requirePublicClientKey(status.PUBLISHABLE_KEY || status.ANON_KEY)
  const adminKey = status.SERVICE_ROLE_KEY || status.SECRET_KEY
  if (!adminKey) throw new Error('Local admin key missing')
  const admin = createClient(API, adminKey, options)
  const conn = new pg.Client({ connectionString: status.DB_URL })
  await conn.connect()
  const env = { ...process.env, BABIN_E2E_DISPOSABLE: '1', E2E_LOCAL_URL: API, E2E_LOCAL_ANON_KEY: publicKey }
  try {
    const branch = (await conn.query('select id from public.branches where is_active order by is_headquarters desc, created_at asc limit 1')).rows[0]?.id
    if (!branch) throw new Error('No seeded active branch; migration/fixture prerequisite missing')
    let fixtureOwner, fixtureWarehouse
    for (const [prefix, role] of [['OWNER', 'Owner'], ['MANAGER', 'Manager'], ['STAFF', 'Warehouse']]) {
      const email = 'disposable-' + prefix.toLowerCase() + '-' + randomUUID() + '@example.test'
      const password = randomBytes(32).toString('base64url')
      const created = await admin.auth.admin.createUser({ email, password, email_confirm: true })
      if (created.error || !created.data.user) throw new Error('Local Auth user creation failed: ' + role)
      const uid = created.data.user.id
      if (prefix === 'OWNER') fixtureOwner = uid
      if (prefix === 'STAFF') fixtureWarehouse = uid
      await conn.query('insert into public.users (id, client_uuid, employee_code, email, full_name, mobile, primary_role, branch_id, is_active) values ($1,$2,$3,$4,$5,$6,$7,$8,true)', [uid, randomUUID(), 'CI-' + prefix + '-' + randomBytes(4).toString('hex'), email, 'Disposable ' + role, '+977-9800000000', role, branch])
      const client = createClient(API, publicKey, options)
      const auth = await client.auth.signInWithPassword({ email, password })
      if (auth.error || auth.data.user?.id !== uid) throw new Error('Local Auth preflight failed: ' + role)
      const profile = await client.from('users').select('id,primary_role').eq('id', uid).single()
      if (profile.error || profile.data?.primary_role !== role) throw new Error('Local role preflight failed: ' + role)
      await client.auth.signOut()
      env['E2E_' + prefix + '_EMAIL'] = email
      env['E2E_' + prefix + '_PASSWORD'] = password
      console.log('Verified disposable role: ' + role)
    }

    // P0 #430: use real, bound client identities and existing targets, not
    // random nonexistent IDs. No admin key is sent to Playwright or logged.
    if (!fixtureOwner) throw new Error('Synthetic owner required')
    const targets = []
    for (const label of ['A', 'B']) {
      const email = 'disposable-payment-client-' + label.toLowerCase() + '-' + randomUUID() + '@example.test'
      const password = randomBytes(32).toString('base64url')
      const created = await admin.auth.admin.createUser({ email, password, email_confirm: true })
      if (created.error || !created.data.user) throw new Error('Synthetic client creation failed')
      const uid = created.data.user.id
      const clientId = randomUUID()
      const bookingId = randomUUID()
      const intentId = randomUUID()
      const phone = label === 'A' ? '+9779800000011' : '+9779800000012'
      await conn.query("insert into public.clients (id,client_uuid,client_code,name,email,phone,status,created_by) values ($1,$2,public.next_document_number('client'),$3,$4,$5,'Active',$6)", [clientId, randomUUID(), 'Disposable Payment Client ' + label, email, phone, fixtureOwner])
      await conn.query("insert into public.portal_users (client_uuid,client_id,auth_user_id,email,email_verified_at,invited_by_staff_id,role,phone,status,activated_at) values ($1,$2,$3,$4,now(),$5,'Member',$6,'Active',now())", [randomUUID(), clientId, uid, email, fixtureOwner, phone])
      await conn.query("insert into public.bookings (id,client_uuid,booking_no,client_id,branch_id,pickup_at,return_at,delivery_type,stage,created_by,updated_by) values ($1,$2,public.next_document_number('booking'),$3,$4,now()+interval '2 days',now()+interval '4 days','Client Pickup','Quote',$5,$5)", [bookingId, randomUUID(), clientId, branch, fixtureOwner])
      const invoiceId = randomUUID()
      // Begin with no fictional paid balance: the ledger starts empty.
      await conn.query("insert into public.invoices (id,client_uuid,invoice_no,booking_id,client_id,branch_id,status,subtotal,taxable_amount,vat_rate,vat_amount,total_amount,paid_amount,outstanding_amount,issue_date,due_date,created_by) values ($1,$2,null,$3,$4,$5,'Draft',10000,10000,0.13,1300,11300,0,11300,null,current_date+7,$6)", [invoiceId, randomUUID(), bookingId, clientId, branch, fixtureOwner])
      await conn.query("insert into public.payment_intents (id,client_uuid,booking_id,client_id,requester_auth_uid,provider,amount_paisa,status) values ($1,$2,$3,$4,$5,'fonepay',1130000,'pending')", [intentId, randomUUID(), bookingId, clientId, uid])
      // Pre-existing synthetic link: seed directly, not through the held issuance RPC.
      const linkId = randomUUID()
      const linkToken = randomBytes(32).toString('hex')
      await conn.query("insert into public.payment_intents (id,client_uuid,booking_id,client_id,requester_auth_uid,provider,amount_paisa,status,token_hash,is_payment_link,expires_at,created_by) values ($1,$2,$3,$4,$5,'fonepay',1130000,'pending',encode(sha256(convert_to($6,'UTF8')),'hex'),true,now()+interval '48 hours',$7)", [linkId, randomUUID(), bookingId, clientId, uid, linkToken, fixtureOwner])
      targets.push({ label, uid, email, password, clientId, bookingId, intentId, invoiceId, linkId, linkToken })
    }
    if (!fixtureWarehouse) throw new Error('Synthetic Warehouse required')
    await verifyCancellationRace({ connectionString: status.DB_URL, observer: conn,
      ownerId: fixtureOwner, warehouseId: fixtureWarehouse, branchId: branch, clientId: targets[0].clientId })
    const bookingIds = targets.map(t => t.bookingId)
    const snapshot = async () => {
      const intents = await conn.query('select * from public.payment_intents where booking_id = any($1::uuid[]) order by id', [bookingIds])
      const payments = await conn.query('select * from public.payments where booking_id = any($1::uuid[]) order by id', [bookingIds])
      return JSON.stringify([intents.rows, payments.rows])
    }
    const verifyExistingLink = async (client, target) => {
      const result = await client.rpc('get_payment_link_details', { p_token: target.linkToken })
      const details = result.data
      if (result.error || details?.valid !== true || details.intent_id !== target.linkId || details.booking_id !== target.bookingId || Number(details.amount_paisa) !== 1130000 || details.provider !== 'fonepay') throw new Error('Existing read-only payment link unavailable during hold')
      if (Object.hasOwn(details, 'token_hash') || Object.hasOwn(details, 'requester_auth_uid') || Object.hasOwn(details, 'client_id')) throw new Error('Read-only payment link exposed internal fields')
      const invalid = await client.rpc('get_payment_link_details', { p_token: randomBytes(32).toString('hex') })
      if (invalid.error || invalid.data?.valid !== false || invalid.data?.reason !== 'not_found') throw new Error('Unknown payment link must remain invalid')
    }
    const before = await snapshot()
    for (const actor of targets) {
      const client = createClient(API, publicKey, options)
      const auth = await client.auth.signInWithPassword({ email: actor.email, password: actor.password })
      if (auth.error || auth.data.user?.id !== actor.uid || !auth.data.session) throw new Error('Synthetic client authentication failed')
      try {
        const role = await client.rpc('auth_user_role')
        const binding = await client.rpc('auth_client_id')
        if (role.error || role.data !== 'Client' || binding.error || binding.data !== actor.clientId) throw new Error('Synthetic client role or binding mismatch')
        const visible = await client.from('bookings').select('id').in('id', bookingIds)
        if (visible.error || visible.data?.length !== 1 || visible.data[0].id !== actor.bookingId) throw new Error('Client booking isolation failed')
        await verifyExistingLink(client, actor)
        for (const target of targets) {
          const denied = [
            await client.rpc('create_payment_intent', { p_client_uuid: randomUUID(), p_booking_id: target.bookingId, p_booking_request_id: null, p_provider: 'fonepay' }),
            await client.rpc('create_booking_payment_link', { p_client_uuid: randomUUID(), p_booking_id: target.bookingId }),
            await client.rpc('allocate_payment_intent', { p_intent_id: target.intentId, p_provider_ref: 'disposable-client-denial-' + randomUUID(), p_provider_response: {} }),
          ]
          for (const result of denied) {
            if (result.data !== null || result.error?.code !== '42501') throw new Error('Client RPC did not fail at the permission boundary: ' + (result.error?.code || 'unexpected success'))
          }
        }
      } finally {
        await client.auth.signOut({ scope: 'local' })
      }
      if (await snapshot() !== before) throw new Error('Denied client RPC changed payment intent or ledger')
      console.log('Verified disposable payment RPC hold and booking isolation: Client ' + actor.label)
    }

    // Positive control: the exact same restricted database must still permit
    // the normal manual-payment write using a real money-role API session.
    // Only the synthetic invoice is affected; no gateway or provider is called.
    const owner = createClient(API, publicKey, options)
    const ownerAuth = await owner.auth.signInWithPassword({ email: env.E2E_OWNER_EMAIL, password: env.E2E_OWNER_PASSWORD })
    if (ownerAuth.error || ownerAuth.data.user?.id !== fixtureOwner || !ownerAuth.data.session) throw new Error('Manual payment owner authentication failed')
    try {
      const money = await owner.rpc('auth_can_view_money')
      if (money.error || money.data !== true) throw new Error('Manual payment money-role preflight failed')
      const target = targets[0]
      const beforeIntents = JSON.stringify((await conn.query('select * from public.payment_intents where booking_id = any($1::uuid[]) order by id', [bookingIds])).rows)
      const number = await owner.rpc('next_document_number', { p_sequence_key: 'payment' })
      if (number.error || typeof number.data !== 'string' || !number.data) throw new Error('Manual payment number allocation failed')
      const key = randomUUID()
      const result = await owner.from('payments').insert({
        client_uuid: key, payment_no: number.data, booking_id: target.bookingId,
        invoice_id: target.invoiceId, client_id: target.clientId, branch_id: branch,
        amount: 1000, payment_type: 'Advance Payment', status: 'Received',
        notes: 'Synthetic disposable manual payment', received_by: fixtureOwner,
      }).select('id').single()
      if (result.error || !result.data?.id) throw new Error('Authorized manual payment failed: ' + (result.error?.code || 'missing receipt'))
      const ledger = (await conn.query('select id,invoice_id,amount from public.payments where booking_id = any($1::uuid[])', [bookingIds])).rows
      if (ledger.length !== 1 || ledger[0].id !== result.data.id || ledger[0].invoice_id !== target.invoiceId || Number(ledger[0].amount) !== 1000) throw new Error('Manual payment ledger mismatch')
      const invoice = (await conn.query('select paid_amount,outstanding_amount,status from public.invoices where id = $1', [target.invoiceId])).rows[0]
      if (!invoice || Number(invoice.paid_amount) !== 1000 || Number(invoice.outstanding_amount) !== 10300 || invoice.status !== 'Draft') throw new Error('Manual payment invoice balance or draft state mismatch')
      const afterIntents = JSON.stringify((await conn.query('select * from public.payment_intents where booking_id = any($1::uuid[]) order by id', [bookingIds])).rows)
      if (beforeIntents !== afterIntents) throw new Error('Manual payment changed online payment intents')
      const afterManual = await snapshot()
      await verifyExistingLink(owner, target)
      if (await snapshot() !== afterManual) throw new Error('Reading an existing payment link mutated payment records')
      console.log('Verified existing payment links remain read-only during online hold')
      console.log('Verified authorized manual payment and exact draft invoice balance during online hold')
    } finally {
      await owner.auth.signOut({ scope: 'local' })
    }

    // Print only fixed phase names and validated SQL metadata: never SQL,
    // values, exception messages, JWTs, URLs, or fixture credentials.
    const fixtureQuery = async (phase, sql, args) => {
      try {
        const result = await conn.query(sql, args)
        console.log('Operations fixture passed: ' + phase)
        return result
      } catch (error) {
        const code = /^[0-9A-Z]{5}$/.test(error?.code || '') ? error.code : 'unknown'
        const constraint = /^[a-zA-Z0-9_]{1,63}$/.test(error?.constraint || '') ? error.constraint : 'none'
        console.error('Operations fixture failed: ' + phase + '; SQLSTATE=' + code + '; constraint=' + constraint)
        throw new Error('Operations fixture setup failed')
      }
    }
    // The booking-line money guard requires a real money-visible actor even
    // for a privileged local fixture connection. Bind the synthetic Owner
    // in this transaction only and verify the same policy the trigger uses.
    await conn.query('begin')
    try {
      await conn.query("select set_config('app.current_user_id',$1,true),set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role','authenticated',true),set_config('request.jwt.claims',$2,true)", [fixtureOwner, JSON.stringify({ sub: fixtureOwner, role: 'authenticated', aal: 'aal1' })])
      const actor = (await conn.query('select public.auth_user_id() as id, public.auth_can_view_money() as money')).rows[0]
      if (actor?.id !== fixtureOwner || actor.money !== true) throw new Error('Operations fixture Owner authorization failed')
      console.log('Operations fixture passed: Owner money authorization')
      // Read-only navigation fixtures: explicitly seed stage snapshots, not
      // simulated evidence of successful physical custody transitions.
      const category = (await fixtureQuery('category lookup', 'select id from public.inventory_categories order by name limit 1')).rows[0]?.id
      if (!category) throw new Error('Operations fixture category missing')
      const productId = randomUUID()
      await fixtureQuery('product insert', "insert into public.products (id,client_uuid,asset_code,name,category_id,brand,tracking_mode,total_quantity,daily_rate,created_by) values ($1,$2,public.next_document_number('equipment'),'Disposable Operations Cable',$3,'Disposable','Quantity',20,250,$4)", [productId, randomUUID(), category, fixtureOwner])
      for (const [stage, prefix, offset] of [['Booked', 'BOOKED', 8], ['Packed', 'PACKED', 12]]) {
        const bookingId = randomUUID()
        const pickup = new Date(Date.now() + offset * 86400000)
        const end = new Date(pickup.getTime() + 2 * 86400000)
        const row = (await fixtureQuery('booking insert', "insert into public.bookings (id,client_uuid,booking_no,client_id,branch_id,pickup_at,return_at,delivery_type,stage,created_by,updated_by) values ($1,$2,public.next_document_number('booking'),$3,$4,$5,$6,'Client Pickup',$7,$8,$8) returning booking_no", [bookingId, randomUUID(), targets[0].clientId, branch, pickup, end, stage, fixtureOwner])).rows[0]
        await fixtureQuery('booking line insert', "insert into public.booking_lines (client_uuid,booking_id,line_type,product_id,description,qty,days,rate,created_by) values ($1,$2,'Equipment',$3,'Disposable Operations Cable',2,2,250,$4)", [randomUUID(), bookingId, productId, fixtureOwner])
        env['E2E_OPS_' + prefix + '_ID'] = bookingId
        env['E2E_OPS_' + prefix + '_NO'] = row.booking_no
      }
      // Separate mutating fixtures per device. Use the actual Quote -> Booked
      // transition to acquire the normal inventory reservation, not a fake pack.
      for (const [device, offset] of [['desktop', 16], ['ipad', 20], ['mobile', 24]]) {
        const bookingId = randomUUID()
        const pickup = new Date(Date.now() + offset * 86400000)
        const end = new Date(pickup.getTime() + 2 * 86400000)
        const row = (await fixtureQuery('booking insert', "insert into public.bookings (id,client_uuid,booking_no,client_id,branch_id,pickup_at,return_at,delivery_type,stage,created_by,updated_by) values ($1,$2,public.next_document_number('booking'),$3,$4,$5,$6,'Client Pickup','Quote',$7,$7) returning booking_no", [bookingId, randomUUID(), targets[0].clientId, branch, pickup, end, fixtureOwner])).rows[0]
        await fixtureQuery('booking line insert', "insert into public.booking_lines (client_uuid,booking_id,line_type,product_id,description,qty,days,rate,created_by) values ($1,$2,'Equipment',$3,'Disposable Operations Cable',2,2,250,$4)", [randomUUID(), bookingId, productId, fixtureOwner])
        await fixtureQuery('Quote to Booked transition', "insert into public.booking_stage_transitions (client_uuid,booking_id,branch_id,from_stage,to_stage,actor_id,actor_role,occurred_at) values ($1,$2,$3,'Quote','Booked',$4,'Owner',now())", [randomUUID(), bookingId, branch, fixtureOwner])
        const stage = (await fixtureQuery('persisted stage read', "select stage from public.bookings where id=$1", [bookingId])).rows[0]?.stage
        if (stage !== 'Booked') throw new Error('Operations confirmation fixture did not reach Booked')
        env['E2E_OPS_CONFIRM_' + device.toUpperCase() + '_ID'] = bookingId
        env['E2E_OPS_CONFIRM_' + device.toUpperCase() + '_NO'] = row.booking_no
      }
      await conn.query('commit')
    } catch (error) {
      await conn.query('rollback')
      throw error
    }
  } finally {
    await conn.end()
  }
  // Do not expose admin keys to the browser or persist credentials to files.
  const result = spawnSync(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '--config=playwright.disposable.config.ts'], { env, stdio: 'inherit' })
  if (result.status !== 0) throw new Error('Disposable Playwright run failed')
}
run().catch(() => { console.error('Disposable E2E failed. Inspect the failing step and role preflight; no credentials printed.'); process.exitCode = 1 })
