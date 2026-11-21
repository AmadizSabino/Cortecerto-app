-- Team accounts: the owner invites people by email; once they sign in with that
-- email they join the salon. Team members use the agenda, week, clients, queue
-- and reminders. Settings, prices, hours, statistics, exports and deleting
-- client data stay with the owner.
-- Run after 0003, 0008 and 0009 (it adds team access to their tables).

create table salon_members (
  salon_id uuid not null references salons(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  professional_id uuid references professionals(id) on delete set null, -- whose agenda is theirs
  created_at timestamptz not null default now(),
  primary key (salon_id, user_id)
);
-- One salon per person, so the app knows which one to open.
create unique index salon_members_one_salon on salon_members (user_id);

create table salon_invites (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references salons(id) on delete cascade,
  email text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  professional_id uuid references professionals(id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);
create unique index salon_invites_open on salon_invites (salon_id, lower(email)) where accepted_at is null;

alter table salon_members enable row level security;
alter table salon_invites enable row level security;

create policy members_owner on salon_members for all using (is_owner(salon_id)) with check (is_owner(salon_id));
create policy members_self_read on salon_members for select using (user_id = auth.uid());
create policy invites_owner on salon_invites for all using (is_owner(salon_id)) with check (is_owner(salon_id));

create function is_member(s uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from salon_members where salon_id = s and user_id = auth.uid());
$$;

-- Team access, added next to the owner's policies (policies of the same command are combined with OR).
-- No delete: removing data stays with the owner.
create policy bookings_team_read on bookings for select using (is_member(salon_id));
create policy bookings_team_insert on bookings for insert with check (is_member(salon_id));
create policy bookings_team_update on bookings for update using (is_member(salon_id)) with check (is_member(salon_id));
create policy notes_team_read on client_notes for select using (is_member(salon_id));
create policy notes_team_insert on client_notes for insert with check (is_member(salon_id));
create policy notes_team_update on client_notes for update using (is_member(salon_id)) with check (is_member(salon_id));
create policy walkins_team_read on walkins for select using (is_member(salon_id));
create policy walkins_team_insert on walkins for insert with check (is_member(salon_id));
create policy walkins_team_update on walkins for update using (is_member(salon_id)) with check (is_member(salon_id));
create policy time_off_team_read on time_off for select using (is_member(salon_id));
-- Opening and closing the queue is a team task too: only that column, through a function.
create function set_queue_open(p_salon uuid, p_open boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (is_owner(p_salon) or is_member(p_salon)) then raise exception 'sem_permissao'; end if;
  update salons set queue_open = p_open where id = p_salon;
end;
$$;
grant execute on function set_queue_open(uuid, boolean) to authenticated;

-- Joins the salons that invited the signed-in email (invites last 14 days).
create function accept_invites() returns int
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  r record;
  v_count int := 0;
begin
  if auth.uid() is null or v_email = '' then return 0; end if;
  if exists (select 1 from salons where owner_id = auth.uid()) or exists (select 1 from salon_members where user_id = auth.uid()) then
    return 0;
  end if;
  for r in select * from salon_invites
           where lower(email) = v_email and accepted_at is null and created_at > now() - interval '14 days'
           order by created_at desc limit 1
  loop
    insert into salon_members (salon_id, user_id, email, professional_id)
    values (r.salon_id, auth.uid(), v_email, r.professional_id) on conflict do nothing;
    update salon_invites set accepted_at = now() where id = r.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
grant execute on function accept_invites() to authenticated;

-- The salon the signed-in person works in, and how.
create function my_salon() returns table (salon_id uuid, role text, professional_id uuid)
language sql stable security definer set search_path = public as $$
  select id, 'dono', null::uuid from salons where owner_id = auth.uid()
  union all
  select m.salon_id, 'equipa', m.professional_id from salon_members m where m.user_id = auth.uid()
  limit 1;
$$;
grant execute on function my_salon() to authenticated;
