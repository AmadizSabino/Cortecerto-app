-- Each professional's own weekly hours, and time off (holidays, days off, blocked hours).
-- Run after 0007 (this replaces move_booking_by_client).

-- A professional with rows here works these hours; one without rows follows the
-- salon's opening hours. Several rows on one weekday make a break (e.g. lunch).
create table professional_hours (
  professional_id uuid not null references professionals(id) on delete cascade,
  salon_id uuid not null references salons(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  opens time not null,
  closes time not null check (closes > opens),
  primary key (professional_id, weekday, opens)
);

-- Time nobody can book. professional_id null: the whole salon (e.g. a holiday).
create table time_off (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references salons(id) on delete cascade,
  professional_id uuid references professionals(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  reason text check (length(reason) <= 80),
  created_at timestamptz not null default now()
);
create index time_off_salon on time_off (salon_id, starts_at);

alter table professional_hours enable row level security;
alter table time_off enable row level security;

-- Hours are public, like the salon's opening hours, so the booking page can show free times.
create policy pro_hours_public_read on professional_hours for select using (true);
create policy pro_hours_owner_write on professional_hours for all
  using (is_owner(salon_id)) with check (is_owner(salon_id));
-- Time off is private (the reason is the salon's business); clients only see it as busy time.
create policy time_off_owner on time_off for all using (is_owner(salon_id)) with check (is_owner(salon_id));

-- Busy time now includes time off, without its reason. Salon-wide time off is
-- returned once per professional.
create or replace function busy_slots(p_salon uuid, p_from timestamptz, p_to timestamptz)
returns table (professional_id uuid, starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = public as $$
  select b.professional_id, b.starts_at, b.ends_at
  from bookings b
  where b.salon_id = p_salon
    and b.status in ('pendente', 'confirmada', 'concluida')
    and b.starts_at < p_to and b.ends_at > p_from
  union all
  select p.id, t.starts_at, t.ends_at
  from time_off t
  join professionals p on p.salon_id = t.salon_id and (t.professional_id is null or t.professional_id = p.id)
  where t.salon_id = p_salon and t.starts_at < p_to and t.ends_at > p_from;
$$;

-- True when the professional has time off overlapping the interval.
create function is_time_off(p_professional uuid, p_from timestamptz, p_to timestamptz) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from time_off t join professionals p on p.id = p_professional
    where t.salon_id = p.salon_id and (t.professional_id is null or t.professional_id = p_professional)
      and t.starts_at < p_to and t.ends_at > p_from
  );
$$;
revoke execute on function is_time_off(uuid, timestamptz, timestamptz) from public, anon, authenticated;

-- Client bookings and moves can't land on time off.
create or replace function create_booking(
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
  if is_time_off(p_professional, p_starts_at, p_starts_at + make_interval(mins => v_duration)) then
    raise exception 'horario_ocupado';
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

create or replace function move_booking_by_client(p_booking uuid, p_starts_at timestamptz) returns void
language plpgsql security definer set search_path = public as $$
declare
  b bookings;
  v_duration int;
begin
  b := client_change_check(p_booking);
  if p_starts_at < now() then raise exception 'horario_passado'; end if;
  select duration_min into v_duration from services where id = b.service_id;
  if is_time_off(b.professional_id, p_starts_at, p_starts_at + make_interval(mins => v_duration)) then
    raise exception 'horario_ocupado';
  end if;
  update bookings set starts_at = p_starts_at, ends_at = p_starts_at + make_interval(mins => v_duration),
         status = 'pendente', client_action = 'mudou', client_action_at = now(), reminder_sent_at = null
  where id = p_booking;
exception when exclusion_violation then
  raise exception 'horario_ocupado';
end;
$$;
