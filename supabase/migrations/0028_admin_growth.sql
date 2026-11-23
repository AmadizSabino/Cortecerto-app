-- 0028: batch 4 of the admin dashboard.
-- 1. prospects: the salons the admin is approaching, with a status and the next follow-up.
-- 2. salons.heard_from: "Como conheceu a CorteCerto?", asked at the end of sign-up.
-- 3. Demo salons: the admin marks a salon as a demo (left out of the money and growth numbers)
--    and fills it with sample bookings for demos, or clears them. Sample bookings have demo = true.
-- 4. Two-step login for the admin: once the admin has a verified authenticator app (Supabase MFA,
--    TOTP), admin access needs a session that used it (aal2). Without one, nothing changes.
--    Lost phone: delete the factor in Supabase > Authentication > Users > the user > MFA.

-- 1. Prospects -------------------------------------------------------------------
create table prospects (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null check (length(trim(name)) between 1 and 120),
  contact_name text check (length(contact_name) <= 120),
  city text check (length(city) <= 80),
  phone text check (length(phone) <= 30),
  instagram text check (length(instagram) <= 80),
  email text check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  source text check (length(source) <= 40),
  status text not null default 'por_contactar'
    check (status in ('por_contactar', 'contactado', 'demo_marcada', 'em_experiencia', 'cliente', 'sem_interesse')),
  next_on date,
  notes text not null default '' check (length(notes) <= 4000),
  salon_id uuid references salons(id) on delete set null
);
create index prospects_next on prospects (next_on) where status not in ('cliente', 'sem_interesse');
alter table prospects enable row level security;
create policy prospects_admin on prospects for all using (is_platform_admin()) with check (is_platform_admin());

-- 2. How they heard about CorteCerto ------------------------------------------------
alter table salons add column heard_from text
  check (heard_from in ('instagram', 'facebook', 'tiktok', 'google', 'amigo', 'visita', 'cartaz', 'outro'));
alter table salons add column heard_detail text check (length(heard_detail) <= 120);

-- 3. Demo salons and sample bookings -------------------------------------------------
alter table salons add column is_demo boolean not null default false;
alter table bookings add column demo boolean not null default false;

