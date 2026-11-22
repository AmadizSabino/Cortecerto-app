-- 0022: business profile, home visits, and packages (combos, event quotes, prepaid packs).
-- Run once, after 0021.

-- ============================================================================
-- 1. Business profile: the areas the salon covers, how clients come, where it works
-- ============================================================================
alter type salon_type add value if not exists 'estetica';
alter type salon_type add value if not exists 'sobrancelhas';
alter type salon_type add value if not exists 'maquilhagem';
alter type salon_type add value if not exists 'massagem';

alter table salons add column areas text[] not null default '{}'
  check (areas <@ array['barbearia', 'cabeleireiro', 'unhas', 'depilacao', 'estetica', 'sobrancelhas', 'maquilhagem', 'massagem']);
-- marcacao: appointments only; sem_marcacao: walk-ins only; ambos
alter table salons add column booking_mode text not null default 'ambos' check (booking_mode in ('marcacao', 'sem_marcacao', 'ambos'));
-- salao: in the salon; domicilio: only at clients' homes (no salon); ambos
alter table salons add column work_place text not null default 'salao' check (work_place in ('salao', 'domicilio', 'ambos'));

-- ============================================================================
-- 2. Home visits. Price = services + the zone's travel fee + the fees the owner
--    switched on (early, evening, weekend, always). Travel time blocks the
--    professional's agenda before and after the visit.
-- ============================================================================
create table home_settings (
  salon_id uuid primary key references salons(id) on delete cascade,
  active boolean not null default false,
  min_order_cents int not null default 0 check (min_order_cents >= 0),
  deposit_required boolean not null default true, -- the salon's deposit applies to every home visit
  updated_at timestamptz not null default now()
);
create table home_zones (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references salons(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  postcodes text[] not null default '{}', -- 4-digit prefixes, e.g. {2900, 2910}; empty: chosen by name
  fee_cents int not null default 0 check (fee_cents >= 0),
  travel_min int not null default 15 check (travel_min between 0 and 180), -- each way
  position int not null default 0,
  active boolean not null default true
);
create table home_fees (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references salons(id) on delete cascade,
  label text not null check (length(trim(label)) between 1 and 60),
  -- sempre: every home visit; antes_das: starts before `at`; depois_das: starts at or after `at`; fim_de_semana: Saturday or Sunday
  rule text not null check (rule in ('sempre', 'antes_das', 'depois_das', 'fim_de_semana')),
  at time,
  amount_cents int not null check (amount_cents > 0),
  active boolean not null default true,
  check (rule not in ('antes_das', 'depois_das') or at is not null)
);
alter table services add column at_home boolean not null default false;
alter table professionals add column at_home boolean not null default false;
-- Managers choose which services go out (professionals they already manage, 0018).
create policy svc_manager_update on services for update using (has_access(salon_id, 'gestor')) with check (has_access(salon_id, 'gestor'));

alter table home_settings enable row level security;
alter table home_zones enable row level security;
alter table home_fees enable row level security;
create policy home_settings_read on home_settings for select using (true);
create policy home_zones_read on home_zones for select using (true);
create policy home_fees_read on home_fees for select using (true);
create policy home_settings_write on home_settings for all using (has_access(salon_id, 'gestor')) with check (has_access(salon_id, 'gestor'));
create policy home_zones_write on home_zones for all using (has_access(salon_id, 'gestor')) with check (has_access(salon_id, 'gestor'));
create policy home_fees_write on home_fees for all using (has_access(salon_id, 'gestor')) with check (has_access(salon_id, 'gestor'));

alter table bookings add column location text not null default 'salao' check (location in ('salao', 'domicilio'));
alter table bookings add column travel_min int not null default 0 check (travel_min >= 0);
alter table bookings add column home_fee_cents int not null default 0 check (home_fee_cents >= 0);
alter table bookings add column en_route_at timestamptz;
alter table bookings add column started_at timestamptz;
alter table bookings add column finished_at timestamptz;

-- The address is kept apart: only the owner, the front desk and the professional who goes can read it.
create table booking_addresses (
  booking_id uuid primary key references bookings(id) on delete cascade,
  salon_id uuid not null references salons(id) on delete cascade,
  professional_id uuid not null,
  address text not null check (length(trim(address)) between 3 and 200),
  postcode text check (postcode is null or postcode ~ '^[0-9]{4}(-[0-9]{3})?$'),
  notes text check (notes is null or length(notes) <= 300),
  zone_name text
);
alter table booking_addresses enable row level security;
create function is_my_professional(s uuid, p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from salon_members m where m.salon_id = s and m.user_id = auth.uid() and m.professional_id = p);
$$;
create policy addresses_read on booking_addresses for select using (has_access(salon_id, 'rececao') or is_my_professional(salon_id, professional_id));
create policy addresses_owner on booking_addresses for all using (is_owner(salon_id)) with check (is_owner(salon_id));

-- Taken now also counts the travel time around home visits.
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
  select p.id, t.starts_at, t.ends_at
  from time_off t
  join professionals p on p.salon_id = t.salon_id and (t.professional_id is null or t.professional_id = p.id)
  where t.salon_id = p_salon and t.starts_at < p_to and t.ends_at > p_from;
$$;

-- The home fees for a visit starting at p_starts_at (salon time).
create function home_fees_for(p_salon uuid, p_starts_at timestamptz) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(sum(f.amount_cents), 0)::int
  from home_fees f join salons s on s.id = f.salon_id
  where f.salon_id = p_salon and f.active and (
    f.rule = 'sempre'
    or (f.rule = 'antes_das' and (p_starts_at at time zone s.timezone)::time < f.at)
    or (f.rule = 'depois_das' and (p_starts_at at time zone s.timezone)::time >= f.at)
    or (f.rule = 'fim_de_semana' and extract(dow from p_starts_at at time zone s.timezone) in (0, 6))
  );
$$;

-- Books a home visit: the service and professional must go out, the zone sets the fee and travel time.
create function create_home_booking(
  p_salon uuid, p_service uuid, p_professional uuid, p_starts_at timestamptz,
  p_client_name text, p_client_phone text, p_consent boolean,
  p_zone uuid, p_address text, p_postcode text, p_notes text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  h home_settings;
  z home_zones;
  v_duration int;
  v_price int;
  v_id uuid;
begin
  select * into h from home_settings where salon_id = p_salon and active;
  if not found then raise exception 'domicilio_fechado'; end if;
  select * into z from home_zones where id = p_zone and salon_id = p_salon and active;
  if not found then raise exception 'zona_invalida'; end if;
  perform 1 from services where id = p_service and salon_id = p_salon and active and at_home;
  if not found then raise exception 'servico_invalido'; end if;
  perform 1 from professionals where id = p_professional and salon_id = p_salon and active and at_home;
  if not found then raise exception 'profissional_invalido'; end if;
  if length(trim(coalesce(p_address, ''))) < 3 then raise exception 'morada_invalida'; end if;
  select e.price_cents, e.duration_min into v_price, v_duration from effective_service(p_service, p_professional) e;
  if v_price < h.min_order_cents then raise exception 'pedido_minimo'; end if;
  -- Travel there and back must be free too.
  if slot_taken(p_professional, p_starts_at - make_interval(mins => z.travel_min),
                p_starts_at + make_interval(mins => v_duration + z.travel_min), null) then
    raise exception 'horario_ocupado';
  end if;
  v_id := create_booking(p_salon, p_service, p_professional, p_starts_at, p_client_name, p_client_phone, p_consent);
  update bookings set location = 'domicilio', travel_min = z.travel_min,
         home_fee_cents = z.fee_cents + home_fees_for(p_salon, p_starts_at),
         deposit = case when h.deposit_required and (select deposit_cents from salons where id = p_salon) > 0 then 'pendente'::deposit_status else deposit end
  where id = v_id;
  insert into booking_addresses (booking_id, salon_id, professional_id, address, postcode, notes, zone_name)
  values (v_id, p_salon, p_professional, trim(p_address), nullif(trim(coalesce(p_postcode, '')), ''), nullif(trim(coalesce(p_notes, '')), ''), z.name);
  return v_id;
end;
$$;
grant execute on function create_home_booking(uuid, uuid, uuid, timestamptz, text, text, boolean, uuid, text, text, text) to anon, authenticated;

-- ============================================================================
-- 3. Packages. One model, three ways to sell:
--    combo:  several services in one visit, a fixed price, optional extras
--    evento: weddings and other events, by request and proposal (trial + the day, per person)
--    pack:   prepaid sessions of one service, used over time
-- ============================================================================
create table packages (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references salons(id) on delete cascade,
  mode text not null check (mode in ('combo', 'evento', 'pack')),
  name text not null check (length(trim(name)) between 1 and 80),
  description text not null default '' check (length(description) <= 800),
  price_cents int not null check (price_cents >= 0),     -- combo: the price; evento: the main person; pack: the whole pack
  per_guest_cents int check (per_guest_cents is null or per_guest_cents >= 0), -- evento: each extra person
  max_guests int check (max_guests is null or max_guests between 0 and 30),
  includes_trial boolean not null default false,          -- evento: a trial session weeks before
  extra_hour_cents int check (extra_hour_cents is null or extra_hour_cents >= 0), -- evento: each hour of waiting on the day
  deposit_pct int check (deposit_pct is null or deposit_pct between 0 and 100),   -- evento
  sessions int check (sessions is null or sessions between 2 and 50),             -- pack
  valid_days int check (valid_days is null or valid_days between 7 and 730),      -- pack
  active boolean not null default true,
  position int not null default 0,
  image_path text,
  created_at timestamptz not null default now(),
  check (mode <> 'pack' or sessions is not null)
);
create table package_items (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references packages(id) on delete cascade,
  service_id uuid not null references services(id) on delete cascade,
  optional boolean not null default false,  -- an extra the client may add
  extra_price_cents int check (extra_price_cents is null or extra_price_cents >= 0), -- price as an extra; null: the service's price
  position int not null default 0
);
create index package_items_package on package_items (package_id, position);
alter table salon_photos add column package_id uuid references packages(id) on delete set null;

alter table packages enable row level security;
alter table package_items enable row level security;
create policy packages_read on packages for select using (true);
create policy packages_write on packages for all using (has_access(salon_id, 'gestor')) with check (has_access(salon_id, 'gestor'));
create policy package_items_read on package_items for select using (true);
create policy package_items_write on package_items for all
  using (has_access((select salon_id from packages p where p.id = package_id), 'gestor'))
  with check (has_access((select salon_id from packages p where p.id = package_id), 'gestor'));

alter table bookings add column package_id uuid references packages(id) on delete set null;
alter table bookings add column package_summary text; -- what the visit includes, as booked
alter table bookings add column waiting_min int not null default 0 check (waiting_min >= 0); -- evento: paid waiting time

-- Combo: one visit with the package's services and the extras chosen, by one professional.
create function create_package_booking(
  p_salon uuid, p_package uuid, p_professional uuid, p_starts_at timestamptz,
  p_client_name text, p_client_phone text, p_consent boolean, p_extras uuid[]
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  k packages;
  v_duration int := 0;
  v_price int;
  v_first uuid;
  v_names text;
  v_deposit int;
  v_id uuid;
begin
  select * into k from packages where id = p_package and salon_id = p_salon and active and mode = 'combo';
  if not found then raise exception 'pacote_invalido'; end if;
  perform 1 from professionals where id = p_professional and salon_id = p_salon and active;
  if not found then raise exception 'profissional_invalido'; end if;
  if p_starts_at < now() then raise exception 'horario_passado'; end if;
  if length(trim(coalesce(p_client_name, ''))) = 0 or length(trim(coalesce(p_client_phone, ''))) < 9 then raise exception 'dados_cliente'; end if;
  select coalesce(sum(e.duration_min), 0),
         k.price_cents + coalesce(sum(case when i.optional then coalesce(i.extra_price_cents, e.price_cents) else 0 end), 0),
         (array_agg(i.service_id order by i.optional, i.position))[1],
         string_agg(s.name, ' + ' order by i.optional, i.position)
    into v_duration, v_price, v_first, v_names
  from package_items i
  join services s on s.id = i.service_id and s.active
  cross join lateral effective_service(i.service_id, p_professional) e
  where i.package_id = p_package and (not i.optional or i.id = any(coalesce(p_extras, '{}')));
  if v_first is null or v_duration = 0 then raise exception 'pacote_invalido'; end if;
  if slot_taken(p_professional, p_starts_at, p_starts_at + make_interval(mins => v_duration), null) then raise exception 'horario_ocupado'; end if;
  select deposit_cents into v_deposit from salons where id = p_salon;
  insert into bookings (salon_id, service_id, professional_id, starts_at, ends_at, client_name, client_phone,
                        consent_messages, deposit, price_cents, package_id, package_summary)
  values (p_salon, v_first, p_professional, p_starts_at, p_starts_at + make_interval(mins => v_duration),
          trim(p_client_name), trim(p_client_phone), coalesce(p_consent, false),
          case when v_deposit > 0 then 'pendente'::deposit_status else 'nenhum' end, v_price, k.id, k.name || ': ' || v_names)
  returning id into v_id;
  return v_id;
exception when exclusion_violation then
  raise exception 'horario_ocupado';
end;
$$;
grant execute on function create_package_booking(uuid, uuid, uuid, timestamptz, text, text, boolean, uuid[]) to anon, authenticated;

-- Evento: the client asks, the salon proposes, the client accepts.
create table package_requests (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references salons(id) on delete cascade,
  package_id uuid not null references packages(id) on delete cascade,
  client_name text not null,
  client_phone text not null,
  consent_messages boolean not null default false,
  event_date date not null,
  event_time time,
  place text not null default 'salao' check (place in ('salao', 'local')),
  address text check (address is null or length(address) <= 200),
  guests int not null default 0 check (guests between 0 and 30),
  extras uuid[] not null default '{}',
  message text check (message is null or length(message) <= 600),
  estimate_cents int not null default 0,
  -- pedido: sent by the client; proposta: the salon answered; aceite; recusado (by the client); cancelado (by the salon)
  status text not null default 'pedido' check (status in ('pedido', 'proposta', 'aceite', 'recusado', 'cancelado')),
  proposal_cents int,
  deposit_cents int,
  proposal_note text check (proposal_note is null or length(proposal_note) <= 600),
  professional_id uuid references professionals(id) on delete set null,
  trial_at timestamptz,
  trial_min int,
  event_at timestamptz,
  event_min int,
  valid_until date,
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  decided_at timestamptz
);
create index package_requests_salon on package_requests (salon_id, created_at desc);
alter table package_requests enable row level security;
create policy package_requests_team on package_requests for select using (has_access(salon_id, 'rececao'));
create policy package_requests_team_update on package_requests for update using (has_access(salon_id, 'rececao')) with check (has_access(salon_id, 'rececao'));
alter table bookings add column package_request_id uuid references package_requests(id) on delete set null;

create function request_package(
  p_package uuid, p_name text, p_phone text, p_consent boolean, p_date date, p_time time,
  p_place text, p_address text, p_guests int, p_extras uuid[], p_message text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  k packages;
  v_extras int;
  v_id uuid;
begin
  select * into k from packages where id = p_package and active and mode = 'evento';
  if not found then raise exception 'pacote_invalido'; end if;
  if length(trim(coalesce(p_name, ''))) = 0 or length(phone_key(p_phone)) < 9 then raise exception 'dados_cliente'; end if;
  if p_date is null or p_date < current_date then raise exception 'data_invalida'; end if;
  if coalesce(p_guests, 0) < 0 or (k.max_guests is not null and p_guests > k.max_guests) then raise exception 'convidados_invalidos'; end if;
  select coalesce(sum(coalesce(i.extra_price_cents, s.price_cents)), 0) into v_extras
  from package_items i join services s on s.id = i.service_id
  where i.package_id = p_package and i.optional and i.id = any(coalesce(p_extras, '{}'));
  insert into package_requests (salon_id, package_id, client_name, client_phone, consent_messages, event_date, event_time,
                                place, address, guests, extras, message, estimate_cents)
  values (k.salon_id, k.id, trim(p_name), trim(p_phone), coalesce(p_consent, false), p_date, p_time,
          case when p_place = 'local' then 'local' else 'salao' end, nullif(trim(coalesce(p_address, '')), ''),
          coalesce(p_guests, 0), coalesce(p_extras, '{}'), nullif(trim(coalesce(p_message, '')), ''),
          k.price_cents + coalesce(k.per_guest_cents, 0) * coalesce(p_guests, 0) + v_extras)
  returning id into v_id;
  return v_id;
end;
$$;
grant execute on function request_package(uuid, text, text, boolean, date, time, text, text, int, uuid[], text) to anon, authenticated;

-- What the client sees on /pedido/<id>.
create function package_request_for_client(p_request uuid)
returns table (
  id uuid, status text, package_name text, package_description text, includes_trial boolean, extra_hour_cents int,
  event_date date, event_time time, place text, guests int, estimate_cents int,
  proposal_cents int, deposit_cents int, proposal_note text, trial_at timestamptz, event_at timestamptz, valid_until date,
  client_name text, salon_slug text, salon_name text, salon_theme text, salon_timezone text, salon_whatsapp text,
  mbway_number text, salon_logo text, professional_name text
)
language sql stable security definer set search_path = public as $$
  select r.id, r.status, k.name, k.description, k.includes_trial, k.extra_hour_cents,
         r.event_date, r.event_time, r.place, r.guests, r.estimate_cents,
         r.proposal_cents, r.deposit_cents, r.proposal_note, r.trial_at, r.event_at, r.valid_until,
         r.client_name, s.slug, s.name, s.theme, s.timezone, s.whatsapp, s.mbway_number, s.logo_path, p.name
  from package_requests r
  join packages k on k.id = r.package_id
  join salons s on s.id = r.salon_id
  left join professionals p on p.id = r.professional_id
  where r.id = p_request;
$$;
grant execute on function package_request_for_client(uuid) to anon, authenticated;

-- The salon sends its proposal: price, deposit, the trial and the day in the agenda's terms.
create function propose_package(
  p_request uuid, p_price int, p_deposit int, p_note text, p_professional uuid,
  p_trial_at timestamptz, p_trial_min int, p_event_at timestamptz, p_event_min int, p_valid_until date
) returns void
language plpgsql security definer set search_path = public as $$
declare r package_requests;
begin
  select * into r from package_requests where id = p_request for update;
  if not found then raise exception 'pedido_inexistente'; end if;
  if not has_access(r.salon_id, 'rececao') then raise exception 'sem_permissao'; end if;
  if r.status not in ('pedido', 'proposta') then raise exception 'pedido_fechado'; end if;
  if p_price is null or p_price < 0 or coalesce(p_deposit, 0) < 0 or coalesce(p_deposit, 0) > p_price then raise exception 'valores_invalidos'; end if;
  perform 1 from professionals where id = p_professional and salon_id = r.salon_id;
  if not found then raise exception 'profissional_invalido'; end if;
  if p_event_at is null or coalesce(p_event_min, 0) < 15 or (p_trial_at is not null and coalesce(p_trial_min, 0) < 15) then raise exception 'datas_invalidas'; end if;
  update package_requests set status = 'proposta', proposal_cents = p_price, deposit_cents = coalesce(p_deposit, 0),
         proposal_note = nullif(trim(coalesce(p_note, '')), ''), professional_id = p_professional,
         trial_at = p_trial_at, trial_min = p_trial_min, event_at = p_event_at, event_min = p_event_min,
         valid_until = p_valid_until, answered_at = now()
  where id = p_request;
end;
$$;
grant execute on function propose_package(uuid, int, int, text, uuid, timestamptz, int, timestamptz, int, date) to authenticated;

-- The client accepts: the trial and the day go into the agenda as bookings.
create function accept_package_proposal(p_request uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  r package_requests;
  k packages;
  v_service uuid;
begin
  select * into r from package_requests where id = p_request for update;
  if not found then raise exception 'pedido_inexistente'; end if;
  if r.status <> 'proposta' then raise exception 'sem_proposta'; end if;
  if r.valid_until is not null and r.valid_until < current_date then raise exception 'proposta_expirada'; end if;
  select * into k from packages where id = r.package_id;
  select service_id into v_service from package_items where package_id = k.id and not optional order by position limit 1;
  if v_service is null then select service_id into v_service from package_items where package_id = k.id order by position limit 1; end if;
  if v_service is null then raise exception 'pacote_invalido'; end if;
  if r.trial_at is not null then
    if slot_taken(r.professional_id, r.trial_at, r.trial_at + make_interval(mins => r.trial_min), null) then raise exception 'horario_ocupado'; end if;
    insert into bookings (salon_id, service_id, professional_id, starts_at, ends_at, client_name, client_phone, consent_messages,
                          deposit, price_cents, package_id, package_summary, package_request_id, location)
    values (r.salon_id, v_service, r.professional_id, r.trial_at, r.trial_at + make_interval(mins => r.trial_min),
            r.client_name, r.client_phone, r.consent_messages, 'nenhum', 0, k.id, k.name || ': prova', r.id, 'salao');
  end if;
  if slot_taken(r.professional_id, r.event_at, r.event_at + make_interval(mins => r.event_min), null) then raise exception 'horario_ocupado'; end if;
  insert into bookings (salon_id, service_id, professional_id, starts_at, ends_at, client_name, client_phone, consent_messages,
                        deposit, price_cents, package_id, package_summary, package_request_id, location)
  values (r.salon_id, v_service, r.professional_id, r.event_at, r.event_at + make_interval(mins => r.event_min),
          r.client_name, r.client_phone, r.consent_messages,
          case when coalesce(r.deposit_cents, 0) > 0 then 'pendente'::deposit_status else 'nenhum' end,
          r.proposal_cents, k.id, k.name || case when r.guests > 0 then ' (+' || r.guests || ')' else '' end, r.id,
          case when r.place = 'local' then 'domicilio' else 'salao' end);
  update package_requests set status = 'aceite', decided_at = now() where id = p_request;
exception when exclusion_violation then
  raise exception 'horario_ocupado';
end;
$$;
grant execute on function accept_package_proposal(uuid) to anon, authenticated;

create function decline_package_proposal(p_request uuid) returns void
language sql security definer set search_path = public as $$
  update package_requests set status = 'recusado', decided_at = now() where id = p_request and status in ('pedido', 'proposta');
$$;
grant execute on function decline_package_proposal(uuid) to anon, authenticated;

-- Pack: prepaid sessions. The client asks to buy; the salon activates once paid and marks each session used.
create table client_packs (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references salons(id) on delete cascade,
  package_id uuid not null references packages(id) on delete cascade,
  phone_key text not null check (phone_key ~ '^[0-9]{6,15}$'),
  client_name text not null,
  client_phone text not null,
  sessions_total int not null check (sessions_total > 0),
  sessions_used int not null default 0 check (sessions_used >= 0),
  price_cents int not null check (price_cents >= 0),
  status text not null default 'pedido' check (status in ('pedido', 'ativo', 'terminado', 'cancelado')),
  paid_at timestamptz,
  expires_on date,
  created_at timestamptz not null default now(),
  check (sessions_used <= sessions_total)
);
create index client_packs_salon on client_packs (salon_id, phone_key);
alter table client_packs enable row level security;
create policy client_packs_team on client_packs for select using (has_access(salon_id, 'agenda'));
create policy client_packs_team_write on client_packs for insert with check (has_access(salon_id, 'rececao'));
create policy client_packs_team_update on client_packs for update using (has_access(salon_id, 'agenda')) with check (has_access(salon_id, 'agenda'));
alter table bookings add column client_pack_id uuid references client_packs(id) on delete set null;

create function buy_pack(p_package uuid, p_name text, p_phone text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  k packages;
  v_id uuid;
begin
  select * into k from packages where id = p_package and active and mode = 'pack';
  if not found then raise exception 'pacote_invalido'; end if;
  if length(trim(coalesce(p_name, ''))) = 0 or length(phone_key(p_phone)) < 9 then raise exception 'dados_cliente'; end if;
  insert into client_packs (salon_id, package_id, phone_key, client_name, client_phone, sessions_total, price_cents)
  values (k.salon_id, k.id, phone_key(p_phone), trim(p_name), trim(p_phone), k.sessions, k.price_cents)
  returning id into v_id;
  return v_id;
end;
$$;
grant execute on function buy_pack(uuid, text, text) to anon, authenticated;

-- Marks one session of an active pack as used by a booking; the visit itself is then free (paid with the pack).
create function use_pack_session(p_pack uuid, p_booking uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  c client_packs;
  b bookings;
begin
  select * into c from client_packs where id = p_pack for update;
  if not found or not has_access(c.salon_id, 'agenda') then raise exception 'sem_permissao'; end if;
  if c.status <> 'ativo' then raise exception 'pack_inativo'; end if;
  if c.expires_on is not null and c.expires_on < current_date then raise exception 'pack_expirado'; end if;
  select * into b from bookings where id = p_booking and salon_id = c.salon_id;
  if not found then raise exception 'marcacao_inexistente'; end if;
  if b.client_pack_id is not null then raise exception 'ja_usado'; end if;
  update bookings set client_pack_id = c.id, price_cents = 0 where id = p_booking;
  update client_packs set sessions_used = sessions_used + 1,
         status = case when sessions_used + 1 >= sessions_total then 'terminado' else status end
  where id = p_pack;
  return c.sessions_total - c.sessions_used - 1;
end;
$$;
grant execute on function use_pack_session(uuid, uuid) to authenticated;

-- Forgetting a client also removes their packs and event requests.
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
  return v_count;
end;
$$;
