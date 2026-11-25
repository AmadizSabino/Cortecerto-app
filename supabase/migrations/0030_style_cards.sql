-- Style cards ("fichas de estilo", app/src/lib/styleCatalog.ts): photos and texts live in the app.
-- Here only what changes per salon and per booking:
-- 1. The styles a salon chose not to show its clients (by card id).
-- 2. The style a client picked from the cards when booking, shown to the salon on the booking.

-- 1. ---------------------------------------------------------------------------
alter table salons add column styles_hidden text[] not null default '{}'
  check (cardinality(styles_hidden) <= 200);

create function set_styles_hidden(p_salon uuid, p_hidden text[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_access(p_salon, 'gestor') then raise exception 'sem_permissao'; end if;
  if exists (select 1 from unnest(coalesce(p_hidden, '{}')) x where x !~ '^[a-z0-9-]{1,60}$') then
    raise exception 'estilo_invalido';
  end if;
  update salons set styles_hidden = (select coalesce(array_agg(distinct x order by x), '{}') from unnest(coalesce(p_hidden, '{}')) x)
  where id = p_salon;
end $$;
revoke execute on function set_styles_hidden(uuid, text[]) from public, anon;
grant execute on function set_styles_hidden(uuid, text[]) to authenticated;

-- 2. ---------------------------------------------------------------------------
alter table bookings add column style text check (style ~ '^[a-z0-9-]{1,60}$');

-- The client sets it right after booking (clients don't sign in): only in the first 10 minutes,
-- and only once, so an old booking link can't be changed later.
create function set_booking_style(p_booking uuid, p_style text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_style is null or p_style !~ '^[a-z0-9-]{1,60}$' then raise exception 'estilo_invalido'; end if;
  update bookings set style = p_style
  where id = p_booking and style is null and created_at > now() - interval '10 minutes';
end $$;
revoke execute on function set_booking_style(uuid, text) from public;
grant execute on function set_booking_style(uuid, text) to anon, authenticated;
