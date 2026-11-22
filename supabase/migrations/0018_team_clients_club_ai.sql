-- 0018: access levels for the team, commissions, the salon's own client list and
-- invitations, a different time suggested by the salon, the Club (monthly
-- membership) and the log behind the AI features.
-- Run once, after 0017. Everything is additive: existing team members keep the
-- access they had ("Receção").

-- ============================================================================
-- 1. Access levels
-- ============================================================================
-- agenda:  agenda, week, bookings, queue and reminders
-- rececao: + clients (list, notes, register, invitations) and the Club members
-- gestor:  + statistics, hours and time off, prices per professional, team and
--            commissions, Club settings
-- dono:    everything, including access, settings, billing, exports and deleting client data
alter table salon_members add column access text not null default 'rececao'
  check (access in ('agenda', 'rececao', 'gestor'));
alter table salon_invites add column access text not null default 'rececao'
  check (access in ('agenda', 'rececao', 'gestor'));

create function access_rank(a text) returns int
language sql immutable as $$
  select case a when 'agenda' then 1 when 'rececao' then 2 when 'gestor' then 3 when 'dono' then 4 else 0 end;
$$;

-- True for the owner, and for team members with at least the given level.
create function has_access(s uuid, need text) returns boolean
language sql stable security definer set search_path = public as $$
  select is_owner(s) or exists (
    select 1 from salon_members m
    where m.salon_id = s and m.user_id = auth.uid() and access_rank(m.access) >= access_rank(need)
  );
$$;
grant execute on function has_access(uuid, text) to authenticated;

-- Client notes are client data: from "Receção" up (the agenda level sees names and phones on bookings only).
drop policy notes_team_read on client_notes;
drop policy notes_team_insert on client_notes;
drop policy notes_team_update on client_notes;
create policy notes_team_read on client_notes for select using (has_access(salon_id, 'rececao'));
create policy notes_team_insert on client_notes for insert with check (has_access(salon_id, 'rececao'));
create policy notes_team_update on client_notes for update using (has_access(salon_id, 'rececao')) with check (has_access(salon_id, 'rececao'));

