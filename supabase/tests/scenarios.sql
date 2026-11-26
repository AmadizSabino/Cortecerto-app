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
-- 0019: filling a freed slot ------------------------------------------------------
set role anon; reset request.jwt.claim.sub;
select create_booking(:'salon', :'corte', :'ana', date_trunc('hour', now()) + interval '12 days 10 hours', 'Livre', '935100000', false) as f1 \gset
select create_booking(:'salon', :'corte', :'ana', date_trunc('hour', now()) + interval '12 days 16 hours', 'Tarde', '935200000', false) as f2 \gset
select set_wants_earlier(:'f2', true) \g /dev/null
select pg_temp.check(wants_earlier, 'client asks for an earlier time') from booking_for_client(:'f2');
reset role;
update bookings set status = 'cancelada' where id = :'f1';
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select offer_free_slot(:'salon', :'ana', date_trunc('hour', now()) + interval '12 days 10 hours', date_trunc('hour', now()) + interval '12 days 11 hours') as o1 \gset
select pg_temp.check(offer_free_slot(:'salon', :'ana', date_trunc('hour', now()) + interval '12 days 10 hours', date_trunc('hour', now()) + interval '12 days 11 hours') = :'o1', 'one open offer per time');
do $$ begin perform offer_free_slot((select id from salons), (select id from professionals where name like 'Ana%'), date_trunc('hour', now()) + interval '12 days 16 hours', date_trunc('hour', now()) + interval '12 days 17 hours'); raise exception 'SHOULD HAVE FAILED'; exception when others then if sqlerrm not like '%horario_ocupado%' then raise; end if; end $$;
reset role;
set role anon; reset request.jwt.claim.sub;
select pg_temp.check(state = 'aberta' and professional_name like 'Ana%', 'offer page shows the open slot') from slot_offer_for_client(:'o1');
select take_slot_offer_move(:'o1', :'f2') \g /dev/null
select pg_temp.check(state = 'ocupada', 'taken offer shows as taken') from slot_offer_for_client(:'o1');
select set_config('t.o1', :'o1', false) \g /dev/null
do $$ begin perform take_slot_offer_new(current_setting('t.o1')::uuid, (select id from services limit 1), 'Outro', '935300000', false); raise exception 'SHOULD HAVE FAILED'; exception when others then if sqlerrm not like '%vaga_ocupada%' then raise; end if; end $$;
reset role;
select pg_temp.check(starts_at = date_trunc('hour', now()) + interval '12 days 10 hours' and client_action = 'mudou' and not wants_earlier, 'later client moved into the freed slot') from bookings where id = :'f2';
-- the afternoon slot is now free: offer it to someone new
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select offer_free_slot(:'salon', :'ana', date_trunc('hour', now()) + interval '12 days 16 hours', date_trunc('hour', now()) + interval '12 days 16 hours 20 minutes') as o2 \gset
reset role;
set role anon; reset request.jwt.claim.sub;
select set_config('t.o2', :'o2', false) \g /dev/null
do $$ begin perform take_slot_offer_new(current_setting('t.o2')::uuid, (select id from services where name = 'Corte'), 'Novo', '935400000', true); raise exception 'SHOULD HAVE FAILED'; exception when others then if sqlerrm not like '%nao_cabe%' then raise; end if; end $$;
reset role;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
update slot_offers set closed_at = now() where id = :'o2';
select offer_free_slot(:'salon', :'ana', date_trunc('hour', now()) + interval '12 days 16 hours', date_trunc('hour', now()) + interval '12 days 17 hours') as o3 \gset
reset role;
set role anon; reset request.jwt.claim.sub;
select pg_temp.check(state = 'expirada', 'withdrawn offer is closed') from slot_offer_for_client(:'o2');
select take_slot_offer_new(:'o3', :'corte', 'Novo', '935400000', true) as f3 \gset
select pg_temp.check(count(*) = 0, 'anon reads no offers') from slot_offers;
reset role;
select pg_temp.check(client_name = 'Novo' and starts_at = date_trunc('hour', now()) + interval '12 days 16 hours', 'new client booked the freed slot') from bookings where id = :'f3';

-- 0019: brand ----------------------------------------------------------------------
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select set_salon_brand(:'salon', :'salon' || '/logo.png', null, '  Barbearia de bairro desde 1990  ') \g /dev/null
do $$ begin perform set_salon_brand((select id from salons), 'outro/logo.png', null, null); raise exception 'SHOULD HAVE FAILED'; exception when others then if sqlerrm not like '%ficheiro_invalido%' then raise; end if; end $$;
insert into salon_photos (salon_id, path, caption) values (:'salon', :'salon' || '/g1.jpg', 'Fade');
reset role; set role anon; reset request.jwt.claim.sub;
select pg_temp.check(count(*) = 1, 'gallery is public') from salon_photos;
select pg_temp.check(about = 'Barbearia de bairro desde 1990' and logo_path like '%/logo.png', 'brand saved and public') from salons;
reset role;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
do $$ begin perform set_salon_brand((select id from salons), null, null, 'hack'); raise exception 'SHOULD HAVE FAILED'; exception when others then if sqlerrm not like '%sem_permissao%' then raise; end if; end $$;
reset role;
-- 0020: promotions -----------------------------------------------------------------
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
insert into promotions (salon_id, code, title, kind, percent, service_ids, time_from, time_to)
values (:'salon', 'tarde-20', 'Tardes -20%', 'percentagem', 20, array[:'corte'::uuid], '14:00', '17:00') returning id as pr1 \gset
reset role;
set role anon; reset request.jwt.claim.sub;
select pg_temp.check(count(*) = 1, 'promotions are public') from promotions where code = 'tarde-20';
select price_cents as base from effective_service(:'corte', :'ana') \gset
select create_booking_with_promo(:'salon', :'corte', :'ana', (date_trunc('day', now() at time zone 'Europe/Lisbon') + interval '20 days 15 hours') at time zone 'Europe/Lisbon', 'Promo', '936100000', false, :'pr1') as pb1 \gset
select create_booking_with_promo(:'salon', :'corte', :'ana', (date_trunc('day', now() at time zone 'Europe/Lisbon') + interval '20 days 10 hours') at time zone 'Europe/Lisbon', 'Manha', '936200000', false, :'pr1') as pb2 \gset
reset role;
select pg_temp.check(promotion_id = :'pr1' and price_before_cents = :base and price_cents = round(:base * 0.8)::int, 'promotion applied in its hours') from bookings where id = :'pb1';
select pg_temp.check(promotion_id is null and price_cents = :base, 'outside its hours the normal price stands') from bookings where id = :'pb2';
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
do $$ begin insert into promotions (salon_id, code, title, kind, gift) values ((select id from salons), 'hack', 'x', 'oferta', 'y'); raise exception 'SHOULD HAVE FAILED'; exception when others then if sqlerrm not like '%row-level security%' then raise; end if; end $$;
reset role;
do $$ begin insert into promotions (salon_id, code, title, kind) values ((select id from salons), 'semvalor', 'x', 'percentagem'); raise exception 'SHOULD HAVE FAILED'; exception when others then if sqlerrm not like '%check%' then raise; end if; end $$;
-- 0022: business profile ----------------------------------------------------------
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
update salons set areas = array['barbearia', 'estetica'], booking_mode = 'ambos', work_place = 'ambos' where id = :'salon';
do $$ begin update salons set areas = array['tatuagem']; raise exception 'SHOULD HAVE FAILED'; exception when others then if sqlerrm not like '%check%' then raise; end if; end $$;
reset role;

