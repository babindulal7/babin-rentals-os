-- 0183_reset_self_qc_when_alone.sql
-- T2-13: Allow cleaner to pass QC when alone on shift (W43, L7).
-- Replaces constraint cleaning_queue_entries_qc_is_a_second_pair_of_eyes so that
-- qc_by = cleaned_by is allowed if and only if qc_self_checked = true (audited).

alter table public.cleaning_queue_entries
  add column if not exists qc_self_checked boolean not null default false;

comment on column public.cleaning_queue_entries.qc_self_checked is
  'True when the cleaner passed their own QC because they were alone on shift (W43, L7, T2-13). Audited.';

alter table public.cleaning_queue_entries
  drop constraint if exists cleaning_queue_entries_qc_is_a_second_pair_of_eyes;

alter table public.cleaning_queue_entries
  add constraint cleaning_queue_entries_qc_is_a_second_pair_of_eyes
  check (
    (qc_skipped = true and qc_skip_reason is not null)
    or (
      qc_skipped = false
      and (
        qc_by is null
        or cleaned_by is null
        or qc_by <> cleaned_by
        or qc_self_checked = true
      )
    )
  );
