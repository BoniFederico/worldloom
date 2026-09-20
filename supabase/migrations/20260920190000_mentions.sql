-- Menzioni (@) = relazioni. Ogni menzione nel testo di uno snippet crea una relazione «menziona» verso lo snippet
-- citato (marcata `from_mention`); se la menzione sparisce dal testo, sparisce anche quella relazione. Le relazioni
-- inserite a mano non si toccano. I backlink sono le relazioni `from_mention` in ingresso.

alter table public.relations add column from_mention boolean not null default false;
create index relations_mentions_in on public.relations (target_id) where from_mention;

create or replace function private.sync_mentions(p_snippet uuid, p_mentions uuid[]) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  v_world uuid;
begin
  -- Elementi NULL scartati (renderebbero NULL il confronto del delete) e un tetto al numero di menzioni.
  p_mentions := coalesce(array_remove(p_mentions, null), '{}');
  if cardinality(p_mentions) > 200 then
    raise exception 'too_many_mentions' using errcode = 'P0001';
  end if;

  select world_id into v_world from public.snippets where id = p_snippet;
  if v_world is null then
    return;
  end if;

  delete from public.relations
   where source_id = p_snippet and from_mention and not (target_id = any (p_mentions));

  -- Solo snippet attivi dello stesso mondo e diversi da sé; la RLS limita a quelli leggibili da chi salva.
  insert into public.relations (world_id, source_id, target_id, label, inverse_label, from_mention, created_by)
    select v_world, p_snippet, s.id, 'menziona', 'menzionato in', true, (select auth.uid())
      from public.snippets s
     where s.world_id = v_world and s.id = any (p_mentions) and s.id <> p_snippet and s.deleted_at is null
    on conflict do nothing;
end;
$$;

revoke all on function private.sync_mentions(uuid, uuid[]) from public, anon;
grant execute on function private.sync_mentions(uuid, uuid[]) to authenticated;

-- Le relazioni nate da menzioni non sono soggette ai vincoli dei tipi (non devono far fallire il salvataggio del testo).
create or replace function private.enforce_relation_type() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  t public.relation_types;
begin
  if new.from_mention then
    -- Il bypass dei tipi vale solo per le vere relazioni da menzione: etichette fisse, niente scorciatoie via API.
    if private.norm_label(new.label) <> 'menziona' or new.inverse_label is distinct from 'menzionato in' then
      raise exception 'invalid_mention_relation' using errcode = 'P0001';
    end if;
    return new;
  end if;
  select * into t from public.relation_types
   where world_id = new.world_id and private.norm_label(label) = private.norm_label(new.label);
  if not found then
    return new;
  end if;
  if t.source_category_id is not null and not exists (
    select 1 from public.snippet_categories
     where snippet_id = new.source_id and category_id = t.source_category_id
  ) then
    raise exception 'relation_constraint_source' using errcode = 'P0001';
  end if;
  if t.target_category_id is not null and not exists (
    select 1 from public.snippet_categories
     where snippet_id = new.target_id and category_id = t.target_category_id
  ) then
    raise exception 'relation_constraint_target' using errcode = 'P0001';
  end if;
  if new.inverse_label is null then
    new.inverse_label := t.inverse_label;
  end if;
  return new;
end;
$$;

-- `from_mention` non si cambia dopo la creazione (una relazione manuale non diventa una menzione e viceversa).
create or replace function private.forbid_mention_flag_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.from_mention is distinct from old.from_mention then
    raise exception 'from_mention è immutabile' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger relations_mention_flag_immutable before update on public.relations
  for each row execute function private.forbid_mention_flag_change();

drop function if exists public.save_snippet(uuid, timestamptz, text, public.snippet_status, jsonb, jsonb, uuid[], text[], text[]);

create or replace function public.save_snippet(
  p_id uuid,
  p_updated timestamptz,
  p_title text,
  p_status public.snippet_status,
  p_body jsonb,
  p_fields jsonb,
  p_categories uuid[],
  p_tags text[],
  p_aliases text[],
  p_mentions uuid[]
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

  perform private.sync_mentions(p_id, p_mentions);
end;
$$;

revoke all on function public.save_snippet(uuid, timestamptz, text, public.snippet_status, jsonb, jsonb, uuid[], text[], text[], uuid[])
  from public, anon;
grant execute on function public.save_snippet(uuid, timestamptz, text, public.snippet_status, jsonb, jsonb, uuid[], text[], text[], uuid[])
  to authenticated;

-- Salvataggio automatico del solo corpo, con le menzioni: restituisce il nuovo `updated_at`.
create or replace function public.autosave_snippet_body(
  p_id uuid,
  p_updated timestamptz,
  p_body jsonb,
  p_mentions uuid[]
)
returns timestamptz
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_updated timestamptz;
begin
  update public.snippets
     set body = p_body
   where id = p_id and updated_at = p_updated and deleted_at is null
  returning updated_at into v_updated;

  if v_updated is null then
    raise exception 'conflict' using errcode = 'P0001';
  end if;

  perform private.sync_mentions(p_id, p_mentions);
  return v_updated;
end;
$$;

revoke all on function public.autosave_snippet_body(uuid, timestamptz, jsonb, uuid[]) from public, anon;
grant execute on function public.autosave_snippet_body(uuid, timestamptz, jsonb, uuid[]) to authenticated;
