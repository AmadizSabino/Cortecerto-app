-- 0027: the site and the system, for /admin (batch 3 of the admin dashboard).
-- 1. site_events: anonymous visits and clicks (landing page, sign-up, booking pages, WhatsApp, install).
--    No cookies and no personal data: the Worker stores a daily visitor code (a hash of the
--    connection, the browser and the day, so it changes every day and can't be traced back),
--    the page path without its query, the campaign (?src=) and the referring site's name.
-- 2. uptime_checks: the Worker checks the app and the database every 5 minutes.
-- 3. ai_requests gets the model, tokens and cost of each request, priced from editable settings,
--    so /admin shows the month's AI cost against the budget (10 € by default).
-- 4. admin_alerts: one row per alert email sent (site down, AI budget, daily summary), so each goes once.
-- 5. Settings: 'ia' (budget, exchange rate, prices) and 'resumo' (daily summary email, off by default).

-- 1. Site events ---------------------------------------------------------------
create table site_events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  name text not null check (name in ('visita', 'conta_criada', 'salao_criado', 'marcacao_inicio', 'marcacao_feita', 'whatsapp', 'instalar')),
  page text not null check (page in ('site', 'registo', 'salao', 'painel', 'outra')),
  path text check (length(path) <= 120),
  src text check (src ~ '^[a-z0-9_-]{1,40}$'),
  ref text check (length(ref) <= 80),
  salon_id uuid references salons(id) on delete cascade,
  visitor text check (visitor ~ '^[0-9a-f]{16}$'),
  device text check (device in ('telemovel', 'computador'))
);
create index site_events_at on site_events (at desc);
create index site_events_salon on site_events (salon_id, at) where salon_id is not null;
alter table site_events enable row level security;
-- Written only by the Worker (service role). Read only through admin_site_stats().

-- 2. Uptime --------------------------------------------------------------------
create table uptime_checks (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  ok boolean not null,
  app_ok boolean not null,
  db_ok boolean not null,
  ms int,
  detail text check (length(detail) <= 200)
);
create index uptime_checks_at on uptime_checks (at desc);
alter table uptime_checks enable row level security;

-- 3. AI cost -------------------------------------------------------------------
alter table ai_requests add column model text check (length(model) <= 60);
alter table ai_requests add column input_tokens int;
alter table ai_requests add column output_tokens int;
alter table ai_requests add column images int not null default 0;
alter table ai_requests add column cost_usd numeric(10, 6);

-- 5. Settings (before the cost trigger reads them) -----------------------------
alter table platform_settings drop constraint platform_settings_key_check;
alter table platform_settings add constraint platform_settings_key_check check (key in ('pagamentos', 'lembretes', 'ia', 'resumo'));
-- Prices in US dollars: per million tokens in and out, and per image made. Claude Haiku 5.5 and
-- Gemini 2.5 Flash Image as of November 2026; change them in /admin > Sistema when they change.
insert into platform_settings (key, value) values
  ('ia', '{"orcamento_eur": 10, "eur_por_usd": 0.87, "precos": {"claude-haiku-5-5": {"entrada": 0.10, "saida": 0.50}, "claude-sonnet-5-5": {"entrada": 2, "saida": 10}, "gemini-2.5-flash-image": {"imagem": 0.04}}}'),
  ('resumo', '{"diario": false, "email": ""}')
on conflict (key) do nothing;

-- The cost of a request, from the prices in the settings. Unknown model: no cost (shown as "sem preço").
create function ai_request_cost() returns trigger language plpgsql security definer set search_path = public as $$
declare v_p jsonb;
begin
  if new.model is null then return new; end if;
  select value->'precos'->new.model into v_p from platform_settings where key = 'ia';
  if v_p is null then return new; end if;
  new.cost_usd := coalesce(new.input_tokens, 0) * coalesce((v_p->>'entrada')::numeric, 0) / 1e6
                + coalesce(new.output_tokens, 0) * coalesce((v_p->>'saida')::numeric, 0) / 1e6
                + coalesce(new.images, 0) * coalesce((v_p->>'imagem')::numeric, 0);
  return new;
end $$;
create trigger ai_requests_cost before insert on ai_requests for each row execute function ai_request_cost();

-- 4. Alerts --------------------------------------------------------------------
create table admin_alerts (
  kind text not null check (kind in ('site_em_baixo', 'site_voltou', 'orcamento_ia', 'resumo')),
  period text not null check (length(period) <= 20),
  sent_at timestamptz not null default now(),
  primary key (kind, period)
);
alter table admin_alerts enable row level security;
create policy admin_alerts_read on admin_alerts for select using (is_platform_admin());

create function is_service_or_admin() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(current_setting('role', true), 'none') = 'service_role' or is_platform_admin()
$$;

