-- Free trial and subscription status per salon, ready for the payment gateway.
-- The app reads these; only the service role (the future payment webhook) or an
-- admin in the SQL editor can change them, never the salon from the app.

create type subscription_status as enum ('experimental', 'ativa', 'em_atraso', 'cancelada');

alter table salons add column subscription subscription_status not null default 'experimental';
alter table salons add column trial_ends_at timestamptz not null default (now() + interval '30 days');
alter table salons add column paid_until timestamptz;
-- Salons that already exist get 30 days from their creation, and at least 30 days from today.
update salons set trial_ends_at = greatest(created_at + interval '30 days', now() + interval '30 days');

-- Blocks changes to the billing columns from the app's roles. Security definer
-- functions, the service role and the SQL editor run as other roles and pass.
create function protect_billing() returns trigger
language plpgsql as $$
begin
  if current_user in ('anon', 'authenticated') and (
    new.subscription is distinct from old.subscription
    or new.trial_ends_at is distinct from old.trial_ends_at
    or new.paid_until is distinct from old.paid_until
  ) then
    raise exception 'campos_de_faturacao';
  end if;
  return new;
end;
$$;

create trigger salons_protect_billing before update on salons
  for each row execute function protect_billing();

-- A new salon can't start with a longer trial or a paid plan either.
create function new_salon_billing() returns trigger
language plpgsql as $$
begin
  if current_user in ('anon', 'authenticated') then
    new.subscription := 'experimental';
    new.trial_ends_at := now() + interval '30 days';
    new.paid_until := null;
  end if;
  return new;
end;
$$;

create trigger salons_new_billing before insert on salons
  for each row execute function new_salon_billing();
