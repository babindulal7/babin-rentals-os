-- RULING 2026-10-26: persisted unit identity/intake corrections, M+ only.
-- WRITTEN locally. NOT APPLIED / NOT PRODUCTION-VERIFIED (N-5).
begin;

create function public.update_equipment_unit(
  p_unit_id uuid, p_revision text, p_key uuid, p_patch jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  actor uuid := auth.uid();
  actor_role text;
  actor_branch uuid;
  unit_row product_units;
  before_row jsonb;
  request jsonb;
  receipt record;
  response jsonb;
  field text;
  normalized jsonb := '{}'::jsonb;
  desired_condition unit_condition;
begin
  select primary_role::text, branch_id into actor_role, actor_branch
    from users where id=actor and is_active and deactivated_at is null;
  if actor is null or actor_role is null or actor_role not in ('Owner','Admin','Manager') then
    raise exception 'Permission denied to edit equipment units.' using errcode='42501';
  end if;
  if p_unit_id is null or p_key is null or nullif(btrim(p_revision),'') is null then
    raise exception 'A unit, observed revision and stable save key are required.';
  end if;
  if p_patch is null or jsonb_typeof(p_patch)<>'object' or p_patch='{}'::jsonb then
    raise exception 'No unit changes were provided.';
  end if;
  for field in select jsonb_object_keys(p_patch) loop
    if field not in ('assetTag','serialNo','rack','shelf','bin','condition') then
      raise exception 'Field % cannot be changed in this unit editor.',field;
    end if;
    if jsonb_typeof(p_patch->field) not in ('string','null') then
      raise exception 'Unit field % must be text.',field;
    end if;
    if field='assetTag' and nullif(btrim(p_patch->>field),'') is null then
      raise exception 'An asset tag is required.';
    end if;
    normalized := normalized || jsonb_build_object(field,nullif(btrim(p_patch->>field),''));
  end loop;
  if normalized ? 'condition' then
    if normalized->>'condition' is null then raise exception 'A condition is required.'; end if;
    desired_condition := (normalized->>'condition')::unit_condition;
  end if;
  request := jsonb_build_object('operation','update_equipment_unit','unit',p_unit_id,
    'revision',p_revision,'patch',normalized);
  perform pg_advisory_xact_lock(hashtextextended(p_key::text,0));
  select * into unit_row from product_units where id=p_unit_id for update;
  if not found then raise exception 'Unit not found.'; end if;
  -- Manager scope is resolved against recorded unit AND current warehouse branch; ambiguity denies.
  if actor_role='Manager' and (unit_row.branch_id is distinct from actor_branch or not exists (
    select 1 from warehouses where id=unit_row.warehouse_id and branch_id=actor_branch for share
  )) then raise exception 'Unit branch access denied.' using errcode='42501'; end if;
  select * into receipt from record_editor_private.receipts where key=p_key;
  if found then
    if receipt.actor<>actor or receipt.request<>request then
      raise exception 'This save key belongs to another change.';
    end if;
    return receipt.response;
  end if;
  if unit_row.updated_at is distinct from p_revision::timestamptz then
    raise exception 'The unit changed. Reload the latest record before saving.' using errcode='40001';
  end if;
  if unit_row.retired_at is not null or unit_row.status='Retired' then
    raise exception 'Retired units are read-only in this editor.';
  end if;
  if (normalized ? 'rack' or normalized ? 'shelf' or normalized ? 'bin')
     and unit_row.status in ('On Rent','Returning') then
    raise exception 'Shelf location cannot change while the unit is out. Use its custody workflow.';
  end if;
  if normalized ? 'condition' and desired_condition is distinct from unit_row.condition then
    -- This is an intake correction, not the missing physical damage/QC clearance contract.
    if unit_row.status not in ('In Stock','Reserved')
       or unit_row.condition not in ('Excellent','Good','Fair')
       or desired_condition not in ('Excellent','Good','Fair')
       or exists(select 1 from damage_findings where unit_id=p_unit_id and voided_at is null)
       or exists(select 1 from maintenance_records where product_unit_id=p_unit_id and completed_at is null)
       or exists(select 1 from cleaning_queue_entries where unit_id=p_unit_id
         and (nullif(btrim(qc_fail_reason),'') is not null or problem_state<>'No Problems')) then
      raise exception 'Condition changes require the Return, damage or QC workflow for this unit.';
    end if;
  end if;
  before_row := jsonb_build_object('assetTag',unit_row.asset_tag,'serialNo',unit_row.serial_no,
    'rack',unit_row.rack,'shelf',unit_row.shelf,'bin',unit_row.bin,'condition',unit_row.condition);
  update product_units set
    asset_tag=case when normalized ? 'assetTag' then normalized->>'assetTag' else asset_tag end,
    serial_no=case when normalized ? 'serialNo' then normalized->>'serialNo' else serial_no end,
    rack=case when normalized ? 'rack' then normalized->>'rack' else rack end,
    shelf=case when normalized ? 'shelf' then normalized->>'shelf' else shelf end,
    bin=case when normalized ? 'bin' then normalized->>'bin' else bin end,
    condition=case when normalized ? 'condition' then desired_condition else condition end,
    updated_at=clock_timestamp(), updated_by=actor
    where id=p_unit_id returning * into unit_row;
  response := jsonb_build_object('id',unit_row.id,'revision',unit_row.updated_at,
    'assetTag',unit_row.asset_tag,'serialNo',unit_row.serial_no,'rack',unit_row.rack,
    'shelf',unit_row.shelf,'bin',unit_row.bin,'condition',unit_row.condition,'state',unit_row.status);
  insert into audit_events(client_uuid,event_class,category,module,action,severity,status,
    table_name,record_id,actor_id,actor_role,branch_id,old_values,new_values)
  values(p_key,'status change','Inventory','Inventory','Update','Informational','Success',
    'product_units',p_unit_id,actor,actor_role::system_role,unit_row.branch_id,before_row,normalized);
  insert into record_editor_private.receipts(key,actor,request,response)
    values(p_key,actor,request,response);
  return response;
end; $$;
revoke all on function public.update_equipment_unit(uuid,text,uuid,jsonb) from public,anon;
grant execute on function public.update_equipment_unit(uuid,text,uuid,jsonb) to authenticated;
commit;
