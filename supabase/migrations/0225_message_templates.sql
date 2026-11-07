-- 0225_message_templates.sql
-- T5-13: Edit email and document texts (Owner and Admin only, B20, O-11, Law 3, Law 7)

begin;

-- =============================================================================
-- Table: message_templates
-- =============================================================================
create table if not exists public.message_templates (
  id                   uuid        not null default gen_random_uuid() primary key,
  client_uuid          uuid        not null unique,
  template_key         text        not null check (char_length(trim(template_key)) >= 3 and char_length(template_key) <= 80),
  category             text        not null check (category in ('email', 'document')),
  name                 text        not null check (char_length(trim(name)) >= 3 and char_length(name) <= 120),
  description          text        null,
  version              integer     not null default 1 check (version >= 1),
  subject              text        null,
  body                 text        not null check (char_length(trim(body)) >= 5),
  allowed_placeholders text[]      not null default '{}',
  is_active            boolean     not null default true,
  created_by           uuid        null references public.users(id),
  created_at           timestamptz not null default now(),
  constraint message_templates_key_version_key unique (template_key, version)
);

comment on table public.message_templates is 'Versioned wording templates for automated client emails and document footers (T5-13, B20, Law 3)';

create index if not exists idx_message_templates_key_active
  on public.message_templates (template_key)
  where is_active = true;

create index if not exists idx_message_templates_key_version
  on public.message_templates (template_key, version desc);

alter table public.message_templates enable row level security;

-- Read policy: Authenticated staff can view active templates and history
create policy message_templates_read
  on public.message_templates
  for select
  to authenticated
  using (true);

-- Direct writes forbidden; all modifications must go through security definer RPCs
create policy message_templates_no_direct_insert
  on public.message_templates
  for insert
  to authenticated
  with check (false);

create policy message_templates_no_direct_update
  on public.message_templates
  for update
  to authenticated
  using (false);

create policy message_templates_no_direct_delete
  on public.message_templates
  for delete
  to authenticated
  using (false);

-- =============================================================================
-- Function: extract_template_placeholders
-- =============================================================================
create or replace function public.extract_template_placeholders(p_text text)
returns text[]
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_match text[];
  v_results text[] := '{}';
begin
  if p_text is null or trim(p_text) = '' then
    return '{}';
  end if;

  for v_match in select regexp_matches(p_text, '\{\{\s*([a-zA-Z0-9_]+)\s*\}\}', 'g') loop
    if not (v_match[1] = any(v_results)) then
      v_results := array_append(v_results, v_match[1]);
    end if;
  end loop;

  return v_results;
end;
$$;

comment on function public.extract_template_placeholders(text) is 'Extracts placeholder variable names from {{variable}} syntax in template strings';

