-- 0025: money and control in /admin.
-- 1. Invoices learn whether they were paid: status, due date, paid on, method, reference.
--    admin_mark_invoice_paid() marks one paid and moves the salon's "Pago até" forward a month.
-- 2. salon_billing: who CorteCerto invoices (legal name, NIF, address, invoice email).
-- 3. admin_notes: the admin's call and visit log per salon.
-- 4. admin_audit: every change to a salon's plan, invoices, billing details and settings, with who and when.
-- 5. platform_settings: payment details shown in reminder emails, and the automatic reminders switch (off).
-- 6. reminder_log + admin_reminders_due() + claim_reminder(): payment reminder emails. The Worker sends
--    them when the admin presses a button, or each morning once automatic reminders are switched on.

-- 1. Invoice payment -----------------------------------------------------------
alter table invoices add column status text not null default 'por_pagar' check (status in ('por_pagar', 'paga', 'anulada'));
alter table invoices add column due_on date;
alter table invoices add column paid_on date;
alter table invoices add column payment_method text check (payment_method in ('mbway', 'transferencia', 'multibanco', 'numerario', 'outro'));
alter table invoices add column payment_ref text check (payment_ref is null or length(payment_ref) <= 120);
alter table invoices add column note text check (note is null or length(note) <= 500);
alter table invoices add constraint invoices_paid_has_date check (status <> 'paga' or paid_on is not null);
update invoices set due_on = issued_on + 8 where due_on is null;

-- Marks an invoice paid. With p_extend, the salon becomes Ativa and "Pago até" moves one month
-- on from where it was (from the end of the trial if it never paid), so a late payment pays the
-- month owed rather than buying a free one. Returns the salon's new "Pago até".
create function admin_mark_invoice_paid(
  p_invoice uuid, p_paid_on date, p_method text, p_ref text default null, p_extend boolean default true
) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare v_salon uuid; v_until timestamptz;
begin
  if not is_platform_admin() then raise exception 'sem_permissao'; end if;
  update invoices set status = 'paga', paid_on = coalesce(p_paid_on, current_date),
    payment_method = p_method, payment_ref = nullif(trim(coalesce(p_ref, '')), '')
  where id = p_invoice and status <> 'paga' returning salon_id into v_salon;
  if v_salon is null then raise exception 'fatura_nao_encontrada'; end if;
  if p_extend then
    update salons set subscription = 'ativa',
      paid_until = coalesce(paid_until, trial_ends_at) + interval '1 month'
    where id = v_salon returning paid_until into v_until;
  else
    select paid_until into v_until from salons where id = v_salon;
  end if;
  return v_until;
end $$;
revoke execute on function admin_mark_invoice_paid(uuid, date, text, text, boolean) from public, anon;
grant execute on function admin_mark_invoice_paid(uuid, date, text, text, boolean) to authenticated;

-- 2. Billing details -----------------------------------------------------------
create table salon_billing (
  salon_id uuid primary key references salons(id) on delete cascade,
  legal_name text check (legal_name is null or length(legal_name) <= 160),
  nif text check (nif is null or nif ~ '^[0-9]{9}$'),
  address text check (address is null or length(address) <= 200),
  postal_code text check (postal_code is null or postal_code ~ '^[0-9]{4}-[0-9]{3}$'),
  city text check (city is null or length(city) <= 80),
  email text check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  updated_at timestamptz not null default now()
);
alter table salon_billing enable row level security;
create policy salon_billing_admin on salon_billing for all using (is_platform_admin()) with check (is_platform_admin());
create policy salon_billing_owner on salon_billing for all
  using (exists (select 1 from salons s where s.id = salon_billing.salon_id and s.owner_id = auth.uid()))
  with check (exists (select 1 from salons s where s.id = salon_billing.salon_id and s.owner_id = auth.uid()));

