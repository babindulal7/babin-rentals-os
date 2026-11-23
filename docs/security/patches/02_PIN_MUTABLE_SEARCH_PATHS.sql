-- =============================================================================
-- BABIN RENTALS OS — STAGING SECURITY PATCH PROPOSAL (SEC-PATCH-02)
-- Target: Remediate Supabase Linter 0007_function_search_path_mutable
--
-- STATUS: STAGING PROPOSAL ONLY — OWNER APPROVAL REQUIRED BEFORE EXECUTION
-- NO AUTOMATIC EXECUTION AGAINST PRODUCTION OR HOSTED STAGING
-- =============================================================================

begin;

-- Pin search_path on privileged functions flagged with mutable search_path
alter function public.log_audit_event()
  set search_path = public, extensions, pg_temp;

alter function public.apply_booking_stage_transition()
  set search_path = public, extensions, pg_temp;

alter function public.enforce_inventory_reservation_capacity()
  set search_path = public, extensions, pg_temp;

alter function public.reject_direct_booking_stage_write()
  set search_path = public, extensions, pg_temp;

commit;
