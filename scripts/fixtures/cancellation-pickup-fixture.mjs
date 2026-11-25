import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

// Synthetic fixture only. Callers must enforce disposable database scope.
  // Real quantity reservation and outbound evidence, not just stage snapshots.
export async function makePickupFixture({q,ownerId,warehouseId,branchId,clientId}) {
    const id = randomUUID(), productId = randomUUID(), lineId = randomUUID()
    const packingId = randomUUID(), sessionId = randomUUID()
    await q('begin')
    try {
      await q("select set_config('app.current_user_id',$1,true),set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role','authenticated',true),set_config('request.jwt.claims',$2,true)", [ownerId,JSON.stringify({sub:ownerId,role:'authenticated',aal:'aal1'})])
      const actor = (await q('select public.auth_user_id() as id, public.auth_can_view_money() as money')).rows[0]
      assert.equal(actor?.id,ownerId)
      assert.equal(actor.money,true)
      const category = (await q('select id from public.inventory_categories order by name limit 1')).rows[0]?.id
      assert.ok(category)
      await q("insert into public.products (id,client_uuid,asset_code,name,category_id,brand,tracking_mode,total_quantity,daily_rate,created_by) values ($1,$2,public.next_document_number('equipment'),'Disposable Pickup Race Cable',$3,'Disposable','Quantity',20,250,$4)",[productId,randomUUID(),category,ownerId])
      await q("insert into public.bookings (id,client_uuid,booking_no,client_id,branch_id,pickup_at,return_at,delivery_type,stage,created_by,updated_by) values ($1,$2,public.next_document_number('booking'),$3,$4,'2099-12-20T04:00:00Z','2099-12-26T04:00:00Z','Client Pickup','Quote',$5,$5)",[id,randomUUID(),clientId,branchId,ownerId])
      await q("insert into public.booking_lines (id,client_uuid,booking_id,line_type,product_id,description,qty,days,rate,created_by) values ($1,$2,$3,'Equipment',$4,'Disposable Pickup Race Cable',2,6,250,$5)",[lineId,randomUUID(),id,productId,ownerId])
      for (const [from,to] of [['Quote','Booked'],['Booked','Packed']]) {
        if (to === 'Packed') {
          await q("insert into public.operation_sessions (id,client_uuid,booking_id,operation,state,warehouse_staff_id,created_by) values ($1,$2,$3,'Packing','In Progress',$4,$4)",[packingId,randomUUID(),id,ownerId])
          await q("insert into public.packing_lines (client_uuid,session_id,booking_line_id,state,qty_required,qty_packed_entered,created_by) values ($1,$2,$3,'Packed',2,2,$4)",[randomUUID(),packingId,lineId,ownerId])
        }
        await q("insert into public.booking_stage_transitions (client_uuid,booking_id,branch_id,from_stage,to_stage,actor_id,actor_role,occurred_at) values ($1,$2,$3,$4,$5,$6,'Owner',now())",[randomUUID(),id,branchId,from,to,ownerId])
      }
      await q("update public.operation_sessions set state='Completed',completed_at=clock_timestamp(),completed_by=$1 where id=$2",[ownerId,packingId])
      await q("insert into public.operation_sessions (id,client_uuid,booking_id,operation,state,delivery_method,warehouse_staff_id,created_by,government_id_verified,booking_authorization_verified) values ($1,$2,$3,'Handover','In Progress','Client Pickup',$4,$5,true,true)",[sessionId,randomUUID(),id,warehouseId,ownerId])
      const active = (await q('select count(*)::int as n from public.inventory_reservations where booking_id=$1 and released_at is null',[id])).rows[0]?.n
      assert.ok(active>0,'Physical fixture must own active inventory holds')
      await q('commit')
      return {id,lineId,sessionId}
    } catch (error) {
      await q('rollback')
      throw error
    }
  }
export const pickup = (conn, fixture, kind, warehouseId) => kind === 'movement'
    ? conn.query("insert into public.session_line_movements (client_uuid,session_id,booking_line_id,qty,resulting_item_state,moved_at,created_by) values ($1,$2,$3,1,'Picked Up',now(),$4)",[randomUUID(),fixture.sessionId,fixture.lineId,warehouseId])
    : conn.query("insert into public.handover_lines (client_uuid,booking_line_id,state,qty_required,first_session_id,completed_session_id,picked_up_at,created_by) values ($1,$2,'Picked Up',2,$3,$3,now(),$4)",[randomUUID(),fixture.lineId,fixture.sessionId,warehouseId])
