set local lock_timeout = '3s';
alter policy booking_requests_client_select on public.booking_requests using (requester_auth_uid = (select auth.uid()));
alter policy booking_request_lines_client_select on public.booking_request_lines using (exists (select 1 from public.booking_requests r where r.id=booking_request_lines.request_id and r.requester_auth_uid=(select auth.uid())));
alter policy online_profiles_self on public.online_profiles using (auth_uid=(select auth.uid())) with check (auth_uid=(select auth.uid()));
alter policy calendar_feed_tokens_self_read on public.calendar_feed_tokens using ((select auth.uid())=user_id);
alter policy portal_link_requests_self_insert on public.portal_link_requests with check (auth_user_id=(select auth.uid()));
alter policy portal_link_requests_self_read on public.portal_link_requests using (auth_user_id=(select auth.uid()));
alter policy portal_users_self_read on public.portal_users using (auth_user_id=(select auth.uid()));
alter policy payment_intents_client_select on public.payment_intents using ((requester_auth_uid=(select auth.uid())) or exists(select 1 from public.booking_requests br where br.id=payment_intents.booking_request_id and br.requester_auth_uid=(select auth.uid())));
