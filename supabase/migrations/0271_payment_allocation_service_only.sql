-- Launch safety: payment allocation is a trusted server action, not a client RPC.
-- Apply only after staging review and explicit Owner approval (N-5).
revoke all on function public.allocate_payment_intent(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.allocate_payment_intent(uuid, text, jsonb) to service_role;

-- P0 #430: issuance is held until merchant and target authorization acceptance.
-- Existing read-only links and manual payment functions are unchanged.
-- Even service_role has no issuance grant during this hold; the migration owner
-- retains normal ownership for isolated historical regression fixtures.
revoke all on function public.create_payment_intent(text, uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.create_booking_payment_link(text, uuid) from public, anon, authenticated, service_role;
