-- Tag e alias degli snippet: limiti sul numero e sulla lunghezza, applicati anche dal salvataggio atomico.

alter table public.snippets
  add constraint snippets_tags_count check (cardinality(tags) <= 30),
  add constraint snippets_aliases_count check (cardinality(aliases) <= 20);

-- Ricerca per tag nell'elenco di un mondo.
create index if not exists snippets_tags_idx on public.snippets using gin (tags);

drop function if exists public.save_snippet(uuid, timestamptz, text, public.snippet_status, jsonb, jsonb, uuid[]);

create or replace function public.save_snippet(
  p_id uuid,
  p_updated timestamptz,
  p_title text,
  p_status public.snippet_status,
  p_body jsonb,
  p_fields jsonb,
  p_categories uuid[],
  p_tags text[],
  p_aliases text[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_world uuid;
begin
  if exists (select 1 from unnest(p_tags) t where btrim(t) = '' or length(t) > 40)
     or exists (select 1 from unnest(p_aliases) a where btrim(a) = '' or length(a) > 100) then
    raise exception 'invalid_labels' using errcode = 'P0001';
  end if;

  update public.snippets
     set title = p_title, status = p_status, body = p_body, fields = p_fields,
         tags = p_tags, aliases = p_aliases
   where id = p_id and updated_at = p_updated and deleted_at is null
  returning world_id into v_world;

  if v_world is null then
    raise exception 'conflict' using errcode = 'P0001';
  end if;

  delete from public.snippet_categories
   where snippet_id = p_id and not (category_id = any (p_categories));
  insert into public.snippet_categories (world_id, snippet_id, category_id)
    select v_world, p_id, c from unnest(p_categories) as c
    on conflict do nothing;
end;
$$;

revoke all on function public.save_snippet(uuid, timestamptz, text, public.snippet_status, jsonb, jsonb, uuid[], text[], text[])
  from public, anon;
grant execute on function public.save_snippet(uuid, timestamptz, text, public.snippet_status, jsonb, jsonb, uuid[], text[], text[])
  to authenticated;
