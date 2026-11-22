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
select pg_temp.check(subscription = 'experimental' and trial_ends_at > now() + interval '29 days', 'new salon starts a 30-day trial') from salons where id=:'salon';
do $$ begin update salons set trial_ends_at = now() + interval '5 years'; raise exception 'SHOULD HAVE FAILED'; exception when others then if sqlerrm not like '%campos_de_faturacao%' then raise; end if; end $$;
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
set role service_role;
select pg_temp.check(action = 'cancelou' and owner_email = 'dono@x.pt', 'change email claimed') from claim_client_change_notification(:'b1');
select pg_temp.check(count(*) = 0, 'change email claimed once') from claim_client_change_notification(:'b1');
reset role;

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
select pg_temp.check(role = 'rececao' and professional_id = :'rui', 'team member salon, default level Receção') from my_salon();
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

-- Admin area: CorteCerto's admin (user c) sets plans and uploads invoices; owners read only their own.
insert into platform_admins values ('00000000-0000-0000-0000-00000000000c');
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$ begin perform admin_set_subscription((select id from salons), 'ativa', now() + interval '1 month', null); raise exception 'SHOULD HAVE FAILED'; exception when others then if sqlerrm not like '%sem_permissao%' then raise; end if; end $$;
do $$ begin insert into invoices (salon_id, number, amount_cents, file_path) values ((select id from salons), 'FT 1', 2448, 'x.pdf'); raise exception 'SHOULD HAVE FAILED'; exception when others then if sqlerrm not like '%row-level security%' then raise; end if; end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select pg_temp.check(is_platform_admin(), 'admin is recognised');
select admin_set_subscription(:'salon', 'ativa', now() + interval '1 month', null) \g /dev/null
insert into invoices (salon_id, number, period, amount_cents, file_path) values (:'salon', 'FT 2026/1', 'dezembro 2026', 2448, :'salon' || '/ft-1.pdf');
reset role;
select pg_temp.check(subscription = 'ativa' and paid_until > now() + interval '27 days', 'admin sets the plan') from salons where id=:'salon';
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select pg_temp.check(count(*) = 1, 'owner sees the invoice') from invoices;
do $$ begin perform admin_set_subscription((select id from salons), 'experimental', null, null); raise exception 'SHOULD HAVE FAILED'; exception when others then if sqlerrm not like '%sem_permissao%' then raise; end if; end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.check(count(*) = 0 and not is_platform_admin(), 'others see no invoices and are not admin') from invoices;
reset role;
-- 0018: access levels ---------------------------------------------------------
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
insert into client_notes (salon_id, phone_key, notes) values (:'salon', '351911111111', 'nota');
update salon_members set access = 'agenda' where user_id = '00000000-0000-0000-0000-00000000000b';
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.check(role = 'agenda', 'owner changed the level to Agenda') from my_salon();
select pg_temp.check(count(*) = 0, 'agenda level reads no client notes') from client_notes;
select pg_temp.check(count(*) > 0, 'agenda level still reads bookings') from bookings;
do $$ begin insert into professional_pay (professional_id, salon_id) select id, salon_id from professionals limit 1; raise exception 'SHOULD HAVE FAILED'; exception when others then if sqlerrm not like '%row-level security%' then raise; end if; end $$;
reset role; set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
update salon_members set access = 'gestor' where user_id = '00000000-0000-0000-0000-00000000000b';
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.check(count(*) = 1, 'gestor reads client notes') from client_notes;
insert into professional_pay (professional_id, salon_id, commission_type, commission_percent) values (:'rui', :'salon', 'percentagem', 40);
insert into professional_pay (professional_id, salon_id, commission_type, commission_cents) values (:'ana', :'salon', 'montante', 500);
with u as (update professionals set name = 'Ana Maria' where id = :'ana' returning id) select pg_temp.check((select count(*) from u) = 1, 'gestor edits the team');
with u as (update salons set name='Hack' where id=:'salon' returning id) select pg_temp.check((select count(*) from u) = 0, 'gestor cannot change the salon');
with d as (delete from salon_members returning user_id) select pg_temp.check((select count(*) from d) = 0, 'gestor cannot remove access');
do $$ begin update professional_pay set commission_percent = 140 where commission_type = 'percentagem'; raise exception 'SHOULD HAVE FAILED'; exception when others then if sqlerrm not like '%check%' then raise; end if; end $$;
set role anon; reset request.jwt.claim.sub;
select pg_temp.check(count(*) = 0, 'commissions are private') from professional_pay;
reset role;

