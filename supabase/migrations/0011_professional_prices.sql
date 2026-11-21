-- Prices and durations per professional, and the price kept on each booking.
-- Run after 0009 (this replaces create_booking and move_booking_by_client).

-- Optional: a professional charges a different price, takes a different time,
-- or doesn't do a service at all. Without a row, the service's own values apply.
create table service_overrides (
  service_id uuid not null references services(id) on delete cascade,
  professional_id uuid not null references professionals(id) on delete cascade,
  salon_id uuid not null references salons(id) on delete cascade,
  offered boolean not null default true,
  price_cents int check (price_cents is null or price_cents between 0 and 100000),
  duration_min int check (duration_min is null or duration_min between 5 and 600),
  primary key (service_id, professional_id)
);
alter table service_overrides enable row level security;
create policy overrides_public_read on service_overrides for select using (true);
create policy overrides_owner_write on service_overrides for all
  using (is_owner(salon_id)) with check (is_owner(salon_id));

-- The price at the time of booking, so revenue doesn't change when prices do.
alter table bookings add column price_cents int;
update bookings b set price_cents = s.price_cents from services s where s.id = b.service_id and b.price_cents is null;

-- Price and duration for a service with a given professional; null when they don't do it.
create function effective_service(p_service uuid, p_professional uuid)
returns table (price_cents int, duration_min int)
language sql stable security definer set search_path = public as $$
  select coalesce(o.price_cents, s.price_cents), coalesce(o.duration_min, s.duration_min)
  from services s
  left join service_overrides o on o.service_id = s.id and o.professional_id = p_professional
  where s.id = p_service and s.active and coalesce(o.offered, true);
$$;

create or replace function create_booking(
  p_salon uuid, p_service uuid, p_professional uuid, p_starts_at timestamptz,
  p_client_name text, p_client_phone text, p_consent boolean
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_duration int;
  v_price int;
  v_deposit int;
  v_id uuid;
begin
  perform 1 from services where id = p_service and salon_id = p_salon and active;
  if not found then raise exception 'servico_invalido'; end if;
  perform 1 from professionals where id = p_professional and salon_id = p_salon and active;
  if not found then raise exception 'profissional_invalido'; end if;
  select e.price_cents, e.duration_min into v_price, v_duration from effective_service(p_service, p_professional) e;
  if v_duration is null then raise exception 'servico_invalido'; end if;
  if p_starts_at < now() then raise exception 'horario_passado'; end if;
  if length(trim(p_client_name)) = 0 or length(trim(p_client_phone)) < 9 then
    raise exception 'dados_cliente';
  end if;
  if is_time_off(p_professional, p_starts_at, p_starts_at + make_interval(mins => v_duration)) then
    raise exception 'horario_ocupado';
  end if;
  select deposit_cents into v_deposit from salons where id = p_salon;

  insert into bookings (salon_id, service_id, professional_id, starts_at, ends_at,
                        client_name, client_phone, consent_messages, deposit, price_cents)
  values (p_salon, p_service, p_professional, p_starts_at,
          p_starts_at + make_interval(mins => v_duration),
          trim(p_client_name), trim(p_client_phone), coalesce(p_consent, false),
          case when v_deposit > 0 then 'pendente'::deposit_status else 'nenhum' end, v_price)
  returning id into v_id;
  return v_id;
exception when exclusion_violation then
  raise exception 'horario_ocupado';
end;
$$;

-- A moved booking keeps its own length.
create or replace function move_booking_by_client(p_booking uuid, p_starts_at timestamptz) returns void
language plpgsql security definer set search_path = public as $$
declare
  b bookings;
  v_length interval;
begin
  b := client_change_check(p_booking);
  if p_starts_at < now() then raise exception 'horario_passado'; end if;
  v_length := b.ends_at - b.starts_at;
  if is_time_off(b.professional_id, p_starts_at, p_starts_at + v_length) then
    raise exception 'horario_ocupado';
  end if;
  update bookings set starts_at = p_starts_at, ends_at = p_starts_at + v_length,
         status = 'pendente', client_action = 'mudou', client_action_at = now(), reminder_sent_at = null
  where id = p_booking;
exception when exclusion_violation then
  raise exception 'horario_ocupado';
end;
$$;

-- The client's page shows the booking's own price and length.
create or replace function booking_for_client(p_booking uuid)
returns table (
  id uuid, status booking_status, deposit deposit_status, starts_at timestamptz, ends_at timestamptz,
  client_name text, salon_id uuid, salon_slug text, salon_name text, salon_theme text,
  salon_timezone text, salon_whatsapp text, mbway_number text, deposit_cents int,
  client_change_hours smallint, service_id uuid, service_name text, duration_min int,
  price_cents int, professional_id uuid, professional_name text
)
language sql stable security definer set search_path = public as $$
  select b.id, b.status, b.deposit, b.starts_at, b.ends_at, b.client_name,
         s.id, s.slug, s.name, s.theme, s.timezone, s.whatsapp, s.mbway_number, s.deposit_cents,
         s.client_change_hours, sv.id, sv.name,
         (extract(epoch from (b.ends_at - b.starts_at)) / 60)::int,
         coalesce(b.price_cents, sv.price_cents), p.id, p.name
  from bookings b
  join salons s on s.id = b.salon_id
  join services sv on sv.id = b.service_id
  join professionals p on p.id = b.professional_id
  where b.id = p_booking;
$$;
