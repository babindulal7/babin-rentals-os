-- 0224_offer_campaigns_and_recipients.sql
-- T5-12: Offer emails to clients (Owner, Admin, Manager only, B31, B34, B43, B50, K6, W80)

begin;

-- =============================================================================
-- Table: offer_campaigns
-- =============================================================================
create table public.offer_campaigns (
  id                   uuid        not null default gen_random_uuid() primary key,
  client_uuid          uuid        not null unique,
  subject              text        not null check (char_length(trim(subject)) >= 3 and char_length(subject) <= 200),
  body_markdown        text        not null check (char_length(trim(body_markdown)) >= 10),
  hero_image_url       text        null,
  cta_button_text      text        not null default 'Book Gear Online',
  cta_button_url       text        not null default 'https://book.babinrentals.com',
  audience_filter      jsonb       not null default '{}'::jsonb,
  status               text        not null default 'draft' check (status in ('draft', 'test_sent', 'queued', 'sending', 'completed', 'cancelled')),
  test_recipient_email text        null,
  test_sent_at         timestamptz null,
  recipient_count      integer     not null default 0 check (recipient_count >= 0),
  sent_count           integer     not null default 0 check (sent_count >= 0),
  failed_count         integer     not null default 0 check (failed_count >= 0),
  bounced_count        integer     not null default 0 check (bounced_count >= 0),
  unsubscribed_count   integer     not null default 0 check (unsubscribed_count >= 0),
  created_by           uuid        not null references public.users(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  queued_at            timestamptz null,
  completed_at         timestamptz null
);

comment on table public.offer_campaigns is 'Marketing offer campaigns authored by Owner, Admin, or Manager (T5-12, B43, B50)';

-- =============================================================================
-- Table: offer_campaign_recipients
-- =============================================================================
create table public.offer_campaign_recipients (
  id                     uuid        not null default gen_random_uuid() primary key,
  campaign_id            uuid        not null references public.offer_campaigns(id) on delete restrict,
  client_id              uuid        not null references public.clients(id) on delete restrict,
  recipient_email        text        not null,
  recipient_name         text        not null,
  unsubscribe_token_hash text        not null unique check (char_length(unsubscribe_token_hash) = 64),
  status                 text        not null default 'pending' check (status in ('pending', 'sent', 'failed', 'bounced', 'unsubscribed')),
  sent_at                timestamptz null,
  error_message          text        null,
  created_at             timestamptz not null default now(),
  constraint offer_campaign_recipients_campaign_client_key unique (campaign_id, client_id)
);

comment on table public.offer_campaign_recipients is 'Recipient queue and delivery log for marketing offer campaigns with tokenized unsubscribe hashes (T5-12, K6)';

create index idx_offer_campaign_recipients_lookup
  on public.offer_campaign_recipients (campaign_id, status);

create index idx_offer_campaign_recipients_unsub
  on public.offer_campaign_recipients (unsubscribe_token_hash);

-- =============================================================================
-- RLS: offer_campaigns & offer_campaign_recipients
-- =============================================================================
alter table public.offer_campaigns enable row level security;
alter table public.offer_campaign_recipients enable row level security;

-- Read policy: Owner, Admin, Manager only (B43)
create policy offer_campaigns_select on public.offer_campaigns
  for select to authenticated
  using (public.auth_user_role() in ('Owner', 'Admin', 'Manager'));

create policy offer_campaign_recipients_select on public.offer_campaign_recipients
  for select to authenticated
  using (public.auth_user_role() in ('Owner', 'Admin', 'Manager'));

-- Direct write policies: NONE. Mutations happen strictly through security definer RPCs.
-- Hard delete is forbidden per Law 3.

-- =============================================================================
-- Views for UI
-- =============================================================================
create or replace view public.offer_campaigns_v as
select
  c.id,
  c.client_uuid,
  c.subject,
  c.body_markdown,
  c.hero_image_url,
  c.cta_button_text,
  c.cta_button_url,
  c.audience_filter,
  c.status,
  c.test_recipient_email,
  c.test_sent_at,
  c.recipient_count,
  c.sent_count,
  c.failed_count,
  c.bounced_count,
  c.unsubscribed_count,
  c.created_by,
  u.full_name as created_by_name,
  c.created_at,
  c.updated_at,
  c.queued_at,
  c.completed_at
from public.offer_campaigns c
left join public.users u on u.id = c.created_by;

alter view public.offer_campaigns_v set (security_invoker = true);
revoke all on public.offer_campaigns_v from public, anon;
grant select on public.offer_campaigns_v to authenticated;

-- =============================================================================
-- RPC: preview_offer_campaign_audience
-- Server-side counting only; never leaks client rows or emails to browser (Law 1, Law 6)
-- =============================================================================
create or replace function public.preview_offer_campaign_audience(
  p_audience_filter jsonb default '{}'::jsonb
)
returns table (
  eligible_count     integer,
  opted_out_count    integer,
  no_email_count     integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text := public.auth_user_role();
begin
  if v_role not in ('Owner', 'Admin', 'Manager') then
    raise exception 'Permission denied: only Owner, Admin, and Manager can preview offer audiences'
      using errcode = '42501';
  end if;

  return query
  with client_data as (
    select
      c.id,
      c.email,
      c.status,
      cmc.state as consent_state
    from public.clients c
    left join public.client_marketing_consents cmc
      on cmc.client_id = c.id and cmc.channel = 'Email'
    where c.status = 'Active'
      and (
        p_audience_filter is null
        or p_audience_filter = '{}'::jsonb
        or (
          (p_audience_filter->>'tag' is null or (c.tags is not null and c.tags @> array[p_audience_filter->>'tag']::text[]))
          and (p_audience_filter->>'membership_plan_id' is null or exists (
            select 1 from public.client_memberships cm
            where cm.client_id = c.id
              and cm.plan_id::text = (p_audience_filter->>'membership_plan_id')
              and cm.superseded_at is null
          ))
        )
      )
  )
  select
    count(case when email is not null and trim(email) <> '' and coalesce(consent_state, 'Not asked') not in ('Opted out', 'Opt-Out', 'Do Not Disturb') then 1 end)::integer as eligible_count,
    count(case when email is not null and trim(email) <> '' and coalesce(consent_state, 'Not asked') in ('Opted out', 'Opt-Out', 'Do Not Disturb') then 1 end)::integer as opted_out_count,
    count(case when email is null or trim(email) = '' then 1 end)::integer as no_email_count
  from client_data;
end;
$$;

revoke all on function public.preview_offer_campaign_audience(jsonb) from public;
grant execute on function public.preview_offer_campaign_audience(jsonb) to authenticated;

-- =============================================================================
-- RPC: save_offer_campaign
-- Create or edit draft campaign (Owner, Admin, Manager only)
-- =============================================================================
create or replace function public.save_offer_campaign(
  p_client_uuid     uuid,
  p_subject         text,
  p_body_markdown   text,
  p_hero_image_url  text default null,
  p_cta_button_text text default 'Book Gear Online',
  p_cta_button_url  text default 'https://book.babinrentals.com',
  p_audience_filter jsonb default '{}'::jsonb,
  p_campaign_id     uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id uuid := auth.uid();
  v_role     text := public.auth_user_role();
  v_id       uuid;
begin
  if v_role not in ('Owner', 'Admin', 'Manager') then
    raise exception 'Permission denied: only Owner, Admin, and Manager can create or edit offer campaigns'
      using errcode = '42501';
  end if;

  if p_campaign_id is not null then
    -- Verify campaign exists and is in editable state
    select id into v_id
    from public.offer_campaigns
    where id = p_campaign_id;

    if not found then
      raise exception 'Campaign % not found', p_campaign_id using errcode = 'P0002';
    end if;

    update public.offer_campaigns
    set
      subject         = p_subject,
      body_markdown   = p_body_markdown,
      hero_image_url  = p_hero_image_url,
      cta_button_text = coalesce(nullif(trim(p_cta_button_text), ''), 'Book Gear Online'),
      cta_button_url  = coalesce(nullif(trim(p_cta_button_url), ''), 'https://book.babinrentals.com'),
      audience_filter = coalesce(p_audience_filter, '{}'::jsonb),
      updated_at      = now()
    where id = p_campaign_id
      and status in ('draft', 'test_sent')
    returning id into v_id;

    if not found then
      raise exception 'Cannot edit campaign that is already queued or completed' using errcode = '55000';
    end if;
  else
    insert into public.offer_campaigns (
      client_uuid,
      subject,
      body_markdown,
      hero_image_url,
      cta_button_text,
      cta_button_url,
      audience_filter,
      status,
      created_by
    ) values (
      p_client_uuid,
      p_subject,
      p_body_markdown,
      p_hero_image_url,
      coalesce(nullif(trim(p_cta_button_text), ''), 'Book Gear Online'),
      coalesce(nullif(trim(p_cta_button_url), ''), 'https://book.babinrentals.com'),
      coalesce(p_audience_filter, '{}'::jsonb),
      'draft',
      v_actor_id
    )
    returning id into v_id;
  end if;

  -- Audit
  insert into public.audit_events (
    client_uuid, event_class, category, module, action, severity, status,
    table_name, record_id, actor_id, actor_role, branch_id, new_values
  ) values (
    gen_random_uuid(),
    'status change',
    'Administration',
    'Clients',
    'Create',
    'Informational',
    'Success',
    'offer_campaigns',
    v_id,
    v_actor_id,
    v_role::system_role,
    '00000000-0000-0000-0000-000000000001'::uuid,
    jsonb_build_object('subject', p_subject, 'audience_filter', p_audience_filter)
  );

  return v_id;
end;
$$;

revoke all on function public.save_offer_campaign(uuid, text, text, text, text, text, jsonb, uuid) from public;
grant execute on function public.save_offer_campaign(uuid, text, text, text, text, text, jsonb, uuid) to authenticated;

-- =============================================================================
-- RPC: record_offer_campaign_test_send
-- Pre-flight test send record (B43, K6)
-- =============================================================================
create or replace function public.record_offer_campaign_test_send(
  p_campaign_id uuid,
  p_test_email  text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id uuid := auth.uid();
  v_role     text := public.auth_user_role();
begin
  if v_role not in ('Owner', 'Admin', 'Manager') then
    raise exception 'Permission denied: only Owner, Admin, and Manager can test offer campaigns'
      using errcode = '42501';
  end if;

  if p_test_email is null or trim(p_test_email) = '' then
    raise exception 'Test recipient email is required' using errcode = '22023';
  end if;

  update public.offer_campaigns
  set
    status               = 'test_sent',
    test_recipient_email = trim(p_test_email),
    test_sent_at         = now(),
    updated_at           = now()
  where id = p_campaign_id
    and status in ('draft', 'test_sent');

  if not found then
    raise exception 'Campaign % not found or not in draft status', p_campaign_id using errcode = 'P0002';
  end if;

  -- Audit test send
  insert into public.audit_events (
    client_uuid, event_class, category, module, action, severity, status,
    table_name, record_id, actor_id, actor_role, branch_id, new_values
  ) values (
    gen_random_uuid(),
    'status change',
    'Administration',
    'Clients',
    'Update',
    'Informational',
    'Success',
    'offer_campaigns',
    p_campaign_id,
    v_actor_id,
    v_role::system_role,
    '00000000-0000-0000-0000-000000000001'::uuid,
    jsonb_build_object('test_email', trim(p_test_email), 'test_sent_at', now())
  );

  return true;
end;
$$;

revoke all on function public.record_offer_campaign_test_send(uuid, text) from public;
grant execute on function public.record_offer_campaign_test_send(uuid, text) to authenticated;

-- =============================================================================
-- RPC: queue_offer_campaign
-- Resolves recipient roster in SQL, enforces consent, pre-flight test gate, and generates tokens (K6)
-- =============================================================================
create or replace function public.queue_offer_campaign(
  p_campaign_id uuid,
  p_client_uuid uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id   uuid := auth.uid();
  v_role       text := public.auth_user_role();
  v_campaign   public.offer_campaigns%rowtype;
  v_count      integer := 0;
  v_client     record;
  v_raw_token  text;
  v_token_hash text;
begin
  -- 1. Role verification: Owner, Admin, Manager only (B43)
  if v_role not in ('Owner', 'Admin', 'Manager') then
    raise exception 'Permission denied: only Owner, Admin, and Manager can broadcast offer campaigns'
      using errcode = '42501';
  end if;

  -- 2. Advisory lock on campaign to stop concurrent double-send races
  perform pg_advisory_xact_lock(hashtext('campaign:' || p_campaign_id::text));

  -- 3. Fetch campaign
  select * into v_campaign
  from public.offer_campaigns
  where id = p_campaign_id;

  if not found then
    raise exception 'Campaign % not found', p_campaign_id using errcode = 'P0002';
  end if;

  -- Idempotency check: if already queued or sent, return existing status without re-queueing
  if v_campaign.status in ('queued', 'sending', 'completed') then
    return jsonb_build_object(
      'campaign_id', v_campaign.id,
      'status', v_campaign.status,
      'recipient_count', v_campaign.recipient_count,
      'idempotent_replay', true
    );
  end if;

  -- 4. Mandatory pre-flight test gate: must be test_sent
  if v_campaign.status <> 'test_sent' or v_campaign.test_sent_at is null then
    raise exception 'A test email must be sent to the author before broadcasting to clients'
      using errcode = 'P0001';
  end if;

  -- 5. Compile recipient population in PostgreSQL (Law 1, data privacy)
  for v_client in
    select
      c.id as client_id,
      trim(c.email) as email,
      coalesce(nullif(trim(c.name), ''), 'Valued Client') as client_name
    from public.clients c
    left join public.client_marketing_consents cmc
      on cmc.client_id = c.id and cmc.channel = 'Email'
    where c.status = 'Active'
      and c.email is not null
      and trim(c.email) <> ''
      and coalesce(cmc.state, 'Not asked') not in ('Opted out', 'Opt-Out', 'Do Not Disturb')
      and (
        v_campaign.audience_filter is null
        or v_campaign.audience_filter = '{}'::jsonb
        or (
          (v_campaign.audience_filter->>'tag' is null or (c.tags is not null and c.tags @> array[v_campaign.audience_filter->>'tag']::text[]))
          and (v_campaign.audience_filter->>'membership_plan_id' is null or exists (
            select 1 from public.client_memberships cm
            where cm.client_id = c.id
              and cm.plan_id::text = (v_campaign.audience_filter->>'membership_plan_id')
              and cm.superseded_at is null
          ))
        )
      )
  loop
    -- Cryptographic token generation: 128-bit raw token, SHA-256 hashed in database (K6)
    v_raw_token := substr(replace(gen_random_uuid()::text, '-', ''), 1, 32);
    v_token_hash := encode(sha256(convert_to(v_raw_token, 'UTF8')), 'hex');

    insert into public.offer_campaign_recipients (
      campaign_id,
      client_id,
      recipient_email,
      recipient_name,
      unsubscribe_token_hash,
      status
    ) values (
      v_campaign.id,
      v_client.client_id,
      v_client.email,
      v_client.client_name,
      v_token_hash,
      'pending'
    )
    on conflict (campaign_id, client_id) do nothing;

    v_count := v_count + 1;
  end loop;

  -- 6. Transition campaign to queued
  update public.offer_campaigns
  set
    status          = 'queued',
    recipient_count = v_count,
    queued_at       = now(),
    updated_at      = now()
  where id = v_campaign.id;

  -- 7. Audit log
  insert into public.audit_events (
    client_uuid, event_class, category, module, action, severity, status,
    table_name, record_id, actor_id, actor_role, branch_id, new_values
  ) values (
    p_client_uuid,
    'status change',
    'Administration',
    'Clients',
    'Update',
    'Informational',
    'Success',
    'offer_campaigns',
    v_campaign.id,
    v_actor_id,
    v_role::system_role,
    '00000000-0000-0000-0000-000000000001'::uuid,
    jsonb_build_object('recipient_count', v_count, 'queued_at', now())
  );

  return jsonb_build_object(
    'campaign_id', v_campaign.id,
    'status', 'queued',
    'recipient_count', v_count,
    'idempotent_replay', false
  );
end;
$$;

revoke all on function public.queue_offer_campaign(uuid, uuid) from public;
grant execute on function public.queue_offer_campaign(uuid, uuid) to authenticated;

-- =============================================================================
-- RPC: process_client_unsubscribe
-- Unauthenticated / public one-click unsubscribe endpoint (K6)
-- Opts out across Email, SMS, WhatsApp marketing while leaving transactional notices intact
-- =============================================================================
create or replace function public.process_client_unsubscribe(
  p_raw_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_hash      text;
  v_recipient record;
  v_channel   channel_code;
begin
  if p_raw_token is null or trim(p_raw_token) = '' then
    return jsonb_build_object('ok', true, 'message', 'You have been unsubscribed.');
  end if;

  v_hash := encode(sha256(convert_to(trim(p_raw_token), 'UTF8')), 'hex');

  select r.id, r.campaign_id, r.client_id
  into v_recipient
  from public.offer_campaign_recipients r
  where r.unsubscribe_token_hash = v_hash;

  if found then
    -- 1. Mark recipient row unsubscribed
    update public.offer_campaign_recipients
    set status = 'unsubscribed'
    where id = v_recipient.id;

    -- 2. Increment campaign unsubscribed_count
    update public.offer_campaigns
    set unsubscribed_count = unsubscribed_count + 1
    where id = v_recipient.campaign_id;

    -- 3. Upsert marketing consent opt-out for all marketing channels (Email, SMS, WhatsApp)
    -- This enforces multi-channel marketing opt-out while keeping transactional notices intact.
    foreach v_channel in array array['Email', 'SMS', 'WhatsApp']::channel_code[]
    loop
      insert into public.client_marketing_consents (
        client_uuid,
        client_id,
        channel,
        state,
        opted_out_at,
        opt_out_origin_channel,
        updated_at
      ) values (
        gen_random_uuid(),
        v_recipient.client_id,
        v_channel,
        'Opted out',
        now(),
        'Email',
        now()
      )
      on conflict (client_id, channel) do update set
        state                  = 'Opted out',
        opted_out_at           = now(),
        opt_out_origin_channel = 'Email',
        updated_at             = now();
    end loop;
  end if;

  -- Always return success to fail closed without leaking token existence
  return jsonb_build_object(
    'ok', true,
    'message', 'You have been successfully unsubscribed from Babin Rentals marketing communications.'
  );
end;
$$;

revoke all on function public.process_client_unsubscribe(text) from public, anon;
grant execute on function public.process_client_unsubscribe(text) to authenticated, service_role;

commit;
