-- 0019: filling a freed slot, and the salon's own brand (logo, cover, text, gallery).
-- Run once, after 0018.

-- The salon's brand (section 2 below); added first because the offer page shows the logo.
alter table salons add column logo_path text;
alter table salons add column cover_path text;
alter table salons add column about text check (about is null or length(about) <= 600);

-- Managers change the brand; the rest of the salon row stays with the owner.
create function set_salon_brand(p_salon uuid, p_logo text, p_cover text, p_about text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_access(p_salon, 'gestor') then raise exception 'sem_permissao'; end if;
  if (p_logo is not null and p_logo !~ ('^' || p_salon::text || '/')) or (p_cover is not null and p_cover !~ ('^' || p_salon::text || '/')) then
    raise exception 'ficheiro_invalido';
  end if;
  update salons set logo_path = p_logo, cover_path = p_cover, about = nullif(trim(coalesce(p_about, '')), '') where id = p_salon;
end;
$$;
grant execute on function set_salon_brand(uuid, text, text, text) to authenticated;

-- ============================================================================
-- 1. Filling a freed slot
-- ============================================================================
-- When a booking is cancelled or a client doesn't show, the salon opens an offer
-- for that time and sends its link to several clients by WhatsApp. The first to
-- accept gets it: someone already booked later moves to it, or someone new books it.

-- Clients can ask, on their booking page, to be told when an earlier time opens.
alter table bookings add column wants_earlier boolean not null default false;

create function set_wants_earlier(p_booking uuid, p_on boolean) returns void
language sql security definer set search_path = public as $$
  update bookings set wants_earlier = coalesce(p_on, false)
  where id = p_booking and status in ('pendente', 'confirmada');
$$;
grant execute on function set_wants_earlier(uuid, boolean) to anon, authenticated;

-- The client's page shows the "earlier time" choice and the salon's logo.
drop function booking_for_client(uuid);
create function booking_for_client(p_booking uuid)
returns table (
  id uuid, status booking_status, deposit deposit_status, starts_at timestamptz, ends_at timestamptz,
  client_name text, salon_id uuid, salon_slug text, salon_name text, salon_theme text,
  salon_timezone text, salon_whatsapp text, mbway_number text, deposit_cents int,
  client_change_hours smallint, service_id uuid, service_name text, duration_min int,
  price_cents int, professional_id uuid, professional_name text,
  proposed_starts_at timestamptz, proposal_note text, wants_earlier boolean, salon_logo text
)
language sql stable security definer set search_path = public as $$
  select b.id, b.status, b.deposit, b.starts_at, b.ends_at, b.client_name,
         s.id, s.slug, s.name, s.theme, s.timezone, s.whatsapp, s.mbway_number, s.deposit_cents,
         s.client_change_hours, sv.id, sv.name,
         (extract(epoch from (b.ends_at - b.starts_at)) / 60)::int,
         coalesce(b.price_cents, sv.price_cents), p.id, p.name,
         b.proposed_starts_at, b.proposal_note, b.wants_earlier, s.logo_path
  from bookings b
  join salons s on s.id = b.salon_id
  join services sv on sv.id = b.service_id
  join professionals p on p.id = b.professional_id
  where b.id = p_booking;
$$;
grant execute on function booking_for_client(uuid) to anon, authenticated;

create table slot_offers (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references salons(id) on delete cascade,
  professional_id uuid not null references professionals(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  filled_booking uuid references bookings(id) on delete set null,
  filled_at timestamptz,
  closed_at timestamptz -- the salon withdrew it
);
create index slot_offers_salon on slot_offers (salon_id, starts_at);
alter table slot_offers enable row level security;
create policy slot_offers_team on slot_offers for select using (has_access(salon_id, 'agenda'));
create policy slot_offers_team_close on slot_offers for update using (has_access(salon_id, 'agenda')) with check (has_access(salon_id, 'agenda'));

-- Opens an offer for a free time of one professional (from the agenda).
create function offer_free_slot(p_salon uuid, p_professional uuid, p_starts_at timestamptz, p_ends_at timestamptz) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not has_access(p_salon, 'agenda') then raise exception 'sem_permissao'; end if;
  perform 1 from professionals where id = p_professional and salon_id = p_salon;
  if not found then raise exception 'profissional_invalido'; end if;
  if p_ends_at <= greatest(p_starts_at, now()) then raise exception 'horario_passado'; end if;
  if slot_taken(p_professional, p_starts_at, p_ends_at, null) then raise exception 'horario_ocupado'; end if;
  -- One open offer per time: reuse it.
  select id into v_id from slot_offers
  where professional_id = p_professional and starts_at = p_starts_at and ends_at = p_ends_at
    and filled_booking is null and closed_at is null;
  if v_id is not null then return v_id; end if;
  insert into slot_offers (salon_id, professional_id, starts_at, ends_at, created_by)
  values (p_salon, p_professional, p_starts_at, p_ends_at, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;
grant execute on function offer_free_slot(uuid, uuid, timestamptz, timestamptz) to authenticated;

-- What a client sees on the offer's page. state: aberta, ocupada (taken), expirada.
create function slot_offer_for_client(p_offer uuid)
returns table (
  id uuid, state text, starts_at timestamptz, ends_at timestamptz,
  salon_id uuid, salon_slug text, salon_name text, salon_theme text, salon_timezone text, salon_whatsapp text,
  salon_logo text, professional_id uuid, professional_name text
)
language sql stable security definer set search_path = public as $$
  select o.id,
         case when o.filled_booking is not null then 'ocupada'
              when o.closed_at is not null or o.starts_at < now() - interval '5 minutes' then 'expirada'
              else 'aberta' end,
         o.starts_at, o.ends_at, s.id, s.slug, s.name, s.theme, s.timezone, s.whatsapp, s.logo_path,
         p.id, p.name
  from slot_offers o
  join salons s on s.id = o.salon_id
  join professionals p on p.id = o.professional_id
  where o.id = p_offer;
$$;
grant execute on function slot_offer_for_client(uuid) to anon, authenticated;

-- Locks an open offer, or explains why it can't be taken.
create function lock_open_offer(p_offer uuid) returns slot_offers
language plpgsql security definer set search_path = public as $$
declare o slot_offers;
begin
  select * into o from slot_offers where id = p_offer for update;
  if not found then raise exception 'oferta_inexistente'; end if;
  if o.filled_booking is not null then raise exception 'vaga_ocupada'; end if;
  if o.closed_at is not null or o.starts_at < now() - interval '5 minutes' then raise exception 'vaga_expirada'; end if;
  return o;
end;
$$;
revoke execute on function lock_open_offer(uuid) from public, anon, authenticated;

-- A client already booked later with the same professional moves to the freed time.
create function take_slot_offer_move(p_offer uuid, p_booking uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  o slot_offers;
  b bookings;
  v_start timestamptz;
begin
  o := lock_open_offer(p_offer);
  select * into b from bookings where id = p_booking for update;
  if not found or b.salon_id <> o.salon_id or b.professional_id <> o.professional_id then raise exception 'marcacao_inexistente'; end if;
  if b.status not in ('pendente', 'confirmada') then raise exception 'marcacao_fechada'; end if;
  if b.starts_at <= o.starts_at then raise exception 'ja_mais_cedo'; end if;
  -- Starts when the offer starts, or now if it already began (a no-show noticed late).
  v_start := greatest(o.starts_at, date_trunc('minute', now()));
  if v_start + (b.ends_at - b.starts_at) > o.ends_at then raise exception 'nao_cabe'; end if;
  update bookings set starts_at = v_start, ends_at = v_start + (b.ends_at - b.starts_at),
         client_action = 'mudou', client_action_at = now(), reminder_sent_at = null,
         proposed_starts_at = null, proposed_at = null, proposal_note = null, wants_earlier = false
  where id = p_booking;
  update slot_offers set filled_booking = p_booking, filled_at = now() where id = p_offer;
exception when exclusion_violation then
  raise exception 'vaga_ocupada';
end;
$$;
grant execute on function take_slot_offer_move(uuid, uuid) to anon, authenticated;

-- Someone new books the freed time, choosing a service that fits in it.
create function take_slot_offer_new(p_offer uuid, p_service uuid, p_name text, p_phone text, p_consent boolean) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  o slot_offers;
  v_duration int;
  v_start timestamptz;
  v_id uuid;
begin
  o := lock_open_offer(p_offer);
  select e.duration_min into v_duration from effective_service(p_service, o.professional_id) e;
  if v_duration is null then raise exception 'servico_invalido'; end if;
  v_start := greatest(o.starts_at, date_trunc('minute', now()));
  if v_start + make_interval(mins => v_duration) > o.ends_at then raise exception 'nao_cabe'; end if;
  v_id := create_booking(o.salon_id, p_service, o.professional_id, v_start, p_name, p_phone, p_consent);
  update slot_offers set filled_booking = v_id, filled_at = now() where id = p_offer;
  return v_id;
end;
$$;
grant execute on function take_slot_offer_new(uuid, uuid, text, text, boolean) to anon, authenticated;

-- ============================================================================
-- 2. The salon's brand: logo, cover photo, a short text, and a gallery of work.
--    Files live in the public bucket "salon-media", one folder per salon.
-- ============================================================================

create table salon_photos (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references salons(id) on delete cascade,
  path text not null,
  caption text check (caption is null or length(caption) <= 120),
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index salon_photos_salon on salon_photos (salon_id, position);
alter table salon_photos enable row level security;
create policy photos_public_read on salon_photos for select using (true);
create policy photos_manager_write on salon_photos for all using (has_access(salon_id, 'gestor')) with check (has_access(salon_id, 'gestor'));
-- At most 24 photos per salon (storage stays small on the free plan).
create function salon_photos_limit() returns trigger language plpgsql as $$
begin
  if (select count(*) from salon_photos where salon_id = new.salon_id) >= 24 then raise exception 'limite_fotos'; end if;
  return new;
end;
$$;
create trigger salon_photos_limit before insert on salon_photos for each row execute function salon_photos_limit();

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('salon-media', 'salon-media', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do nothing;
    execute $p$create policy salon_media_read on storage.objects for select using (bucket_id = 'salon-media')$p$;
    execute $p$create policy salon_media_write on storage.objects for insert
      with check (bucket_id = 'salon-media' and public.has_access(((storage.foldername(name))[1])::uuid, 'gestor'))$p$;
    execute $p$create policy salon_media_update on storage.objects for update
      using (bucket_id = 'salon-media' and public.has_access(((storage.foldername(name))[1])::uuid, 'gestor'))$p$;
    execute $p$create policy salon_media_delete on storage.objects for delete
      using (bucket_id = 'salon-media' and public.has_access(((storage.foldername(name))[1])::uuid, 'gestor'))$p$;
  end if;
end $$;
