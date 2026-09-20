-- Tag e alias: le stesse regole valgono anche per chi scrive direttamente sulla tabella (non solo tramite
-- save_snippet). Nei tag sono vietati i caratteri che hanno un significato nei filtri (`, { } " \`).

create or replace function private.valid_labels(labels text[], max_length int, strict boolean)
returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(bool_and(
    l is not null
    and btrim(l) <> ''
    and length(l) <= max_length
    and (not strict or (l !~ '[,{}"]' and position(chr(92) in l) = 0))
  ), true)
  from unnest(labels) as l
$$;

grant execute on function private.valid_labels(text[], int, boolean) to anon, authenticated;

alter table public.snippets
  add constraint snippets_tags_valid check (private.valid_labels(tags, 40, true)),
  add constraint snippets_aliases_valid check (private.valid_labels(aliases, 100, false));

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
  if not private.valid_labels(p_tags, 40, true) or not private.valid_labels(p_aliases, 100, false) then
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
