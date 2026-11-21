-- Email to the salon owner when a client cancels or moves a booking (sent by the Worker).
-- Like 0005: only the service role can claim, once per client action, within 10 minutes.
-- Run after 0007.

alter table bookings add column client_change_notified_at timestamptz;

create function claim_client_change_notification(p_booking uuid)
returns table (
  owner_email text, salon_name text, salon_timezone text, action text,
  client_name text, client_phone text, service_name text, professional_name text, starts_at timestamptz
)
language sql security definer set search_path = public as $$
  with claimed as (
    update bookings b set client_change_notified_at = now()
    where b.id = p_booking and b.client_action is not null
      and b.client_action_at > now() - interval '10 minutes'
      and (b.client_change_notified_at is null or b.client_change_notified_at < b.client_action_at)
    returning b.*
  )
  select u.email::text, s.name, s.timezone, c.client_action,
         c.client_name, c.client_phone, sv.name, p.name, c.starts_at
  from claimed c
  join salons s on s.id = c.salon_id
  join auth.users u on u.id = s.owner_id
  join services sv on sv.id = c.service_id
  join professionals p on p.id = c.professional_id;
$$;

revoke execute on function claim_client_change_notification(uuid) from public, anon, authenticated;
grant execute on function claim_client_change_notification(uuid) to service_role;
