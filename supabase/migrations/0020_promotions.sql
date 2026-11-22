-- 0020: promotions tied to the agenda. A promotion has its own booking link
-- (/s/<salon>?promo=<code>), days, hours, services and dates; bookings made through it
-- get the discount and are counted, so the salon sees what each promotion brought in.
-- Run once, after 0019.

create table promotions (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references salons(id) on delete cascade,
  code text not null check (code ~ '^[a-z0-9-]{3,40}$'),
  title text not null check (length(trim(title)) between 1 and 80),
  message text not null default '' check (length(message) <= 1200), -- the post's caption
  -- percentagem: % off; montante: € off; oferta: price unchanged, plus a gift (e.g. "barba grátis")
  kind text not null check (kind in ('percentagem', 'montante', 'oferta')),
  percent int check (percent is null or percent between 1 and 90),
  amount_cents int check (amount_cents is null or amount_cents > 0),
  gift text check (gift is null or length(gift) <= 80),
  service_ids uuid[],                 -- null: every service
  weekdays smallint[],                -- 0 = Sunday … 6 = Saturday; null: every day
  time_from time, time_to time,       -- in the salon's time zone; null: all day
  starts_on date not null default current_date,
  ends_on date,
  active boolean not null default true,
  image_path text,                    -- the salon's own picture for the post (bucket salon-media)
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (kind <> 'percentagem' or percent is not null),
  check (kind <> 'montante' or amount_cents is not null),
  check (kind <> 'oferta' or gift is not null),
  check (ends_on is null or ends_on >= starts_on),
  check ((time_from is null) = (time_to is null) and (time_from is null or time_to > time_from)),
  unique (salon_id, code)
);
alter table promotions enable row level security;
-- A promotion is public by nature (it is posted); clients' booking page reads it.
create policy promos_public_read on promotions for select using (true);
create policy promos_manager_write on promotions for all using (has_access(salon_id, 'gestor')) with check (has_access(salon_id, 'gestor'));

alter table bookings add column promotion_id uuid references promotions(id) on delete set null;
alter table bookings add column price_before_cents int; -- the price before the promotion

-- Whether a promotion covers this service at this time.
create function promo_applies(p promotions, p_service uuid, p_starts_at timestamptz) returns boolean
language sql stable set search_path = public as $$
  select p.active
     and (p.service_ids is null or p_service = any(p.service_ids))
     and (p_starts_at at time zone s.timezone)::date >= p.starts_on
     and (p.ends_on is null or (p_starts_at at time zone s.timezone)::date <= p.ends_on)
     and (p.weekdays is null or extract(dow from p_starts_at at time zone s.timezone)::smallint = any(p.weekdays))
     and (p.time_from is null or ((p_starts_at at time zone s.timezone)::time >= p.time_from
                                  and (p_starts_at at time zone s.timezone)::time < p.time_to))
  from salons s where s.id = p.salon_id;
$$;

-- Price after the promotion.
create function promo_price(p promotions, p_price int) returns int
language sql immutable as $$
  select case p.kind
    when 'percentagem' then round(p_price * (100 - p.percent) / 100.0)::int
    when 'montante' then greatest(0, p_price - p.amount_cents)
    else p_price end;
$$;

-- Booking through a promotion's link: books as usual, then applies the promotion when it
-- covers that service and time (otherwise the booking stands at the normal price).
create function create_booking_with_promo(
  p_salon uuid, p_service uuid, p_professional uuid, p_starts_at timestamptz,
  p_client_name text, p_client_phone text, p_consent boolean, p_promo uuid
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  p promotions;
  b bookings;
begin
  v_id := create_booking(p_salon, p_service, p_professional, p_starts_at, p_client_name, p_client_phone, p_consent);
  select * into p from promotions where id = p_promo and salon_id = p_salon;
  if found and promo_applies(p, p_service, p_starts_at) then
    select * into b from bookings where id = v_id;
    update bookings set promotion_id = p.id, price_before_cents = b.price_cents, price_cents = promo_price(p, b.price_cents)
    where id = v_id;
  end if;
  return v_id;
end;
$$;
grant execute on function create_booking_with_promo(uuid, uuid, uuid, timestamptz, text, text, boolean, uuid) to anon, authenticated;
