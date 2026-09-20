-- Cestino degli snippet: gli elementi eliminati da più di 30 giorni vengono cancellati davvero.
-- La funzione non è esposta via API (schema private); la pianifica pg_cron, se l'estensione è disponibile.

create or replace function private.purge_expired_snippets()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  delete from public.snippets where deleted_at is not null and deleted_at < now() - interval '30 days';
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function private.purge_expired_snippets() from public, anon, authenticated;

-- Indice per trovare in fretta gli snippet nel cestino di un mondo.
create index if not exists snippets_trash_idx on public.snippets (world_id, deleted_at)
  where deleted_at is not null;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.unschedule('purge-expired-snippets')
      where exists (select 1 from cron.job where jobname = 'purge-expired-snippets');
    perform cron.schedule('purge-expired-snippets', '17 3 * * *', 'select private.purge_expired_snippets()');
  end if;
end;
$$;
