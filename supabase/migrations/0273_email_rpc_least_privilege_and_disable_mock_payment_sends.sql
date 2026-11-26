-- 0273_email_rpc_least_privilege_and_disable_mock_payment_sends.sql
-- Prepared 2026-11-26. Staging-first, reviewed release only.
-- Privileged email RPCs must only be reached via service_role Edge Functions.
-- No real email or simulated email is sent by this migration.
begin;

-- The existing processor can create WhatsApp DRAFT tasks, but does not have
-- an SMTP/Resend transport. Preserve pause/settled checks and Whatsapp tasks;
-- keep email reminders pending until a real outbox worker processes them.
create or replace function public.process_due_payment_reminders(
  p_limit int default 50
)
returns table (
  reminder_id uuid,
  booking_id uuid,
  client_id uuid,
  sequence int,
  channel text,
  status text,
  recipient_email text,
  recipient_phone text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  r record;
  v_outstanding numeric(14,2);
  v_paused boolean;
  v_next_seq int;
  v_next_interval interval;
begin
  for r in
    select pr.*, b.booking_no
    from public.payment_reminders pr
    join public.bookings b on b.id = pr.booking_id
    where pr.status = 'pending'
      and pr.due_at <= now()
    order by pr.due_at asc
    limit p_limit
    for update skip locked
  loop
    -- 1. Check if client is paused
    select coalesce(c.reminders_paused, false)
    into v_paused
    from public.clients c
    where c.id = r.client_id;

    if v_paused then
      update public.payment_reminders
      set status = 'cancelled',
          error_message = 'Reminders paused by staff for client',
          updated_at = now()
      where id = r.id;
      continue;
    end if;

    -- 2. Check if balance is settled
    select coalesce(sum(inv.outstanding_amount), 0)
    into v_outstanding
    from public.invoices inv
    where inv.booking_id = r.booking_id
      and inv.status not in ('Void');

    if v_outstanding <= 0 then
      update public.payment_reminders
      set status = 'cancelled',
          error_message = 'Balance fully settled',
          updated_at = now()
      where id = r.id;
      continue;
    end if;

    -- 3. Dispatch
    if r.channel = 'whatsapp_draft' then
      update public.payment_reminders
      set status = 'draft_ready',
          sent_at = now(),
          outstanding_amount = v_outstanding,
          updated_at = now()
      where id = r.id;

      perform public.notify_staff(
        'general',
        'WhatsApp Draft Ready: payment_reminder',
        'Client ' || coalesce(r.recipient_name, 'Client') || ' for booking ' || r.booking_no || ' has no email. WhatsApp draft ready to send.',
        'Client ' || coalesce(r.recipient_name, 'Client') || ' for booking ' || r.booking_no || ' has no email. WhatsApp draft ready to send.',
        '/rentals/' || r.booking_id,
        'booking',
        r.booking_no
      );

      reminder_id := r.id;
      booking_id := r.booking_id;
      client_id := r.client_id;
      sequence := r.sequence;
      channel := r.channel;
      status := 'draft_ready';
      recipient_email := r.recipient_email;
      recipient_phone := r.recipient_phone;
      return next;

    elsif r.channel = 'email' then
      -- SECURITY: This SQL worker has no email provider. Leave the reminder
      -- pending until a separate, verified Resend outbox worker is approved.
      -- Never mint an email_log 'mock_sent' entry or mark it 'sent' here.
      -- Paused or settled reminders have already been cancelled above.
      continue;
    end if;

    -- 4. Schedule next reminder (W18: completion, day 5, day 10, then every 5 days)
    if v_outstanding > 0 and not v_paused then
      v_next_seq := r.sequence + 1;
      v_next_interval := interval '5 days';

      insert into public.payment_reminders (
        client_uuid, booking_id, client_id, sequence, channel, status, due_at,
        recipient_name, recipient_email, recipient_phone, outstanding_amount
      ) values (
        gen_random_uuid(), r.booking_id, r.client_id, v_next_seq, r.channel, 'pending',
        r.due_at + v_next_interval,
        r.recipient_name, r.recipient_email, r.recipient_phone, v_outstanding
      )
      on conflict (booking_id, sequence)
      do nothing;
    end if;
  end loop;
end;
$$;


-- Lock down SECURITY DEFINER SQL endpoints. RLS does NOT protect a function.
-- Do NOT remove service_role privileges used by Edge Functions.
revoke execute on function public.build_email_payload(text, uuid, text) from public, anon, authenticated;
revoke execute on function public.record_email_send(text, text, uuid, text, text, text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.process_due_payment_reminders(integer) from public, anon, authenticated;
revoke execute on function public.process_client_unsubscribe(text) from public, anon, authenticated;

grant execute on function public.build_email_payload(text, uuid, text) to service_role;
grant execute on function public.record_email_send(text, text, uuid, text, text, text, text, text, jsonb) to service_role;
grant execute on function public.process_due_payment_reminders(integer) to service_role;
grant execute on function public.process_client_unsubscribe(text) to service_role;

commit;
