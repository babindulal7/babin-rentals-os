-- Pin application-owned invoker helpers and guard triggers found by the live
-- read-only audit. No role, data, grants, function bodies or extension objects change.
-- N-5: write and verify locally only; Babin applies after backup/staging review.
begin;

alter function public.booking_intel_note_archive_only() set search_path to public, pg_temp;
alter function public.intel_entity_note_archive_only() set search_path to public, pg_temp;
alter function public.intel_field_allowed(text) set search_path to public, pg_temp;
alter function public.intel_field_definition_archive_only() set search_path to public, pg_temp;
alter function public.reject_delete_nothing_is_deleted() set search_path to public, pg_temp;
alter function public.reject_direct_booking_stage_write() set search_path to public, pg_temp;
alter function public.reject_money_column_write_by_money_blind_role() set search_path to public, pg_temp;
alter function public.reject_update_append_only() set search_path to public, pg_temp;
alter function public.reject_update_daily_closing() set search_path to public, pg_temp;
alter function public.reject_update_released_unit() set search_path to public, pg_temp;
alter function public.reject_users_delete() set search_path to public, pg_temp;
alter function record_editor_private.fields(text) set search_path to public, pg_temp;
alter function record_editor_private.pick(jsonb, text[]) set search_path to public, pg_temp;

do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where ((n.nspname = 'public'
      and p.proname in (
        'booking_intel_note_archive_only', 'intel_entity_note_archive_only',
        'intel_field_allowed', 'intel_field_definition_archive_only',
        'reject_delete_nothing_is_deleted', 'reject_direct_booking_stage_write',
        'reject_money_column_write_by_money_blind_role', 'reject_update_append_only',
        'reject_update_daily_closing', 'reject_update_released_unit', 'reject_users_delete'
      )) or (n.nspname = 'record_editor_private' and p.proname in ('fields', 'pick')))
      and not ('search_path=public, pg_temp' = any(coalesce(p.proconfig, array[]::text[])))
  ) then raise exception 'Application guard search-path pinning failed'; end if;
end $$;

commit;