-- 0022: home visits ----------------------------------------------------------------
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
insert into home_settings (salon_id, active, min_order_cents, deposit_required) values (:'salon', true, 500, false);
insert into home_zones (salon_id, name, postcodes, fee_cents, travel_min) values (:'salon', 'Setúbal', array['2900', '2910'], 800, 20) returning id as z1 \gset
insert into home_fees (salon_id, label, rule, at, amount_cents) values (:'salon', 'Antes das 9h', 'antes_das', '09:00', 500);
insert into home_fees (salon_id, label, rule, amount_cents) values (:'salon', 'Fim de semana', 'fim_de_semana', 300);
update services set at_home = true where id = :'corte';
update professionals set at_home = true where id = :'ana';
reset role;
-- a weekday 15 days ahead at 08:30 Lisbon
select (d + time '08:30') at time zone 'Europe/Lisbon' as h1 from (select (current_date + 15 + case extract(dow from current_date + 15)::int when 0 then 1 when 6 then 2 else 0 end)::timestamp as d) x \gset
select set_config('t.h1', :'h1', false) \g /dev/null
set role anon; reset request.jwt.claim.sub;
select create_home_booking(:'salon', :'corte', :'ana', :'h1', 'Casa', '937100000', false, :'z1', 'Rua das Flores 1', '2900-123', 'Cão simpático') as hb1 \gset
select pg_temp.check(count(*) = 0, 'anon reads no addresses') from booking_addresses;
select pg_temp.check(count(*) = 1, 'travel is busy') from busy_slots(:'salon', :'h1'::timestamptz - interval '19 minutes', :'h1'::timestamptz - interval '18 minutes');
do $$ begin perform create_booking((select id from salons), (select id from services where name = 'Corte'), (select id from professionals where name like 'Ana%'), current_setting('t.h1')::timestamptz - interval '15 minutes', 'X', '937200000', false); raise exception 'SHOULD HAVE FAILED'; exception when others then if sqlerrm not like '%horario_ocupado%' and sqlerrm not like '%t.h1%' then raise; end if; end $$;
reset role;
select pg_temp.check(location = 'domicilio' and travel_min = 20 and home_fee_cents = 1300, 'home visit priced: zone + early fee') from bookings where id = :'hb1';
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.check(count(*) = 1 and max(notes) = 'Cão simpático', 'front desk and up read the address') from booking_addresses;
reset role;
set role anon; reset request.jwt.claim.sub;
do $$ begin perform create_home_booking((select id from salons), (select id from services where name = 'Corte'), (select id from professionals where name = 'Rui'), now() + interval '16 days', 'Y', '937300000', false, (select id from home_zones limit 1), 'Rua 2', null, null); raise exception 'SHOULD HAVE FAILED'; exception when others then if sqlerrm not like '%profissional_invalido%' then raise; end if; end $$;
reset role;

-- 0022: packages: combo --------------------------------------------------------------
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
insert into packages (salon_id, mode, name, price_cents) values (:'salon', 'combo', 'Dia do noivo', 3000) returning id as k1 \gset
insert into package_items (package_id, service_id) values (:'k1', :'corte');
insert into package_items (package_id, service_id, optional, extra_price_cents) values (:'k1', :'corte', true, 700) returning id as x1 \gset
reset role;
set role anon; reset request.jwt.claim.sub;
select create_package_booking(:'salon', :'k1', :'rui', date_trunc('hour', now()) + interval '17 days 11 hours', 'Noivo', '938100000', false, array[:'x1'::uuid]) as kb1 \gset
reset role;
select pg_temp.check(price_cents = 3700 and package_summary = 'Dia do noivo: Corte + Corte' and ends_at - starts_at = interval '90 minutes', 'combo booked with an extra: price and time add up') from bookings where id = :'kb1';

-- 0022: packages: evento ------------------------------------------------------------
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
insert into packages (salon_id, mode, name, price_cents, per_guest_cents, max_guests, includes_trial, deposit_pct) values (:'salon', 'evento', 'Noiva', 18000, 4500, 6, true, 30) returning id as k2 \gset
insert into package_items (package_id, service_id) values (:'k2', :'corte');
reset role;
set role anon; reset request.jwt.claim.sub;
select request_package(:'k2', 'Joana', '939100000', true, current_date + 60, '09:00', 'local', 'Quinta do Lago', 3, null, 'Casamento') as r1 \gset
select pg_temp.check(status = 'pedido' and estimate_cents = 18000 + 3 * 4500, 'event request estimate per person') from package_request_for_client(:'r1');
do $$ begin perform request_package((select id from packages where name = 'Noiva'), 'J', '939100000', true, current_date + 60, null, 'salao', null, 9, null, null); raise exception 'SHOULD HAVE FAILED'; exception when others then if sqlerrm not like '%convidados_invalidos%' then raise; end if; end $$;
select set_config('t.r1', :'r1', false) \g /dev/null
do $$ begin perform accept_package_proposal(current_setting('t.r1')::uuid); raise exception 'SHOULD HAVE FAILED'; exception when others then if sqlerrm not like '%sem_proposta%' then raise; end if; end $$;
reset role;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select propose_package(:'r1', 30000, 9000, 'Inclui prova', :'ana', date_trunc('hour', now()) + interval '30 days 10 hours', 90, date_trunc('hour', now()) + interval '60 days 8 hours', 240, current_date + 14) \g /dev/null
reset role;
set role anon; reset request.jwt.claim.sub;
select accept_package_proposal(:'r1') \g /dev/null
reset role;
select pg_temp.check(count(*) = 2 and sum(price_cents) = 30000 and bool_or(location = 'domicilio'), 'accepting puts the trial and the day in the agenda') from bookings where package_request_id = :'r1';
select pg_temp.check(status = 'aceite', 'request accepted') from package_requests where id = :'r1';

