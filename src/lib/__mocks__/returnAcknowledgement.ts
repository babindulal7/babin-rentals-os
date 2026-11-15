import type { Store, EngineHooks } from './engine'
import { validateReturnAcknowledgement } from '../returnAcknowledgement'

/** Local preview counterpart; PGlite lifecycle tests certify the actual authority. */
export function recordMockReturnAcknowledgement(store: Store, hooks: EngineHooks, actorId: string | undefined, args: Record<string, unknown>) {
  const actor = store['users']?.find(row => row['id'] === actorId)
  if (!actorId || !['Owner', 'Admin', 'Manager', 'Warehouse', 'Technician'].includes(String(actor?.['primary_role']))) throw new Error('Permission denied to acknowledge a Return.')
  const session = store['operation_sessions']?.find(row => row['id'] === args['p_session_id'])
  const booking = store['bookings']?.find(row => row['id'] === session?.['booking_id'])
  const grants = (store['operations_grants'] ?? []).filter(row => row['user_id'] === actorId && row['operation'] === 'return')
  if (!session || session['operation'] !== 'Return' || !booking || (grants.length && !grants.some(row => row['branch_id'] === booking['branch_id'] && !row['revoked_at']))) throw new Error('Return branch authorization refused.')
  const input = { returningName: String(args['p_returning_name'] ?? ''), evidenceFileId: args['p_evidence_file_id'] ? String(args['p_evidence_file_id']) : null, refusalReason: args['p_refusal_reason'] ? String(args['p_refusal_reason']) : null }
  const problem = validateReturnAcknowledgement(input)
  if (problem) throw new Error(problem)
  const previous = store['return_acknowledgements']?.find(row => row['session_id'] === session['id'] || row['client_uuid'] === args['p_client_uuid'])
  if (previous) {
    const signature = store['signatures']?.find(row => row['id'] === previous['signature_id'])
    if (previous['session_id'] !== session['id'] || previous['client_uuid'] !== args['p_client_uuid'] || previous['returning_name'] !== input.returningName.trim() || previous['refusal_reason'] !== input.refusalReason || (signature?.['signature_evidence_file_id'] ?? null) !== input.evidenceFileId) throw new Error('This Return acknowledgement was already recorded with different details.')
    return previous['id']
  }
  if (session['state'] !== 'In Progress' || booking['stage'] !== 'On Rent') throw new Error('An open Return on an On Rent booking is required.')
  const lines = (store['return_lines'] ?? []).filter(row => row['session_id'] === session['id'] && (row['condition'] === 'Damaged' || row['condition'] === 'Lost' || row['state'] === 'Not Returned'))
  if (!lines.length) throw new Error('Flagged items are required.')
  const now = new Date().toISOString()
  let signatureId: string | null = null
  if (input.evidenceFileId) {
    if (!(store['evidence_references'] ?? []).some(row => row['session_id'] === session['id'] && row['operation_stage'] === 'Return' && row['evidence_file_id'] === input.evidenceFileId)) throw new Error('Store the signature image against this Return session first.')
    signatureId = crypto.randomUUID()
    const result = hooks.insert('signatures', [{ id: signatureId, client_uuid: args['p_client_uuid'], session_id: session['id'], signature_role: 'Returning person', signer_name: input.returningName.trim(), signature_evidence_file_id: input.evidenceFileId, signed_at: now, created_by: actorId, is_required: true, device: 'Web' }])
    if (result.error) throw new Error(result.error.message)
  }
  const id = crypto.randomUUID()
  const result = hooks.insert('return_acknowledgements', [{ id, client_uuid: args['p_client_uuid'], session_id: session['id'], signature_id: signatureId, returning_name: input.returningName.trim(), refusal_reason: input.refusalReason, recorded_by: actorId, recorded_at: now,
    flagged_items: lines.map(line => ({ booking_line_id: line['booking_line_id'], state: line['state'], condition: line['condition'], note: line['inspector_note'], reason: line['not_returned_reason'] })) }])
  if (result.error) throw new Error(result.error.message)
  return id
}
