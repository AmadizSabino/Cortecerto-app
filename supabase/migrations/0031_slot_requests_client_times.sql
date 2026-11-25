-- 0031: two things a barber asked for. Run once, after 0030.
--
-- 1. Per-client service times. The salon knows that João needs 60 minutes for a haircut that
--    usually takes 30 (more hair, a fussier finish). In the client's card the salon sets either
--    a time for one service ("Corte: 60 min") or extra minutes on everything ("+15 min").
--    João still just books "Corte" online; the agenda blocks the longer time by itself.
--
-- 2. "Pedir este horário": a client wants a time that is already taken. Instead of phoning the
--    salon, they ask for it on the booking page (with a second choice if they like). Until the
--    salon gives them a time, they wait on the salon's waiting list. The salon answers from
--    Hoje: accept (after moving the other client, by WhatsApp), suggest another time (the client
--    accepts it with one tap on a link), or say no. Messages are one-tap WhatsApp sends from the
--    salon's own phone, never automatic, so there is no cost.

-- ============================================================================
-- 1. Per-client service times
-- ============================================================================
create table client_times (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references salons(id) on delete cascade,
  phone_key text not null check (phone_key ~ '^[0-9]{6,15}$'),
  -- A service: its whole length for this client. Null: extra minutes on every service.
  service_id uuid references services(id) on delete cascade,
  minutes smallint not null check (minutes between 5 and 480),
  updated_at timestamptz not null default now()
);
create unique index client_times_one on client_times (salon_id, phone_key, coalesce(service_id, '00000000-0000-0000-0000-000000000000'));
alter table client_times enable row level security;
-- Client data, like notes: from "Receção" up. The agenda level gets the minutes through client_duration.
create policy client_times_team on client_times for all using (has_access(salon_id, 'rececao')) with check (has_access(salon_id, 'rececao'));

-- How long this client takes for this service with this professional. Without a time of their
-- own, it is the service's length (with that professional) plus any extra minutes.
create function client_duration(p_salon uuid, p_service uuid, p_professional uuid, p_phone text) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select t.minutes::int from client_times t
      where t.salon_id = p_salon and t.phone_key = phone_key(p_phone) and t.service_id = p_service),
    (select e.duration_min from effective_service(p_service, p_professional) e)
      + coalesce((select t.minutes::int from client_times t
                   where t.salon_id = p_salon and t.phone_key = phone_key(p_phone) and t.service_id is null), 0)
  );
$$;
-- The booking page asks once the client typed their phone (only the minutes come back), and the
-- salon's own booking form fills in the length with it.
grant execute on function client_duration(uuid, uuid, uuid, text) to anon, authenticated;

