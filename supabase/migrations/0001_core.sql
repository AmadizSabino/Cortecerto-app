-- CorteCerto core schema: salons, services, professionals, hours, bookings.
-- Run in the Supabase SQL editor (or `supabase db push`).

create extension if not exists btree_gist;

create type salon_type as enum ('barbearia', 'cabeleireiro', 'unhas', 'depilacao');
create type booking_status as enum ('pendente', 'confirmada', 'concluida', 'faltou', 'cancelada');
create type deposit_status as enum ('nenhum', 'pendente', 'pago');

create table salons (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,40}$'),
  name text not null,
  type salon_type not null,
  whatsapp text,                -- salon's WhatsApp number, e.g. 351912345678
  mbway_number text,            -- deposits go straight to the salon
  deposit_cents int not null default 0 check (deposit_cents >= 0),
  theme text not null default 'classico',
  timezone text not null default 'Europe/Lisbon',
  created_at timestamptz not null default now()
);

create table professionals (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references salons(id) on delete cascade,
  name text not null,
  active boolean not null default true
);

create table services (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references salons(id) on delete cascade,
  name text not null,
  duration_min int not null check (duration_min between 5 and 600),
  price_cents int not null check (price_cents >= 0), -- always set by the salon
  active boolean not null default true
);

-- Weekly opening hours per salon. weekday: 0 = Sunday ... 6 = Saturday.
create table opening_hours (
  salon_id uuid not null references salons(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  opens time not null,
  closes time not null check (closes > opens),
  primary key (salon_id, weekday, opens)
);

create table bookings (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references salons(id) on delete cascade,
  service_id uuid not null references services(id),
  professional_id uuid not null references professionals(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  client_name text not null,
  client_phone text not null,
  consent_messages boolean not null default false, -- opt-in, never pre-ticked
  status booking_status not null default 'pendente',
  deposit deposit_status not null default 'nenhum',
  created_at timestamptz not null default now(),
  -- No double booking of the same professional (cancelled/no-show free the slot).
  constraint no_overlap exclude using gist (
    professional_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status in ('pendente', 'confirmada', 'concluida'))
);
create index bookings_salon_day on bookings (salon_id, starts_at);

-- Row level security ---------------------------------------------------------
alter table salons enable row level security;
alter table professionals enable row level security;
alter table services enable row level security;
alter table opening_hours enable row level security;
alter table bookings enable row level security;

create function is_owner(s uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from salons where id = s and owner_id = auth.uid());
$$;

-- Public pages can read a salon's profile, services, team and hours.
create policy salons_public_read on salons for select using (true);
create policy salons_owner_write on salons for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy prof_public_read on professionals for select using (true);
create policy prof_owner_write on professionals for all
  using (is_owner(salon_id)) with check (is_owner(salon_id));

create policy svc_public_read on services for select using (true);
create policy svc_owner_write on services for all
  using (is_owner(salon_id)) with check (is_owner(salon_id));

create policy hours_public_read on opening_hours for select using (true);
create policy hours_owner_write on opening_hours for all
  using (is_owner(salon_id)) with check (is_owner(salon_id));

-- Bookings hold client data: only the salon owner reads or edits them.
create policy bookings_owner on bookings for all
  using (is_owner(salon_id)) with check (is_owner(salon_id));

-- Public RPCs -------------------------------------------------------------
-- Busy intervals for a salon on a date range, without any client data.
create function busy_slots(p_salon uuid, p_from timestamptz, p_to timestamptz)
returns table (professional_id uuid, starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = public as $$
  select b.professional_id, b.starts_at, b.ends_at
  from bookings b
  where b.salon_id = p_salon
    and b.status in ('pendente', 'confirmada', 'concluida')
    and b.starts_at < p_to and b.ends_at > p_from;
$$;

-- Clients book without an account. The service sets the duration server-side.
create function create_booking(
  p_salon uuid, p_service uuid, p_professional uuid, p_starts_at timestamptz,
  p_client_name text, p_client_phone text, p_consent boolean
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_duration int;
  v_deposit int;
  v_id uuid;
begin
  select duration_min into v_duration from services
    where id = p_service and salon_id = p_salon and active;
  if v_duration is null then raise exception 'servico_invalido'; end if;
  perform 1 from professionals where id = p_professional and salon_id = p_salon and active;
  if not found then raise exception 'profissional_invalido'; end if;
  if p_starts_at < now() then raise exception 'horario_passado'; end if;
  if length(trim(p_client_name)) = 0 or length(trim(p_client_phone)) < 9 then
    raise exception 'dados_cliente';
  end if;
  select deposit_cents into v_deposit from salons where id = p_salon;

  insert into bookings (salon_id, service_id, professional_id, starts_at, ends_at,
                        client_name, client_phone, consent_messages, deposit)
  values (p_salon, p_service, p_professional, p_starts_at,
          p_starts_at + make_interval(mins => v_duration),
          trim(p_client_name), trim(p_client_phone), coalesce(p_consent, false),
          case when v_deposit > 0 then 'pendente'::deposit_status else 'nenhum' end)
  returning id into v_id;
  return v_id;
exception when exclusion_violation then
  raise exception 'horario_ocupado';
end;
$$;

grant execute on function busy_slots(uuid, timestamptz, timestamptz) to anon, authenticated;
grant execute on function create_booking(uuid, uuid, uuid, timestamptz, text, text, boolean) to anon, authenticated;
