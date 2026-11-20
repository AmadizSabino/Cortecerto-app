-- Notes and birthdays the salon keeps about each client.
-- Clients are identified by their phone digits (e.g. 351912345678), the same key
-- the client list uses to group bookings. Only the salon owner can read or write.
-- The birthday keeps only day and month: the year is not needed and is not asked.

create table client_notes (
  salon_id uuid not null references salons(id) on delete cascade,
  phone_key text not null check (phone_key ~ '^[0-9]{6,15}$'),
  notes text not null default '' check (length(notes) <= 2000),
  birthday_day smallint check (birthday_day between 1 and 31),
  birthday_month smallint check (birthday_month between 1 and 12),
  updated_at timestamptz not null default now(),
  primary key (salon_id, phone_key),
  check ((birthday_day is null) = (birthday_month is null))
);

alter table client_notes enable row level security;

create policy client_notes_owner on client_notes for all
  using (is_owner(salon_id)) with check (is_owner(salon_id));