-- Online bookings take the client's own time. When the usual length would fit but the client's
-- longer one doesn't, the page is told 'horario_curto' and shows the times that do fit.
create or replace function create_booking(
  p_salon uuid, p_service uuid, p_professional uuid, p_starts_at timestamptz,
  p_client_name text, p_client_phone text, p_consent boolean
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_duration int;
  v_base int;
  v_price int;
  v_deposit int;
  v_member boolean;
  v_id uuid;
begin
  perform 1 from services where id = p_service and salon_id = p_salon and active;
  if not found then raise exception 'servico_invalido'; end if;
  perform 1 from professionals where id = p_professional and salon_id = p_salon and active;
  if not found then raise exception 'profissional_invalido'; end if;
  select e.price_cents, e.duration_min into v_price, v_base from effective_service(p_service, p_professional) e;
  if v_base is null then raise exception 'servico_invalido'; end if;
  v_duration := coalesce(client_duration(p_salon, p_service, p_professional, p_client_phone), v_base);
  if p_starts_at < now() then raise exception 'horario_passado'; end if;
  if length(trim(p_client_name)) = 0 or length(trim(p_client_phone)) < 9 then
    raise exception 'dados_cliente';
  end if;
  -- Time off, and times the salon has suggested to another client, are taken.
  if slot_taken(p_professional, p_starts_at, p_starts_at + make_interval(mins => v_duration), null) then
    if v_duration > v_base and not slot_taken(p_professional, p_starts_at, p_starts_at + make_interval(mins => v_base), null) then
      raise exception 'horario_curto';
    end if;
    raise exception 'horario_ocupado';
  end if;
  select deposit_cents into v_deposit from salons where id = p_salon;
  select exists (
    select 1 from club_members m join salon_club c on c.salon_id = m.salon_id
    where m.salon_id = p_salon and m.phone_key = phone_key(p_client_phone) and m.status = 'ativo'
      and c.active and c.no_deposit and (m.paid_until is null or m.paid_until >= current_date)
  ) into v_member;

  insert into bookings (salon_id, service_id, professional_id, starts_at, ends_at,
                        client_name, client_phone, consent_messages, deposit, price_cents)
  values (p_salon, p_service, p_professional, p_starts_at,
          p_starts_at + make_interval(mins => v_duration),
          trim(p_client_name), trim(p_client_phone), coalesce(p_consent, false),
          case when v_deposit > 0 and not v_member then 'pendente'::deposit_status else 'nenhum' end, v_price)
  returning id into v_id;
  return v_id;
exception when exclusion_violation then
  raise exception 'horario_ocupado';
end;
$$;

-- ============================================================================
-- 2. "Pedir este horário": requests for a taken time, on the salon's waiting list
-- ============================================================================
create table slot_requests (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references salons(id) on delete cascade,
  service_id uuid not null references services(id) on delete cascade,
  professional_id uuid references professionals(id) on delete set null, -- null: anyone
  starts_at timestamptz not null,           -- the time they asked for
  alt_starts_at timestamptz,                -- a second choice, if any
  duration_min int not null check (duration_min between 5 and 600),
  client_name text not null check (length(trim(client_name)) between 1 and 80),
  client_phone text not null check (length(client_phone) between 9 and 20),
  consent_messages boolean not null default false,
  note text check (note is null or length(note) <= 300),
  -- espera: on the waiting list; proposta: the salon suggested a time (held for them);
  -- marcada: booked; recusada: the salon said no; cancelada: the client gave up.
  status text not null default 'espera' check (status in ('espera', 'proposta', 'marcada', 'recusada', 'cancelada')),
  proposed_starts_at timestamptz,
  proposed_professional_id uuid references professionals(id) on delete set null,
  proposal_note text check (proposal_note is null or length(proposal_note) <= 300),
  client_declined_at timestamptz,           -- said no to a suggested time: back on the list
  booking_id uuid references bookings(id) on delete set null,
  push_notified_at timestamptz,
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  check (status <> 'proposta' or (proposed_starts_at is not null and proposed_professional_id is not null))
);
create index slot_requests_open on slot_requests (salon_id, starts_at) where status in ('espera', 'proposta');
create index slot_requests_phone on slot_requests (salon_id, phone_key(client_phone)) where status in ('espera', 'proposta');
alter table slot_requests enable row level security;
-- Everyone on the agenda sees them (they see names and phones on bookings too). Written through the functions below.
create policy slot_requests_team on slot_requests for select using (has_access(salon_id, 'agenda'));
-- A read-only (unpaid) account takes no new requests and can't answer them.
create trigger slot_requests_locked before insert or update or delete on slot_requests
  for each row execute function refuse_when_locked();
create trigger client_times_locked before insert or update or delete on client_times
  for each row execute function refuse_when_locked();

-- A time the salon suggested in answer to a request is held for that client, like a suggested
-- time on a booking: nobody else can book it until they answer.
create or replace function slot_taken(p_professional uuid, p_from timestamptz, p_to timestamptz, p_except uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from bookings b
    where b.professional_id = p_professional and b.id is distinct from p_except
      and b.status in ('pendente', 'confirmada', 'concluida')
      and (
        (b.starts_at - make_interval(mins => b.travel_min) < p_to and b.ends_at + make_interval(mins => b.travel_min) > p_from)
        or (b.proposed_starts_at is not null
            and b.proposed_starts_at < p_to
            and b.proposed_starts_at + (b.ends_at - b.starts_at) > p_from)
      )
  ) or exists (
    select 1 from slot_requests r
    where r.status = 'proposta' and r.proposed_professional_id = p_professional and r.id is distinct from p_except
      and r.proposed_starts_at < p_to and r.proposed_starts_at + make_interval(mins => r.duration_min) > p_from
  ) or is_time_off(p_professional, p_from, p_to);
$$;

create or replace function busy_slots(p_salon uuid, p_from timestamptz, p_to timestamptz)
returns table (professional_id uuid, starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = public as $$
  select b.professional_id, b.starts_at - make_interval(mins => b.travel_min), b.ends_at + make_interval(mins => b.travel_min)
  from bookings b
  where b.salon_id = p_salon
    and b.status in ('pendente', 'confirmada', 'concluida')
    and b.starts_at - make_interval(mins => b.travel_min) < p_to and b.ends_at + make_interval(mins => b.travel_min) > p_from
  union all
  select b.professional_id, b.proposed_starts_at, b.proposed_starts_at + (b.ends_at - b.starts_at)
  from bookings b
  where b.salon_id = p_salon and b.proposed_starts_at is not null
    and b.status in ('pendente', 'confirmada')
    and b.proposed_starts_at < p_to and b.proposed_starts_at + (b.ends_at - b.starts_at) > p_from
  union all
  select r.proposed_professional_id, r.proposed_starts_at, r.proposed_starts_at + make_interval(mins => r.duration_min)
  from slot_requests r
  where r.salon_id = p_salon and r.status = 'proposta'
    and r.proposed_starts_at < p_to and r.proposed_starts_at + make_interval(mins => r.duration_min) > p_from
  union all
  select p.id, t.starts_at, t.ends_at
  from time_off t
  join professionals p on p.salon_id = t.salon_id and (t.professional_id is null or t.professional_id = p.id)
  where t.salon_id = p_salon and t.starts_at < p_to and t.ends_at > p_from;
$$;

-- The client asks for a taken time (and maybe a second one). Returns the request's id, which is
-- the client's private link (/horario/<id>). Asking again for the same time hands back the same one.
create function request_slot(
  p_salon uuid, p_service uuid, p_professional uuid, p_starts_at timestamptz, p_alt_starts_at timestamptz,
  p_client_name text, p_client_phone text, p_consent boolean, p_note text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_duration int;
  v_id uuid;
  v_key text := phone_key(p_client_phone);
begin
  perform 1 from services where id = p_service and salon_id = p_salon and active;
  if not found then raise exception 'servico_invalido'; end if;
  if p_professional is not null then
    perform 1 from professionals where id = p_professional and salon_id = p_salon and active;
    if not found then raise exception 'profissional_invalido'; end if;
  end if;
  if length(trim(coalesce(p_client_name, ''))) = 0 or length(v_key) < 9 then raise exception 'dados_cliente'; end if;
  if p_starts_at < now() or (p_alt_starts_at is not null and p_alt_starts_at < now()) then raise exception 'horario_passado'; end if;
  if p_starts_at > now() + interval '90 days' or p_alt_starts_at > now() + interval '90 days' then raise exception 'horario_longe'; end if;
  v_duration := client_duration(p_salon, p_service, p_professional, p_client_phone);
  if v_duration is null then raise exception 'servico_invalido'; end if;
  select id into v_id from slot_requests
  where salon_id = p_salon and phone_key(client_phone) = v_key and starts_at = p_starts_at and status in ('espera', 'proposta');
  if v_id is not null then return v_id; end if;
  -- A few open requests per person, so the list stays useful.
  if (select count(*) from slot_requests where salon_id = p_salon and phone_key(client_phone) = v_key and status in ('espera', 'proposta')) >= 3 then
    raise exception 'pedidos_a_mais';
  end if;
  insert into slot_requests (salon_id, service_id, professional_id, starts_at, alt_starts_at, duration_min,
                             client_name, client_phone, consent_messages, note)
  values (p_salon, p_service, p_professional, p_starts_at, nullif(p_alt_starts_at, p_starts_at), v_duration,
          trim(p_client_name), trim(p_client_phone), coalesce(p_consent, false), nullif(trim(coalesce(p_note, '')), ''))
  returning id into v_id;
  return v_id;
end;
$$;
grant execute on function request_slot(uuid, uuid, uuid, timestamptz, timestamptz, text, text, boolean, text) to anon, authenticated;

-- What the client sees on their request's page.
create function slot_request_for_client(p_request uuid)
returns table (
  id uuid, status text, starts_at timestamptz, alt_starts_at timestamptz, duration_min int,
  proposed_starts_at timestamptz, proposal_note text, client_declined_at timestamptz, booking_id uuid,
  client_name text, service_name text, professional_name text, proposed_professional_name text,
  salon_slug text, salon_name text, salon_theme text, salon_timezone text, salon_whatsapp text, salon_logo text
)
language sql stable security definer set search_path = public as $$
  select r.id, r.status, r.starts_at, r.alt_starts_at, r.duration_min,
         r.proposed_starts_at, r.proposal_note, r.client_declined_at, r.booking_id,
         r.client_name, sv.name, p.name, pp.name,
         s.slug, s.name, s.theme, s.timezone, s.whatsapp, s.logo_path
  from slot_requests r
  join salons s on s.id = r.salon_id
  join services sv on sv.id = r.service_id
  left join professionals p on p.id = r.professional_id
  left join professionals pp on pp.id = r.proposed_professional_id
  where r.id = p_request;
$$;
grant execute on function slot_request_for_client(uuid) to anon, authenticated;

-- The client gives up on the request.
create function cancel_slot_request(p_request uuid) returns void
language sql security definer set search_path = public as $$
  update slot_requests set status = 'cancelada', answered_at = now()
  where id = p_request and status in ('espera', 'proposta');
$$;
grant execute on function cancel_slot_request(uuid) to anon, authenticated;

-- The client answers the salon's suggested time. Yes books it; no puts them back on the list.
create function answer_slot_proposal(p_request uuid, p_accept boolean) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  r slot_requests;
  v_id uuid;
begin
  select * into r from slot_requests where id = p_request for update;
  if not found then raise exception 'pedido_inexistente'; end if;
  if r.status <> 'proposta' then raise exception 'sem_proposta'; end if;
  if not p_accept then
    update slot_requests set status = 'espera', proposed_starts_at = null, proposed_professional_id = null,
           proposal_note = null, client_declined_at = now()
    where id = p_request;
    return null;
  end if;
  if r.proposed_starts_at < now() then raise exception 'horario_passado'; end if;
  -- Releases the held time first, then books it the usual way (all of it, or none).
  update slot_requests set status = 'marcada', answered_at = now() where id = p_request;
  v_id := create_booking(r.salon_id, r.service_id, r.proposed_professional_id, r.proposed_starts_at,
                         r.client_name, r.client_phone, r.consent_messages);
  update slot_requests set booking_id = v_id where id = p_request;
  return v_id;
end;
$$;
grant execute on function answer_slot_proposal(uuid, boolean) to anon, authenticated;

-- The salon gives the client the time they asked for (p_choice 1) or their second choice (2),
-- usually after moving the other client. The booking is confirmed: the salon just agreed to it
-- (it stays pending while a deposit is owed). p_professional: who does it, when the client said "anyone".
create function accept_slot_request(p_request uuid, p_choice int, p_professional uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  r slot_requests;
  v_when timestamptz;
  v_pro uuid;
  v_id uuid;
begin
  select * into r from slot_requests where id = p_request for update;
  if not found then raise exception 'pedido_inexistente'; end if;
  if not has_access(r.salon_id, 'agenda') then raise exception 'sem_permissao'; end if;
  if r.status not in ('espera', 'proposta') then raise exception 'pedido_fechado'; end if;
  v_when := case when p_choice = 2 then r.alt_starts_at else r.starts_at end;
  if v_when is null then raise exception 'sem_horario'; end if;
  v_pro := coalesce(r.professional_id, p_professional);
  if v_pro is null then raise exception 'profissional_invalido'; end if;
  update slot_requests set status = 'marcada', answered_at = now() where id = p_request;
  v_id := create_booking(r.salon_id, r.service_id, v_pro, v_when, r.client_name, r.client_phone, r.consent_messages);
  update bookings set status = 'confirmada' where id = v_id and deposit = 'nenhum';
  update slot_requests set booking_id = v_id where id = p_request;
  return v_id;
end;
$$;
grant execute on function accept_slot_request(uuid, int, uuid) to authenticated;

-- The salon suggests another time. It is held for this client until they answer on their link.
create function propose_slot_request(p_request uuid, p_starts_at timestamptz, p_professional uuid, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare r slot_requests;
begin
  select * into r from slot_requests where id = p_request for update;
  if not found then raise exception 'pedido_inexistente'; end if;
  if not has_access(r.salon_id, 'agenda') then raise exception 'sem_permissao'; end if;
  if r.status not in ('espera', 'proposta') then raise exception 'pedido_fechado'; end if;
  perform 1 from professionals where id = p_professional and salon_id = r.salon_id and active;
  if not found then raise exception 'profissional_invalido'; end if;
  if p_starts_at < now() then raise exception 'horario_passado'; end if;
  if slot_taken(p_professional, p_starts_at, p_starts_at + make_interval(mins => r.duration_min), r.id) then
    raise exception 'horario_ocupado';
  end if;
  update slot_requests set status = 'proposta', proposed_starts_at = p_starts_at, proposed_professional_id = p_professional,
         proposal_note = nullif(trim(coalesce(p_note, '')), ''), client_declined_at = null, answered_at = now()
  where id = p_request;
end;
$$;
grant execute on function propose_slot_request(uuid, timestamptz, uuid, text) to authenticated;

-- The salon can't fit the client in. (The client can always ask again, or book a free time.)
create function decline_slot_request(p_request uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_salon uuid;
begin
  select salon_id into v_salon from slot_requests where id = p_request;
  if v_salon is null or not has_access(v_salon, 'agenda') then raise exception 'sem_permissao'; end if;
  update slot_requests set status = 'recusada', answered_at = now(), proposed_starts_at = null, proposed_professional_id = null
  where id = p_request and status in ('espera', 'proposta');
end;
$$;
grant execute on function decline_slot_request(uuid) to authenticated;

-- When the client gets a booking on one of the days they asked for, however it was made (they
-- took a freed time, the salon booked them by phone...), their request leaves the waiting list.
create function close_slot_requests_on_booking() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_tz text;
begin
  if new.demo or coalesce(new.client_phone, '') = '' then return new; end if;
  select timezone into v_tz from salons where id = new.salon_id;
  update slot_requests r set status = 'marcada', booking_id = new.id, answered_at = now()
  where r.salon_id = new.salon_id and r.status in ('espera', 'proposta')
    and phone_key(r.client_phone) = phone_key(new.client_phone)
    and (new.starts_at at time zone v_tz)::date in (
      (r.starts_at at time zone v_tz)::date,
      (coalesce(r.alt_starts_at, r.starts_at) at time zone v_tz)::date,
      (coalesce(r.proposed_starts_at, r.starts_at) at time zone v_tz)::date);
  return new;
end;
$$;
create trigger bookings_close_slot_requests after insert on bookings
  for each row execute function close_slot_requests_on_booking();

-- A new request is announced on the salon's phones once, in its first 10 minutes (Worker, service role).
create function claim_slot_request_push(p_request uuid) returns table (
  salon_id uuid, salon_timezone text, client_name text, service_name text, professional_name text,
  starts_at timestamptz, alt_starts_at timestamptz, taken_by text
)
language sql security definer set search_path = public as $$
  with claimed as (
    update slot_requests r set push_notified_at = now()
    where r.id = p_request and r.push_notified_at is null and r.status = 'espera'
      and r.created_at > now() - interval '10 minutes'
    returning r.*
  )
  select c.salon_id, s.timezone, c.client_name, sv.name, p.name, c.starts_at, c.alt_starts_at,
         (select b.client_name from bookings b
           where b.salon_id = c.salon_id and b.status in ('pendente', 'confirmada')
             and (c.professional_id is null or b.professional_id = c.professional_id)
             and b.starts_at < c.starts_at + make_interval(mins => c.duration_min) and b.ends_at > c.starts_at
           order by b.starts_at limit 1)
  from claimed c
  join salons s on s.id = c.salon_id
  join services sv on sv.id = c.service_id
  left join professionals p on p.id = c.professional_id;
$$;
revoke execute on function claim_slot_request_push(uuid) from public, anon, authenticated;
grant execute on function claim_slot_request_push(uuid) to service_role;

-- ============================================================================
-- 3. Privacy: forgetting a client also removes their requests and their times; closed requests
--    are deleted after 90 days, and open ones whose times passed a month ago, every night.
-- ============================================================================
create or replace function forget_client_rows(p_salon uuid, p_key text) returns int
language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  update bookings set status = 'cancelada'
  where salon_id = p_salon and phone_key(client_phone) = p_key
    and status in ('pendente', 'confirmada') and starts_at > now();
  update bookings set client_name = 'Cliente apagado', client_phone = '', consent_messages = false
  where salon_id = p_salon and phone_key(client_phone) = p_key;
  get diagnostics v_count = row_count;
  delete from booking_addresses a using bookings b where a.booking_id = b.id and b.salon_id = p_salon and b.client_phone = '' and b.client_name = 'Cliente apagado';
  delete from client_notes where salon_id = p_salon and phone_key = p_key;
  delete from walkins where salon_id = p_salon and phone_key(client_phone) = p_key;
  delete from salon_clients where salon_id = p_salon and phone_key = p_key;
  update club_members set name = 'Cliente apagado', phone = '', status = 'cancelado', cancelled_at = coalesce(cancelled_at, now())
  where salon_id = p_salon and phone_key = p_key;
  update client_packs set client_name = 'Cliente apagado', client_phone = '', status = 'cancelado' where salon_id = p_salon and phone_key = p_key;
  delete from package_requests where salon_id = p_salon and phone_key(client_phone) = p_key;
  delete from slot_requests where salon_id = p_salon and phone_key(client_phone) = p_key;
  delete from client_times where salon_id = p_salon and phone_key = p_key;
  return v_count;
end;
$$;

create or replace function forget_inactive_clients() returns int
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_total int := 0;
begin
  for r in
    select salon_id, phone_key(client_phone) as k
    from bookings
    where client_phone <> ''
    group by salon_id, phone_key(client_phone)
    having max(starts_at) < now() - interval '3 years'
  loop
    v_total := v_total + forget_client_rows(r.salon_id, r.k);
  end loop;
  perform set_config('cortecerto.allow_locked', 'on', true);
  delete from slot_requests
  where (status not in ('espera', 'proposta') and coalesce(answered_at, created_at) < now() - interval '90 days')
     or (status in ('espera', 'proposta') and greatest(starts_at, coalesce(alt_starts_at, starts_at), coalesce(proposed_starts_at, starts_at)) < now() - interval '30 days');
  perform set_config('cortecerto.allow_locked', '', true);
  return v_total;
end;
$$;
revoke execute on function forget_inactive_clients() from public, anon, authenticated;
