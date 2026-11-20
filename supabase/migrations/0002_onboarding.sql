-- Onboarding: create a salon with its services, team and hours in one step.
-- Runs as the signed-in user, so the row level security rules still apply.
create function create_salon(p jsonb) returns uuid
language plpgsql security invoker set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'sem_sessao'; end if;
  if exists (select 1 from salons where owner_id = auth.uid()) then raise exception 'ja_tem_salao'; end if;

  insert into salons (owner_id, slug, name, type, whatsapp, mbway_number, deposit_cents, theme)
  values (auth.uid(), p->>'slug', p->>'name', (p->>'type')::salon_type,
          nullif(p->>'whatsapp', ''), nullif(p->>'mbway_number', ''),
          coalesce((p->>'deposit_cents')::int, 0), coalesce(p->>'theme', 'classico'))
  returning id into v_id;

  insert into services (salon_id, name, duration_min, price_cents)
  select v_id, s->>'name', (s->>'duration_min')::int, (s->>'price_cents')::int
  from jsonb_array_elements(p->'services') s;

  insert into professionals (salon_id, name)
  select v_id, x #>> '{}' from jsonb_array_elements(p->'professionals') x;

  insert into opening_hours (salon_id, weekday, opens, closes)
  select v_id, (h->>'weekday')::smallint, (h->>'opens')::time, (h->>'closes')::time
  from jsonb_array_elements(p->'hours') h;

  return v_id;
exception when unique_violation then
  raise exception 'slug_ocupado';
end;
$$;

grant execute on function create_salon(jsonb) to authenticated;
