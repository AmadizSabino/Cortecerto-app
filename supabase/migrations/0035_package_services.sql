-- Services made for packages: a salon adds a service from the package form (Pacotes) without going to
-- Definições, and can keep it off the booking page's own list ("só em pacotes").
alter table services add column packages_only boolean not null default false;

-- Gestor and up may create services from the package form (Definições stays owner-only).
create function add_package_service(p_salon uuid, p_name text, p_minutes int, p_price_cents int, p_packages_only boolean default true)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not has_access(p_salon, 'gestor') then raise exception 'sem_permissao'; end if;
  if length(trim(coalesce(p_name, ''))) = 0 or length(trim(p_name)) > 80 then raise exception 'nome_invalido'; end if;
  if p_minutes is null or p_minutes not between 5 and 600 then raise exception 'duracao_invalida'; end if;
  if p_price_cents is null or p_price_cents not between 0 and 1000000 then raise exception 'preco_invalido'; end if;
  insert into services (salon_id, name, duration_min, price_cents, packages_only)
  values (p_salon, trim(p_name), p_minutes, p_price_cents, coalesce(p_packages_only, true))
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function add_package_service(uuid, text, int, int, boolean) from public, anon;
grant execute on function add_package_service(uuid, text, int, int, boolean) to authenticated;
