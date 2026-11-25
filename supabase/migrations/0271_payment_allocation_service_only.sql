-- Launch safety: payment allocation is a trusted server action, not a client RPC.
-- Apply only after staging review and explicit Owner approval (N-5).
revoke all on function public.allocate_payment_intent(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.allocate_payment_intent(uuid, text, jsonb) to service_role;