-- =============================================================================
-- Function: save_message_template
-- =============================================================================
create or replace function public.save_message_template(
  p_client_uuid uuid,
  p_template_key text,
  p_subject text,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_role system_role;
  v_actor_id uuid;
  v_existing_id uuid;
  v_current record;
  v_used_placeholders text[];
  v_placeholder text;
  v_next_version integer;
  v_new_record public.message_templates%rowtype;
begin
  -- 1. Authorization: Owner and Admin only (B20)
  v_actor_role := auth_user_role();
  if v_actor_role::text not in ('Owner', 'Admin') then
    raise exception 'Only Owner and Admin can edit message and document texts (B20)'
      using errcode = '42501';
  end if;

  -- 2. Validate client_uuid for idempotency (Law 8)
  if p_client_uuid is null then
    raise exception 'client_uuid is required for idempotency (Law 8)'
      using errcode = '23502';
  end if;

  -- Idempotency check: if already committed with this client_uuid, return existing record
  select id into v_existing_id
  from public.message_templates
  where client_uuid = p_client_uuid;

  if v_existing_id is not null then
    select * into v_new_record
    from public.message_templates
    where id = v_existing_id;
    return to_jsonb(v_new_record);
  end if;

  -- 3. Validate template body
  if p_body is null or char_length(trim(p_body)) < 5 then
    raise exception 'Template body must be at least 5 characters long'
      using errcode = '22023';
  end if;

  -- 4. Fetch base metadata from active template definition
  select category, name, description, allowed_placeholders
  into v_current
  from public.message_templates
  where template_key = p_template_key and is_active = true
  order by version desc
  limit 1;

  if not found then
    -- Try any version if no active one found
    select category, name, description, allowed_placeholders
    into v_current
    from public.message_templates
    where template_key = p_template_key
    order by version desc
    limit 1;

    if not found then
      raise exception 'Template "%" does not exist in the catalogue', p_template_key
        using errcode = 'P0002';
    end if;
  end if;

  -- 5. Validate placeholders: unknown placeholders are strictly refused on save
  v_used_placeholders := public.extract_template_placeholders(coalesce(p_subject, '') || ' ' || p_body);

  if v_used_placeholders is not null and array_length(v_used_placeholders, 1) > 0 then
    foreach v_placeholder in array v_used_placeholders loop
      if not (v_placeholder = any(v_current.allowed_placeholders)) then
        raise exception 'Unknown placeholder "{{%}}" is refused for template "%". Allowed placeholders: %',
          v_placeholder, p_template_key, array_to_string(v_current.allowed_placeholders, ', ')
          using errcode = '22023';
      end if;
    end loop;
  end if;

  -- 6. Calculate next version (Law 3: append-only history, never overwrite)
  select coalesce(max(version), 0) + 1
  into v_next_version
  from public.message_templates
  where template_key = p_template_key;

  -- 7. Deactivate currently active version
  update public.message_templates
  set is_active = false
  where template_key = p_template_key and is_active = true;

  -- 8. Insert new version
  v_actor_id := auth.uid();
  if v_actor_id is null then
    select id into v_actor_id from public.users where primary_role::text = 'Owner' limit 1;
  end if;

  insert into public.message_templates (
    client_uuid,
    template_key,
    category,
    name,
    description,
    version,
    subject,
    body,
    allowed_placeholders,
    is_active,
    created_by,
    created_at
  ) values (
    p_client_uuid,
    p_template_key,
    v_current.category,
    v_current.name,
    v_current.description,
    v_next_version,
    p_subject,
    p_body,
    v_current.allowed_placeholders,
    true,
    v_actor_id,
    now()
  )
  returning * into v_new_record;

  -- 9. Audit event
  insert into public.audit_events (
    client_uuid,
    event_class,
    category,
    module,
    action,
    severity,
    status,
    table_name,
    record_id,
    actor_id,
    actor_role,
    old_values,
    new_values,
    diff,
    reason
  ) values (
    p_client_uuid,
    'status change',
    'Administration'::audit_category,
    'Settings'::audit_module,
    'Update',
    'Informational',
    'Success',
    'message_templates',
    v_new_record.id,
    v_actor_id,
    v_actor_role::system_role,
    jsonb_build_object('version', v_next_version - 1),
    jsonb_build_object(
      'template_key', p_template_key,
      'version', v_next_version,
      'subject', p_subject,
      'body', p_body
    ),
    jsonb_build_object('template_key', p_template_key, 'version', v_next_version),
    format('Saved version %s for template %s', v_next_version, p_template_key)
  );

  return to_jsonb(v_new_record);
end;
$$;

comment on function public.save_message_template(uuid, text, text, text) is 'Saves a new active version for a message or document template with placeholder validation and audit logging (Owner/Admin only)';

-- =============================================================================
-- Function: restore_message_template
-- =============================================================================
create or replace function public.restore_message_template(
  p_client_uuid uuid,
  p_template_key text,
  p_target_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_role system_role;
  v_target public.message_templates%rowtype;
begin
  -- 1. Authorization: Owner and Admin only (B20)
  v_actor_role := auth_user_role();
  if v_actor_role::text not in ('Owner', 'Admin') then
    raise exception 'Only Owner and Admin can restore message and document texts (B20)'
      using errcode = '42501';
  end if;

  -- 2. Find target version
  select * into v_target
  from public.message_templates
  where template_key = p_template_key and version = p_target_version;

  if not found then
    raise exception 'Template "%" version % does not exist', p_template_key, p_target_version
      using errcode = 'P0002';
  end if;

  -- 3. Delegate to save_message_template to create next version as an exact restored copy (Law 3)
  return public.save_message_template(
    p_client_uuid,
    p_template_key,
    v_target.subject,
    v_target.body
  );
end;
$$;

comment on function public.restore_message_template(uuid, text, integer) is 'Restores a historical version of a message template by saving it as the latest active version (Owner/Admin only)';

-- =============================================================================
-- Seed Initial Template Versions (Version 1)
-- =============================================================================
do $$
declare
  v_owner_id uuid;
begin
  select id into v_owner_id from public.users where primary_role::text = 'Owner' limit 1;

  -- 1. email.booking_confirmed
  insert into public.message_templates (
    client_uuid, template_key, category, name, description, version, subject, body, allowed_placeholders, is_active, created_by
  ) values (
    'e0000001-0000-0000-0000-000000000001'::uuid,
    'email.booking_confirmed',
    'email',
    'Booking Confirmation',
    'Automatic email sent to clients when their rental booking is confirmed',
    1,
    'Your gear booking {{booking_number}} is confirmed',
    'Dear {{client_name}},\n\nYour equipment rental {{booking_number}} has been confirmed.\n\nPickup Time: {{pickup_time}}\nReturn Time: {{return_time}}\n\nYou can review your rental details online at {{action_url}}.\n\nThank you,\n{{company_name}}\n{{company_phone}}',
    array['client_name', 'booking_number', 'pickup_time', 'return_time', 'action_url', 'portal_url', 'company_name', 'company_phone'],
    true,
    v_owner_id
  ) on conflict (template_key, version) do nothing;

  -- 2. email.pickup_reminder
  insert into public.message_templates (
    client_uuid, template_key, category, name, description, version, subject, body, allowed_placeholders, is_active, created_by
  ) values (
    'e0000001-0000-0000-0000-000000000002'::uuid,
    'email.pickup_reminder',
    'email',
    'Pickup Reminder',
    'Automatic reminder sent 24 hours prior to equipment pickup',
    1,
    'Reminder: Equipment pickup for {{booking_number}} on {{pickup_date}}',
    'Dear {{client_name}},\n\nThis is a reminder that your rental gear for booking {{booking_number}} is scheduled for pickup on {{pickup_date}} at {{pickup_time}}.\n\nPlease remember to bring your authorized ID for equipment handover.\n\nDetails: {{action_url}}\n\nWarm regards,\n{{company_name}}\n{{company_phone}}',
    array['client_name', 'booking_number', 'pickup_time', 'pickup_date', 'action_url', 'company_name', 'company_phone'],
    true,
    v_owner_id
  ) on conflict (template_key, version) do nothing;

  -- 3. email.return_reminder
  insert into public.message_templates (
    client_uuid, template_key, category, name, description, version, subject, body, allowed_placeholders, is_active, created_by
  ) values (
    'e0000001-0000-0000-0000-000000000003'::uuid,
    'email.return_reminder',
    'email',
    'Return Reminder',
    'Automatic reminder sent morning of return due date',
    1,
    'Reminder: Equipment return for {{booking_number}} on {{return_date}}',
    'Dear {{client_name}},\n\nThis is a courtesy reminder that your equipment rental {{booking_number}} is due for return on {{return_date}} by {{return_time}}.\n\nRental summary: {{action_url}}\n\nThank you,\n{{company_name}}\n{{company_phone}}',
    array['client_name', 'booking_number', 'return_time', 'return_date', 'action_url', 'company_name', 'company_phone'],
    true,
    v_owner_id
  ) on conflict (template_key, version) do nothing;

  -- 4. email.payment_reminder
  insert into public.message_templates (
    client_uuid, template_key, category, name, description, version, subject, body, allowed_placeholders, is_active, created_by
  ) values (
    'e0000001-0000-0000-0000-000000000004'::uuid,
    'email.payment_reminder',
    'email',
    'Payment Reminder',
    'Automated reminder sent for overdue or outstanding invoice balances',
    1,
    'Payment Reminder for Invoice {{invoice_number}} (Booking {{booking_number}})',
    'Dear {{client_name}},\n\nThis is a reminder regarding outstanding invoice {{invoice_number}} associated with booking {{booking_number}}.\n\nOutstanding Balance: {{amount_due}}\nDue Date: {{due_date}}\n\nYou may settle online at {{pay_url}} or at our rental counter.\n\nRegards,\n{{company_name}}\n{{company_phone}}',
    array['client_name', 'invoice_number', 'booking_number', 'amount_due', 'due_date', 'pay_url', 'company_name', 'company_phone'],
    true,
    v_owner_id
  ) on conflict (template_key, version) do nothing;

  -- 5. email.offer_footer
  insert into public.message_templates (
    client_uuid, template_key, category, name, description, version, subject, body, allowed_placeholders, is_active, created_by
  ) values (
    'e0000001-0000-0000-0000-000000000005'::uuid,
    'email.offer_footer',
    'email',
    'Offer Email Footer',
    'Standard regulatory and unsubscribe footer appended to client promotional offers',
    1,
    null,
    'You are receiving this special offer as a valued client of {{company_name}}.\nTo manage your preferences or unsubscribe, please visit: {{unsubscribe_url}}\nPortal: {{portal_url}}\n{{company_address}}',
    array['company_name', 'unsubscribe_url', 'portal_url', 'company_address'],
    true,
    v_owner_id
  ) on conflict (template_key, version) do nothing;

  -- 6. doc.invoice_footer
  insert into public.message_templates (
    client_uuid, template_key, category, name, description, version, subject, body, allowed_placeholders, is_active, created_by
  ) values (
    'e0000001-0000-0000-0000-000000000006'::uuid,
    'doc.invoice_footer',
    'document',
    'Invoice Footer',
    'Notes, payment terms, and bank details rendered at the bottom of official tax invoices',
    1,
    null,
    'Thank you for choosing {{company_name}} for your cinema equipment rentals.\nPayment is due per agreed invoice terms.\nFor inquiries contact {{company_phone}} or {{company_email}}.\nBank Details: {{bank_details}}',
    array['company_name', 'company_phone', 'company_email', 'bank_details'],
    true,
    v_owner_id
  ) on conflict (template_key, version) do nothing;

  -- 7. doc.proforma_note
  insert into public.message_templates (
    client_uuid, template_key, category, name, description, version, subject, body, allowed_placeholders, is_active, created_by
  ) values (
    'e0000001-0000-0000-0000-000000000007'::uuid,
    'doc.proforma_note',
    'document',
    'Pro Forma Note',
    'Validity disclaimer and booking confirmation note on pro forma estimate quotes',
    1,
    null,
    'This pro forma estimate is valid for {{validity_days}} days from issuance.\nEquipment availability is confirmed only upon reservation booking.\nIssued by {{company_name}} / Contact: {{contact_name}}',
    array['company_name', 'validity_days', 'contact_name'],
    true,
    v_owner_id
  ) on conflict (template_key, version) do nothing;

  -- 8. doc.rental_agreement_terms
  insert into public.message_templates (
    client_uuid, template_key, category, name, description, version, subject, body, allowed_placeholders, is_active, created_by
  ) values (
    'e0000001-0000-0000-0000-000000000008'::uuid,
    'doc.rental_agreement_terms',
    'document',
    'Rental Agreement Terms (O-11)',
    'Standard legal clauses printed on rental contracts signed during equipment handover',
    1,
    null,
    '1. Custody & Care: The renter ({{client_name}}) assumes full custody and responsibility for all equipment listed upon handover until check-in return to {{company_name}}.\n2. Late Returns: {{late_fee_policy}}.\n3. Damage & Loss: Damaged or missing equipment is billed at full repair or replacement cost.\n4. Jurisdiction: Governed by the laws of {{jurisdiction}}.',
    array['company_name', 'client_name', 'jurisdiction', 'late_fee_policy'],
    true,
    v_owner_id
  ) on conflict (template_key, version) do nothing;

  -- 9. doc.packing_list_footer
  insert into public.message_templates (
    client_uuid, template_key, category, name, description, version, subject, body, allowed_placeholders, is_active, created_by
  ) values (
    'e0000001-0000-0000-0000-000000000009'::uuid,
    'doc.packing_list_footer',
    'document',
    'Packing List Footer',
    'Floor checkout reminders and warehouse support contacts printed on equipment pick sheets',
    1,
    null,
    'Please inspect and verify all packed items and accessories against this manifest prior to departure.\nEmergency Support: {{support_phone}}.\nOperations Note: {{checklist_note}}.\n{{company_name}} Warehouse Operations',
    array['company_name', 'support_phone', 'checklist_note'],
    true,
    v_owner_id
  ) on conflict (template_key, version) do nothing;
end $$;

-- Permissions
revoke all on function public.extract_template_placeholders(text) from public, anon;
grant execute on function public.extract_template_placeholders(text) to authenticated;

revoke all on function public.save_message_template(uuid, text, text, text) from public, anon;
grant execute on function public.save_message_template(uuid, text, text, text) to authenticated;

revoke all on function public.restore_message_template(uuid, text, integer) from public, anon;
grant execute on function public.restore_message_template(uuid, text, integer) to authenticated;

commit;
