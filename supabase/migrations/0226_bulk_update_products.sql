-- Migration 0223: Bulk update products (T4-12)
-- Enables Owner/Admin/Manager to update selected products in bulk with audit trail and idempotency.
-- Rate changes by percentage are strictly Owner-only. Money fields are barred from money-blind roles.
begin;

create or replace function public.bulk_update_products(
  p_product_ids uuid[],
  p_field text,
  p_value jsonb,
  p_client_uuid uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_is_owner boolean;
  v_can_money boolean;
  v_allowed_fields text[];
  v_money_fields text[];
  v_request jsonb;
  v_saved record;
  v_prod_id uuid;
  v_prod record;
  v_old_val jsonb;
  v_new_val jsonb;
  v_pct numeric;
  v_new_daily numeric;
  v_new_weekly numeric;
  v_new_monthly numeric;
  v_results jsonb := '[]'::jsonb;
  v_updated_count int := 0;
  v_response jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  v_role := auth_user_role()::text;
  v_is_owner := (v_role = 'Owner');
  v_can_money := auth_can_view_money();

  if not (v_role = any(array['Owner', 'Admin', 'Manager'])) then
    raise exception 'Permission denied: bulk product updates require Manager, Admin or Owner role.' using errcode = '42501';
  end if;

  if p_client_uuid is null then
    raise exception 'client_uuid is required for bulk updates.' using errcode = '22023';
  end if;

  if p_product_ids is null or array_length(p_product_ids, 1) is null or array_length(p_product_ids, 1) = 0 then
    raise exception 'At least one product ID must be provided.' using errcode = '22023';
  end if;

  -- Idempotency receipt check with transaction advisory lock
  perform pg_advisory_xact_lock(hashtextextended(p_client_uuid::text, 0));
  v_request := jsonb_build_object(
    'product_ids', p_product_ids,
    'field', p_field,
    'value', p_value,
    'client_uuid', p_client_uuid
  );

  select * into v_saved from record_editor_private.receipts where key = p_client_uuid;
  if found then
    if v_saved.actor <> auth.uid() or v_saved.request <> v_request then
      raise exception 'This save key belongs to a different change.' using errcode = '23505';
    end if;
    return v_saved.response;
  end if;

  v_money_fields := array[
    'rates_percentage', 'daily_rate', 'weekly_rate', 'monthly_rate',
    'hourly_rate', 'weekend_rate', 'deposit_percent', 'deposit_fixed',
    'purchase_price', 'replacement_value'
  ];

  -- Calls the same column rules as the section saves (0173) - never a second copy of the rules
  v_allowed_fields := record_editor_private.fields('equipment');

  if p_field <> 'rates_percentage' and not (p_field = any(v_allowed_fields)) then
    raise exception 'Field % cannot be updated in bulk.', p_field using errcode = '42703';
  end if;

  if (p_field = any(v_money_fields)) and not v_can_money then
    raise exception 'Permission denied: Warehouse and money-blind roles cannot modify financial fields.' using errcode = '42501';
  end if;

  if p_field = 'rates_percentage' and not v_is_owner then
    raise exception 'Permission denied: Only the Owner can adjust product rental rates by percentage.' using errcode = '42501';
  end if;

  -- Process updates
  for v_prod_id in select unnest(p_product_ids) loop
    select * into v_prod from public.products where id = v_prod_id for update;
    if found then
      if p_field = 'rates_percentage' then
        v_pct := (p_value->>'percentage')::numeric;
        if v_pct is null or v_pct < -100 or v_pct > 1000 then
          raise exception 'Invalid percentage adjustment: %', v_pct using errcode = '22023';
        end if;

        v_new_daily := round(coalesce(v_prod.daily_rate, 0) * (1.0 + v_pct / 100.0));
        v_new_weekly := case when v_prod.weekly_rate is not null then round(v_prod.weekly_rate * (1.0 + v_pct / 100.0)) else null end;
        v_new_monthly := case when v_prod.monthly_rate is not null then round(v_prod.monthly_rate * (1.0 + v_pct / 100.0)) else null end;

        v_old_val := jsonb_build_object(
          'daily_rate', v_prod.daily_rate,
          'weekly_rate', v_prod.weekly_rate,
          'monthly_rate', v_prod.monthly_rate
        );
        v_new_val := jsonb_build_object(
          'daily_rate', v_new_daily,
          'weekly_rate', v_new_weekly,
          'monthly_rate', v_new_monthly,
          'percentage', v_pct
        );

        update public.products
        set daily_rate = v_new_daily,
            weekly_rate = v_new_weekly,
            monthly_rate = v_new_monthly,
            updated_at = now(),
            updated_by = auth.uid()
        where id = v_prod_id;

      elsif p_field = 'category_id' then
        v_old_val := to_jsonb(v_prod.category_id);
        v_new_val := to_jsonb((p_value->>'category_id')::uuid);
        update public.products
        set category_id = (p_value->>'category_id')::uuid,
            updated_at = now(),
            updated_by = auth.uid()
        where id = v_prod_id;

      else
        v_old_val := to_jsonb(v_prod)->p_field;
        v_new_val := case when jsonb_typeof(p_value) = 'object' and p_value ? p_field then p_value->p_field else p_value end;
        perform record_editor_private.write_row(
          'products',
          v_prod_id,
          jsonb_build_object(p_field, v_new_val, 'updated_at', now(), 'updated_by', auth.uid())
        );
      end if;

      v_updated_count := v_updated_count + 1;
      v_results := v_results || jsonb_build_object(
        'id', v_prod_id,
        'success', true,
        'old_value', v_old_val,
        'new_value', v_new_val
      );

      -- Audit row per updated product with batch client_uuid
      insert into public.audit_events (
        client_uuid, event_class, category, module, action, severity, status,
        table_name, record_id, actor_id, actor_role, old_values, new_values, diff, reason
      ) values (
        md5(p_client_uuid::text || ':bulk:' || v_prod_id::text)::uuid,
        'status change', 'Inventory'::audit_category, 'Inventory'::audit_module,
        'Update', 'Informational', 'Success', 'products', v_prod_id,
        auth.uid(), auth_user_role(),
        jsonb_build_object(p_field, v_old_val),
        jsonb_build_object(p_field, v_new_val, 'batch_id', p_client_uuid),
        jsonb_build_object('batch_id', p_client_uuid, 'field', p_field, 'old', v_old_val, 'new', v_new_val),
        format('Bulk update of %s in batch %s', p_field, p_client_uuid)
      );
    else
      v_results := v_results || jsonb_build_object(
        'id', v_prod_id,
        'success', false,
        'error', 'Product not found'
      );
    end if;
  end loop;

  v_response := jsonb_build_object(
    'batch_id', p_client_uuid,
    'field', p_field,
    'total_requested', array_length(p_product_ids, 1),
    'updated_count', v_updated_count,
    'results', v_results
  );

  insert into record_editor_private.receipts (key, actor, request, response)
  values (p_client_uuid, auth.uid(), v_request, v_response);

  return v_response;
end;
$$;

revoke all on function public.bulk_update_products(uuid[], text, jsonb, uuid) from public, anon;
grant execute on function public.bulk_update_products(uuid[], text, jsonb, uuid) to authenticated;

commit;
