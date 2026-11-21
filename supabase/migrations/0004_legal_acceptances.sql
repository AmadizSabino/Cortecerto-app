-- Record of each salon owner accepting the terms and the data processing agreement.
-- One row per acceptance, never updated or deleted by the app, so the history
-- shows which version was accepted, when, and from which browser.
-- When a document gets a new version, the app asks the owner to accept again.

create type legal_document as enum ('termos', 'tratamento_dados');

create table legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  salon_id uuid references salons(id) on delete cascade, -- null when accepted before the salon exists
  document legal_document not null,
  version text not null check (version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  accepted_at timestamptz not null default now(),
  user_agent text check (length(user_agent) <= 400)
);
create index legal_acceptances_user on legal_acceptances (user_id, document, version);

alter table legal_acceptances enable row level security;

-- The owner reads and adds their own acceptances. No update or delete policy:
-- the record can't be changed from the app.
create policy legal_read_own on legal_acceptances for select using (user_id = auth.uid());
create policy legal_insert_own on legal_acceptances for insert with check (
  user_id = auth.uid() and (salon_id is null or is_owner(salon_id))
);

-- The server sets who and when, so neither can be forged from the browser.
create function legal_acceptance_stamp() returns trigger
language plpgsql set search_path = public as $$
begin
  new.user_id := auth.uid();
  new.accepted_at := now();
  return new;
end;
$$;

create trigger legal_acceptance_stamp before insert on legal_acceptances
  for each row execute function legal_acceptance_stamp();
