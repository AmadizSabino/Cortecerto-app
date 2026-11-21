-- Walk-in queue: clients scan the salon's QR code, join the queue with their name
-- and phone, and see how many people are ahead. The salon calls them by WhatsApp.

alter table salons add column queue_open boolean not null default false;

create type walkin_status as enum ('espera', 'chamado', 'atendido', 'saiu');

create table walkins (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references salons(id) on delete cascade,
  client_name text not null check (length(trim(client_name)) between 1 and 80),
  client_phone text check (client_phone is null or length(client_phone) between 9 and 20),
  consent_messages boolean not null default false,
  status walkin_status not null default 'espera',
  created_at timestamptz not null default now(),
  called_at timestamptz,
  finished_at timestamptz
);
create index walkins_salon_open on walkins (salon_id, created_at) where status in ('espera', 'chamado');
-- One place in the queue per phone at a time.
create unique index walkins_one_per_phone on walkins (salon_id, client_phone)
  where status in ('espera', 'chamado') and client_phone is not null;

alter table walkins enable row level security;
create policy walkins_owner on walkins for all using (is_owner(salon_id)) with check (is_owner(salon_id));

-- Clients join without an account. Returns the place id, kept in their browser.
create function join_queue(p_salon uuid, p_name text, p_phone text, p_consent boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform 1 from salons where id = p_salon and queue_open;
  if not found then raise exception 'fila_fechada'; end if;
  if length(trim(coalesce(p_name, ''))) = 0 or length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) < 9 then
    raise exception 'dados_cliente';
  end if;
  -- Already in the queue with this phone: hand back the same place.
  select id into v_id from walkins
    where salon_id = p_salon and client_phone = trim(p_phone) and status in ('espera', 'chamado');
  if found then return v_id; end if;
  insert into walkins (salon_id, client_name, client_phone, consent_messages)
  values (p_salon, trim(p_name), trim(p_phone), coalesce(p_consent, false))
  returning id into v_id;
  return v_id;
end;
$$;

-- What the client sees: their status, how many are ahead, and what the estimate needs.
create function queue_status(p_walkin uuid)
returns table (
  status walkin_status, ahead int, client_name text,
  salon_name text, salon_slug text, salon_theme text, queue_open boolean,
  avg_minutes int, professionals int
)
language sql stable security definer set search_path = public as $$
  select w.status,
         (select count(*)::int from walkins o where o.salon_id = w.salon_id and o.status = 'espera' and o.created_at < w.created_at),
         w.client_name, s.name, s.slug, s.theme, s.queue_open,
         coalesce((select round(avg(duration_min))::int from services where salon_id = s.id and active), 30),
         greatest((select count(*)::int from professionals where salon_id = s.id and active), 1)
  from walkins w join salons s on s.id = w.salon_id
  where w.id = p_walkin;
$$;

-- How long the queue is right now, for the join page.
create function queue_length(p_salon uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from walkins where salon_id = p_salon and status = 'espera';
$$;

create function leave_queue(p_walkin uuid) returns void
language sql security definer set search_path = public as $$
  update walkins set status = 'saiu', finished_at = now() where id = p_walkin and status in ('espera', 'chamado');
$$;

grant execute on function join_queue(uuid, text, text, boolean) to anon, authenticated;
grant execute on function queue_status(uuid) to anon, authenticated;
grant execute on function queue_length(uuid) to anon, authenticated;
grant execute on function leave_queue(uuid) to anon, authenticated;
