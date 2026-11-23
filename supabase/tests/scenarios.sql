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
\echo All database checks passed