-- 0022: packages: pack ----------------------------------------------------------------
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
insert into packages (salon_id, mode, name, price_cents, sessions) values (:'salon', 'pack', '5 cortes', 5000, 2) returning id as k3 \gset
reset role;
set role anon; reset request.jwt.claim.sub;
select buy_pack(:'k3', 'Pack', '930100000') as cp1 \gset
select create_booking(:'salon', :'corte', :'rui', date_trunc('hour', now()) + interval '18 days 15 hours', 'Pack', '930100000', false) as pb \gset
reset role;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select set_config('t.cp1', :'cp1', false) \g /dev/null
select set_config('t.pb', :'pb', false) \g /dev/null
do $$ begin perform use_pack_session(current_setting('t.cp1')::uuid, current_setting('t.pb')::uuid); raise exception 'SHOULD HAVE FAILED'; exception when others then if sqlerrm not like '%pack_inativo%' then raise; end if; end $$;
update client_packs set status = 'ativo', paid_at = now() where id = :'cp1';
select pg_temp.check(use_pack_session(:'cp1', :'pb') = 1, 'one session left');
reset role;
select pg_temp.check(price_cents = 0 and client_pack_id = :'cp1', 'visit paid with the pack') from bookings where id = :'pb';
-- 0023: gentle lock -------------------------------------------------------------------
set role anon; reset request.jwt.claim.sub;
select create_booking(:'salon', :'corte', :'rui', date_trunc('hour', now()) + interval '25 days 11 hours', 'Antes', '931000000', false) as lb \gset
reset role;
select pg_temp.check(not salon_locked(:'salon'), 'a paid salon is not locked');
update salons set paid_until = now() - interval '10 days' where id = :'salon';
select pg_temp.check(not salon_locked(:'salon'), 'still in the 14-day grace period');
update salons set paid_until = now() - interval '15 days' where id = :'salon';
select pg_temp.check(salon_locked(:'salon'), 'locked 14 days after the paid period ends');
select set_config('t.rui', :'rui', false) \g /dev/null
select set_config('t.corte', :'corte', false) \g /dev/null
select set_config('t.salon', :'salon', false) \g /dev/null
set role anon;
do $$ begin perform create_booking(current_setting('t.salon')::uuid, current_setting('t.corte')::uuid, current_setting('t.rui')::uuid, date_trunc('hour', now()) + interval '26 days 11 hours', 'Novo', '931000001', false); raise exception 'SHOULD HAVE FAILED'; exception when others then if sqlerrm not like '%salao_bloqueado%' then raise; end if; end $$;
select cancel_booking_by_client(:'lb') \g /dev/null
reset role;
select pg_temp.check(status = 'cancelada', 'a client can still cancel while the salon is locked') from bookings where id = :'lb';
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select pg_temp.check(count(*) > 0, 'the owner still sees the bookings') from bookings;
do $$ begin update salons set theme = 'b2'; raise exception 'SHOULD HAVE FAILED'; exception when others then if sqlerrm not like '%salao_bloqueado%' then raise; end if; end $$;
do $$ begin update bookings set status = 'concluida' where status = 'confirmada'; raise exception 'SHOULD HAVE FAILED'; exception when others then if sqlerrm not like '%salao_bloqueado%' then raise; end if; end $$;
do $$ begin insert into services (salon_id, name, duration_min, price_cents) values (current_setting('t.salon')::uuid, 'Novo', 30, 1000); raise exception 'SHOULD HAVE FAILED'; exception when others then if sqlerrm not like '%salao_bloqueado%' then raise; end if; end $$;
select forget_client(:'salon', '351931000000') \g /dev/null
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select admin_set_subscription(:'salon', 'ativa', now() + interval '1 month', null) \g /dev/null
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
with u as (update salons set theme = 'b2' where id = :'salon' returning 1) select pg_temp.check((select count(*) from u) = 1, 'marking the salon paid unlocks it');
reset role;
select pg_temp.check(client_name = 'Cliente apagado', 'forgetting a client works while locked') from bookings where id = :'lb';
-- 0024: admin dashboard ---------------------------------------------------------
select pg_temp.check(source = 'online', 'a client booking on the public page is online') from bookings where id = :'b1';
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
insert into bookings (salon_id, service_id, professional_id, starts_at, ends_at, client_name, client_phone, status)
  values (:'salon', :'corte', :'ana', now() + interval '61 days 7 hours', now() + interval '61 days 7 hours 30 minutes', 'Ao telefone', '914000000', 'confirmada') returning id as pb \gset
do $$ begin perform admin_dashboard(); raise exception 'SHOULD HAVE FAILED'; exception when others then if sqlerrm not like '%sem_permissao%' then raise; end if; end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select pg_temp.check(jsonb_array_length(d->'salons') = 1 and jsonb_array_length(d->'weeks') = 12
  and (d->'salons'->0->>'owner_email') = 'dono@x.pt' and (d->'salons'->0->>'bookings')::int > 0, 'the admin gets the dashboard')
  from (select admin_dashboard() as d) x;
reset role;
select pg_temp.check(source = 'salao', 'a booking made in the panel is the salon''s') from bookings where id = :'pb';
set role anon;
do $$ begin perform admin_dashboard(); raise exception 'SHOULD HAVE FAILED'; exception when others then if sqlerrm not like '%permission denied%' and sqlerrm not like '%sem_permissao%' then raise; end if; end $$;
reset role;
-- 0025: money and control ---------------------------------------------------------
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
insert into invoices (salon_id, number, amount_cents, file_path, issued_on, due_on)
  values (:'salon', 'FT 2026/9', 2448, :'salon' || '/ft-9.pdf', current_date - 14, current_date - 6) returning id as inv \gset
