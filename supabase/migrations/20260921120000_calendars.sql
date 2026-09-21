-- Calendari personalizzati del mondo (#26): mesi, giorni della settimana, ere e anno lungo definiti dall'utente.
-- La definizione è un JSON validato dall'applicazione (zod); qui restano i limiti minimi a difesa dei dati.
-- I campi «data in calendario» degli snippet conservano l'id del calendario nel valore: se il calendario viene
-- eliminato le date restano nello snippet e si mostrano in forma numerica.

create table public.calendars (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.worlds (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  definition jsonb not null check (
    jsonb_typeof(definition) = 'object' and pg_column_size(definition) <= 20000
  ),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index calendars_name on public.calendars (world_id, lower(btrim(name)));
create index calendars_world on public.calendars (world_id);

create trigger calendars_touch before update on public.calendars
  for each row execute function private.touch_updated_at();
create trigger calendars_world_immutable before update on public.calendars
  for each row execute function private.forbid_world_change();

alter table public.calendars enable row level security;
create policy calendars_read on public.calendars for select to authenticated
  using (private.world_role(world_id) is not null);
create policy calendars_write on public.calendars for all to authenticated
  using (private.can_write(world_id)) with check (private.can_write(world_id));

revoke all on public.calendars from public, anon, authenticated;
grant select, insert, update, delete on public.calendars to authenticated;
