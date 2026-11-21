-- RGPD: forget a client on request, and forget clients inactive for 3 years.
-- Forgetting keeps the bookings for the salon's statistics but removes who they
-- were: name and phone are replaced, consent is cleared, notes are deleted.
-- Run after 0003 (client_notes) and 0008 (walkins).

-- The same phone key the app uses: digits only, 00 prefix dropped, 351 added to 9-digit numbers.
create function phone_key(p text) returns text
language sql immutable as $$
  select case
    when length(d) = 9 then '351' || d
    else d
  end
  from (select regexp_replace(regexp_replace(coalesce(p, ''), '\D', '', 'g'), '^00', '') as d) x;
$$;

create function forget_client_rows(p_salon uuid, p_key text) returns int
language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  -- Future bookings still on are cancelled: nobody to remind or call any more.
  update bookings set status = 'cancelada'
  where salon_id = p_salon and phone_key(client_phone) = p_key
    and status in ('pendente', 'confirmada') and starts_at > now();
  update bookings set client_name = 'Cliente apagado', client_phone = '', consent_messages = false
  where salon_id = p_salon and phone_key(client_phone) = p_key;
  get diagnostics v_count = row_count;
  delete from client_notes where salon_id = p_salon and phone_key = p_key;
  delete from walkins where salon_id = p_salon and phone_key(client_phone) = p_key;
  return v_count;
end;
$$;
revoke execute on function forget_client_rows(uuid, text) from public, anon, authenticated;

-- Called by the salon owner from the client list.
create function forget_client(p_salon uuid, p_key text) returns int
language plpgsql security definer set search_path = public as $$
begin
  if not is_owner(p_salon) then raise exception 'sem_permissao'; end if;
  if p_key !~ '^[0-9]{6,15}$' then raise exception 'telefone_invalido'; end if;
  return forget_client_rows(p_salon, p_key);
end;
$$;
grant execute on function forget_client(uuid, text) to authenticated;

-- Clients whose last booking was more than 3 years ago, in every salon.
create function forget_inactive_clients() returns int
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_total int := 0;
begin
  for r in
    select salon_id, phone_key(client_phone) as k
    from bookings
    where client_phone <> ''
    group by salon_id, phone_key(client_phone)
    having max(starts_at) < now() - interval '3 years'
  loop
    v_total := v_total + forget_client_rows(r.salon_id, r.k);
  end loop;
  return v_total;
end;
$$;
revoke execute on function forget_inactive_clients() from public, anon, authenticated;

-- Run it every night at 03:30 if pg_cron is available (Supabase: Database > Extensions > pg_cron).
-- Without pg_cron the migration still succeeds; enable the extension and run this block again.
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('forget-inactive-clients', '30 3 * * *', 'select public.forget_inactive_clients()');
exception when others then
  raise notice 'pg_cron not available: inactive clients will not be forgotten automatically (%).', sqlerrm;
end;
$$;