select pg_temp.check(count(*) = 1, 'an invoice 6 days late is due a reminder') from admin_reminders_due() where invoice_id = :'inv' and kind = 'atraso_5';
select pg_temp.check(count(*) = 1 and min(owner_email) = 'dono@x.pt', 'the admin claims the reminder') from claim_reminder(:'salon', 'atraso_5', :'inv');
select pg_temp.check(count(*) = 0, 'the same reminder is not sent twice') from claim_reminder(:'salon', 'atraso_5', :'inv');
select reminder_result((select id from reminder_log where invoice_id = :'inv'), true);
select paid_until as before_paid from salons where id = :'salon' \gset
select admin_mark_invoice_paid(:'inv', current_date, 'mbway', 'ref 1') \g /dev/null
select pg_temp.check(status = 'paga' and paid_on = current_date and payment_method = 'mbway', 'invoice marked paid') from invoices where id = :'inv';
select pg_temp.check(count(*) >= 2, 'payment and plan change are in the audit log') from admin_audit_recent(10) where action in ('fatura_paga', 'assinatura');
select pg_temp.check(count(*) = 0, 'a paid invoice is not due a reminder') from admin_reminders_due() where invoice_id = :'inv';
insert into admin_notes (salon_id, body) values (:'salon', 'Ligar na sexta');
update platform_settings set value = '{"mbway": "912345678", "iban": "PT50000000000000000000000", "titular": "X", "nota": ""}' where key = 'pagamentos';
reset role;
select pg_temp.check(paid_until = :'before_paid'::timestamptz + interval '1 month' and subscription = 'ativa', 'paying moves Pago até one month on') from salons where id = :'salon';
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$ begin perform admin_mark_invoice_paid((select id from invoices limit 1), current_date, 'mbway'); raise exception 'SHOULD HAVE FAILED'; exception when others then if sqlerrm not like '%sem_permissao%' then raise; end if; end $$;
do $$ begin perform * from admin_reminders_due(); raise exception 'SHOULD HAVE FAILED'; exception when others then if sqlerrm not like '%sem_permissao%' then raise; end if; end $$;
do $$ begin perform * from claim_reminder((select id from salons limit 1), 'atraso_5', null); raise exception 'SHOULD HAVE FAILED'; exception when others then if sqlerrm not like '%sem_permissao%' then raise; end if; end $$;
select pg_temp.check(count(*) = 0, 'owners cannot read the audit log, notes or settings')
  from (select id::text from admin_audit union all select id::text from admin_notes union all select key from platform_settings) x;
insert into salon_billing (salon_id, legal_name, nif, email) values (:'salon', 'Barb Lda', '123456789', 'faturas@x.pt');
do $$ begin update salon_billing set nif = '12'; raise exception 'SHOULD HAVE FAILED'; exception when others then if sqlerrm not like '%violates check%' then raise; end if; end $$;
reset role;
set role service_role;
select pg_temp.check(count(*) = 0, 'no automatic reminders while switched off') from reminders_due_auto();
reset role;
-- 0026: payment requests -----------------------------------------------------------
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select pg_temp.check(count(*) = 1, 'a paying salon is due a request next month')
  from admin_payment_requests_due((date_trunc('month', current_date) + interval '1 month')::date);
select number as pp from admin_new_payment_request(:'salon', (date_trunc('month', current_date) + interval '1 month')::date, 'próximo mês', 2448,
  current_date, current_date + 8, :'salon' || '/pp-1.pdf') \gset
select pg_temp.check(:'pp' = 'PP ' || to_char(current_date, 'YYYY') || '/001', 'requests are numbered PP year/001');
select pg_temp.check(count(*) = 0, 'a salon with a request for the month is not due again')
  from admin_payment_requests_due((date_trunc('month', current_date) + interval '1 month')::date);
do $$ begin perform admin_new_payment_request((select id from salons limit 1), (date_trunc('month', current_date) + interval '1 month')::date, 'x', 2448, current_date, current_date + 8, (select id from salons limit 1)::text || '/pp-2.pdf'); raise exception 'SHOULD HAVE FAILED'; exception when others then if sqlerrm not like '%invoices_one_request_per_month%' then raise; end if; end $$;
select pg_temp.check(count(*) = 1 and min(number) = :'pp', 'the admin claims the request email')
  from admin_claim_request_email((select id from invoices where number = :'pp'));
select pg_temp.check(sent_at is not null and sent_to = 'faturas@x.pt', 'the request is sent to the billing email') from invoices where number = :'pp';
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select pg_temp.check(count(*) = 1, 'the owner sees the request') from invoices where kind = 'pedido';
do $$ begin perform admin_new_payment_request((select id from salons limit 1), current_date, 'x', 2448, current_date, current_date + 8, (select id from salons limit 1)::text || '/pp-3.pdf'); raise exception 'SHOULD HAVE FAILED'; exception when others then if sqlerrm not like '%sem_permissao%' then raise; end if; end $$;
reset role;
-- 0027: site events, uptime, AI cost, alerts ------------------------------------------
set role service_role;
insert into site_events (name, page, path, src, visitor, device) values
  ('visita', 'site', '/', 'cartaz', '0123456789abcdef', 'telemovel'),
  ('visita', 'site', '/', 'cartaz', '0123456789abcdef', 'telemovel'),
  ('conta_criada', 'registo', '/painel', 'cartaz', '0123456789abcdef', 'telemovel');
insert into site_events (name, page, path, salon_id, visitor) values
  ('visita', 'salao', '/s/x', :'salon', 'fedcba9876543210'), ('marcacao_feita', 'salao', '/s/x', :'salon', 'fedcba9876543210');
insert into uptime_checks (ok, app_ok, db_ok, ms) values (true, true, true, 120);
insert into uptime_checks (ok, app_ok, db_ok, ms, detail) values (false, true, false, 5000, 'db 503'), (false, true, false, 5000, 'db 503');
insert into ai_requests (salon_id, feature, status, model, input_tokens, output_tokens) values (:'salon', 'review-reply', 'feito', 'claude-haiku-5-5', 1000000, 1000000);
insert into ai_requests (salon_id, feature, status, model, images) values (:'salon', 'try-on', 'feito', 'gemini-2.5-flash-image', 1);
select pg_temp.check(sum(cost_usd) = 0.64, 'AI requests are priced from the settings') from ai_requests where model is not null;
select pg_temp.check((s->>'email') = 'outro@x.pt' and jsonb_array_length(s->'last_checks') = 3 and s->>'down_since' is not null
  and (s->'ai'->>'cost_eur')::numeric = round(0.64 * 0.87, 4), 'the Worker reads the ops status') from (select ops_status() as s) x;
select pg_temp.check(claim_admin_alert('site_em_baixo', '2026-11-23 10'), 'an alert is claimed once');
select pg_temp.check(not claim_admin_alert('site_em_baixo', '2026-11-23 10'), 'the same alert is not claimed twice');
select pg_temp.check((d->>'paying')::int >= 0 and d ? 'owed_cents', 'the daily summary builds') from (select ops_digest() as d) x;
reset role;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select pg_temp.check((s->'visitors'->>'site')::int = 1 and (s->'totals'->>'registo:conta_criada')::int = 1
  and (s->'sources'->0->>'source') = 'cartaz' and (s->'salons'->0->>'booked')::int = 1 and jsonb_array_length(s->'daily') = 31,
  'the admin gets the site stats') from (select admin_site_stats(30) as s) x;
select pg_temp.check((o->'uptime'->'24h'->>'failed')::int = 2 and jsonb_array_length(o->'ai_features') = 2, 'the admin gets uptime and AI cost')
  from (select admin_ops() as o) x;
