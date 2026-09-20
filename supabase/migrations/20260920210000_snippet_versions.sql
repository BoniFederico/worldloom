-- Cronologia versioni degli snippet.
-- Una versione a ogni salvataggio che cambia il contenuto (titolo, testo, campi, tag, alias, stato).
-- Per non registrare ogni salvataggio automatico, le modifiche dello stesso autore entro 10 minuti
-- aggiornano la versione più recente invece di crearne una nuova. Si conservano le ultime 100.
-- La cronologia è scritta solo dal trigger (security definer) e letta da chi può scrivere nel mondo.

create table public.snippet_versions (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null,
  snippet_id uuid not null,
  version int not null check (version > 0),
  title text not null,
  status public.snippet_status not null default 'draft',
  body jsonb not null default '{}',
  fields jsonb not null default '{}',
  tags text[] not null default '{}',
  aliases text[] not null default '{}',
  restored_from int,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (snippet_id, version),
  foreign key (world_id, snippet_id) references public.snippets (world_id, id) on delete cascade
);

alter table public.snippet_versions enable row level security;
revoke all on public.snippet_versions from public, anon, authenticated;
grant select on public.snippet_versions to authenticated;

create policy snippet_versions_read on public.snippet_versions for select to authenticated using (
  world_id in (select private.writer_worlds())
);

create function private.record_snippet_version() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_last public.snippet_versions;
  v_restore int := nullif(current_setting('worldloom.restore_of', true), '')::int;
begin
  if tg_op = 'UPDATE'
     and old.title = new.title and old.status = new.status and old.body = new.body
     and old.fields = new.fields and old.tags = new.tags and old.aliases = new.aliases then
    return new;
  end if;

  select * into v_last from public.snippet_versions
   where snippet_id = new.id order by version desc limit 1;

  if v_last.id is not null and v_restore is null and v_last.restored_from is null
     and v_last.created_by is not distinct from v_user
     and v_last.created_at > now() - interval '10 minutes' then
    update public.snippet_versions
       set title = new.title, status = new.status, body = new.body, fields = new.fields,
           tags = new.tags, aliases = new.aliases, created_at = now()
     where id = v_last.id;
  else
    insert into public.snippet_versions
      (world_id, snippet_id, version, title, status, body, fields, tags, aliases, restored_from, created_by)
    values
      (new.world_id, new.id, coalesce(v_last.version, 0) + 1, new.title, new.status, new.body,
       new.fields, new.tags, new.aliases, v_restore, coalesce(v_user, new.created_by));
    delete from public.snippet_versions
     where snippet_id = new.id and version <= coalesce(v_last.version, 0) + 1 - 100;
  end if;
  return new;
end;
$$;

create trigger snippets_record_version after insert or update on public.snippets
  for each row execute function private.record_snippet_version();

-- Ripristina il contenuto di una versione (la cronologia registra il ripristino come nuova versione).
-- Gira con i permessi di chi chiama; non sovrascrive mai una modifica più recente (`conflict`).
create function public.restore_snippet_version(p_snippet uuid, p_version int, p_updated timestamptz)
returns void
language plpgsql security invoker set search_path = ''
as $$
declare
  v public.snippet_versions;
  v_id uuid;
begin
  select * into v from public.snippet_versions where snippet_id = p_snippet and version = p_version;
  if v.id is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  perform set_config('worldloom.restore_of', p_version::text, true);
  update public.snippets
     set title = v.title, status = v.status, body = v.body, fields = v.fields,
         tags = v.tags, aliases = v.aliases
   where id = p_snippet and updated_at = p_updated and deleted_at is null
  returning id into v_id;
  perform set_config('worldloom.restore_of', '', true);

  if v_id is null then
    raise exception 'conflict' using errcode = 'P0001';
  end if;

  -- Le relazioni da menzione seguono il testo ripristinato (ids ricavati dal documento, non dal client).
  perform private.sync_mentions(
    p_snippet,
    coalesce(
      (select array_agg(distinct m::uuid)
         from jsonb_path_query(v.body, '$.** ? (@.type == "mention").attrs.id') as j,
              lateral (select j #>> '{}' as m) as x
        where m ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
      '{}'
    )
  );
end;
$$;

revoke all on function public.restore_snippet_version(uuid, int, timestamptz) from public, anon;
grant execute on function public.restore_snippet_version(uuid, int, timestamptz) to authenticated;

-- Versione iniziale degli snippet già esistenti.
insert into public.snippet_versions
  (world_id, snippet_id, version, title, status, body, fields, tags, aliases, created_by, created_at)
select world_id, id, 1, title, status, body, fields, tags, aliases, created_by, updated_at
  from public.snippets;
