-- Ricerca full-text sugli snippet (#19): titolo e alias (peso A), tag (B), testo (C), senza badare a maiuscole e accenti,
-- con prefissi («eda» trova «Edaline»). La funzione `search_snippets` gira con i permessi di chi chiama (security invoker):
-- la visibilità la decide la RLS di `snippets`, nessun filtro lato client.

-- Prestazioni della RLS: la policy `snippets_read` chiamava `private.can_read` una volta per riga (~60 µs ciascuna), e poiché
-- `@@` non è «leakproof» Postgres la valuta su tutte le righe del mondo prima di usare l'indice: 3.000 snippet ≈ 200 ms.
-- Riscritta con sottoquery NON correlate (mondi in cui l'utente è membro/scrittore), valutate una sola volta per query.
-- Stessa semantica: chi scrive vede tutto (anche il cestino); lettori e commentatori i soli `members` e `public`; gli
-- estranei i soli `public`; `shared` e `secret` restano chiusi ai non scrittori (issue #32).
create or replace function private.member_worlds() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select world_id from public.world_members where user_id = (select auth.uid())
$$;

create or replace function private.writer_worlds() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select world_id from public.world_members
   where user_id = (select auth.uid()) and role in ('owner', 'editor')
$$;

revoke all on function private.member_worlds(), private.writer_worlds() from public;
grant execute on function private.member_worlds(), private.writer_worlds() to anon, authenticated;

drop policy snippets_read on public.snippets;
create policy snippets_read on public.snippets for select to anon, authenticated using (
  world_id in (select private.writer_worlds())
  or (
    deleted_at is null
    and (visibility = 'public' or (visibility = 'members' and world_id in (select private.member_worlds())))
  )
);

create extension if not exists unaccent with schema extensions;

create text search configuration public.simple_unaccent (copy = pg_catalog.simple);
alter text search configuration public.simple_unaccent
  alter mapping for hword, hword_part, word with extensions.unaccent, pg_catalog.simple;

alter table public.snippets
  add column body_text text not null default '',
  add column search tsvector not null default ''::tsvector;

create or replace function private.snippets_search_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- Testo del documento: tutti i nodi `text` (le menzioni non hanno testo, quindi non rivelano titoli altrui).
  new.body_text := coalesce(
    (select string_agg(v #>> '{}', ' ') from jsonb_path_query(new.body, 'strict $.**.text', '{}', true) as v),
    ''
  );
  new.search :=
    setweight(to_tsvector('public.simple_unaccent', coalesce(new.title, '')), 'A')
    || setweight(to_tsvector('public.simple_unaccent', coalesce(array_to_string(new.aliases, ' '), '')), 'A')
    || setweight(to_tsvector('public.simple_unaccent', coalesce(array_to_string(new.tags, ' '), '')), 'B')
    || setweight(to_tsvector('public.simple_unaccent', new.body_text), 'C');
  return new;
end;
$$;

create trigger snippets_search before insert or update of title, body, aliases, tags on public.snippets
  for each row execute function private.snippets_search_update();

-- Ripopola le righe esistenti (il trigger scatta su un update di `title`).
update public.snippets set title = title;

create index snippets_search_idx on public.snippets using gin (search);

-- Da testo libero a tsquery: solo parole (lettere e cifre, massimo 8) con ricerca per prefisso. Nessun operatore
-- dell'utente arriva alla query, quindi non c'è modo di rompere la sintassi né di iniettare.
create or replace function private.prefix_query(q text) returns tsquery
language sql immutable set search_path = '' as $$
  select case when count(*) = 0 then null::tsquery
    else to_tsquery('public.simple_unaccent', string_agg(t || ':*', ' & ')) end
  from (
    select left(w, 50) as t
      from unnest(regexp_split_to_array(lower(coalesce(q, '')), '[^[:alnum:]]+')) as w
     where w <> ''
     limit 8
  ) x
$$;

grant execute on function private.prefix_query(text) to anon, authenticated;

create or replace function public.search_snippets(
  p_world uuid,
  p_query text default '',
  p_category uuid default null,
  p_tags text[] default '{}',
  p_status public.snippet_status default null,
  p_field_key text default null,
  p_field_value text default null,
  p_relation text default null,
  p_include_archived boolean default false,
  p_limit integer default 30
)
returns table (
  id uuid,
  title text,
  status public.snippet_status,
  tags text[],
  excerpt text,
  rank real,
  updated_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  with q as (select private.prefix_query(p_query) as tsq)
  select s.id, s.title, s.status, s.tags,
         case when q.tsq is null then left(s.body_text, 160)
              else ts_headline('public.simple_unaccent', s.body_text, q.tsq,
                               'StartSel=<<,StopSel=>>,MaxFragments=1,MaxWords=20,MinWords=8') end as excerpt,
         (case when q.tsq is null then 0 else ts_rank_cd(s.search, q.tsq) end)::real as rank,
         s.updated_at
    from public.snippets s, q
   where s.world_id = p_world
     and s.deleted_at is null
     and (p_include_archived or s.archived_at is null)
     and (q.tsq is null or s.search @@ q.tsq)
     and (p_category is null or exists (
           select 1 from public.snippet_categories c where c.snippet_id = s.id and c.category_id = p_category))
     and (coalesce(cardinality(p_tags), 0) = 0 or s.tags @> p_tags)
     and (p_status is null or s.status = p_status)
     and (p_field_key is null or lower(s.fields ->> p_field_key) = lower(coalesce(p_field_value, '')))
     and (p_relation is null or exists (
           select 1 from public.relations r
            where (r.source_id = s.id or r.target_id = s.id)
              and (private.norm_label(r.label) = private.norm_label(p_relation)
                   or private.norm_label(r.inverse_label) = private.norm_label(p_relation))))
   order by rank desc, s.updated_at desc
   limit least(greatest(coalesce(p_limit, 30), 1), 100)
$$;

revoke all on function public.search_snippets(uuid, text, uuid, text[], public.snippet_status, text, text, text, boolean, integer)
  from public, anon;
grant execute on function public.search_snippets(uuid, text, uuid, text[], public.snippet_status, text, text, text, boolean, integer)
  to authenticated;
