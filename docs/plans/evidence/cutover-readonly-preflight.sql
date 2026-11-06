-- T9-01 hosted preflight: one SELECT, no record values or mutations.
-- Run only against the intended OS project. Relation presence is checked
-- separately from migration-history labels, whose version formats can differ.
-- These counts do not establish matching identities or import approval.
select jsonb_build_object(
  'observed_at', current_timestamp,
  'catalogue_counts', (
    select jsonb_agg(to_jsonb(c) order by c.entity)
    from (
      select 'products' as entity, count(*) as total_rows,
             count(*) filter (where is_active) as active_rows
      from public.products
      union all
      select 'clients', count(*), null::bigint from public.clients
      union all
      select 'bundles', count(*), count(*) filter (where is_active)
      from public.bundles
    ) c
  ),
  'external_reference_count', (select count(*) from public.external_refs),
  'external_reference_groups', (
    select coalesce(jsonb_agg(to_jsonb(r) order by r.provider, r.entity), '[]'::jsonb)
    from (
      select provider, entity, count(*) as mapping_rows
      from public.external_refs
      group by provider, entity
    ) r
  ),
  'pricing_relations', (
    select jsonb_agg(jsonb_build_object(
      'relation', e.table_name,
      'present', to_regclass('public.' || e.table_name) is not null
    ) order by e.table_name)
    from (values
      ('pricing_structures'), ('pricing_structure_tiles'),
      ('pricing_rulesets'), ('pricing_rules')
    ) e(table_name)
  ),
  'external_reference_columns', (
    select jsonb_agg(column_name order by ordinal_position)
    from information_schema.columns
    where table_schema = 'public' and table_name = 'external_refs'
  )
) as cutover_preflight;
