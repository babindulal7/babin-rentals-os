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
