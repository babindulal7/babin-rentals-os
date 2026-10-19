import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {btree_gist} from '@electric-sql/pglite/contrib/btree_gist';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
const db=await PGlite.create({extensions:{pgcrypto,btree_gist}});
await db.exec(readFileSync('supabase/pglite-prelude.sql','utf8'));
for(const f of readdirSync('supabase/migrations').filter(x=>x.endsWith('.sql')).sort()) { await db.exec(readFileSync('supabase/migrations/'+f,'utf8')); }
const snap={};
for (const [k,q] of Object.entries({users:'select id,primary_role,branch_id from users',products:'select id,daily_rate from products limit 2',rls:"select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity",policies:"select * from pg_policies where schemaname in ('public','storage')",functions:"select p.oid::regprocedure::text signature,p.prosecdef,has_function_privilege('authenticated',p.oid,'execute') auth_exec,pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f'"})) snap[k]=(await db.query(q)).rows;
writeFileSync('audit-security-catalog.json',JSON.stringify(snap,null,2));
await db.exec("grant usage on schema storage,auth to authenticated; grant select,insert,update,delete on storage.objects to authenticated; insert into storage.objects(bucket_id,name) values ('documents','other-client/private-invoice.pdf')");
await db.exec("set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000999',false)");
console.log('UNMAPPED_AUTH_USER', (await db.query("select auth_user_role(),(select count(*) from storage.objects) readable_objects")).rows);
console.log('STORAGE_UPDATE', (await db.query("update storage.objects set name='other-client/overwritten.pdf' returning name")).rows);
await db.exec('reset role');
const prod=snap.products[0];
console.log('PRODUCT_FIXTURE',prod);
await db.exec("set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000999',false)");
console.log('CLIENT_PRICE_RPC',(await db.query('select auth_user_role(),get_model_daily_rate($1::uuid,null) exposed_rate',[prod.id])).rows);

console.log('AUDIT_FORGED_INSERT', (await db.query("insert into audit_events(client_uuid,table_name,record_id,actor_id,actor_role,reason) values(gen_random_uuid(),'bookings',gen_random_uuid(),'00000000-0000-0000-0000-000000000101','Owner','Forged owner audit event')")).rows);
await db.exec('reset role');
console.log('FORGED_AUDIT_PERSISTED',(await db.query("select actor_id,actor_role from audit_events where reason='Forged owner audit event'")).rows);
const booking=(await db.query('select id,booking_no from bookings limit 1')).rows[0];
console.log('BOOKING_FIXTURE',booking);
for(const [role,id] of [['Warehouse','00000000-0000-0000-0000-000000000103'],['Client','00000000-0000-0000-0000-000000000999']]){
 await db.exec("set role authenticated; select set_config('request.jwt.claim.sub','"+id+"',false)");
 console.log(role+'_ESTIMATE',(await db.query('select auth_user_role(),booking_estimate_total($1) total',[booking.id])).rows);
 await db.exec('reset role');
}
await db.exec("set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000102',false)");
const otherOwner=snap.users.find(u=>u.primary_role==='Owner'&&u.id!=='00000000-0000-0000-0000-000000000101');
console.log('ADMIN_DEMOTES_OWNER',(await db.query("update users set primary_role='Coordinator' where id=$1 returning id,primary_role",[otherOwner.id])).rows);
await db.exec('reset role');
await db.exec("update users set primary_role='Driver' where id='00000000-0000-0000-0000-000000000103'; set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000103',false)");
console.log('DRIVER_UNASSIGNED_READ',(await db.query("select auth_user_role(),(select count(*) from bookings) bookings,(select count(*) from clients) clients,(select count(*) from delivery_jobs where assigned_driver_id=auth.uid()) assigned_jobs")).rows);
console.log('DRIVER_PII_COLUMNS',(await db.query('select name,phone,government_id_number,pan_vat from clients limit 1')).rows);
await db.close();


