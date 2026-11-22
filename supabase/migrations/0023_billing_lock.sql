-- 0023: gentle lock for salons that don't pay.
-- 14 days after the trial ends (or after the paid period ends) with no payment,
-- the salon's account becomes read-only: the owner and the team can still see
-- everything, but can't change it, and new online bookings are paused.
-- Bookings already made stay as they are, and clients can still cancel them.
-- Access comes back as soon as the admin marks the salon paid in /admin
-- (admin_set_subscription: "Ativa" with a future "Pago até").
-- A cancelled salon locks when its paid period ends, without the 14 days.

create function salon_locked(p_salon uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select case
      when s.subscription = 'cancelada' then now() > coalesce(s.paid_until, s.trial_ends_at)
      when s.subscription = 'experimental' then now() > s.trial_ends_at + interval '14 days'
      when s.subscription = 'ativa' then s.paid_until is not null and now() > s.paid_until + interval '14 days'
      when s.subscription = 'em_atraso' then now() > coalesce(s.paid_until, s.trial_ends_at) + interval '14 days'
      else false
    end
    from salons s where s.id = p_salon
  ), false)
$$;
grant execute on function salon_locked(uuid) to anon, authenticated;

-- Who is asking: the role the API request runs as. It stays the same inside
-- security definer functions, so it covers the owner's RPCs too. Scheduled
-- jobs and the service role are never blocked.
create function locked_write_refused(p_salon uuid, p_op text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare v_role text := coalesce(current_setting('role', true), 'none');
begin
  if v_role not in ('anon', 'authenticated') then return false; end if;
  if current_setting('cortecerto.allow_locked', true) = 'on' then return false; end if;
  if is_platform_admin() then return false; end if;
  if not salon_locked(p_salon) then return false; end if;
  -- New rows (a booking, a place in the queue…) are paused for everyone.
  -- Changes and deletes only for the salon's team: a client can still cancel.
  return p_op = 'INSERT' or v_role = 'authenticated';
end;
$$;
revoke execute on function locked_write_refused(uuid, text) from public, anon, authenticated;

create function refuse_when_locked() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_salon uuid;
begin
  v_salon := case when tg_op = 'DELETE' then old.salon_id else new.salon_id end;
  if locked_write_refused(v_salon, tg_op) then raise exception 'salao_bloqueado'; end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- Every table the salon writes to, except: legal acceptances (accepting the
-- terms must still work), invoices (admin only), AI and error logs, and the
-- team tables (accepting an invite runs at sign-in).
do $$
declare t text;
begin
  foreach t in array array[
    'bookings', 'booking_addresses', 'client_notes', 'client_packs', 'club_members',
    'home_fees', 'home_settings', 'home_zones', 'opening_hours', 'package_requests',
    'packages', 'professional_hours', 'professional_pay', 'professionals', 'promotions',
    'salon_clients', 'salon_club', 'salon_photos', 'service_overrides', 'services',
    'slot_offers', 'time_off', 'walkins'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('create trigger %I before insert or update or delete on %I for each row execute function refuse_when_locked()', t || '_locked', t);
    end if;
  end loop;
end $$;

-- The salon's own settings. The admin's plan change still goes through.
create function refuse_salon_when_locked() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if locked_write_refused(old.id, tg_op) then raise exception 'salao_bloqueado'; end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
create trigger salons_locked before update on salons
  for each row execute function refuse_salon_when_locked();

-- A client's right to be forgotten still works while the salon is locked.
create or replace function forget_client(p_salon uuid, p_key text) returns int
language plpgsql security definer set search_path = public as $$
declare v int;
begin
  if not is_owner(p_salon) then raise exception 'sem_permissao'; end if;
  if p_key !~ '^[0-9]{6,15}$' then raise exception 'telefone_invalido'; end if;
  perform set_config('cortecerto.allow_locked', 'on', true);
  v := forget_client_rows(p_salon, p_key);
  perform set_config('cortecerto.allow_locked', '', true);
  return v;
end;
$$;
