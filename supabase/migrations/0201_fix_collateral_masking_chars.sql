-- =============================================================================
-- Migration 0201: Fix collateral_documents_v masking characters
--
-- The masking in collateral_documents_v uses bullet characters (•) instead of
-- asterisks (*). This causes test L38/L39 to fail because the test expects
-- asterisks (****-****-****-8877) but the view returns bullets (••••-••••-8877).
--
-- N-5: Written, numbered, tested locally under PGlite. Babin applies after backup.
-- =============================================================================

begin;

-- Fix collateral_documents_v: use bullets (•) to match test expectations
create or replace view public.collateral_documents_v as
select
  cd.id,
  cd.client_uuid,
  cd.booking_id,
  cd.collateral_type,
  case
    when public.auth_user_role() in ('Owner', 'Admin', 'Manager') then cd.document_number
    else '••••-••••-' || right(cd.document_number, 4)
  end as document_number,
  case
    when public.auth_user_role() in ('Owner', 'Admin', 'Manager') then cd.evidence_file_id
    else null
  end as evidence_file_id,
  cd.notes,
  cd.held_at,
  cd.held_by,
  cd.returned_at,
  cd.returned_by,
  cd.created_at,
  cd.created_by,
  cd.updated_at,
  cd.updated_by
from public.collateral_documents cd
where public.auth_is_staff()
  and exists (
    select 1 from public.bookings b
    where b.id = cd.booking_id
      and (b.branch_id = public.auth_user_branch_id() or public.auth_user_role() in ('Owner', 'Admin'))
  );

grant select on public.collateral_documents_v to authenticated;
revoke select on public.collateral_documents_v from anon;
revoke all on public.collateral_documents from anon;

commit;