-- 0018: client list, invitations and new-client check -----------------------
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
insert into salon_clients (salon_id, phone_key, name, phone, source, invited_at) values (:'salon', '351922222222', 'Convidado', '922222222', 'convite', now());
select pg_temp.check(array_agg(k) = array['351922222222'], 'known clients by phone') from known_clients(:'salon', array['351922222222', '351933333333']) k;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select pg_temp.check(count(*) = 0, 'outsider sees no client list') from salon_clients;
select pg_temp.check(count(*) = 0, 'outsider learns nothing from known_clients') from known_clients(:'salon', array['351922222222']);
reset role;

-- 0018: the salon suggests another time --------------------------------------
set role anon; reset request.jwt.claim.sub;
select create_booking(:'salon', :'corte', :'ana', now() + interval '5 days', 'Marta', '966666666', false) as b5 \gset
reset role;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select propose_booking_time(:'b5', now() + interval '6 days', 'Pode ser um dia depois?') \g /dev/null
reset role;
set role anon; reset request.jwt.claim.sub;
select pg_temp.check(proposed_starts_at is not null and proposal_note = 'Pode ser um dia depois?', 'client sees the suggestion') from booking_for_client(:'b5');
select pg_temp.check(count(*) = 1, 'suggested time is held as busy') from busy_slots(:'salon', now() + interval '6 days' - interval '1 minute', now() + interval '6 days' + interval '1 minute');
do $$ begin perform create_booking((select id from salons), (select id from services), (select id from professionals where name like 'Ana%'), now() + interval '6 days' + interval '5 minutes', 'X', '913000000', false); raise exception 'SHOULD HAVE FAILED'; exception when others then if sqlerrm not like '%horario_ocupado%' then raise; end if; end $$;
select respond_to_proposal(:'b5', true) \g /dev/null
reset role;
select pg_temp.check(status = 'confirmada' and client_action = 'aceitou' and proposed_starts_at is null and starts_at > now() + interval '5 days 23 hours', 'accepting moves and confirms') from bookings where id = :'b5';
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select propose_booking_time(:'b5', now() + interval '7 days') \g /dev/null
reset role; set role anon; reset request.jwt.claim.sub;
select respond_to_proposal(:'b5', false) \g /dev/null
select set_config('t.b5', :'b5', false) \g /dev/null
do $$ begin perform respond_to_proposal(current_setting('t.b5')::uuid, true); raise exception 'SHOULD HAVE FAILED'; exception when others then if sqlerrm not like '%sem_proposta%' then raise; end if; end $$;
reset role;
select pg_temp.check(client_action = 'recusou' and proposed_starts_at is null, 'declining keeps the booking') from bookings where id = :'b5';
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
do $$ begin perform propose_booking_time(current_setting('t.b5')::uuid, now() + interval '8 days'); raise exception 'SHOULD HAVE FAILED'; exception when others then if sqlerrm not like '%sem_permissao%' then raise; end if; end $$;
reset role;

-- 0018: the Club ----------------------------------------------------------------
update salons set deposit_cents = 500 where id = :'salon';
set role anon; reset request.jwt.claim.sub;
do $$ begin perform join_club((select id from salons), 'Zé', '934000000'); raise exception 'SHOULD HAVE FAILED'; exception when others then if sqlerrm not like '%clube_fechado%' then raise; end if; end $$;
reset role;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
insert into salon_club (salon_id, active, name, price_cents, benefits) values (:'salon', true, 'Clube Barb', 3500, 'Cortes ilimitados');
reset role;
set role anon; reset request.jwt.claim.sub;
select join_club(:'salon', 'Zé', '934 000 000') as m1 \gset
select pg_temp.check(join_club(:'salon', 'Zé', '934000000') = :'m1', 'one open membership per phone');
select pg_temp.check(count(*) = 0, 'anon reads no members') from club_members;
select create_booking(:'salon', :'corte', :'rui', now() + interval '9 days', 'Zé', '934000000', false) as b6 \gset
reset role;
select pg_temp.check(deposit = 'pendente', 'a club request still pays the deposit') from bookings where id = :'b6';
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
update club_members set status = 'ativo', started_at = now(), paid_until = current_date + 30 where id = :'m1';
reset role; set role anon; reset request.jwt.claim.sub;
select create_booking(:'salon', :'corte', :'rui', now() + interval '10 days', 'Zé', '934000000', false) as b7 \gset
reset role;
select pg_temp.check(deposit = 'nenhum', 'active members book without a deposit') from bookings where id = :'b7';
update salons set deposit_cents = 0 where id = :'salon';
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select forget_client(:'salon', '351934000000') \g /dev/null
reset role;
select pg_temp.check(status = 'cancelado' and phone = '', 'forgetting a client ends the membership') from club_members where id = :'m1';

-- 0018: AI log is written by the Worker only
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$ begin insert into ai_requests (salon_id, feature, status) values ((select id from salons), 'try-on', 'feito'); raise exception 'SHOULD HAVE FAILED'; exception when others then if sqlerrm not like '%row-level security%' then raise; end if; end $$;
reset role;
\echo All database checks passed
