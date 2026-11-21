-- Clients cancel or move their own booking from a private link: /m/<booking id>.
-- The booking id is a random UUID that only the client (on the confirmation page
-- and in the salon's WhatsApp messages) and the salon know.

-- Hours before the start until which clients may cancel or move. Null: not allowed.
alter table salons add column client_change_hours smallint default 2
  check (client_change_hours is null or client_change_hours between 0 and 168);

-- What the client last did, shown on the salon's agenda.
alter table bookings add column client_action text check (client_action in ('cancelou', 'mudou'));
alter table bookings add column client_action_at timestamptz;

-- The booking as the client sees it. No other clients' data, no salon-only fields.
create function booking_for_client(p_booking uuid)
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
         s.client_change_hours, sv.id, sv.name, sv.duration_min, sv.price_cents, p.id, p.name
  from bookings b
  join salons s on s.id = b.salon_id
  join services sv on sv.id = b.service_id
  join professionals p on p.id = b.professional_id
  where b.id = p_booking;
$$;

-- Raises unless the client may still change this booking. Returns its row, locked.
create function client_change_check(p_booking uuid) returns bookings
language plpgsql security definer set search_path = public as $$
declare
  b bookings;
  v_hours smallint;
begin
  select * into b from bookings where id = p_booking for update;
  if not found then raise exception 'marcacao_inexistente'; end if;
  if b.status not in ('pendente', 'confirmada') then raise exception 'marcacao_fechada'; end if;
  select client_change_hours into v_hours from salons where id = b.salon_id;
  if v_hours is null then raise exception 'alteracao_nao_permitida'; end if;
  if b.starts_at - make_interval(hours => v_hours) < now() then raise exception 'fora_do_prazo'; end if;
  return b;
end;
$$;

create function cancel_booking_by_client(p_booking uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform client_change_check(p_booking);
  update bookings set status = 'cancelada', client_action = 'cancelou', client_action_at = now()
  where id = p_booking;
end;
$$;

create function move_booking_by_client(p_booking uuid, p_starts_at timestamptz) returns void
language plpgsql security definer set search_path = public as $$
declare
  b bookings;
  v_duration int;
begin
  b := client_change_check(p_booking);
  if p_starts_at < now() then raise exception 'horario_passado'; end if;
  select duration_min into v_duration from services where id = b.service_id;
  -- Back to pending, so the salon sees and confirms the new time.
  update bookings set starts_at = p_starts_at, ends_at = p_starts_at + make_interval(mins => v_duration),
         status = 'pendente', client_action = 'mudou', client_action_at = now(), reminder_sent_at = null
  where id = p_booking;
exception when exclusion_violation then
  raise exception 'horario_ocupado';
end;
$$;

revoke execute on function client_change_check(uuid) from public, anon, authenticated;
grant execute on function booking_for_client(uuid) to anon, authenticated;
grant execute on function cancel_booking_by_client(uuid) to anon, authenticated;
grant execute on function move_booking_by_client(uuid, timestamptz) to anon, authenticated;
