-- Salon profile details for the client page, and reminder tracking.
alter table salons add column if not exists address text;      -- e.g. "Rua das Flores 12, Lisboa"
alter table salons add column if not exists news text;         -- short note shown on the client page
alter table salons add column if not exists google_review_url text;
alter table bookings add column if not exists reminded_at timestamptz;
alter table bookings add column if not exists source text not null default 'online'
  check (source in ('online', 'telefone', 'presencial'));
