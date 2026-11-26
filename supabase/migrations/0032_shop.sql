-- The salon's shop ("Loja"): products the salon sells (pomade, shampoo, beard oil…), reserved by
-- clients on the booking page, and sales made at the counter.
-- No money goes through CorteCerto: the client pays the salon, in the salon or by MB WAY to the
-- salon's own number. The salon chooses per product which one (pay).
-- 1. products   2. product_orders (reservations and sales)   3. reserve_product (clients)
-- 4. the phone notification for a new reservation   5. privacy

-- 1. ---------------------------------------------------------------------------
create table products (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references salons(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  description text check (description is null or length(description) <= 300),
  price_cents int not null check (price_cents between 1 and 100000),
  photo_path text check (photo_path is null or length(photo_path) <= 200),
  -- salao: the client pays when picking it up; mbway: the client sends MB WAY to the salon first.
  pay text not null default 'salao' check (pay in ('salao', 'mbway')),
  -- Weeks after a purchase when the salon is offered a one-tap WhatsApp "is it running out?". Null: never.
  refill_weeks int check (refill_weeks is null or refill_weeks between 1 and 52),
  sold_out boolean not null default false,
  active boolean not null default true,
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index products_salon on products (salon_id, position);
alter table products enable row level security;
-- Clients see what is on sale; the team also sees what is hidden.
create policy products_public_read on products for select using (active or has_access(salon_id, 'agenda'));
create policy products_manager_write on products for all using (has_access(salon_id, 'gestor')) with check (has_access(salon_id, 'gestor'));
create trigger products_locked before insert or update or delete on products
  for each row execute function refuse_when_locked();
-- At most 60 products per salon (photos stay small on the free plan).
create function products_limit() returns trigger language plpgsql as $$
begin
  if (select count(*) from products where salon_id = new.salon_id) >= 60 then raise exception 'limite_produtos'; end if;
  return new;
end;
$$;
create trigger products_limit before insert on products for each row execute function products_limit();

-- 2. ---------------------------------------------------------------------------
create table product_orders (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references salons(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  -- Kept as sold, so changing or removing the product later doesn't change past sales.
  product_name text not null check (length(trim(product_name)) between 1 and 80),
  price_cents int not null check (price_cents between 0 and 100000), -- each
  qty int not null default 1 check (qty between 1 and 20),
  client_name text not null check (length(trim(client_name)) between 1 and 80),
  client_phone text not null default '' check (length(client_phone) <= 20), -- '' for a counter sale with no client
  pay text not null default 'salao' check (pay in ('salao', 'mbway')),
  -- online: reserved on the booking page; balcao: sold in the salon.
  source text not null default 'online' check (source in ('online', 'balcao')),
  -- reservado: waiting for the client; pago: paid (MB WAY), not picked up yet;
  -- entregue: paid and with the client; cancelado: not going ahead.
  status text not null default 'reservado' check (status in ('reservado', 'pago', 'entregue', 'cancelado')),
  note text check (note is null or length(note) <= 300),
  refill_weeks int check (refill_weeks is null or refill_weeks between 1 and 52),
  paid_at timestamptz,          -- the sale counts from here (statistics)
  delivered_at timestamptz,
  cancelled_at timestamptz,
  refill_sent_at timestamptz,   -- the salon sent the "is it running out?" message
  push_notified_at timestamptz,
  created_at timestamptz not null default now(),
  check (status not in ('pago', 'entregue') or paid_at is not null)
);
create index product_orders_salon on product_orders (salon_id, created_at desc);
create index product_orders_open on product_orders (salon_id) where status in ('reservado', 'pago');
alter table product_orders enable row level security;
-- From Receção up, like the client list and the Club. Only the owner deletes.
create policy product_orders_team_read on product_orders for select using (has_access(salon_id, 'rececao'));
create policy product_orders_team_insert on product_orders for insert with check (has_access(salon_id, 'rececao'));
create policy product_orders_team_update on product_orders for update using (has_access(salon_id, 'rececao')) with check (has_access(salon_id, 'rececao'));
create policy product_orders_owner_delete on product_orders for delete using (is_owner(salon_id));
create trigger product_orders_locked before insert or update or delete on product_orders
  for each row execute function refuse_when_locked();

-- 3. ---------------------------------------------------------------------------
-- A client reserves a product from the booking page (clients don't sign in).
create function reserve_product(p_product uuid, p_qty int, p_name text, p_phone text, p_note text default null)
returns table (id uuid, pay text)
language plpgsql security definer set search_path = public as $$
declare
  p products;
  v_key text := phone_key(p_phone);
  v_id uuid;
begin
  select * into p from products where products.id = p_product and active;
  if not found then raise exception 'produto_invalido'; end if;
  if p.sold_out then raise exception 'produto_esgotado'; end if;
  if length(trim(coalesce(p_name, ''))) = 0 or length(trim(p_name)) > 80 or length(v_key) < 9 or length(trim(p_phone)) > 20 then
    raise exception 'dados_cliente';
  end if;
  if p_qty is null or p_qty < 1 or p_qty > 10 then raise exception 'quantidade_invalida'; end if;
  if (select count(*) from product_orders o where o.salon_id = p.salon_id and o.status in ('reservado', 'pago')
      and o.source = 'online' and phone_key(o.client_phone) = v_key) >= 5 then
    raise exception 'reservas_a_mais';
  end if;
  insert into product_orders (salon_id, product_id, product_name, price_cents, qty, client_name, client_phone, pay, source, note, refill_weeks)
  values (p.salon_id, p.id, p.name, p.price_cents, p_qty, trim(p_name), trim(p_phone), p.pay, 'online',
          nullif(left(trim(coalesce(p_note, '')), 300), ''), p.refill_weeks)
  returning product_orders.id into v_id;
  return query select v_id, p.pay;
end;
$$;
revoke execute on function reserve_product(uuid, int, text, text, text) from public;
grant execute on function reserve_product(uuid, int, text, text, text) to anon, authenticated;

-- 4. ---------------------------------------------------------------------------
-- The Worker (/api/notify-order) announces a new online reservation once, right after it is made.
create function claim_product_order_push(p_order uuid) returns table (
  salon_id uuid, owner_id uuid, client_name text, product_name text, qty int, price_cents int, pay text
)
language sql security definer set search_path = public as $$
  with claimed as (
    update product_orders o set push_notified_at = now()
    where o.id = p_order and o.push_notified_at is null and o.source = 'online'
      and o.created_at > now() - interval '10 minutes'
    returning o.*
  )
  select c.salon_id, s.owner_id, c.client_name, c.product_name, c.qty, c.price_cents, c.pay
  from claimed c join salons s on s.id = c.salon_id;
$$;
revoke execute on function claim_product_order_push(uuid) from public, anon, authenticated;
grant execute on function claim_product_order_push(uuid) to service_role;

-- 5. ---------------------------------------------------------------------------
-- Forgetting a client: open reservations are cancelled; sales stay for the salon's numbers, without
-- the client's name or phone.
create or replace function forget_client_rows(p_salon uuid, p_key text) returns int
language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  update bookings set status = 'cancelada'
  where salon_id = p_salon and phone_key(client_phone) = p_key
    and status in ('pendente', 'confirmada') and starts_at > now();
  update bookings set client_name = 'Cliente apagado', client_phone = '', consent_messages = false
  where salon_id = p_salon and phone_key(client_phone) = p_key;
  get diagnostics v_count = row_count;
  delete from booking_addresses a using bookings b where a.booking_id = b.id and b.salon_id = p_salon and b.client_phone = '' and b.client_name = 'Cliente apagado';
  delete from client_notes where salon_id = p_salon and phone_key = p_key;
  delete from walkins where salon_id = p_salon and phone_key(client_phone) = p_key;
  delete from salon_clients where salon_id = p_salon and phone_key = p_key;
  update club_members set name = 'Cliente apagado', phone = '', status = 'cancelado', cancelled_at = coalesce(cancelled_at, now())
  where salon_id = p_salon and phone_key = p_key;
  update client_packs set client_name = 'Cliente apagado', client_phone = '', status = 'cancelado' where salon_id = p_salon and phone_key = p_key;
  delete from package_requests where salon_id = p_salon and phone_key(client_phone) = p_key;
  delete from slot_requests where salon_id = p_salon and phone_key(client_phone) = p_key;
  delete from client_times where salon_id = p_salon and phone_key = p_key;
  update product_orders set status = 'cancelado', cancelled_at = now()
  where salon_id = p_salon and phone_key(client_phone) = p_key and status = 'reservado';
  update product_orders set client_name = 'Cliente apagado', client_phone = '', note = null
  where salon_id = p_salon and phone_key(client_phone) = p_key;
  return v_count;
end;
$$;
