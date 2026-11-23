-- 0024: data for the admin dashboard (/admin).
-- 1. bookings.source: where a booking came from. The live project already had this
--    column from an early setup script that never became a migration; this makes
--    every database the same, and adds 'salao' for bookings the team makes in the panel.
-- 2. admin_dashboard(): one call that returns everything the dashboard shows, for
--    platform admins only. It reads tables the admin can't read directly (bookings,
--    owners' last login, errors, scheduled jobs), and returns counts, never clients' details.

alter table bookings add column if not exists source text not null default 'online';
do $$
declare c record;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.bookings'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%source%'
  loop
    execute format('alter table bookings drop constraint %I', c.conname);
  end loop;
end $$;
alter table bookings add constraint bookings_source_check
  check (source in ('online', 'salao', 'telefone', 'presencial'));

-- A booking made by someone signed in to the salon's team (the panel, "next visit")
-- is the salon's; a client on the public booking page is never signed in.
create function set_booking_source() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.source = 'online' and auth.uid() is not null and has_access(new.salon_id, 'agenda') then
    new.source := 'salao';
  end if;
  return new;
end $$;
create trigger bookings_source before insert on bookings
  for each row execute function set_booking_source();

create function admin_dashboard() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_salons jsonb; v_weeks jsonb; v_ai jsonb; v_errors jsonb; v_jobs jsonb := '[]'::jsonb;
begin
  if not is_platform_admin() then raise exception 'sem_permissao'; end if;

  select coalesce(jsonb_agg(row_to_json(x) order by x.created_at desc), '[]') into v_salons from (
    select s.id, s.name, s.slug, s.type, s.created_at, s.subscription, s.trial_ends_at, s.paid_until,
           s.address, s.whatsapp, (s.logo_path is not null) as has_logo,
           u.email as owner_email, u.last_sign_in_at,
           (select count(*) from services v where v.salon_id = s.id and v.active) as services,
           (select count(*) from professionals p where p.salon_id = s.id and p.active) as professionals,
           (select count(distinct weekday) from opening_hours h where h.salon_id = s.id) as open_days,
           (select count(*) from salon_members m where m.salon_id = s.id) as team,
           (select count(*) from salon_clients c where c.salon_id = s.id) as clients,
           b.total as bookings, b.last30 as bookings_30d, b.online30 as online_30d, b.noshow30 as noshow_30d,
           b.value30 as value_30d_cents, b.first_at as first_booking_at, b.first_online_at, b.last_at as last_booking_at,
           (select count(*) from walkins w where w.salon_id = s.id and w.created_at > now() - interval '30 days') as walkins_30d,
           (select count(*) from promotions pr where pr.salon_id = s.id) as promotions,
           (select count(*) from client_packs cp where cp.salon_id = s.id) as packs,
           (select count(*) from ai_requests a where a.salon_id = s.id and a.status = 'feito' and a.created_at > now() - interval '30 days') as ai_30d
    from salons s
    left join auth.users u on u.id = s.owner_id
    left join lateral (
      select count(*) filter (where bk.status <> 'cancelada') as total,
             count(*) filter (where bk.created_at > now() - interval '30 days' and bk.status <> 'cancelada') as last30,
             count(*) filter (where bk.created_at > now() - interval '30 days' and bk.status <> 'cancelada' and bk.source = 'online') as online30,
             count(*) filter (where bk.starts_at > now() - interval '30 days' and bk.status = 'faltou') as noshow30,
             coalesce(sum(coalesce(bk.price_cents, sv.price_cents)) filter (
               where bk.starts_at > now() - interval '30 days' and bk.starts_at <= now() and bk.status in ('confirmada', 'concluida')), 0) as value30,
             min(bk.created_at) as first_at,
             min(bk.created_at) filter (where bk.source = 'online') as first_online_at,
             max(bk.created_at) as last_at
      from bookings bk left join services sv on sv.id = bk.service_id
      where bk.salon_id = s.id
    ) b on true
  ) x;

  -- Bookings made per week, last 12 weeks (Monday start, Lisbon time).
  select coalesce(jsonb_agg(row_to_json(w) order by w.week), '[]') into v_weeks from (
    select to_char(g.week, 'YYYY-MM-DD') as week,
           count(bk.id) filter (where bk.source = 'online') as online,
           count(bk.id) filter (where bk.source <> 'online') as salao,
           coalesce(sum(coalesce(bk.price_cents, sv.price_cents)), 0) as value_cents
    from generate_series(date_trunc('week', (now() at time zone 'Europe/Lisbon')) - interval '11 weeks',
                         date_trunc('week', (now() at time zone 'Europe/Lisbon')), interval '1 week') as g(week)
    left join bookings bk on bk.status <> 'cancelada'
      and date_trunc('week', bk.created_at at time zone 'Europe/Lisbon') = g.week
    left join services sv on sv.id = bk.service_id
    group by g.week
  ) w;

  -- AI this month by feature and result.
  select coalesce(jsonb_agg(row_to_json(a)), '[]') into v_ai from (
    select feature, status, count(*) as n, count(distinct salon_id) as salons
    from ai_requests where created_at >= date_trunc('month', now())
    group by feature, status order by feature, status
  ) a;

  -- Browser errors of the last 7 days, grouped by message.
  select coalesce(jsonb_agg(row_to_json(e)), '[]') into v_errors from (
    select message, count(*) as n, max(at) as last_at, (array_agg(path order by at desc))[1] as path
    from client_errors where at > now() - interval '7 days'
    group by message order by max(at) desc limit 20
  ) e;

  -- Scheduled jobs (pg_cron), when the extension is installed.
  if to_regclass('cron.job_run_details') is not null then
    execute $q$
      select coalesce(jsonb_agg(row_to_json(j)), '[]') from (
        select jb.jobname, jb.schedule, jb.active,
               (select d.status from cron.job_run_details d where d.jobid = jb.jobid order by d.start_time desc limit 1) as last_status,
               (select d.start_time from cron.job_run_details d where d.jobid = jb.jobid order by d.start_time desc limit 1) as last_run,
               (select count(*) from cron.job_run_details d where d.jobid = jb.jobid and d.status = 'failed' and d.start_time > now() - interval '7 days') as failed_7d
        from cron.job jb order by jb.jobname
      ) j $q$ into v_jobs;
  end if;

  return jsonb_build_object('generated_at', now(), 'salons', v_salons, 'weeks', v_weeks, 'ai', v_ai, 'errors', v_errors, 'jobs', v_jobs);
end $$;
revoke execute on function admin_dashboard() from public, anon;
grant execute on function admin_dashboard() to authenticated;
