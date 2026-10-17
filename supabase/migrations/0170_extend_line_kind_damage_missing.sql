-- ============================================================================
-- 0170_extend_line_kind_damage_missing.sql
-- MONEY-08: Add 'Damage' and 'Missing' to line_kind enum so return-time
-- damage assessments and unreturned item replacement charges can be
-- billed as itemized invoice lines.
--
-- N-5: write and verify locally only; Babin applies after backup/staging review.
-- ============================================================================

alter type public.line_kind add value if not exists 'Damage';
alter type public.line_kind add value if not exists 'Missing';
