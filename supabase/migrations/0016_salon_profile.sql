-- Salon profile shown on the booking page and the poster.
-- "if not exists": the live project already got these columns by hand on 2026-11-20.
alter table salons add column if not exists address text;
alter table salons add column if not exists news text;
alter table salons add column if not exists google_review_url text;
