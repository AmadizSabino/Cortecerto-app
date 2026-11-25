-- 1. A daily limit per person on the client AI features (try-on, cut suggestions), on top of the
--    monthly limit per salon. Clients don't sign in, so the Worker keeps two keyed hashes on each
--    request: one of the phone (a random id the booking page keeps) and one of the internet
--    connection. They are cleared after two days by the Worker's daily job.
-- 2. Phone notifications (Web Push) for the salon: a new booking, online or made by someone else
--    in the salon, shows up on the lock screen of everyone in the salon who switched it on.
--    Free: it goes through the phone's own push service, no WhatsApp or SMS costs.

-- 1. ---------------------------------------------------------------------------
alter table ai_requests add column client_device text check (length(client_device) <= 64);
alter table ai_requests add column client_ip text check (length(client_ip) <= 64);
create index ai_requests_client_device on ai_requests (client_device, created_at) where client_device is not null;
create index ai_requests_client_ip on ai_requests (client_ip, created_at) where client_ip is not null;

-- 2. ---------------------------------------------------------------------------
-- The app's own push key pair (VAPID). Made by the Worker on first use; only the service role reads it.
create table push_vapid (
  id boolean primary key default true check (id),
  public_key text not null,
  private_jwk jsonb not null,
  created_at timestamptz not null default now()
);
alter table push_vapid enable row level security; -- no policies: service role only

-- One row per phone or computer that switched notifications on.
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references salons(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique check (length(endpoint) <= 1000),
  p256dh text not null check (length(p256dh) <= 200),
  auth text not null check (length(auth) <= 100),
  created_at timestamptz not null default now()
);
create index push_subscriptions_salon on push_subscriptions (salon_id);
alter table push_subscriptions enable row level security;
-- Each person sees only their own devices (to show "ligado" in the app). Written through the functions below.
create policy push_subscriptions_own on push_subscriptions for select using (user_id = auth.uid());

-- Only the browsers' own push services, so the Worker never posts anywhere else.
create function push_endpoint_ok(p text) returns boolean language sql immutable as $$
  select p ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)/'
$$;

create function save_push_subscription(p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = public as $$
declare s uuid;
begin
  select salon_id into s from my_salon();
  if s is null then raise exception 'sem_salao'; end if;
  if not push_endpoint_ok(p_endpoint) then raise exception 'endereco_invalido'; end if;
  insert into push_subscriptions (salon_id, user_id, endpoint, p256dh, auth)
  values (s, auth.uid(), p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update set salon_id = excluded.salon_id, user_id = excluded.user_id,
    p256dh = excluded.p256dh, auth = excluded.auth, created_at = now();
end $$;
revoke execute on function save_push_subscription(text, text, text) from public, anon;
grant execute on function save_push_subscription(text, text, text) to authenticated;

create function delete_push_subscription(p_endpoint text) returns void
language sql security definer set search_path = public as $$
  delete from push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
$$;
revoke execute on function delete_push_subscription(text) from public, anon;
grant execute on function delete_push_subscription(text) to authenticated;

-- Each booking is announced once, in its first 10 minutes. p_by is the person who made it in the
-- panel (null for an online booking): they must belong to the salon, and they are not notified.
alter table bookings add column push_notified_at timestamptz;

create function claim_booking_push(p_booking uuid, p_by uuid) returns table (
  salon_id uuid, owner_id uuid, salon_timezone text, source text,
  client_name text, service_name text, professional_name text, price_cents int, starts_at timestamptz,
  made_today int, best_day_before int
)
language sql security definer set search_path = public as $$
  with claimed as (
    update bookings b set push_notified_at = now()
    where b.id = p_booking and b.push_notified_at is null and not b.demo
      and b.created_at > now() - interval '10 minutes'
      and (p_by is null or exists (
        select 1 from salons s where s.id = b.salon_id and s.owner_id = p_by
        union all
        select 1 from salon_members m where m.salon_id = b.salon_id and m.user_id = p_by))
    returning b.*
  )
  select c.salon_id, s.owner_id, s.timezone, c.source, c.client_name, sv.name, p.name,
         coalesce(c.price_cents, sv.price_cents), c.starts_at,
         (select count(*)::int from bookings t where t.salon_id = c.salon_id and not t.demo
            and t.status <> 'cancelada'
            and (t.created_at at time zone s.timezone)::date = (now() at time zone s.timezone)::date),
         coalesce((select max(n)::int from (
            select count(*) n from bookings t where t.salon_id = c.salon_id and not t.demo
              and t.created_at > now() - interval '90 days'
              and (t.created_at at time zone s.timezone)::date < (now() at time zone s.timezone)::date
            group by (t.created_at at time zone s.timezone)::date) d), 0)
  from claimed c
  join salons s on s.id = c.salon_id
  join services sv on sv.id = c.service_id
  join professionals p on p.id = c.professional_id;
$$;
revoke execute on function claim_booking_push(uuid, uuid) from public, anon, authenticated;
grant execute on function claim_booking_push(uuid, uuid) to service_role;
