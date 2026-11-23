-- 0026: monthly payment requests ("pedidos de pagamento").
-- A payment request is a PDF the admin sends each salon for the month: not a legal invoice
-- (those still come from certified invoicing software and are uploaded as before).
-- Requests live in the invoices table with kind 'pedido', so status, due date, "Marcar como paga",
-- payment reminders, the money totals and the owner's Assinatura page all work for them too.
-- When the legal invoice for a paid request is uploaded later, it points to the request
-- (request_id) and is left out of the totals, so nothing is counted twice.

alter table invoices add column kind text not null default 'fatura' check (kind in ('fatura', 'pedido'));
alter table invoices add column request_id uuid references invoices(id) on delete set null;
alter table invoices add column period_month date check (period_month is null or extract(day from period_month) = 1);
alter table invoices add column sent_at timestamptz;
alter table invoices add column sent_to text;
create unique index invoices_one_request_per_month on invoices (salon_id, period_month)
  where kind = 'pedido' and status <> 'anulada';

-- Salons that should get a request for the month and don't have one yet: paying salons, and
-- salons whose free period ends before the month is over. Cancelled salons never.
create function admin_payment_requests_due(p_month date) returns table (
  salon_id uuid, salon_name text, owner_email text, billing_email text, legal_name text, nif text,
  address text, postal_code text, city text, subscription subscription_status,
  trial_ends_at timestamptz, paid_until timestamptz, professionals int
) language plpgsql stable security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'sem_permissao'; end if;
  return query
    select s.id, s.name, u.email::text, b.email, b.legal_name, b.nif, b.address, b.postal_code, b.city,
           s.subscription, s.trial_ends_at, s.paid_until,
           (select count(*)::int from professionals p where p.salon_id = s.id and p.active)
    from salons s
    join auth.users u on u.id = s.owner_id
    left join salon_billing b on b.salon_id = s.id
    where s.subscription <> 'cancelada'
      and (s.subscription in ('ativa', 'em_atraso')
           or (s.trial_ends_at at time zone 'Europe/Lisbon')::date < (date_trunc('month', p_month) + interval '1 month')::date)
      and not exists (select 1 from invoices i where i.salon_id = s.id and i.kind = 'pedido'
                      and i.status <> 'anulada' and i.period_month = date_trunc('month', p_month)::date)
    order by s.name;
end $$;
revoke execute on function admin_payment_requests_due(date) from public, anon;
grant execute on function admin_payment_requests_due(date) to authenticated;

-- Reserves the next number (PP 2026/001, one series per year) and records the request.
-- The app then draws the PDF with that number and uploads it to p_file_path.
create function admin_new_payment_request(
  p_salon uuid, p_month date, p_period text, p_amount_cents int, p_issued_on date, p_due_on date, p_file_path text
) returns table (id uuid, number text)
language plpgsql security definer set search_path = public as $$
declare v_year text := to_char(p_issued_on, 'YYYY'); v_n int; v_number text; v_id uuid;
begin
  if not is_platform_admin() then raise exception 'sem_permissao'; end if;
  if p_amount_cents is null or p_amount_cents <= 0 then raise exception 'valor_invalido'; end if;
  if p_file_path !~ ('^' || p_salon::text || '/[a-z0-9-]+\.pdf$') then raise exception 'ficheiro_invalido'; end if;
  perform pg_advisory_xact_lock(hashtext('cortecerto-pedido-' || v_year));
  select coalesce(max(substring(i.number from '/(\d+)$')::int), 0) + 1 into v_n
  from invoices i where i.kind = 'pedido' and i.number like 'PP ' || v_year || '/%';
  v_number := 'PP ' || v_year || '/' || lpad(v_n::text, 3, '0');
  insert into invoices (salon_id, kind, number, issued_on, due_on, period, period_month, amount_cents, file_path)
  values (p_salon, 'pedido', v_number, p_issued_on, p_due_on, p_period, date_trunc('month', p_month)::date, p_amount_cents, p_file_path)
  returning invoices.id into v_id;
  return query select v_id, v_number;
end $$;
revoke execute on function admin_new_payment_request(uuid, date, text, int, date, date, text) from public, anon;
grant execute on function admin_new_payment_request(uuid, date, text, int, date, date, text) to authenticated;

-- The Worker emails a request's PDF: this records the send and returns what the email needs.
create function admin_claim_request_email(p_request uuid) returns table (
  owner_email text, salon_name text, number text, amount_cents int, issued_on date, due_on date,
  period text, file_path text, payments jsonb
) language plpgsql security definer set search_path = public as $$
declare v_email text;
begin
  if not is_platform_admin() then raise exception 'sem_permissao'; end if;
  select coalesce(b.email, u.email::text) into v_email
  from invoices i join salons s on s.id = i.salon_id join auth.users u on u.id = s.owner_id
  left join salon_billing b on b.salon_id = s.id
  where i.id = p_request and i.kind = 'pedido' and i.status = 'por_pagar';
  if v_email is null then return; end if;
  update invoices set sent_at = now(), sent_to = v_email where invoices.id = p_request;
  return query
    select v_email, s.name, i.number, i.amount_cents, i.issued_on, i.due_on, i.period, i.file_path,
           coalesce((select value from platform_settings where key = 'pagamentos'), '{}'::jsonb)
    from invoices i join salons s on s.id = i.salon_id where i.id = p_request;
end $$;
revoke execute on function admin_claim_request_email(uuid) from public, anon;
grant execute on function admin_claim_request_email(uuid) to authenticated;

-- Reminders now say whether the overdue document is a request or an invoice.
drop function claim_reminder(uuid, text, uuid);
create function claim_reminder(p_salon uuid, p_kind text, p_invoice uuid default null) returns table (
  log_id uuid, owner_email text, salon_name text, kind text, trial_ends_at timestamptz, lock_on date,
  invoice_number text, amount_cents int, issued_on date, due_on date, payments jsonb, doc_kind text
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
           coalesce((select value from platform_settings where key = 'pagamentos'), '{}'::jsonb),
           i.kind
    from salons s left join invoices i on i.id = p_invoice
    where s.id = p_salon;
end $$;
revoke execute on function claim_reminder(uuid, text, uuid) from public, anon;
grant execute on function claim_reminder(uuid, text, uuid) to authenticated, service_role;

-- The due list names requests as requests.
create or replace function reminders_due() returns table (
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
    select s.id, s.name, coalesce(b.email, u.email::text) as email, i.id as invoice_id, i.number, i.kind as doc_kind,
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
  select l.id, l.name, l.email, l.kind, l.invoice_id, case when l.doc_kind = 'pedido' then 'Pedido ' else 'Fatura ' end || l.number || ' com ' || l.late_days || ' d de atraso'
  from late_kind l
  where l.kind is not null and not exists (
    select 1 from reminder_log r where r.invoice_id = l.invoice_id and r.kind = l.kind and r.status <> 'falhou')
  order by 2
$$;
