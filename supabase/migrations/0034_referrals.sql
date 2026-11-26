-- "Traga um colega": a salon invites another salon. When the new salon pays its first month,
-- the admin gives both one month free (admin_reward_referral). Nothing is automatic about money.
-- The invite link is cortecerto.pt/?convite=<slug of the salon that invites>.

create table salon_referrals (
  referred_salon uuid primary key references salons(id) on delete cascade, -- a salon is invited once
  referrer_salon uuid not null references salons(id) on delete cascade,
  created_at timestamptz not null default now(),
  rewarded_at timestamptz,
  check (referred_salon <> referrer_salon)
);
create index salon_referrals_referrer on salon_referrals (referrer_salon);
alter table salon_referrals enable row level security;
create policy salon_referrals_read on salon_referrals for select
  using (is_owner(referrer_salon) or is_owner(referred_salon) or is_platform_admin());

-- Right after sign-up, the new salon's owner records who invited them. Only in the first 2 days,
-- only once, and never their own salon or another salon of the same owner.
create function set_referrer(p_salon uuid, p_code text) returns text
language plpgsql security definer set search_path = public as $$
declare
  me salons;
  r salons;
begin
  select * into me from salons where id = p_salon;
  if not found or me.owner_id is distinct from auth.uid() then raise exception 'sem_permissao'; end if;
  if me.created_at < now() - interval '2 days' then raise exception 'convite_tarde'; end if;
  if exists (select 1 from salon_referrals where referred_salon = p_salon) then
    return (select s.name from salon_referrals x join salons s on s.id = x.referrer_salon where x.referred_salon = p_salon);
  end if;
  select * into r from salons where slug = lower(trim(coalesce(p_code, '')));
  if not found or r.id = me.id or r.owner_id = me.owner_id then raise exception 'convite_invalido'; end if;
  insert into salon_referrals (referred_salon, referrer_salon) values (me.id, r.id);
  return r.name;
end;
$$;
revoke execute on function set_referrer(uuid, text) from public, anon;
grant execute on function set_referrer(uuid, text) to authenticated;

-- The salons a salon invited, for Mais > Convidar um colega (owner only).
create function my_referrals(p_salon uuid) returns table (name text, joined_at timestamptz, paying boolean, rewarded_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_owner(p_salon) then raise exception 'sem_permissao'; end if;
  return query
    select s.name, x.created_at, (s.subscription = 'ativa' and s.paid_until is not null and s.paid_until > now()), x.rewarded_at
    from salon_referrals x join salons s on s.id = x.referred_salon
    where x.referrer_salon = p_salon order by x.created_at desc;
end;
$$;
revoke execute on function my_referrals(uuid) from public, anon;
grant execute on function my_referrals(uuid) to authenticated;

-- /admin: every invite, and whether the new salon is paying.
create function admin_referrals() returns table (
  referred_id uuid, referred_name text, referred_subscription text, referred_paid_until timestamptz,
  referrer_id uuid, referrer_name text, created_at timestamptz, rewarded_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'sem_permissao'; end if;
  return query
    select a.id, a.name, a.subscription::text, a.paid_until, b.id, b.name, x.created_at, x.rewarded_at
    from salon_referrals x join salons a on a.id = x.referred_salon join salons b on b.id = x.referrer_salon
    order by x.rewarded_at nulls first, x.created_at desc;
end;
$$;
revoke execute on function admin_referrals() from public, anon;
grant execute on function admin_referrals() to authenticated;

-- One free month for both salons: 30 days more on what they paid, or on the trial if not paying yet.
-- The salons' billing changes are recorded in admin_audit by the triggers of migration 0025.
create function admin_reward_referral(p_referred uuid) returns void
language plpgsql security definer set search_path = public as $$
declare x salon_referrals;
begin
  if not is_platform_admin() then raise exception 'sem_permissao'; end if;
  select * into x from salon_referrals where referred_salon = p_referred for update;
  if not found then raise exception 'convite_invalido'; end if;
  if x.rewarded_at is not null then raise exception 'ja_dado'; end if;
  update salons set
    paid_until = case when subscription = 'ativa' and paid_until is not null then greatest(paid_until, now()) + interval '30 days' else paid_until end,
    trial_ends_at = case when subscription = 'ativa' and paid_until is not null then trial_ends_at else greatest(trial_ends_at, now()) + interval '30 days' end
  where id in (x.referred_salon, x.referrer_salon);
  update salon_referrals set rewarded_at = now() where referred_salon = p_referred;
end;
$$;
revoke execute on function admin_reward_referral(uuid) from public, anon;
grant execute on function admin_reward_referral(uuid) to authenticated;
