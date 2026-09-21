-- Mappe (#28): un'immagine per mappa (file del bucket `world-images`, D-016), pin sugli snippet con coordinate relative
-- (0–1 sui due assi, così valgono a qualunque dimensione) e percorsi tra pin. Una mappa può «raffigurare» uno snippet-luogo
-- (`snippet_id`): un pin su quel luogo, da qualunque mappa, apre la sua mappa (mappe annidate: regione → città → dungeon).

create table public.maps (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.worlds (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  -- Nome del file nel bucket (`<world_id>/<image>`), scelto dalla rotta di caricamento.
  image text not null check (image ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp|gif)$'),
  -- Lo snippet-luogo che questa mappa raffigura (facoltativo). Se lo snippet viene eliminato il legame decade.
  snippet_id uuid,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (world_id, id),
  foreign key (world_id, snippet_id) references public.snippets (world_id, id) on delete set null (snippet_id)
);
create index maps_world on public.maps (world_id);
create index maps_snippet on public.maps (snippet_id) where snippet_id is not null;

create table public.map_pins (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.worlds (id) on delete cascade,
  map_id uuid not null,
  snippet_id uuid not null,
  x double precision not null check (x >= 0 and x <= 1),
  y double precision not null check (y >= 0 and y <= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (world_id, id),
  unique (map_id, snippet_id),
  foreign key (world_id, map_id) references public.maps (world_id, id) on delete cascade,
  foreign key (world_id, snippet_id) references public.snippets (world_id, id) on delete cascade
);
create index map_pins_map on public.map_pins (map_id);
create index map_pins_snippet on public.map_pins (snippet_id);

-- Percorso: elenco ordinato di pin della stessa mappa.
create table public.map_routes (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.worlds (id) on delete cascade,
  map_id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 80),
  stops uuid[] not null check (cardinality(stops) between 2 and 30),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (world_id, map_id) references public.maps (world_id, id) on delete cascade
);
create index map_routes_map on public.map_routes (map_id);

create trigger maps_touch before update on public.maps
  for each row execute function private.touch_updated_at();
create trigger map_pins_touch before update on public.map_pins
  for each row execute function private.touch_updated_at();
create trigger map_routes_touch before update on public.map_routes
  for each row execute function private.touch_updated_at();
create trigger maps_world_immutable before update on public.maps
  for each row execute function private.forbid_world_change();
create trigger map_pins_world_immutable before update on public.map_pins
  for each row execute function private.forbid_world_change();
create trigger map_routes_world_immutable before update on public.map_routes
  for each row execute function private.forbid_world_change();

-- I pin e i percorsi non cambiano mappa e la mappa non cambia file: si ricreano.
create or replace function private.forbid_map_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.map_id is distinct from old.map_id then
    raise exception 'map_id è immutabile' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger map_pins_map_immutable before update on public.map_pins
  for each row execute function private.forbid_map_change();
create trigger map_routes_map_immutable before update on public.map_routes
  for each row execute function private.forbid_map_change();

-- Le tappe di un percorso sono pin della stessa mappa (con i permessi di chi scrive).
create or replace function private.check_route_stops() returns trigger
language plpgsql set search_path = '' as $$
begin
  if exists (
    select 1 from unnest(new.stops) as s(pin)
     where not exists (select 1 from public.map_pins p where p.id = s.pin and p.map_id = new.map_id)
  ) then
    raise exception 'route_stops_invalid' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger map_routes_stops before insert or update of stops, map_id on public.map_routes
  for each row execute function private.check_route_stops();

-- Eliminare un pin lo toglie dai percorsi; un percorso che resterebbe con meno di 2 tappe si elimina.
create or replace function private.drop_pin_from_routes() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.map_routes
   where map_id = old.map_id and old.id = any (stops) and cardinality(array_remove(stops, old.id)) < 2;
  update public.map_routes set stops = array_remove(stops, old.id)
   where map_id = old.map_id and old.id = any (stops);
  return old;
end;
$$;
revoke all on function private.drop_pin_from_routes() from public, anon, authenticated;
create trigger map_pins_drop_stops before delete on public.map_pins
  for each row execute function private.drop_pin_from_routes();

alter table public.maps enable row level security;
alter table public.map_pins enable row level security;
alter table public.map_routes enable row level security;

create policy maps_read on public.maps for select to authenticated
  using (private.world_role(world_id) is not null);
create policy maps_write on public.maps for all to authenticated
  using (private.can_write(world_id)) with check (private.can_write(world_id));

-- Un pin si vede solo se si vede lo snippet (la sottoquery gira con la RLS di chi legge): un luogo segreto non compare.
create policy map_pins_read on public.map_pins for select to authenticated
  using (
    private.world_role(world_id) is not null
    and exists (select 1 from public.snippets s where s.id = snippet_id)
  );
create policy map_pins_write on public.map_pins for all to authenticated
  using (private.can_write(world_id)) with check (private.can_write(world_id));

create policy map_routes_read on public.map_routes for select to authenticated
  using (private.world_role(world_id) is not null);
create policy map_routes_write on public.map_routes for all to authenticated
  using (private.can_write(world_id)) with check (private.can_write(world_id));

revoke all on public.maps, public.map_pins, public.map_routes from public, anon, authenticated;
grant select, insert, update, delete on public.maps, public.map_pins, public.map_routes to authenticated;