update platform_settings set value = jsonb_set(value, '{orcamento_eur}', '5') where key = 'ia';
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$ begin perform admin_site_stats(30); raise exception 'SHOULD HAVE FAILED'; exception when others then if sqlerrm not like '%sem_permissao%' then raise; end if; end $$;
do $$ begin perform ops_status(); raise exception 'SHOULD HAVE FAILED'; exception when others then if sqlerrm not like '%sem_permissao%' then raise; end if; end $$;
do $$ begin perform claim_admin_alert('resumo', 'x'); raise exception 'SHOULD HAVE FAILED'; exception when others then if sqlerrm not like '%sem_permissao%' then raise; end if; end $$;
select pg_temp.check(count(*) = 0, 'owners cannot read site events or uptime') from (select id from site_events union all select id from uptime_checks) x;
reset role;
select pg_temp.check((value->>'orcamento_eur')::int = 5, 'the admin changes the AI budget') from platform_settings where key = 'ia';
-- 0028: prospects, how they heard, demo salons, admin two-step login ----------------------
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
update salons set heard_from = 'instagram', heard_detail = 'anúncio' where id = :'salon';
reset role;
select pg_temp.check(heard_from = 'instagram', 'the owner says how they heard') from salons where id = :'salon';
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
insert into prospects (name, city, phone, status, next_on) values ('Barbearia do Zé', 'Setúbal', '912000000', 'contactado', current_date + 2);
select pg_temp.check(count(*) = 1, 'the admin keeps a prospect list') from prospects;
do $$ begin perform admin_fill_demo((select id from salons limit 1)); raise exception 'SHOULD HAVE FAILED'; exception when others then if sqlerrm not like '%nao_e_demo%' then raise; end if; end $$;
select admin_set_demo(:'salon', true);
select admin_fill_demo(:'salon') as demo_n \gset
select pg_temp.check(:demo_n > 20, 'a demo salon is filled with sample bookings');
reset role;
select pg_temp.check(count(*) = :demo_n and count(*) filter (where status = 'concluida') > 0 and count(*) filter (where status = 'confirmada') > 0,
  'sample bookings are marked demo, past ones done, future ones confirmed') from bookings where salon_id = :'salon' and demo;
set role authenticated;
select pg_temp.check(admin_fill_demo(:'salon') = :demo_n, 'filling again replaces the sample instead of adding to it');
select pg_temp.check(admin_clear_demo(:'salon') = :demo_n, 'clearing removes only the sample bookings');
reset role;
select pg_temp.check(count(*) > 0, 'real bookings stay') from bookings where salon_id = :'salon' and not demo;
set role authenticated;
select pg_temp.check(count(*) = 0, 'demo salons are left out of how-they-heard') from admin_heard_from();
select admin_set_demo(:'salon', false);
select pg_temp.check(min(heard_from) = 'instagram', 'how they heard is counted') from admin_heard_from();
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select pg_temp.check(count(*) = 0, 'owners cannot read prospects') from prospects;
do $$ begin update salons set is_demo = true; raise exception 'SHOULD HAVE FAILED'; exception when others then if sqlerrm not like '%sem_permissao%' then raise; end if; end $$;
do $$ begin perform admin_fill_demo((select id from salons limit 1)); raise exception 'SHOULD HAVE FAILED'; exception when others then if sqlerrm not like '%sem_permissao%' then raise; end if; end $$;
reset role;
insert into auth.mfa_factors (user_id, status) values ('00000000-0000-0000-0000-00000000000c', 'verified');
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select pg_temp.check(not is_platform_admin(), 'with an authenticator app, a session without the code is not admin');
set request.jwt.claim.aal = 'aal2';
select pg_temp.check(is_platform_admin(), 'with the code, the admin is admin');
set request.jwt.claim.aal = '';
reset role;
delete from auth.mfa_factors;
-- 0029: phone notifications and the client AI daily limit
insert into auth.users values ('00000000-0000-0000-0000-00000000000d','sem-salao@x.pt');
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select save_push_subscription('https://fcm.googleapis.com/fcm/send/dono-1', 'p256', 'auth');
select save_push_subscription('https://fcm.googleapis.com/fcm/send/dono-1', 'p256-new', 'auth2');
select pg_temp.check(count(*) = 1 and min(p256dh) = 'p256-new', 'saving the same device again updates it') from push_subscriptions;
do $$ begin perform save_push_subscription('https://evil.example.com/x', 'p', 'a'); raise exception 'SHOULD HAVE FAILED'; exception when others then if sqlerrm not like '%endereco_invalido%' then raise; end if; end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d';
do $$ begin perform save_push_subscription('https://fcm.googleapis.com/fcm/send/x', 'p', 'a'); raise exception 'SHOULD HAVE FAILED'; exception when others then if sqlerrm not like '%sem_salao%' then raise; end if; end $$;
select pg_temp.check(count(*) = 0, 'people only see their own devices') from push_subscriptions;
select delete_push_subscription('https://fcm.googleapis.com/fcm/send/dono-1');
do $$ begin perform claim_booking_push((select id from bookings limit 1), null); raise exception 'SHOULD HAVE FAILED'; exception when others then if sqlerrm not like '%permission denied%' then raise; end if; end $$;
reset role;
select pg_temp.check(count(*) = 1, 'nobody else can remove a device') from push_subscriptions;
select pg_temp.check(count(*) = 0, 'the key pair table is closed to the app')
  from pg_policies where tablename = 'push_vapid';
set role anon;
select create_booking(:'salon', :'corte', :'rui', now() + interval '20 days', 'Push', '919000000', false) as bp \gset
reset role;
select pg_temp.check(count(*) = 1 and min(made_today) >= 1 and min(client_name) = 'Push', 'a new booking is announced once')
  from claim_booking_push(:'bp', null);
