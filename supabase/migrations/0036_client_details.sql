-- More (optional) details on the salon's own client list (salon_clients, migration 0018), all filled in
-- by the salon in "Registar cliente". Only what has a clear use (GDPR data minimisation): no gender,
-- no year of birth, no health data. Birthday (day and month) stays in client_notes (migration 0003).
alter table salon_clients
  add column preferred_pro uuid references professionals(id) on delete set null,
  add column heard_from text check (heard_from in ('amigo', 'instagram', 'facebook', 'tiktok', 'google', 'passagem', 'outro')),
  add column nif text check (nif ~ '^[0-9]{9}$'),
  -- Consent to promotional messages given to the salon in person, with when it was recorded.
  -- The most recent signal wins: a later online booking without the tick counts as a withdrawal.
  add column consent_messages boolean,
  add column consent_at timestamptz,
  add constraint salon_clients_consent_dated check ((consent_messages is null) = (consent_at is null));
