-- Viste salvate: filtri + tipo di visualizzazione + configurazione, con un link stabile (/worlds/<mondo>/views/<id>).
-- Una vista salva solo *cosa* mostrare, mai i dati: i risultati si calcolano a ogni apertura con i permessi di chi guarda
-- (RLS su snippet e relazioni), quindi condividere una vista non può rivelare contenuti che il destinatario non può leggere.
-- `shared`: visibile a tutti i membri del mondo; altrimenti solo a chi l'ha creata.

create table public.saved_views (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.worlds (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  kind text not null check (kind in ('list', 'table', 'graph', 'timeline', 'map', 'tree', 'kanban')),
  filters jsonb not null default '{}' check (jsonb_typeof(filters) = 'object' and length(filters::text) <= 10000),
  config jsonb not null default '{}' check (jsonb_typeof(config) = 'object' and length(config::text) <= 10000),
  shared boolean not null default true,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.saved_views (world_id);

create trigger saved_views_touch before update on public.saved_views
  for each row execute function private.touch_updated_at();

create function private.saved_views_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.world_id is distinct from old.world_id
     or new.created_by is distinct from old.created_by
     or new.kind is distinct from old.kind then
    raise exception 'world_id, created_by e kind sono immutabili' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger saved_views_immutable before update on public.saved_views
  for each row execute function private.saved_views_immutable();

alter table public.saved_views enable row level security;
revoke all on public.saved_views from public, anon, authenticated;
grant select, insert, update, delete on public.saved_views to authenticated;

create policy saved_views_read on public.saved_views for select to authenticated using (
  world_id in (select private.member_worlds())
  and (shared or created_by = (select auth.uid()))
);

create policy saved_views_insert on public.saved_views for insert to authenticated with check (
  private.can_write(world_id) and created_by = (select auth.uid())
);

create policy saved_views_update on public.saved_views for update to authenticated
  using (private.can_write(world_id) and (created_by = (select auth.uid()) or private.is_owner(world_id)))
  with check (private.can_write(world_id) and (created_by = (select auth.uid()) or private.is_owner(world_id)));

create policy saved_views_delete on public.saved_views for delete to authenticated
  using (private.can_write(world_id) and (created_by = (select auth.uid()) or private.is_owner(world_id)));
