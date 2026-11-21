-- Email to the salon owner for each new booking, sent by the Cloudflare Worker.
-- The Worker calls claim_booking_notification with the service role key (a secret
-- kept in Cloudflare). Each booking can be claimed once, and only in its first
-- 10 minutes, so the endpoint can't be used to send repeated or old emails.

alter table bookings add column owner_notified_at timestamptz;

create function claim_booking_notification(p_booking uuid)
returns table (
  owner_email text, salon_name text, salon_timezone text,
  client_name text, client_phone text, consent_messages boolean,
  service_name text, price_cents int, professional_name text,
  starts_at timestamptz, deposit deposit_status
)
language sql security definer set search_path = public as $$
  with claimed as (
    update bookings b set owner_notified_at = now()
    where b.id = p_booking and b.owner_notified_at is null
      and b.created_at > now() - interval '10 minutes'
    returning b.*
  )
  select u.email::text, s.name, s.timezone,
         c.client_name, c.client_phone, c.consent_messages,
         sv.name, sv.price_cents, p.name, c.starts_at, c.deposit
  from claimed c
  join salons s on s.id = c.salon_id
  join auth.users u on u.id = s.owner_id
  join services sv on sv.id = c.service_id
  join professionals p on p.id = c.professional_id;
$$;

-- Only the Worker (service role) may call it: it returns the owner's email.
revoke execute on function claim_booking_notification(uuid) from public, anon, authenticated;
grant execute on function claim_booking_notification(uuid) to service_role;
