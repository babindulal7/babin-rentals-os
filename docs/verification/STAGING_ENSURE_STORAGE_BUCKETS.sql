-- =============================================================================
-- STAGING_ENSURE_STORAGE_BUCKETS.sql
-- Ensure standard storage buckets exist on staging (klhmsrunqrdxjudyhnkm)
-- Card: T1-06 (Storage scoping accepted on staging)
-- =============================================================================

begin;

insert into storage.buckets (id, name, public)
values 
  ('documents', 'documents', false),
  ('evidence', 'evidence', false),
  ('problem-reports', 'problem-reports', false),
  ('catalogue', 'catalogue', true),
  ('request-ids', 'request-ids', false)
on conflict (id) do update set public = excluded.public;

commit;