-- 3. Notes ---------------------------------------------------------------------
create table admin_notes (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references salons(id) on delete cascade,
  body text not null check (length(trim(body)) between 1 and 2000),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index admin_notes_salon on admin_notes (salon_id, created_at desc);
alter table admin_notes enable row level security;
create policy admin_notes_admin on admin_notes for all using (is_platform_admin()) with check (is_platform_admin());

-- 5. Settings (before the audit triggers, which also watch it) ------------------
create table platform_settings (
  key text primary key check (key in ('pagamentos', 'lembretes')),
  value jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
alter table platform_settings enable row level security;
create policy platform_settings_admin on platform_settings for all using (is_platform_admin()) with check (is_platform_admin());
insert into platform_settings (key, value) values
  ('pagamentos', '{"mbway": "", "iban": "", "titular": "", "nota": ""}'),
  ('lembretes', '{"automaticos": false}');

-- 4. Audit log -----------------------------------------------------------------
create table admin_audit (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid,                          -- null: a scheduled job, the service role or the SQL editor
  salon_id uuid references salons(id) on delete set null,
  action text not null,
  details jsonb not null default '{}'
);
create index admin_audit_at on admin_audit (at desc);
create index admin_audit_salon on admin_audit (salon_id, at desc);
alter table admin_audit enable row level security;
create policy admin_audit_read on admin_audit for select using (is_platform_admin());
-- No insert, update or delete policy: only the triggers below write it, and nobody edits it.

create function audit_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_salon uuid; v_action text; v_details jsonb;
begin
  if tg_table_name = 'salons' then
    if (old.subscription, old.trial_ends_at, old.paid_until) is not distinct from (new.subscription, new.trial_ends_at, new.paid_until) then
      return new;
    end if;
    v_salon := new.id; v_action := 'assinatura';
    v_details := jsonb_build_object(
      'antes', jsonb_build_object('estado', old.subscription, 'gratis_ate', old.trial_ends_at, 'pago_ate', old.paid_until),
      'depois', jsonb_build_object('estado', new.subscription, 'gratis_ate', new.trial_ends_at, 'pago_ate', new.paid_until));
  elsif tg_table_name = 'invoices' then
    v_salon := coalesce(new.salon_id, old.salon_id);
    v_action := case tg_op when 'INSERT' then 'fatura_enviada' when 'DELETE' then 'fatura_apagada'
      else case when new.status = 'paga' and old.status <> 'paga' then 'fatura_paga' else 'fatura_alterada' end end;
    v_details := jsonb_strip_nulls(jsonb_build_object('numero', coalesce(new.number, old.number), 'valor_cents', coalesce(new.amount_cents, old.amount_cents),
      'estado_antes', case when tg_op = 'UPDATE' then old.status end, 'estado', case when tg_op <> 'DELETE' then new.status end,
      'pago_em', case when tg_op <> 'DELETE' then new.paid_on end, 'metodo', case when tg_op <> 'DELETE' then new.payment_method end));
  elsif tg_table_name = 'salon_billing' then
    v_salon := coalesce(new.salon_id, old.salon_id); v_action := 'dados_faturacao';
    v_details := case when tg_op = 'DELETE' then '{}'::jsonb else jsonb_strip_nulls(jsonb_build_object('nome', new.legal_name, 'nif', new.nif)) end;
  elsif tg_table_name = 'platform_settings' then
    v_action := 'definicoes'; v_details := jsonb_build_object('chave', new.key, 'valor', new.value);
  end if;
  insert into admin_audit (actor, salon_id, action, details) values (auth.uid(), v_salon, v_action, v_details);
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger salons_audit after update on salons for each row execute function audit_change();
create trigger invoices_audit after insert or update or delete on invoices for each row execute function audit_change();
create trigger salon_billing_audit after insert or update or delete on salon_billing for each row execute function audit_change();
create trigger platform_settings_audit after update on platform_settings for each row execute function audit_change();

-- The latest entries, with who did it.
create function admin_audit_recent(p_limit int default 100) returns table (
  id bigint, at timestamptz, actor_email text, salon_id uuid, salon_name text, action text, details jsonb
) language plpgsql stable security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'sem_permissao'; end if;
  return query
    select a.id, a.at, u.email::text, a.salon_id, s.name, a.action, a.details
    from admin_audit a left join auth.users u on u.id = a.actor left join salons s on s.id = a.salon_id
    order by a.at desc limit least(greatest(p_limit, 1), 500);
end $$;
revoke execute on function admin_audit_recent(int) from public, anon;
grant execute on function admin_audit_recent(int) to authenticated;

-- 6. Payment reminders -----------------------------------------------------------
create table reminder_log (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references salons(id) on delete cascade,
  invoice_id uuid references invoices(id) on delete set null,
  kind text not null check (kind in ('gratis_7', 'gratis_3', 'gratis_0', 'atraso_5', 'atraso_10')),
  email text,
  status text not null default 'a_enviar' check (status in ('a_enviar', 'enviado', 'falhou')),
  automatic boolean not null default false,
  sent_by uuid references auth.users(id) on delete set null,
  sent_at timestamptz not null default now()
);
create index reminder_log_salon on reminder_log (salon_id, sent_at desc);
alter table reminder_log enable row level security;
create policy reminder_log_admin on reminder_log for select using (is_platform_admin());

-- Who should get a reminder today. Trial: 7, 3 and 0 days before the free period ends (a day
-- missed is caught the next day). Overdue: 5 and 10 days after an unpaid invoice's due date,
-- both before the 14-day lock. A reminder already sent (or being sent) isn't due again.
create function reminders_due() returns table (
  salon_id uuid, salon_name text, owner_email text, kind text, invoice_id uuid, detail text
) language sql stable security definer set search_path = public as $$
  with today as (select (now() at time zone 'Europe/Lisbon')::date as d),
  trial as (
    select s.id, s.name, coalesce(b.email, u.email::text) as email, s.trial_ends_at,
           (s.trial_ends_at at time zone 'Europe/Lisbon')::date - (select d from today) as left_days
    from salons s join auth.users u on u.id = s.owner_id left join salon_billing b on b.salon_id = s.id
    where s.subscription = 'experimental'
  ),
  trial_kind as (
    select t.*, case when left_days between 4 and 7 then 'gratis_7' when left_days between 1 and 3 then 'gratis_3'
                     when left_days between -13 and 0 then 'gratis_0' end as kind
    from trial t
  ),
  late as (
    select s.id, s.name, coalesce(b.email, u.email::text) as email, i.id as invoice_id, i.number,
           (select d from today) - i.due_on as late_days
    from invoices i join salons s on s.id = i.salon_id join auth.users u on u.id = s.owner_id
    left join salon_billing b on b.salon_id = s.id
    where i.status = 'por_pagar' and i.due_on is not null and s.subscription <> 'cancelada'
  ),
  late_kind as (
    select l.*, case when late_days between 5 and 9 then 'atraso_5' when late_days between 10 and 13 then 'atraso_10' end as kind
    from late l
  )
  select t.id, t.name, t.email, t.kind, null::uuid,
         case when t.left_days > 0 then 'Grátis acaba em ' || t.left_days || ' d' else 'Grátis terminou' end
  from trial_kind t
  where t.kind is not null and not exists (
    select 1 from reminder_log r where r.salon_id = t.id and r.kind = t.kind and r.status <> 'falhou'
      and r.sent_at > t.trial_ends_at - interval '10 days')
  union all
  select l.id, l.name, l.email, l.kind, l.invoice_id, 'Fatura ' || l.number || ' com ' || l.late_days || ' d de atraso'
  from late_kind l
  where l.kind is not null and not exists (
    select 1 from reminder_log r where r.invoice_id = l.invoice_id and r.kind = l.kind and r.status <> 'falhou')
  order by 2
$$;
revoke execute on function reminders_due() from public, anon, authenticated;

-- What the admin sees in /admin.
create function admin_reminders_due() returns table (
  salon_id uuid, salon_name text, owner_email text, kind text, invoice_id uuid, detail text
) language plpgsql stable security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'sem_permissao'; end if;
  return query select * from reminders_due();
end $$;
revoke execute on function admin_reminders_due() from public, anon;
grant execute on function admin_reminders_due() to authenticated;

-- The Worker claims one reminder before emailing it: the admin (button) or the service role
-- (the morning run, only when automatic reminders are on). Returns what the email needs,
-- or nothing when it isn't due any more (already sent, paid meanwhile, switched off).
create function claim_reminder(p_salon uuid, p_kind text, p_invoice uuid default null) returns table (
  log_id uuid, owner_email text, salon_name text, kind text, trial_ends_at timestamptz, lock_on date,
  invoice_number text, amount_cents int, issued_on date, due_on date, payments jsonb
) language plpgsql security definer set search_path = public as $$
declare
  v_role text := coalesce(current_setting('role', true), 'none');
  v_auto boolean := v_role = 'service_role';
  v_due record; v_id uuid;
begin
  if not v_auto and not is_platform_admin() then raise exception 'sem_permissao'; end if;
  if v_auto and coalesce((select (value->>'automaticos')::boolean from platform_settings where key = 'lembretes'), false) is not true then
    return;
  end if;
  select * into v_due from reminders_due() d
  where d.salon_id = p_salon and d.kind = p_kind and d.invoice_id is not distinct from p_invoice;
  if not found or v_due.owner_email is null then return; end if;
  insert into reminder_log (salon_id, invoice_id, kind, email, automatic, sent_by)
  values (p_salon, p_invoice, p_kind, v_due.owner_email, v_auto, auth.uid()) returning id into v_id;
  return query
    select v_id, v_due.owner_email, s.name, p_kind, s.trial_ends_at,
           ((case when s.subscription = 'experimental' then s.trial_ends_at else coalesce(s.paid_until, s.trial_ends_at) end + interval '14 days') at time zone 'Europe/Lisbon')::date,
           i.number, i.amount_cents, i.issued_on, i.due_on,
           coalesce((select value from platform_settings where key = 'pagamentos'), '{}'::jsonb)
    from salons s left join invoices i on i.id = p_invoice
    where s.id = p_salon;
end $$;
revoke execute on function claim_reminder(uuid, text, uuid) from public, anon;
grant execute on function claim_reminder(uuid, text, uuid) to authenticated, service_role;

-- The Worker reports whether the email went out.
create function reminder_result(p_log uuid, p_ok boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('role', true), 'none') <> 'service_role' and not is_platform_admin() then
    raise exception 'sem_permissao';
  end if;
  update reminder_log set status = case when p_ok then 'enviado' else 'falhou' end where id = p_log and status = 'a_enviar';
end $$;
revoke execute on function reminder_result(uuid, boolean) from public, anon;
grant execute on function reminder_result(uuid, boolean) to authenticated, service_role;

-- For the morning run: today's due reminders, only when automatic reminders are on.
create function reminders_due_auto() returns table (salon_id uuid, kind text, invoice_id uuid)
language sql stable security definer set search_path = public as $$
  select d.salon_id, d.kind, d.invoice_id from reminders_due() d
  where coalesce((select (value->>'automaticos')::boolean from platform_settings where key = 'lembretes'), false)
$$;
revoke execute on function reminders_due_auto() from public, anon, authenticated;
grant execute on function reminders_due_auto() to service_role;
