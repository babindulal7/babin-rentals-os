import { expect, it } from 'vitest'
import { mockSupabase } from '../client'

it('projects committed mock pickups into the handover line', async () => {
  const line = crypto.randomUUID()
  const session = crypto.randomUUID()
  await mockSupabase.from('booking_lines').insert({ id: line, client_uuid: crypto.randomUUID(), qty: 2 })
  await mockSupabase.from('operation_sessions').insert({ id: session, client_uuid: crypto.randomUUID(), operation: 'Handover' })
  const move = async () => mockSupabase.from('session_line_movements').insert({
    client_uuid: crypto.randomUUID(), session_id: session, booking_line_id: line,
    qty: 1, resulting_item_state: 'Picked Up', moved_at: new Date().toISOString(), created_by: 'actor',
  })
  await move()
  const partial = await mockSupabase.from('handover_lines').select('state').eq('booking_line_id', line).single()
  expect(partial.data).toMatchObject({ state: 'Remaining' })
  await move()
  const complete = await mockSupabase.from('handover_lines').select('state').eq('booking_line_id', line).single()
  expect(complete.data).toMatchObject({ state: 'Picked Up' })
})

it('updates the assigned serial on pickup and full correction', async () => {
  const line = crypto.randomUUID(), session = crypto.randomUUID(), unit = crypto.randomUUID(), asset = crypto.randomUUID()
  await mockSupabase.from('booking_lines').insert({ id: line, client_uuid: crypto.randomUUID(), qty: 1 })
  await mockSupabase.from('booking_line_units').insert({ id: unit, client_uuid: crypto.randomUUID(), booking_line_id: line, asset_id: asset, unit_state: 'Ready' })
  await mockSupabase.from('operation_sessions').insert({ id: session, client_uuid: crypto.randomUUID(), operation: 'Handover' })
  const movement = crypto.randomUUID()
  await mockSupabase.from('session_line_movements').insert({ id: movement, client_uuid: crypto.randomUUID(), session_id: session,
    booking_line_id: line, unit_id: asset, qty: 1, resulting_item_state: 'Picked Up', moved_at: new Date().toISOString(), created_by: 'actor' })
  let state = await mockSupabase.from('booking_line_units').select('unit_state,handover_session_id').eq('id', unit).single()
  expect(state.data).toMatchObject({ unit_state: 'Picked Up', handover_session_id: session })
  await mockSupabase.from('session_line_movements').insert({ client_uuid: crypto.randomUUID(), session_id: session,
    booking_line_id: line, qty: 1, resulting_item_state: 'Picked Up', reverses_movement_id: movement, moved_at: new Date().toISOString(), created_by: 'actor' })
  state = await mockSupabase.from('booking_line_units').select('unit_state,handover_session_id').eq('id', unit).single()
  expect(state.data).toMatchObject({ unit_state: 'Ready', handover_session_id: null })
})
