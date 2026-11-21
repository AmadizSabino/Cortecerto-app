-- End-to-end checks of the database rules, run in CI after applying every migration.
-- Each check raises if the rule is broken.
\set ON_ERROR_STOP 1
create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'CHECK FAILED: %', what; end if; end $$;
insert into auth.users values ('00000000-0000-0000-0000-00000000000a','dono@x.pt'),('00000000-0000-0000-0000-00000000000b','rui@x.pt'),('00000000-0000-0000-0000-00000000000c','outro@x.pt');

-- Owner creates salon
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a'; set request.jwt.claim.email='dono@x.pt';
select create_salon('{"slug":"barb-teste","name":"Barb","type":"barbearia","theme":"b3","deposit_cents":0,
  "services":[{"name":"Corte","duration_min":30,"price_cents":1200}],"professionals":["Rui","Ana"],
  "hours":[{"weekday":0,"opens":"00:00","closes":"23:59"},{"weekday":1,"opens":"00:00","closes":"23:59"},{"weekday":2,"opens":"00:00","closes":"23:59"},{"weekday":3,"opens":"00:00","closes":"23:59"},{"weekday":4,"opens":"00:00","closes":"23:59"},{"weekday":5,"opens":"00:00","closes":"23:59"},{"weekday":6,"opens":"00:00","closes":"23:59"}]}'::jsonb) as salon \gset
-- theme update as owner returns row
with u as (update salons set theme='b5' where id=:'salon' returning theme) select pg_temp.check((select count(*) from u) = 1, 'owner can change the theme');
select id as rui from professionals where name='Rui' \gset
select id as ana from professionals where name='Ana' \gset
select id as corte from services limit 1 \gset
-- price override for Rui
insert into service_overrides values (:'corte', :'rui', :'salon', true, 1500, 45);
reset role;

-- Client books (anon) with Rui: should take 45 min and 15 €
set role anon; reset request.jwt.claim.sub;
select create_booking(:'salon', :'corte', :'rui', now() + interval '2 days', 'Tiago', '912345678', true) as b1 \gset
reset role;
select pg_temp.check(price_cents = 1500 and ends_at - starts_at = interval '45 minutes', 'professional price and length apply') from bookings where id=:'b1';

-- Double booking blocked
select starts_at + interval '10 minutes' as overlap from bookings where id=:'b1' \gset
set role anon;
select set_config('t.overlap', :'overlap', false);
do $$ begin perform create_booking((select id from salons), (select id from services), (select id from professionals where name='Rui'), current_setting('t.overlap')::timestamptz, 'X', '913000000', false); raise exception 'SHOULD HAVE FAILED'; exception when others then if sqlerrm not like '%horario_ocupado%' then raise; end if; end $$;
reset role;

-- Time off blocks
insert into time_off (salon_id, professional_id, starts_at, ends_at) select :'salon', :'ana', now()+interval '3 days', now()+interval '3 days 2 hours';
set role anon;
do $$ begin perform create_booking((select id from salons), (select id from services), (select id from professionals where name='Ana'), now()+interval '3 days 30 minutes', 'X', '913000000', false); raise exception 'SHOULD HAVE FAILED'; exception when others then if sqlerrm not like '%horario_ocupado%' then raise; end if; end $$;
select pg_temp.check(count(*) = 2, 'busy slots include time off') from busy_slots((select id from salons), now(), now()+interval '7 days');
-- client view + move + cancel
select pg_temp.check(duration_min = 45 and price_cents = 1500, 'client page shows booking price and length') from booking_for_client(:'b1');
select move_booking_by_client(:'b1', now() + interval '4 days') \g /dev/null
reset role;
select pg_temp.check(status = 'pendente' and client_action = 'mudou' and ends_at - starts_at = interval '45 minutes', 'move keeps length, back to pending') from bookings where id=:'b1';
set role anon; select cancel_booking_by_client(:'b1') \g /dev/null
reset role;
select pg_temp.check(status = 'cancelada' and client_action = 'cancelou', 'client cancel') from bookings where id=:'b1';

-- Notification claim once (service role)
set role anon;
select create_booking(:'salon', :'corte', :'ana', now() + interval '5 days', 'Joana', '965738127', false) as b2 \gset
reset role;
set role service_role;
select pg_temp.check(owner_email = 'dono@x.pt', 'claim returns owner email') from claim_booking_notification(:'b2');
select pg_temp.check(count(*) = 0, 'a booking is claimed once') from claim_booking_notification(:'b2');
reset role;
-- anon cannot claim
set role anon; do $$ begin perform claim_booking_notification(gen_random_uuid()); raise exception 'SHOULD HAVE FAILED'; exception when insufficient_privilege then null; end $$; reset role;

-- Anon cannot read bookings
set role anon; select pg_temp.check(count(*) = 0, 'anon reads no bookings') from bookings; reset role;

-- Queue
update salons set queue_open = true;
set role anon; select join_queue(:'salon', 'Zé', '934000000', false) as w1 \gset
select pg_temp.check(join_queue(:'salon', 'Zé', '934000000', false) = :'w1', 'one place per phone');
select pg_temp.check(status = 'espera' and ahead = 0, 'queue status') from queue_status(:'w1');
reset role;

-- Team: invite Rui, he signs in, accepts, can read/update bookings, cannot delete, cannot change salon
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
insert into salon_invites (salon_id, email, professional_id) values (:'salon', 'RUI@x.pt', :'rui');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b'; set request.jwt.claim.email='rui@x.pt';
select pg_temp.check(accept_invites() = 1, 'invite accepted, email case-insensitive');
select pg_temp.check(role = 'equipa' and professional_id = :'rui', 'team member salon') from my_salon();
select pg_temp.check(count(*) = 2, 'team reads bookings') from bookings;
with u as (update bookings set status='confirmada' where id=:'b2' returning id) select pg_temp.check((select count(*) from u) = 1, 'team updates bookings');
with d as (delete from bookings where id=:'b2' returning id) select pg_temp.check((select count(*) from d) = 0, 'team cannot delete bookings');
with u as (update salons set name='Hack' where id=:'salon' returning id) select pg_temp.check((select count(*) from u) = 0, 'team cannot change the salon');
select set_queue_open(:'salon', false) \g /dev/null
-- outsider sees nothing
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c'; set request.jwt.claim.email='outro@x.pt';
select pg_temp.check(accept_invites() = 0, 'no invite for outsider'); select pg_temp.check(count(*) = 0, 'outsider reads no bookings') from bookings;
do $$ begin perform set_queue_open((select id from salons), true); raise exception 'SHOULD HAVE FAILED'; exception when others then if sqlerrm not like '%sem_permissao%' then raise; end if; end $$;
-- legal acceptance by owner, stamps server time/user
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
with i as (insert into legal_acceptances (document, version, salon_id, accepted_at) values ('termos','2026-11-21', :'salon', '2000-01-01') returning accepted_at) select pg_temp.check((select accepted_at from i) > now() - interval '1 minute', 'acceptance time set by the server');
-- forget client
select pg_temp.check(forget_client(:'salon', '351965738127') = 1, 'forget client');
reset role;
select pg_temp.check(client_name = 'Cliente apagado' and client_phone = '', 'forgotten booking anonymised') from bookings where id=:'b2';
select pg_temp.check(phone_key('+351 912 345 678') = '351912345678' and phone_key('00351912345678') = '351912345678' and phone_key('912345678') = '351912345678', 'phone key');
select pg_temp.check(forget_inactive_clients() = 0, 'recent clients are kept');
\echo All database checks passed