select pg_temp.check(count(*) = 0, 'and only once') from claim_booking_push(:'bp', null);
set role anon;
select create_booking(:'salon', :'corte', :'rui', now() + interval '21 days', 'Push2', '919000001', false) as bp2 \gset
reset role;
select pg_temp.check(count(*) = 0, 'someone outside the salon cannot announce its bookings') from claim_booking_push(:'bp2', '00000000-0000-0000-0000-00000000000d');
select pg_temp.check(count(*) = 1, 'someone in the salon can') from claim_booking_push(:'bp2', '00000000-0000-0000-0000-00000000000b');
update bookings set push_notified_at = null, created_at = now() - interval '1 hour' where id = :'bp2';
select pg_temp.check(count(*) = 0, 'old bookings are not announced') from claim_booking_push(:'bp2', null);
insert into ai_requests (salon_id, feature, status, client_device, client_ip) values (:'salon', 'try-on', 'feito', 'abc', 'def');
select pg_temp.check(count(*) = 1, 'AI requests keep the client keys for the daily limit') from ai_requests where client_device = 'abc';
-- 0030: style cards
set role anon;
select create_booking(:'salon', :'corte', :'rui', now() + interval '22 days', 'Estilo', '919000002', false) as bs \gset
select set_booking_style(:'bs', 'mid-fade');
select set_booking_style(:'bs', 'buzz-cut');
do $$ begin perform set_booking_style(gen_random_uuid(), 'Mid Fade!'); raise exception 'SHOULD HAVE FAILED'; exception when others then if sqlerrm not like '%estilo_invalido%' then raise; end if; end $$;
reset role;
select pg_temp.check(min(style) = 'mid-fade', 'the client picks a style once, when booking') from bookings where id = :'bs';
update bookings set style = null, created_at = now() - interval '1 hour' where id = :'bs';
set role anon;
select set_booking_style(:'bs', 'buzz-cut');
do $$ begin perform set_styles_hidden((select id from salons limit 1), '{low-fade}'); raise exception 'SHOULD HAVE FAILED'; exception when others then if sqlerrm not like '%permission denied%' then raise; end if; end $$;
reset role;
select pg_temp.check(min(style) is null, 'an old booking keeps its style') from bookings where id = :'bs';
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select set_styles_hidden(:'salon', '{pompadour,low-fade,pompadour}');
select pg_temp.check(styles_hidden = '{low-fade,pompadour}', 'the salon hides styles from its clients') from salons where id = :'salon';
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
do $$ begin perform set_styles_hidden((select id from salons where owner_id = '00000000-0000-0000-0000-00000000000a'), '{}'); raise exception 'SHOULD HAVE FAILED'; exception when others then if sqlerrm not like '%sem_permissao%' then raise; end if; end $$;
reset role;
-- 0031: per-client service times
select set_config('t.salon', :'salon', false), set_config('t.ana', :'ana', false), set_config('t.corte', :'corte', false) \g /dev/null
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
insert into client_times (salon_id, phone_key, service_id, minutes) values (:'salon', '351917000001', :'corte', 60);
insert into client_times (salon_id, phone_key, service_id, minutes) values (:'salon', '351917000002', null, 15);
select pg_temp.check(client_duration(:'salon', :'corte', :'ana', '917 000 001') = 60, 'a client time for one service replaces its length');
select pg_temp.check(client_duration(:'salon', :'corte', :'ana', '917000002') = 45, 'extra minutes are added to the usual length');
select pg_temp.check(client_duration(:'salon', :'corte', :'ana', '917000003') = 30, 'other clients keep the usual length');
reset role; reset request.jwt.claim.sub;
set role anon;
select create_booking(:'salon', :'corte', :'ana', date_trunc('day', now()) + interval '30 days 12 hours', 'Longo', '917000001', false) as bl \gset
reset role;
select pg_temp.check(ends_at - starts_at = interval '60 minutes', 'an online booking takes the client''s own time') from bookings where id = :'bl';
-- A booking 45 minutes after leaves 45 minutes free: enough for others, not for this client.
set role anon;
select create_booking(:'salon', :'corte', :'ana', date_trunc('day', now()) + interval '31 days 12 hours 45 minutes', 'Depois', '917000009', false) \g /dev/null
select set_config('t.before', (date_trunc('day', now()) + interval '31 days 12 hours')::text, false);
do $$ begin perform create_booking(current_setting('t.salon')::uuid, current_setting('t.corte')::uuid, current_setting('t.ana')::uuid, current_setting('t.before')::timestamptz, 'Longo', '917000001', false); raise exception 'SHOULD HAVE FAILED'; exception when others then if sqlerrm not like '%horario_curto%' then raise; end if; end $$;
select create_booking(:'salon', :'corte', :'ana', current_setting('t.before')::timestamptz, 'Normal', '917000008', false) \g /dev/null
do $$ begin insert into client_times (salon_id, phone_key, minutes) values (current_setting('t.salon')::uuid, '351917000005', 30); raise exception 'SHOULD HAVE FAILED'; exception when others then if sqlerrm not like '%row-level security%' then raise; end if; end $$;
reset role;
-- 0031: requests for a taken time
select starts_at as taken from bookings where id = :'bl' \gset
set role anon;
select request_slot(:'salon', :'corte', :'ana', :'taken', :'taken'::timestamptz + interval '2 hours', 'Pedro', '917100001', true, 'Só posso a esta hora') as rq \gset
select pg_temp.check(request_slot(:'salon', :'corte', :'ana', :'taken', null, 'Pedro', '917100001', true) = :'rq', 'asking again for the same time gives the same request');
select pg_temp.check(status = 'espera' and service_name = 'Corte' and alt_starts_at is not null, 'the client sees they are on the waiting list') from slot_request_for_client(:'rq');
select set_config('t.rq', :'rq', false) \g /dev/null
do $$ begin perform propose_slot_request(current_setting('t.rq')::uuid, now() + interval '40 days', current_setting('t.ana')::uuid); raise exception 'SHOULD HAVE FAILED'; exception when others then if sqlerrm not like '%sem_permissao%' then raise; end if; end $$;
select pg_temp.check(count(*) = 0, 'clients cannot read the waiting list') from slot_requests;
reset role;
set role service_role;
select pg_temp.check(count(*) = 1 and min(taken_by) = 'Longo', 'a new request is announced, with who has that time') from claim_slot_request_push(:'rq');
select pg_temp.check(count(*) = 0, 'and only once') from claim_slot_request_push(:'rq');
reset role;
-- The salon suggests another time: it is held until the client answers.
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select pg_temp.check(count(*) = 1, 'the salon sees the request') from slot_requests where id = :'rq';
do $$ begin perform accept_slot_request(current_setting('t.rq')::uuid, 1); raise exception 'SHOULD HAVE FAILED'; exception when others then if sqlerrm not like '%horario_ocupado%' then raise; end if; end $$;
select pg_temp.check(status = 'espera', 'a failed accept leaves the request on the list') from slot_requests where id = :'rq';
select propose_slot_request(:'rq', :'taken'::timestamptz + interval '5 hours', :'ana', 'Às 5 já dá');
reset role; reset request.jwt.claim.sub;
set role anon;
select set_config('t.held', (:'taken'::timestamptz + interval '5 hours')::text, false);
do $$ begin perform create_booking(current_setting('t.salon')::uuid, current_setting('t.corte')::uuid, current_setting('t.ana')::uuid, current_setting('t.held')::timestamptz, 'Outro', '917100009', false); raise exception 'SHOULD HAVE FAILED'; exception when others then if sqlerrm not like '%horario_ocupado%' then raise; end if; end $$;
select pg_temp.check(count(*) >= 1, 'the suggested time shows as busy') from busy_slots(:'salon', current_setting('t.held')::timestamptz, current_setting('t.held')::timestamptz + interval '10 minutes');
select answer_slot_proposal(:'rq', false) \g /dev/null
select pg_temp.check(status = 'espera' and client_declined_at is not null and proposed_starts_at is null, 'saying no puts the client back on the list') from slot_request_for_client(:'rq');
reset role;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select propose_slot_request(:'rq', :'taken'::timestamptz + interval '5 hours', :'ana');
reset role; reset request.jwt.claim.sub;
set role anon;
select answer_slot_proposal(:'rq', true) as rqb \gset
reset role;
select pg_temp.check(r.status = 'marcada' and r.booking_id = :'rqb' and b.starts_at = :'taken'::timestamptz + interval '5 hours' and b.client_name = 'Pedro',
  'accepting the suggested time books it') from slot_requests r join bookings b on b.id = r.booking_id where r.id = :'rq';
