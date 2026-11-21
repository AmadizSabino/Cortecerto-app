-- CorteCerto's own admin area: the people who run CorteCerto (not salons) set each
-- salon's subscription and upload its monthly invoice; the salon owner downloads it.

create table platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table platform_admins enable row level security;
-- Nobody manages admins from the app: add them in the SQL editor.
create policy platform_admins_self on platform_admins for select using (user_id = auth.uid());

create function is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = auth.uid())
$$;

create table invoices (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references salons(id) on delete cascade,
  number text not null check (length(trim(number)) > 0),
  issued_on date not null default current_date,
  period text,
  amount_cents integer not null check (amount_cents >= 0),
  file_path text not null unique,
  created_at timestamptz not null default now()
);
create index invoices_salon on invoices (salon_id, issued_on desc);
alter table invoices enable row level security;
create policy invoices_admin on invoices for all using (is_platform_admin()) with check (is_platform_admin());
create policy invoices_owner_read on invoices for select
  using (exists (select 1 from salons s where s.id = invoices.salon_id and s.owner_id = auth.uid()));

-- The admin sets a salon's plan. Runs as the function owner, so the billing guard
-- (0015) lets it through; the check below keeps it admin-only.
create function admin_set_subscription(
  p_salon uuid, p_status subscription_status, p_paid_until timestamptz, p_trial_ends_at timestamptz
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'sem_permissao'; end if;
  update salons set subscription = p_status, paid_until = p_paid_until,
    trial_ends_at = coalesce(p_trial_ends_at, trial_ends_at)
  where id = p_salon;
  if not found then raise exception 'salao_nao_encontrado'; end if;
end;
$$;
revoke execute on function admin_set_subscription(uuid, subscription_status, timestamptz, timestamptz) from anon;

-- Invoice PDFs live in a private storage bucket, one folder per salon: <salon_id>/<file>.pdf.
-- Skipped where there is no Supabase Storage (the plain Postgres used in CI).
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public) values ('invoices', 'invoices', false) on conflict (id) do nothing;
    execute $p$create policy invoices_files_admin on storage.objects for all
      using (bucket_id = 'invoices' and public.is_platform_admin())
      with check (bucket_id = 'invoices' and public.is_platform_admin())$p$;
    execute $p$create policy invoices_files_owner_read on storage.objects for select
      using (bucket_id = 'invoices' and exists (
        select 1 from public.salons s where s.id::text = (storage.foldername(name))[1] and s.owner_id = auth.uid()))$p$;
  end if;
end $$;