-- Managers run the team, hours, time off and prices per professional (added next to the owner's policies).
create policy prof_manager_write on professionals for all using (has_access(salon_id, 'gestor')) with check (has_access(salon_id, 'gestor'));
create policy pro_hours_manager_write on professional_hours for all using (has_access(salon_id, 'gestor')) with check (has_access(salon_id, 'gestor'));
create policy time_off_manager on time_off for all using (has_access(salon_id, 'gestor')) with check (has_access(salon_id, 'gestor'));
create policy overrides_manager_write on service_overrides for all using (has_access(salon_id, 'gestor')) with check (has_access(salon_id, 'gestor'));

-- Invites carry the level; the owner can change a member's level later (members_owner policy).
create or replace function accept_invites() returns int
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  r record;
  v_count int := 0;
begin
  if auth.uid() is null or v_email = '' then return 0; end if;
  if exists (select 1 from salons where owner_id = auth.uid()) or exists (select 1 from salon_members where user_id = auth.uid()) then
    return 0;
  end if;
  for r in select * from salon_invites
           where lower(email) = v_email and accepted_at is null and created_at > now() - interval '14 days'
           order by created_at desc limit 1
  loop
    insert into salon_members (salon_id, user_id, email, professional_id, access)
    values (r.salon_id, auth.uid(), v_email, r.professional_id, r.access) on conflict do nothing;
    update salon_invites set accepted_at = now() where id = r.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- role is now 'dono' or the member's level.
create or replace function my_salon() returns table (salon_id uuid, role text, professional_id uuid)
language sql stable security definer set search_path = public as $$
  select id, 'dono', null::uuid from salons where owner_id = auth.uid()
  union all
  select m.salon_id, m.access, m.professional_id from salon_members m where m.user_id = auth.uid()
  limit 1;
$$;

-- ============================================================================
-- 2. Commissions, per professional. Kept apart from `professionals`, which the
--    booking page reads publicly.
-- ============================================================================
create table professional_pay (
  professional_id uuid primary key references professionals(id) on delete cascade,
  salon_id uuid not null references salons(id) on delete cascade,
  -- nenhuma: no commission; percentagem: % of each completed visit; montante: fixed amount per completed visit
  commission_type text not null default 'nenhuma' check (commission_type in ('nenhuma', 'percentagem', 'montante')),
  commission_percent numeric(5,2) check (commission_percent is null or commission_percent between 0 and 100),
  commission_cents int check (commission_cents is null or commission_cents >= 0),
  updated_at timestamptz not null default now(),
  check (commission_type <> 'percentagem' or commission_percent is not null),
  check (commission_type <> 'montante' or commission_cents is not null)
);
alter table professional_pay enable row level security;
create policy pay_manager on professional_pay for all using (has_access(salon_id, 'gestor')) with check (has_access(salon_id, 'gestor'));

-- ============================================================================
-- 3. The salon's own client list ("registered" clients) and invitations.
--    Clients are keyed by phone digits, like client_notes and the client list.
-- ============================================================================
create table salon_clients (
  salon_id uuid not null references salons(id) on delete cascade,
  phone_key text not null check (phone_key ~ '^[0-9]{6,15}$'),
  name text not null check (length(trim(name)) between 1 and 120),
  phone text not null,
  email text check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  source text not null default 'salao' check (source in ('salao', 'convite', 'marcacao', 'contactos')),
  invited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (salon_id, phone_key)
);
alter table salon_clients enable row level security;
create policy clients_owner on salon_clients for all using (is_owner(salon_id)) with check (is_owner(salon_id));
create policy clients_team_read on salon_clients for select using (has_access(salon_id, 'rececao'));
create policy clients_team_insert on salon_clients for insert with check (has_access(salon_id, 'rececao'));
create policy clients_team_update on salon_clients for update using (has_access(salon_id, 'rececao')) with check (has_access(salon_id, 'rececao'));
-- Agenda-level staff only need to know whether a booking's client is already on the list, not who is on it.
create function known_clients(p_salon uuid, p_keys text[]) returns setof text
language sql stable security definer set search_path = public as $$
  select phone_key from salon_clients
  where salon_id = p_salon and phone_key = any(p_keys) and has_access(p_salon, 'agenda');
$$;
grant execute on function known_clients(uuid, text[]) to authenticated;

-- ============================================================================
-- 4. The salon suggests a different time; the client accepts or declines on
--    their private booking page (/m/<id>).
-- ============================================================================
alter table bookings add column proposed_starts_at timestamptz;
alter table bookings add column proposed_at timestamptz;
alter table bookings add column proposal_note text check (proposal_note is null or length(proposal_note) <= 300);
alter table bookings drop constraint if exists bookings_client_action_check;
alter table bookings add constraint bookings_client_action_check
  check (client_action in ('cancelou', 'mudou', 'aceitou', 'recusou'));

-- True when another live booking or a suggested time of this professional overlaps.
create function slot_taken(p_professional uuid, p_from timestamptz, p_to timestamptz, p_except uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from bookings b
    where b.professional_id = p_professional and b.id is distinct from p_except
      and b.status in ('pendente', 'confirmada', 'concluida')
      and (
        (b.starts_at < p_to and b.ends_at > p_from)
        or (b.proposed_starts_at is not null
            and b.proposed_starts_at < p_to
            and b.proposed_starts_at + (b.ends_at - b.starts_at) > p_from)
      )
  ) or is_time_off(p_professional, p_from, p_to);
$$;
revoke execute on function slot_taken(uuid, timestamptz, timestamptz, uuid) from public, anon, authenticated;

create function propose_booking_time(p_booking uuid, p_starts_at timestamptz, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare b bookings;
begin
  select * into b from bookings where id = p_booking for update;
  if not found then raise exception 'marcacao_inexistente'; end if;
  if not has_access(b.salon_id, 'agenda') then raise exception 'sem_permissao'; end if;
  if b.status not in ('pendente', 'confirmada') then raise exception 'marcacao_fechada'; end if;
  if p_starts_at < now() then raise exception 'horario_passado'; end if;
  if slot_taken(b.professional_id, p_starts_at, p_starts_at + (b.ends_at - b.starts_at), b.id) then
    raise exception 'horario_ocupado';
  end if;
  update bookings set proposed_starts_at = p_starts_at, proposed_at = now(),
         proposal_note = nullif(trim(coalesce(p_note, '')), ''), client_action = null, client_action_at = null
  where id = p_booking;
end;
$$;
grant execute on function propose_booking_time(uuid, timestamptz, text) to authenticated;

create function withdraw_booking_proposal(p_booking uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_salon uuid;
begin
  select salon_id into v_salon from bookings where id = p_booking;
  if v_salon is null or not has_access(v_salon, 'agenda') then raise exception 'sem_permissao'; end if;
  update bookings set proposed_starts_at = null, proposed_at = null, proposal_note = null where id = p_booking;
end;
$$;
grant execute on function withdraw_booking_proposal(uuid) to authenticated;

-- The client's answer. Accepting moves the booking to the suggested time and confirms it
-- (it stays pending while a deposit is still owed).
create function respond_to_proposal(p_booking uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  b bookings;
  v_length interval;
begin
  select * into b from bookings where id = p_booking for update;
  if not found then raise exception 'marcacao_inexistente'; end if;
  if b.proposed_starts_at is null then raise exception 'sem_proposta'; end if;
  if b.status not in ('pendente', 'confirmada') then raise exception 'marcacao_fechada'; end if;
  if not p_accept then
    update bookings set proposed_starts_at = null, proposed_at = null, client_action = 'recusou', client_action_at = now()
    where id = p_booking;
    return;
  end if;
  if b.proposed_starts_at < now() then raise exception 'horario_passado'; end if;
  v_length := b.ends_at - b.starts_at;
  if is_time_off(b.professional_id, b.proposed_starts_at, b.proposed_starts_at + v_length) then
    raise exception 'horario_ocupado';
  end if;
  update bookings set starts_at = b.proposed_starts_at, ends_at = b.proposed_starts_at + v_length,
         status = case when b.deposit = 'pendente' then 'pendente'::booking_status else 'confirmada'::booking_status end,
         proposed_starts_at = null, proposed_at = null, proposal_note = null,
         client_action = 'aceitou', client_action_at = now(), reminder_sent_at = null
  where id = p_booking;
exception when exclusion_violation then
  raise exception 'horario_ocupado';
end;
$$;
grant execute on function respond_to_proposal(uuid, boolean) to anon, authenticated;

-- Busy time for the booking pages now includes times the salon has suggested and is holding.
create or replace function busy_slots(p_salon uuid, p_from timestamptz, p_to timestamptz)
returns table (professional_id uuid, starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = public as $$
  select b.professional_id, b.starts_at, b.ends_at
  from bookings b
  where b.salon_id = p_salon
    and b.status in ('pendente', 'confirmada', 'concluida')
    and b.starts_at < p_to and b.ends_at > p_from
  union all
  select b.professional_id, b.proposed_starts_at, b.proposed_starts_at + (b.ends_at - b.starts_at)
  from bookings b
  where b.salon_id = p_salon and b.proposed_starts_at is not null
    and b.status in ('pendente', 'confirmada')
    and b.proposed_starts_at < p_to and b.proposed_starts_at + (b.ends_at - b.starts_at) > p_from
  union all
  select p.id, t.starts_at, t.ends_at
  from time_off t
  join professionals p on p.salon_id = t.salon_id and (t.professional_id is null or t.professional_id = p.id)
  where t.salon_id = p_salon and t.starts_at < p_to and t.ends_at > p_from;
$$;

-- The client's page also shows a suggested time. The returned columns change, so drop and create.
drop function booking_for_client(uuid);
create function booking_for_client(p_booking uuid)
returns table (
  id uuid, status booking_status, deposit deposit_status, starts_at timestamptz, ends_at timestamptz,
  client_name text, salon_id uuid, salon_slug text, salon_name text, salon_theme text,
  salon_timezone text, salon_whatsapp text, mbway_number text, deposit_cents int,
  client_change_hours smallint, service_id uuid, service_name text, duration_min int,
  price_cents int, professional_id uuid, professional_name text,
  proposed_starts_at timestamptz, proposal_note text
)
language sql stable security definer set search_path = public as $$
  select b.id, b.status, b.deposit, b.starts_at, b.ends_at, b.client_name,
         s.id, s.slug, s.name, s.theme, s.timezone, s.whatsapp, s.mbway_number, s.deposit_cents,
         s.client_change_hours, sv.id, sv.name,
         (extract(epoch from (b.ends_at - b.starts_at)) / 60)::int,
         coalesce(b.price_cents, sv.price_cents), p.id, p.name,
         b.proposed_starts_at, b.proposal_note
  from bookings b
  join salons s on s.id = b.salon_id
  join services sv on sv.id = b.service_id
  join professionals p on p.id = b.professional_id
  where b.id = p_booking;
$$;
grant execute on function booking_for_client(uuid) to anon, authenticated;

-- ============================================================================
-- 5. The Club: a monthly membership the salon sells. Payment goes straight to
--    the salon (MB Way or at the counter); the app keeps who is a member.
-- ============================================================================
create table salon_club (
  salon_id uuid primary key references salons(id) on delete cascade,
  active boolean not null default false,
  name text not null default 'Clube' check (length(trim(name)) between 1 and 60),
  price_cents int not null default 0 check (price_cents >= 0),
  benefits text not null default '' check (length(benefits) <= 500),
  no_deposit boolean not null default true, -- members book without a deposit
  updated_at timestamptz not null default now()
);
alter table salon_club enable row level security;
create policy club_public_read on salon_club for select using (true);
create policy club_manager_write on salon_club for all using (has_access(salon_id, 'gestor')) with check (has_access(salon_id, 'gestor'));

create table club_members (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references salons(id) on delete cascade,
  phone_key text not null check (phone_key ~ '^[0-9]{6,15}$'),
  name text not null,
  phone text not null,
  -- pedido: asked to join online, waiting for the first payment; ativo; cancelado
  status text not null default 'pedido' check (status in ('pedido', 'ativo', 'cancelado')),
  pay_method text not null default 'mbway' check (pay_method in ('mbway', 'balcao')),
  price_cents int not null default 0 check (price_cents >= 0), -- price when joined
  started_at timestamptz,
  paid_until date,
  cancelled_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index club_members_open on club_members (salon_id, phone_key) where status in ('pedido', 'ativo');
alter table club_members enable row level security;
create policy club_members_owner on club_members for all using (is_owner(salon_id)) with check (is_owner(salon_id));
create policy club_members_team_read on club_members for select using (has_access(salon_id, 'rececao'));
create policy club_members_team_insert on club_members for insert with check (has_access(salon_id, 'rececao'));
create policy club_members_team_update on club_members for update using (has_access(salon_id, 'rececao')) with check (has_access(salon_id, 'rececao'));

-- A client asks to join from the booking page. The salon activates it once paid.
create function join_club(p_salon uuid, p_name text, p_phone text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  c salon_club;
  v_key text := phone_key(p_phone);
  v_id uuid;
begin
  select * into c from salon_club where salon_id = p_salon and active;
  if not found then raise exception 'clube_fechado'; end if;
  if length(trim(coalesce(p_name, ''))) = 0 or length(v_key) < 9 then raise exception 'dados_cliente'; end if;
  select id into v_id from club_members where salon_id = p_salon and phone_key = v_key and status in ('pedido', 'ativo');
  if v_id is not null then return v_id; end if;
  insert into club_members (salon_id, phone_key, name, phone, price_cents)
  values (p_salon, v_key, trim(p_name), trim(p_phone), c.price_cents)
  returning id into v_id;
  return v_id;
end;
$$;
grant execute on function join_club(uuid, text, text) to anon, authenticated;

-- Members with a paid month book without a deposit (when the salon chose that benefit).
create or replace function create_booking(
  p_salon uuid, p_service uuid, p_professional uuid, p_starts_at timestamptz,
  p_client_name text, p_client_phone text, p_consent boolean
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_duration int;
  v_price int;
  v_deposit int;
  v_member boolean;
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
  -- Time off, and times the salon has suggested to another client, are taken.
  if slot_taken(p_professional, p_starts_at, p_starts_at + make_interval(mins => v_duration), null) then
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

-- Forgetting a client (RGPD) also removes them from the list and the Club.
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
  delete from client_notes where salon_id = p_salon and phone_key = p_key;
  delete from walkins where salon_id = p_salon and phone_key(client_phone) = p_key;
  delete from salon_clients where salon_id = p_salon and phone_key = p_key;
  update club_members set name = 'Cliente apagado', phone = '', status = 'cancelado', cancelled_at = coalesce(cancelled_at, now())
  where salon_id = p_salon and phone_key = p_key;
  return v_count;
end;
$$;

-- ============================================================================
-- 6. AI features: one log row per request, for usage limits per plan and for
--    support. Requests go through the Worker (/api/ai/<feature>); no photo or
--    model output is kept here, only what was asked and whether it worked.
-- ============================================================================
create table ai_requests (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid references salons(id) on delete cascade,
  feature text not null check (feature ~ '^[a-z-]{3,40}$'),
  status text not null check (status in ('feito', 'erro', 'indisponivel', 'limite')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index ai_requests_salon_month on ai_requests (salon_id, created_at);
alter table ai_requests enable row level security;
-- Written only by the Worker (service role); the salon can read its own usage.
create policy ai_requests_read on ai_requests for select using (has_access(salon_id, 'gestor'));