-- The salon moves the other client and gives the requested time; second choice and "anyone".
set role anon;
select request_slot(:'salon', :'corte', null, :'taken', :'taken'::timestamptz + interval '1 day', 'Marta', '917100002', false) as rq2 \gset
reset role;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$ begin perform accept_slot_request((select id from slot_requests where client_name = 'Marta'), 2); raise exception 'SHOULD HAVE FAILED'; exception when others then if sqlerrm not like '%profissional_invalido%' then raise; end if; end $$;
select accept_slot_request(:'rq2', 2, :'rui') as rq2b \gset
select pg_temp.check(status = 'confirmada' and professional_id = :'rui', 'the salon gives the second choice, with who it chose, confirmed') from bookings where id = :'rq2b';
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
do $$ begin perform decline_slot_request(current_setting('t.rq')::uuid); raise exception 'SHOULD HAVE FAILED'; exception when others then if sqlerrm not like '%sem_permissao%' then raise; end if; end $$;
reset role;
-- A booking on the same day, made any other way, takes the client off the list.
set role anon;
select request_slot(:'salon', :'corte', :'ana', :'taken', null, 'Rita', '917100003', false) as rq3 \gset
select create_booking(:'salon', :'corte', :'rui', :'taken'::timestamptz - interval '2 hours', 'Rita', '917 100 003', false) as rq3b \gset
select pg_temp.check(status = 'marcada' and booking_id = :'rq3b', 'booking that day closes the request') from slot_request_for_client(:'rq3');
select request_slot(:'salon', :'corte', :'ana', :'taken', null, 'Sofia', '917100004', false) as rq4 \gset
select cancel_slot_request(:'rq4');
select pg_temp.check(status = 'cancelada', 'the client can give up') from slot_request_for_client(:'rq4');
select request_slot(:'salon', :'corte', :'ana', :'taken'::timestamptz + interval '1 day', null, 'Rui C', '917100005', false) \g /dev/null
select request_slot(:'salon', :'corte', :'ana', :'taken'::timestamptz + interval '2 days', null, 'Rui C', '917100005', false) \g /dev/null
select request_slot(:'salon', :'corte', :'ana', :'taken'::timestamptz + interval '3 days', null, 'Rui C', '917100005', false) \g /dev/null
do $$ begin perform request_slot(current_setting('t.salon')::uuid, current_setting('t.corte')::uuid, null, now() + interval '4 days', null, 'Rui C', '917100005', false); raise exception 'SHOULD HAVE FAILED'; exception when others then if sqlerrm not like '%pedidos_a_mais%' then raise; end if; end $$;
reset role;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select forget_client(:'salon', '351917000001') \g /dev/null
select forget_client(:'salon', '351917100005') \g /dev/null
reset role;
select pg_temp.check((select count(*) from client_times where phone_key = '351917000001') = 0
  and (select count(*) from slot_requests where client_name = 'Rui C') = 0, 'forgetting a client removes their times and requests');
-- 0032: the salon's shop
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
insert into products (salon_id, name, price_cents, pay, refill_weeks) values (:'salon', 'Pomada mate', 1500, 'mbway', 6) returning id as pomada \gset
insert into products (salon_id, name, price_cents, sold_out) values (:'salon', 'Óleo de barba', 1200, true) returning id as oleo \gset
insert into products (salon_id, name, price_cents, active) values (:'salon', 'Escondido', 900, false) returning id as escondido \gset
reset role; reset request.jwt.claim.sub;
set role anon;
select pg_temp.check(count(*) = 2, 'clients see only the products on sale') from products where salon_id = :'salon';
select id as enc, pay as enc_pay from reserve_product(:'pomada', 2, 'Tiago', '912345678', 'Guardem-me até sexta') \gset
select pg_temp.check(:'enc_pay' = 'mbway', 'the client is told how to pay');
select set_config('t.oleo', :'oleo', false) \g /dev/null
select set_config('t.escondido', :'escondido', false) \g /dev/null
select set_config('t.pomada', :'pomada', false) \g /dev/null
do $$ begin perform reserve_product(current_setting('t.oleo')::uuid, 1, 'Tiago', '912345678'); raise exception 'SHOULD HAVE FAILED'; exception when others then if sqlerrm not like '%produto_esgotado%' then raise; end if; end $$;
do $$ begin perform reserve_product(current_setting('t.escondido')::uuid, 1, 'Tiago', '912345678'); raise exception 'SHOULD HAVE FAILED'; exception when others then if sqlerrm not like '%produto_invalido%' then raise; end if; end $$;
do $$ begin perform reserve_product(current_setting('t.pomada')::uuid, 1, 'Tiago', '12'); raise exception 'SHOULD HAVE FAILED'; exception when others then if sqlerrm not like '%dados_cliente%' then raise; end if; end $$;
do $$ begin perform reserve_product(current_setting('t.pomada')::uuid, 50, 'Tiago', '912345678'); raise exception 'SHOULD HAVE FAILED'; exception when others then if sqlerrm not like '%quantidade_invalida%' then raise; end if; end $$;
select reserve_product(:'pomada', 1, 'Muito', '919999999') \g /dev/null
select reserve_product(:'pomada', 1, 'Muito', '919999999') \g /dev/null
select reserve_product(:'pomada', 1, 'Muito', '919999999') \g /dev/null
select reserve_product(:'pomada', 1, 'Muito', '919999999') \g /dev/null
select reserve_product(:'pomada', 1, 'Muito', '919999999') \g /dev/null
do $$ begin perform reserve_product(current_setting('t.pomada')::uuid, 1, 'Muito', '919 999 999'); raise exception 'SHOULD HAVE FAILED'; exception when others then if sqlerrm not like '%reservas_a_mais%' then raise; end if; end $$;
select pg_temp.check(count(*) = 0, 'clients cannot read reservations') from product_orders;
do $$ begin insert into products (salon_id, name, price_cents) values (current_setting('t.salon')::uuid, 'X', 100); raise exception 'SHOULD HAVE FAILED'; exception when others then if sqlerrm not like '%row-level security%' then raise; end if; end $$;
reset role;
select pg_temp.check(product_name = 'Pomada mate' and price_cents = 1500 and qty = 2 and refill_weeks = 6 and status = 'reservado' and note is not null,
  'a reservation keeps the product, price and refill time') from product_orders where id = :'enc';