-- Records an alert once per period; true when this call is the first (the Worker then sends it).
create function claim_admin_alert(p_kind text, p_period text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not is_service_or_admin() then raise exception 'sem_permissao'; end if;
  insert into admin_alerts (kind, period) values (p_kind, p_period) on conflict do nothing;
  return found;
end $$;
revoke execute on function claim_admin_alert(text, text) from public, anon;
grant execute on function claim_admin_alert(text, text) to authenticated, service_role;

-- AI cost this month in euros, and the budget.
create function ai_month_cost() returns table (cost_eur numeric, budget_eur numeric, requests bigint, unpriced bigint)
language sql stable security definer set search_path = public as $$
  with s as (select value from platform_settings where key = 'ia')
  select round(coalesce(sum(a.cost_usd), 0) * coalesce((select (value->>'eur_por_usd')::numeric from s), 0.87), 4),
         coalesce((select (value->>'orcamento_eur')::numeric from s), 10),
         count(*) filter (where a.status = 'feito'),
         count(*) filter (where a.status = 'feito' and a.cost_usd is null)
  from ai_requests a
  where a.created_at >= date_trunc('month', now() at time zone 'Europe/Lisbon') at time zone 'Europe/Lisbon'
$$;
revoke execute on function ai_month_cost() from public, anon;

-- What the Worker's scheduled checks need: where alerts go, the last checks, the AI cost.
create function ops_status() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not is_service_or_admin() then raise exception 'sem_permissao'; end if;
  select jsonb_build_object(
    'email', coalesce(nullif((select value->>'email' from platform_settings where key = 'resumo'), ''),
                      (select u.email::text from platform_admins p join auth.users u on u.id = p.user_id order by u.email limit 1)),
    'digest', coalesce((select (value->>'diario')::boolean from platform_settings where key = 'resumo'), false),
    'last_checks', coalesce((select jsonb_agg(jsonb_build_object('at', c.at, 'ok', c.ok, 'detail', c.detail) order by c.at desc)
                             from (select * from uptime_checks order by at desc limit 3) c), '[]'),
    'down_since', (select min(c.at) from uptime_checks c where not c.ok
                     and c.at > coalesce((select max(k.at) from uptime_checks k where k.ok), '-infinity')),
    'ai', (select row_to_json(m) from ai_month_cost() m)
  ) into v;
  return v;
end $$;
revoke execute on function ops_status() from public, anon;
grant execute on function ops_status() to authenticated, service_role;

-- The daily summary for the admin: yesterday (Lisbon) and where things stand today.
create function ops_digest() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Europe/Lisbon')::date;
  v_from timestamptz := ((v_today - 1)::timestamp at time zone 'Europe/Lisbon');
  v_to timestamptz := (v_today::timestamp at time zone 'Europe/Lisbon');
  v jsonb;
begin
  if not is_service_or_admin() then raise exception 'sem_permissao'; end if;
  select jsonb_build_object(
    'day', v_today - 1,
    'visitors', (select count(distinct visitor) from site_events where at >= v_from and at < v_to and name = 'visita' and page = 'site'),
    'accounts', (select count(*) from site_events where at >= v_from and at < v_to and name = 'conta_criada'),
    'new_salons', (select coalesce(jsonb_agg(s.name order by s.created_at), '[]') from salons s where s.created_at >= v_from and s.created_at < v_to),
    'bookings', (select count(*) from bookings b where b.created_at >= v_from and b.created_at < v_to and b.status <> 'cancelada'),
    'bookings_online', (select count(*) from bookings b where b.created_at >= v_from and b.created_at < v_to and b.status <> 'cancelada' and b.source = 'online'),
    'paying', (select count(*) from salons where subscription = 'ativa'),
    'trials_ending_7d', (select count(*) from salons where subscription = 'experimental' and trial_ends_at between now() and now() + interval '7 days'),
    'owed_cents', (select coalesce(sum(amount_cents), 0) from invoices where status = 'por_pagar' and request_id is null),
    'overdue', (select count(*) from invoices where status = 'por_pagar' and request_id is null and due_on < v_today),
    'paid_yesterday_cents', (select coalesce(sum(amount_cents), 0) from invoices where status = 'paga' and request_id is null and paid_on = v_today - 1),
    'reminders_due', (select count(*) from reminders_due()),
    'errors', (select count(*) from client_errors where at >= v_from and at < v_to),
    'uptime_checks', (select count(*) from uptime_checks where at >= v_from and at < v_to),
    'uptime_failed', (select count(*) from uptime_checks where at >= v_from and at < v_to and not ok),
    'ai', (select row_to_json(m) from ai_month_cost() m)
  ) into v;
  return v;
end $$;
revoke execute on function ops_digest() from public, anon;
grant execute on function ops_digest() to authenticated, service_role;

-- /admin > Site: visits and clicks over the last p_days days.
create function admin_site_stats(p_days int default 30) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_from timestamptz := now() - make_interval(days => least(greatest(p_days, 1), 90)); v jsonb;
begin
  if not is_platform_admin() then raise exception 'sem_permissao'; end if;
  select jsonb_build_object(
    'days', least(greatest(p_days, 1), 90),
    'totals', (select coalesce(jsonb_object_agg(k, n), '{}') from (
        select page || ':' || name as k, count(*) as n from site_events where at >= v_from group by 1) t),
    'visitors', (select coalesce(jsonb_object_agg(page, n), '{}') from (
        select page, count(distinct (visitor, (at at time zone 'Europe/Lisbon')::date)) as n
        from site_events where at >= v_from and name = 'visita' group by page) t),
    'daily', (select coalesce(jsonb_agg(row_to_json(d) order by d.day), '[]') from (
        select to_char(g.day, 'YYYY-MM-DD') as day,
               count(distinct e.visitor) filter (where e.page = 'site' and e.name = 'visita') as site,
               count(distinct e.visitor) filter (where e.page = 'salao' and e.name = 'visita') as salao,
               count(e.id) filter (where e.name = 'marcacao_feita') as marcacoes
        from generate_series((v_from at time zone 'Europe/Lisbon')::date, (now() at time zone 'Europe/Lisbon')::date, interval '1 day') as g(day)
        left join site_events e on (e.at at time zone 'Europe/Lisbon')::date = g.day::date
        group by g.day) d),
    'sources', (select coalesce(jsonb_agg(row_to_json(s) order by s.visits desc), '[]') from (
        select coalesce(src, case when ref is null then 'direto' else ref end) as source, src is not null as campaign,
               count(*) filter (where name = 'visita') as visits,
               count(*) filter (where name = 'conta_criada') as accounts,
               count(*) filter (where name = 'marcacao_feita') as bookings
        from site_events where at >= v_from group by 1, 2 order by 3 desc limit 15) s),
    'devices', (select coalesce(jsonb_object_agg(coalesce(device, 'outro'), n), '{}') from (
        select device, count(distinct visitor) as n from site_events where at >= v_from and name = 'visita' group by device) t),
    'salons', (select coalesce(jsonb_agg(row_to_json(x) order by x.visits desc), '[]') from (
        select s.id, s.name,
               count(*) filter (where e.name = 'visita') as visits,
               count(*) filter (where e.name = 'marcacao_inicio') as started,
               count(*) filter (where e.name = 'marcacao_feita') as booked,
               count(*) filter (where e.name = 'whatsapp') as whatsapp
        from site_events e join salons s on s.id = e.salon_id
        where e.at >= v_from group by s.id, s.name order by 3 desc limit 10) x)
  ) into v;
  return v;
end $$;
revoke execute on function admin_site_stats(int) from public, anon;
grant execute on function admin_site_stats(int) to authenticated;

-- /admin > Sistema: uptime and AI cost.
create function admin_ops() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not is_platform_admin() then raise exception 'sem_permissao'; end if;
  select jsonb_build_object(
    'uptime', (select jsonb_object_agg(w, jsonb_build_object('checks', n, 'failed', f)) from (
        select '24h' as w, count(*) as n, count(*) filter (where not ok) as f from uptime_checks where at > now() - interval '24 hours'
        union all select '7d', count(*), count(*) filter (where not ok) from uptime_checks where at > now() - interval '7 days'
        union all select '30d', count(*), count(*) filter (where not ok) from uptime_checks where at > now() - interval '30 days') t),
    'last_check', (select row_to_json(c) from (select at, ok, app_ok, db_ok, ms, detail from uptime_checks order by at desc limit 1) c),
    'failures', (select coalesce(jsonb_agg(row_to_json(c) order by c.at desc), '[]') from (
        select at, app_ok, db_ok, detail from uptime_checks where not ok and at > now() - interval '30 days' order by at desc limit 10) c),
    'ai_month', (select row_to_json(m) from ai_month_cost() m),
    'ai_features', (select coalesce(jsonb_agg(row_to_json(f) order by f.cost_usd desc nulls last), '[]') from (
        select feature, coalesce(model, '—') as model, count(*) as n, sum(input_tokens) as input_tokens, sum(output_tokens) as output_tokens,
               sum(images) as images, round(sum(cost_usd), 4) as cost_usd
        from ai_requests where status = 'feito'
          and created_at >= date_trunc('month', now() at time zone 'Europe/Lisbon') at time zone 'Europe/Lisbon'
        group by feature, model) f),
    'ai_months', (select coalesce(jsonb_agg(row_to_json(m) order by m.month), '[]') from (
        select to_char(date_trunc('month', created_at at time zone 'Europe/Lisbon'), 'YYYY-MM') as month,
               round(sum(cost_usd), 4) as cost_usd, count(*) filter (where status = 'feito') as n
        from ai_requests where created_at > now() - interval '6 months' group by 1) m),
    'alerts', (select coalesce(jsonb_agg(row_to_json(a) order by a.sent_at desc), '[]') from (
        select kind, period, sent_at from admin_alerts order by sent_at desc limit 10) a)
  ) into v;
  return v;
end $$;
revoke execute on function admin_ops() from public, anon;
grant execute on function admin_ops() to authenticated;

-- Keep 13 months of events and 60 days of checks, if pg_cron is available.
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('trim-site-events', '50 3 * * *', $c$delete from public.site_events where at < now() - interval '13 months'$c$);
  perform cron.schedule('trim-uptime-checks', '55 3 * * *', $c$delete from public.uptime_checks where at < now() - interval '60 days'$c$);
exception when others then
  raise notice 'pg_cron not available: old site events and uptime checks will not be trimmed automatically (%).', sqlerrm;
end;
$$;
