-- Demo salon for testing. Replace OWNER_USER_ID with your user id from
-- Supabase > Authentication > Users (sign in once at /painel first).
with s as (
  insert into salons (owner_id, slug, name, type, whatsapp, mbway_number, deposit_cents)
  values ('OWNER_USER_ID', 'barbearia-demo', 'Barbearia Demo', 'barbearia', '351912345678', '912345678', 500)
  returning id
), p as (
  insert into professionals (salon_id, name) select id, n from s, unnest(array['Zé', 'Rita']) n
), sv as (
  insert into services (salon_id, name, duration_min, price_cents)
  select id, n, d, c from s, (values ('Corte', 30, 1200), ('Corte + barba', 45, 1800), ('Barba', 20, 800)) v(n, d, c)
)
insert into opening_hours (salon_id, weekday, opens, closes)
select id, wd, o::time, c::time from s,
  (values (2,'09:00','13:00'),(2,'14:00','19:00'),(3,'09:00','13:00'),(3,'14:00','19:00'),
          (4,'09:00','13:00'),(4,'14:00','19:00'),(5,'09:00','13:00'),(5,'14:00','19:00'),
          (6,'09:00','14:00')) v(wd, o, c);
