#!/usr/bin/env node
// Financial integrity regression: isolated in-memory PGlite, NEVER live Supabase.
// Verify summed discount rows, quote VAT pinning, create_invoice, and the payment
// ceiling that consumes booking_estimate_total. Requires migration 0164.
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const db = await PGlite.create({ extensions: { pgcrypto, btree_gist } })
const sql = (statement, params = []) => db.query(statement, params)
const requireMoney = (row, field, amount) => {
  const value = Number(row?.[field])
  if (Math.abs(value - amount) > 0.01 || !Number.isFinite(value)) {
    throw new Error(`Expected ${field}=${amount}, received ${String(row?.[field])}`)
  }
}
const id = () => crypto.randomUUID()
try {
  await db.exec(readFileSync(join(ROOT, 'supabase/pglite-prelude.sql'), 'utf8'))
  const migrationDir = join(ROOT, 'supabase/migrations')
  for (const file of readdirSync(migrationDir).filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(migrationDir, file), 'utf8'))
  }

  const ownerId = '00000000-0000-0000-0000-000000000489'
  const branch = (await sql('select id from branches order by created_at limit 1')).rows[0]?.id
  const client = (await sql('select id from clients order by created_at limit 1')).rows[0]?.id
  const product = (await sql('select id from products order by created_at limit 1')).rows[0]?.id
  if (!branch || !client || !product) throw new Error('PGlite fixtures unavailable')
  await sql(`insert into users
    (id,client_uuid,employee_code,email,full_name,mobile,primary_role,branch_id,is_active,created_by)
    values ($1,gen_random_uuid(),'EMP-FIN-489','finance-probe@babinrentals.com','Finance Probe',
     '+977-9800000489','Owner',$2,true,$1)
    on conflict(id) do update set primary_role='Owner'`, [ownerId, branch])
  await sql('select set_config($1,$2,false)', ['app.current_user_id',ownerId])

  async function booking({code, vatRate, discountRows}) {
    const created = await sql(`insert into bookings
      (client_uuid,booking_no,client_id,branch_id,stage,pickup_at,return_at,
       delivery_type,deposit_required,vat_rate,created_by,updated_by)
      values (gen_random_uuid(),$1,$2,$3,'Quote',
      '2027-02-10 10:00:00+00','2027-02-11 10:00:00+00',
      'Client Pickup',0,$4,$5,$5) returning id`,
      [code,client,branch,vatRate,ownerId])
    const bookingId=created.rows[0].id
    await sql(`insert into booking_lines
      (client_uuid,booking_id,line_type,product_id,description,qty,days,rate,created_by)
      values (gen_random_uuid(),$1,'Equipment',$2,'Financial integrity test',1,1,10000,$3)`,
      [bookingId,product,ownerId])
    for (const [source,percent] of discountRows) {
      const auditId=id()
      await sql(`insert into audit_events
        (id,client_uuid,event_class,category,module,action,severity,status,
         table_name,record_id,actor_id,branch_id,reason,new_values)
        values($1,gen_random_uuid(),'discount','Rentals','Rentals','Create',
         'Informational','Success','booking_discounts',$2,$3,$4,'financial test','{}'::jsonb)`,
        [auditId,bookingId,ownerId,branch])
      await sql(`insert into booking_discounts
        (client_uuid,booking_id,branch_id,discount_source,percent,reason,
         applied_by,audit_event_id)
        values (gen_random_uuid(),$1,$2,$3,$4,'financial test',$5,$6)`,
        [bookingId,branch,source,percent,ownerId,auditId])
    }
    const result=(await sql('select booking_estimate_total($1::uuid) as total',[bookingId])).rows[0]
    return {bookingId, total:Number(result.total), code}
  }

  const stacked=await booking({code:'990489',vatRate:0.13,
    discountRows:[['Membership',20],['Women-DoP 5%',5]]})
  requireMoney(stacked,'total',8475)
  console.log('PASS: Membership 20 + Women DoP 5 => NPR 8,475 with VAT')

  try {
    await booking({code:'990492',vatRate:0.13,
      discountRows:[['Membership',20],['Women-DoP 5%',10]]})
    throw new Error('Stacked discount above 25% was accepted')
  } catch (error) {
    if (!String(error.message).includes('Stacking discount rows above 25')) throw error
  }
  console.log('PASS: database refuses a 30% stacked discount')

  const zero=await booking({code:'990490',vatRate:0,
    discountRows:[['Manual',30]]})
  requireMoney(zero,'total',7000)
  console.log('PASS: standalone 30% manual and pinned zero VAT => NPR 7,000')

  const legacy=await booking({code:'990491',vatRate:null,discountRows:[]})
  requireMoney(legacy,'total',11300)
  console.log('PASS: null legacy VAT retains historical 13% behavior')

  const invoice=(await sql(`select public.create_invoice($1::jsonb) as result`,
    [JSON.stringify({client_uuid:id(),created_by:ownerId,booking_id:stacked.bookingId,
      booking_no:stacked.code,vat_rate:0.13})])).rows[0].result
  if (!invoice?.invoice_id && !invoice?.id) throw new Error('create_invoice did not return an invoice')
  const invoiceRow=(await sql(`select discount_percent,vat_rate,total_amount
    from invoices where booking_id=$1`,[stacked.bookingId])).rows[0]
  requireMoney(invoiceRow,'discount_percent',25)
  requireMoney(invoiceRow,'vat_rate',0.13)
  requireMoney(invoiceRow,'total_amount',8475)
  console.log('PASS: multiple discount rows produce one correctly totaled invoice')

  requireMoney((await sql('select booking_estimate_total($1::uuid) as total',[stacked.bookingId])).rows[0],'total',8475)

  try {
    await sql(`insert into payments
       (client_uuid,payment_no,booking_id,client_id,branch_id,amount,
        payment_type,payment_date,received_by)
       values(gen_random_uuid(),'PAY-990489',$1,$2,$3,9040,'Advance Payment',now(),$4)`,
       [stacked.bookingId,client,branch,ownerId])
    throw new Error('Payment ceiling accepted NPR 9,040 above NPR 8,475 quote')
  } catch (error) {
    if (!String(error.message).includes('gate.payment.over_booking')) throw error
  }
  console.log('PASS: overpayment rejected by booking-only payment ceiling')

  const noVatInvoice=(await sql('select public.create_invoice($1::jsonb) as result',
    [JSON.stringify({client_uuid:id(),created_by:ownerId,booking_id:zero.bookingId,
      booking_no:zero.code,vat_rate:0.13})])).rows[0].result
  if (!noVatInvoice) throw new Error('Zero VAT create_invoice returned nothing')
  const zeroInvoiceRow=(await sql('select vat_rate,total_amount from invoices where booking_id=$1',
    [zero.bookingId])).rows[0]
  requireMoney(zeroInvoiceRow,'vat_rate',0)
  requireMoney(zeroInvoiceRow,'total_amount',7000)
  console.log('PASS: zero-VAT quote survives invoice creation unchanged')

  // Direct PostgREST inserts bypass create_booking. Ensure that a money-blind
  // staff account cannot select VAT even through the raw bookings table.
  const warehouseId='00000000-0000-0000-0000-000000000490'
  await sql(`insert into users
    (id,client_uuid,employee_code,email,full_name,mobile,primary_role,branch_id,is_active,created_by)
    values ($1,gen_random_uuid(),'EMP-FIN-490','warehouse-finance-probe@babinrentals.com',
      'Warehouse Finance Probe','+977-9800000490','Warehouse',$2,true,$3)
    on conflict(id) do update set primary_role='Warehouse'`,[warehouseId,branch,ownerId])
  await db.exec(`select set_config('app.current_user_id','${warehouseId}',false); set role authenticated;`)
  try {
    await sql(`insert into bookings
      (client_uuid,booking_no,client_id,branch_id,stage,pickup_at,return_at,
       delivery_type,deposit_required,vat_rate,created_by,updated_by)
      values (gen_random_uuid(),'990495',$1,$2,'Quote',
       '2027-02-10 10:00:00+00','2027-02-11 10:00:00+00',
       'Client Pickup',0,0,$3,$3)`,[client,branch,warehouseId])
    throw new Error('Money-blind direct INSERT accepted a zero-VAT booking')
  } catch (error) {
    if (!String(error.message).includes('gate.vat.money_blind')) throw error
  } finally {
    await db.exec(`reset role; select set_config('app.current_user_id','${ownerId}',false);`)
  }
  console.log('PASS: money-blind direct booking INSERT cannot select zero VAT')

  console.log('FINANCIAL INTEGRITY VERIFIED IN ISOLATED PGLITE')
} finally {
  await db.close()
}
