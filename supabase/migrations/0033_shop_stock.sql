-- Stock for the salon's shop (migration 0032), optional per product.
-- stock null: the salon doesn't count it. Otherwise:
--   * units go out when a sale is delivered (entregue), and come back if that sale is cancelled or deleted;
--   * open reservations (reservado, pago) hold units: clients can't reserve more than what is left;
--   * low_stock: the panel warns when what is left gets to this number or below.

-- 1. ---------------------------------------------------------------------------
alter table products
  add column stock int check (stock is null or stock between 0 and 100000),
  add column low_stock int check (low_stock is null or low_stock between 0 and 1000);

-- 2. ---------------------------------------------------------------------------
-- Units held by open reservations.
create function product_held(p_product uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(sum(qty), 0)::int from product_orders where product_id = p_product and status in ('reservado', 'pago');
$$;
revoke execute on function product_held(uuid) from public, anon;
grant execute on function product_held(uuid) to authenticated;

-- What clients can still reserve, for the products the salon counts (the booking page).
create function product_stock_left(p_salon uuid) returns table (product_id uuid, left_qty int)
language sql stable security definer set search_path = public as $$
  select p.id, greatest(p.stock - product_held(p.id), 0)
  from products p where p.salon_id = p_salon and p.active and p.stock is not null;
$$;
grant execute on function product_stock_left(uuid) to anon, authenticated;

-- 3. ---------------------------------------------------------------------------
-- Delivered sales take units out; undoing one puts them back. Never below 0 (the count may be off).
create function product_orders_stock() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_out int := 0;  -- units that left with the new row
  v_back int := 0; -- units the old row had taken
begin
  if tg_op <> 'DELETE' and new.status = 'entregue' and new.product_id is not null then v_out := new.qty; end if;
  if tg_op <> 'INSERT' and old.status = 'entregue' and old.product_id is not null then v_back := old.qty; end if;
  if tg_op = 'UPDATE' and old.product_id is distinct from new.product_id then
    update products set stock = least(stock + v_back, 100000) where id = old.product_id and stock is not null;
    v_back := 0;
  end if;
  if v_out <> v_back then
    update products set stock = greatest(least(stock + v_back - v_out, 100000), 0)
    where id = coalesce(case when tg_op = 'DELETE' then old.product_id else new.product_id end) and stock is not null;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
create trigger product_orders_stock after insert or update or delete on product_orders
  for each row execute function product_orders_stock();

-- A delivery arrived: add units (Gestor and up). Starts counting if the product wasn't counted.
create function add_product_stock(p_product uuid, p_units int) returns int
language plpgsql security definer set search_path = public as $$
declare v_salon uuid; v_stock int;
begin
  select salon_id into v_salon from products where id = p_product;
  if v_salon is null or not has_access(v_salon, 'gestor') then raise exception 'sem_permissao'; end if;
  if p_units is null or p_units < 1 or p_units > 10000 then raise exception 'quantidade_invalida'; end if;
  update products set stock = least(coalesce(stock, 0) + p_units, 100000), sold_out = false
  where id = p_product returning stock into v_stock;
  return v_stock;
end;
$$;
revoke execute on function add_product_stock(uuid, int) from public, anon;
grant execute on function add_product_stock(uuid, int) to authenticated;

-- 4. ---------------------------------------------------------------------------
-- Reserving checks what is left. The product row is locked so two clients can't take the last one.
create or replace function reserve_product(p_product uuid, p_qty int, p_name text, p_phone text, p_note text default null)
returns table (id uuid, pay text)
language plpgsql security definer set search_path = public as $$
declare
  p products;
  v_key text := phone_key(p_phone);
  v_id uuid;
begin
  select * into p from products where products.id = p_product and active for update;
  if not found then raise exception 'produto_invalido'; end if;
  if p.sold_out then raise exception 'produto_esgotado'; end if;
  if length(trim(coalesce(p_name, ''))) = 0 or length(trim(p_name)) > 80 or length(v_key) < 9 or length(trim(p_phone)) > 20 then
    raise exception 'dados_cliente';
  end if;
  if p_qty is null or p_qty < 1 or p_qty > 10 then raise exception 'quantidade_invalida'; end if;
  if p.stock is not null and p_qty > p.stock - product_held(p.id) then
    if p.stock - product_held(p.id) <= 0 then raise exception 'produto_esgotado'; end if;
    raise exception 'sem_stock';
  end if;
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
