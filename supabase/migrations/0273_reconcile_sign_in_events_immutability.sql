-- Reconcile the append-only trigger observed in hosted staging before the three
-- recorded stabilization migrations. This prerequisite was absent from the
-- repository chain; it must not be inferred to have a hosted ledger entry.
begin;
create or replace function public.trg_prevent_sign_in_events_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  raise exception 'GATE:gate.audit.immutable|Sign-in events are immutable.';
end;
$$;

create or replace trigger trg_sign_in_events_immutable
before update or delete on public.sign_in_events
for each row execute function public.trg_prevent_sign_in_events_mutation();
commit;