set role service_role;
select pg_temp.check(count(*) = 1 and min(product_name) = 'Pomada mate', 'a new reservation is announced') from claim_product_order_push(:'enc');
select pg_temp.check(count(*) = 0, 'and only once') from claim_product_order_push(:'enc');
reset role;
-- The salon receives the MB WAY, hands it over, and sells at the counter.
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select pg_temp.check(count(*) = 6, 'the salon sees its reservations') from product_orders where salon_id = :'salon';
do $$ begin update product_orders set status = 'pago' where client_name = 'Tiago'; raise exception 'SHOULD HAVE FAILED'; exception when others then if sqlerrm not like '%check%' then raise; end if; end $$;
update product_orders set status = 'entregue', paid_at = now(), delivered_at = now() where id = :'enc';
insert into product_orders (salon_id, product_id, product_name, price_cents, client_name, client_phone, source, status, paid_at, delivered_at)
  values (:'salon', :'pomada', 'Pomada mate', 1500, 'Venda ao balcão', '', 'balcao', 'entregue', now(), now());
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select pg_temp.check(count(*) = 0, 'another salon sees no reservations') from product_orders where salon_id = :'salon';
reset role;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select forget_client(:'salon', '351919999999') \g /dev/null
reset role;
select pg_temp.check((select count(*) from product_orders where client_name = 'Muito') = 0
  and (select count(*) from product_orders where client_name = 'Cliente apagado' and status = 'cancelado') = 5, 'forgetting a client cancels and anonymises their reservations');
-- 0033: stock
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
insert into products (salon_id, name, price_cents, stock, low_stock) values (:'salon', 'Champô', 900, 3, 1) returning id as champo \gset
reset role; reset request.jwt.claim.sub;
set role anon;
select id as st1 from reserve_product(:'champo', 2, 'Ana', '931000001') \gset
select pg_temp.check(left_qty = 1, 'a reservation holds units') from product_stock_left(:'salon') where product_id = :'champo';
select set_config('t.champo', :'champo', false) \g /dev/null
do $$ begin perform reserve_product(current_setting('t.champo')::uuid, 2, 'Bia', '931000002'); raise exception 'SHOULD HAVE FAILED'; exception when others then if sqlerrm not like '%sem_stock%' then raise; end if; end $$;
select reserve_product(:'champo', 1, 'Bia', '931000002') \g /dev/null
do $$ begin perform reserve_product(current_setting('t.champo')::uuid, 1, 'Caio', '931000003'); raise exception 'SHOULD HAVE FAILED'; exception when others then if sqlerrm not like '%produto_esgotado%' then raise; end if; end $$;
reset role;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
update product_orders set status = 'entregue', paid_at = now(), delivered_at = now() where id = :'st1';
select pg_temp.check(stock = 1, 'delivering takes units out') from products where id = :'champo';
update product_orders set status = 'cancelado', cancelled_at = now() where id = :'st1';
select pg_temp.check(stock = 3, 'cancelling a delivered sale puts them back') from products where id = :'champo';
insert into product_orders (salon_id, product_id, product_name, price_cents, qty, client_name, source, status, paid_at, delivered_at)
  values (:'salon', :'champo', 'Champô', 900, 5, 'Balcão', 'balcao', 'entregue', now(), now());
select pg_temp.check(stock = 0, 'a counter sale never takes stock below 0') from products where id = :'champo';
select pg_temp.check(add_product_stock(:'champo', 6) = 6, 'a delivery adds units');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
do $$ begin perform add_product_stock(current_setting('t.champo')::uuid, 1); raise exception 'SHOULD HAVE FAILED'; exception when others then if sqlerrm not like '%sem_permissao%' then raise; end if; end $$;
reset role; reset request.jwt.claim.sub;
-- 0034: a salon invites another salon
insert into auth.users values ('00000000-0000-0000-0000-0000000000c1','colega@x.pt');
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1'; set request.jwt.claim.email='colega@x.pt';
select create_salon('{"slug":"colega","name":"Colega","type":"barbearia","theme":"b3","deposit_cents":0,
  "services":[{"name":"Corte","duration_min":30,"price_cents":1000}],"professionals":["Zé"],
  "hours":[{"weekday":1,"opens":"09:00","closes":"18:00"}]}'::jsonb) as colega \gset
select set_config('t.colega', :'colega', false) \g /dev/null
do $$ begin perform set_referrer(current_setting('t.colega')::uuid, 'colega'); raise exception 'SHOULD HAVE FAILED'; exception when others then if sqlerrm not like '%convite_invalido%' then raise; end if; end $$;
select pg_temp.check(set_referrer(:'colega', ' Barb-Teste ') = 'Barb', 'the new salon records who invited it');
select pg_temp.check(set_referrer(:'colega', 'outro') = 'Barb', 'only once');
do $$ begin perform set_referrer(current_setting('t.salon')::uuid, 'colega'); raise exception 'SHOULD HAVE FAILED'; exception when others then if sqlerrm not like '%sem_permissao%' then raise; end if; end $$;
do $$ begin perform admin_reward_referral(current_setting('t.colega')::uuid); raise exception 'SHOULD HAVE FAILED'; exception when others then if sqlerrm not like '%sem_permissao%' then raise; end if; end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select pg_temp.check(count(*) = 1 and bool_and(not paying) and min(name) = 'Colega', 'the inviting owner sees the salon they brought') from my_referrals(:'salon');
reset role;
select trial_ends_at as colega_trial from salons where id = :'colega' \gset
select trial_ends_at as barb_trial, paid_until as barb_paid, subscription as barb_sub from salons where id = :'salon' \gset
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select pg_temp.check(count(*) = 1, 'the admin sees the invite') from admin_referrals();
select admin_reward_referral(:'colega');
do $$ begin perform admin_reward_referral(current_setting('t.colega')::uuid); raise exception 'SHOULD HAVE FAILED'; exception when others then if sqlerrm not like '%ja_dado%' then raise; end if; end $$;
reset role; reset request.jwt.claim.sub;
select pg_temp.check(trial_ends_at = :'colega_trial'::timestamptz + interval '30 days', 'the new salon gets a free month') from salons where id = :'colega';
select pg_temp.check(case when :'barb_sub' = 'ativa' and :'barb_paid' <> '' then paid_until >= :'barb_paid'::timestamptz + interval '30 days'
  else trial_ends_at >= :'barb_trial'::timestamptz + interval '30 days' end, 'and so does the salon that invited it') from salons where id = :'salon';
\echo All database checks passed
