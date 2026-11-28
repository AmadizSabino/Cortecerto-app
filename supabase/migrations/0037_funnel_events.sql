-- 0037: funnel events for /admin > Site.
-- Adds four anonymous events to site_events (still no cookies, nothing personal):
--   cta            a "Experimentar / Começar grátis" button on the site, detail = where (hero, calculadora, fixo, ...)
--   calculadora    the visitor moved the no-show calculator (once per page load)
--   registo_aberto the "Crie o seu salão" form was opened
--   passo          a step of the salon wizard was completed, detail = passo1..passo4; and no_ar = reached "O seu salão está no ar"
-- and admin_funnel(), which counts unique daily visitors at each stage, so /admin shows where people stop.

alter table site_events add column if not exists detail text check (detail ~ '^[a-z0-9_-]{1,40}$');

alter table site_events drop constraint if exists site_events_name_check;
alter table site_events add constraint site_events_name_check check (name in (
  'visita', 'conta_criada', 'salao_criado', 'marcacao_inicio', 'marcacao_feita', 'whatsapp', 'instalar',
  'cta', 'calculadora', 'registo_aberto', 'passo'));

-- Unique visitors per stage (the visitor code changes every day, so a person who comes back
-- another day counts again: good enough for spotting where people stop).
create or replace function admin_funnel(p_days int default 30) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_from timestamptz := now() - make_interval(days => least(greatest(p_days, 1), 90)); v jsonb;
begin
  if not is_platform_admin() then raise exception 'sem_permissao'; end if;
  with e as (select * from site_events where at >= v_from),
  u as (select name, detail, count(distinct (visitor, (at at time zone 'Europe/Lisbon')::date)) as n from e group by name, detail)
  select jsonb_build_object(
    'days', least(greatest(p_days, 1), 90),
    'stages', jsonb_build_array(
      jsonb_build_object('id', 'visita', 'n', (select count(distinct (visitor, (at at time zone 'Europe/Lisbon')::date)) from e where name = 'visita' and page = 'site')),
      jsonb_build_object('id', 'cta', 'n', coalesce((select sum(n) from u where name = 'cta'), 0)),
      jsonb_build_object('id', 'registo_aberto', 'n', coalesce((select sum(n) from u where name = 'registo_aberto'), 0)),
      jsonb_build_object('id', 'conta_criada', 'n', coalesce((select sum(n) from u where name = 'conta_criada'), 0)),
      jsonb_build_object('id', 'salao_criado', 'n', coalesce((select sum(n) from u where name = 'salao_criado'), 0)),
      jsonb_build_object('id', 'no_ar', 'n', coalesce((select sum(n) from u where name = 'passo' and detail = 'no_ar'), 0))),
    'cta', (select coalesce(jsonb_object_agg(coalesce(detail, 'outro'), n), '{}') from u where name = 'cta'),
    'steps', (select coalesce(jsonb_object_agg(detail, n), '{}') from u where name = 'passo' and detail is not null),
    'calculator', coalesce((select sum(n) from u where name = 'calculadora'), 0)
  ) into v;
  return v;
end $$;
revoke execute on function admin_funnel(int) from public, anon;
grant execute on function admin_funnel(int) to authenticated;