-- Only the admin changes is_demo (the owner's own updates keep working for everything else).
create function protect_demo_flag() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.is_demo is distinct from old.is_demo and coalesce(current_setting('role', true), 'none') <> 'service_role' and not is_platform_admin() then
    raise exception 'sem_permissao';
  end if;
  return new;
end $$;
create trigger salons_protect_demo before update on salons for each row execute function protect_demo_flag();

create function admin_set_demo(p_salon uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'sem_permissao'; end if;
  update salons set is_demo = p_on where id = p_salon;
end $$;
revoke execute on function admin_set_demo(uuid, boolean) from public, anon;
grant execute on function admin_set_demo(uuid, boolean) to authenticated;

-- Sample bookings for a demo salon: the last 4 weeks and the next week, on its active
-- services and professionals, mostly done, a few no-shows, the future ones confirmed.
-- Clients have made-up names and 900 numbers (not real Portuguese phones). Filling again replaces
-- the earlier sample. Returns how many.
create function admin_fill_demo(p_salon uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_tz text; v_n int := 0; v_day date; v_pro record; v_hour int; v_svc record; v_i int := 0; v_start timestamptz; v_status booking_status;
  v_names text[] := array['João Silva', 'Miguel Costa', 'Rui Ferreira', 'Tiago Santos', 'André Pereira', 'Pedro Oliveira',
    'Bruno Rodrigues', 'Diogo Martins', 'Ricardo Sousa', 'Nuno Fernandes', 'Hugo Gonçalves', 'Carlos Lopes',
    'Fábio Marques', 'Luís Almeida', 'Paulo Ribeiro', 'Gonçalo Pinto', 'Rafael Carvalho', 'Vasco Teixeira',
    'Duarte Moreira', 'Filipe Correia', 'Marco Mendes', 'Sérgio Nunes', 'Leonardo Vieira', 'Daniel Rocha'];
  v_svcs uuid[]; v_sid uuid;
begin
  if not is_platform_admin() then raise exception 'sem_permissao'; end if;
  if not exists (select 1 from salons where id = p_salon and is_demo) then raise exception 'nao_e_demo'; end if;
  select timezone into v_tz from salons where id = p_salon;
  select array_agg(id order by price_cents) into v_svcs from services where salon_id = p_salon and active and duration_min <= 60;
  if v_svcs is null then raise exception 'sem_servicos'; end if;
  delete from bookings where salon_id = p_salon and demo; -- filling again starts over
  for v_day in select d::date from generate_series(current_date - 28, current_date + 7, interval '1 day') d loop
    if extract(isodow from v_day) = 7 then continue; end if; -- closed on Sundays
    for v_pro in select id from professionals where salon_id = p_salon and active order by name loop
      foreach v_hour in array array[10, 11, 12, 14, 15, 16, 17, 18] loop
        v_i := v_i + 1;
        -- About 6 in 10 slots booked, busier on Fridays and Saturdays.
        if ((v_i * 7919) % 10 >= (case when extract(isodow from v_day) in (5, 6) then 8 else 5 end)) then continue; end if;
        v_sid := v_svcs[1 + (v_i * 31) % array_length(v_svcs, 1)];
        select id, duration_min, price_cents into v_svc from services where id = v_sid;
        v_start := (v_day + make_time(v_hour, case when v_i % 3 = 0 then 30 else 0 end, 0)) at time zone coalesce(v_tz, 'Europe/Lisbon');
        v_status := case when v_start > now() then 'confirmada'::booking_status
                         when v_i % 13 = 0 then 'faltou'::booking_status
                         when v_i % 17 = 0 then 'cancelada'::booking_status else 'concluida'::booking_status end;
        insert into bookings (salon_id, service_id, professional_id, starts_at, ends_at, client_name, client_phone,
                              consent_messages, status, price_cents, source, demo)
        values (p_salon, v_svc.id, v_pro.id, v_start, v_start + make_interval(mins => v_svc.duration_min),
                v_names[1 + (v_i * 13) % array_length(v_names, 1)], '900000' || lpad((1 + (v_i * 13) % array_length(v_names, 1))::text, 3, '0'),
                true, v_status, v_svc.price_cents,
                case when v_i % 5 < 3 then 'online' when v_i % 5 = 3 then 'telefone' else 'presencial' end, true)
        on conflict do nothing;
        if found then v_n := v_n + 1; end if;
      end loop;
    end loop;
  end loop;
  return v_n;
end $$;
revoke execute on function admin_fill_demo(uuid) from public, anon;
grant execute on function admin_fill_demo(uuid) to authenticated;

create function admin_clear_demo(p_salon uuid) returns int
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  if not is_platform_admin() then raise exception 'sem_permissao'; end if;
  delete from bookings where salon_id = p_salon and demo;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke execute on function admin_clear_demo(uuid) from public, anon;
grant execute on function admin_clear_demo(uuid) to authenticated;

-- How sign-ups heard about CorteCerto, for /admin > Site.
create function admin_heard_from() returns table (heard_from text, salons bigint, paying bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'sem_permissao'; end if;
  return query
    select coalesce(s.heard_from, 'sem_resposta'), count(*), count(*) filter (where s.subscription = 'ativa')
    from salons s where not s.is_demo group by 1 order by 2 desc;
end $$;
revoke execute on function admin_heard_from() from public, anon;
grant execute on function admin_heard_from() to authenticated;

-- 4. Two-step login for the admin ----------------------------------------------------
-- Same function name and signature, so every admin check (policies, RPCs) follows it.
create or replace function is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = auth.uid())
     and (coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2'
          or not exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified'))
$$;
