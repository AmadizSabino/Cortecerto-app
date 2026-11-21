-- Errors from the app in people's browsers, sent through the Worker (service role).
-- No policies: nobody can read or write this table from the app itself.
-- Holds no client data: message, stack, page path without query, browser, release.

create table client_errors (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  message text not null check (length(message) <= 500),
  stack text check (length(stack) <= 4000),
  path text check (length(path) <= 200),
  user_agent text check (length(user_agent) <= 300),
  release text check (length(release) <= 40)
);
create index client_errors_at on client_errors (at desc);
alter table client_errors enable row level security;

-- Keep 30 days, if pg_cron is available.
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('trim-client-errors', '45 3 * * *', $c$delete from public.client_errors where at < now() - interval '30 days'$c$);
exception when others then
  raise notice 'pg_cron not available: old client errors will not be trimmed automatically (%).', sqlerrm;
end;
$$;
