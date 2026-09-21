-- Dati per la vista grafo: nodi (snippet) e archi (relazioni) di un mondo, già ridotti a ciò che si può disegnare.
-- Gira con i permessi di chi chiama (security invoker): la RLS di snippet e relazioni decide cosa si vede, quindi uno
-- snippet segreto non compare a chi non può leggerlo, e nemmeno le sue relazioni.
--
--  * senza centro: gli snippet con più relazioni (fino a `p_max_nodes`), così il grafo resta leggibile e veloce anche con
--    5.000 snippet e 20.000 relazioni; con un centro: i nodi entro `p_depth` passi da esso (relazioni in entrambe le direzioni);
--  * filtri: etichetta (anche quella inversa, senza badare alle maiuscole), categoria, inclusione delle relazioni da menzione;
--  * profondità 0–4 e nodi 1–500: valori fuori intervallo vengono riportati nei limiti.
-- Restituisce {nodes:[{id,title,category_ids,degree}], edges:[{source,target,label,inverse_label,from_mention}], truncated}.

create or replace function public.graph_data(
  p_world uuid,
  p_center uuid,
  p_depth integer,
  p_label text,
  p_category uuid,
  p_mentions boolean,
  p_max_nodes integer
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_depth integer := least(greatest(coalesce(p_depth, 2), 0), 4);
  v_max integer := least(greatest(coalesce(p_max_nodes, 300), 1), 500);
  v_label text := nullif(private.norm_label(p_label), '');
  v_result jsonb;
begin
  with recursive
  base as (
    select r.source_id, r.target_id, r.label, r.inverse_label, r.from_mention
      from public.relations r
     where r.world_id = p_world
       and (coalesce(p_mentions, true) or not r.from_mention)
       and (v_label is null
            or private.norm_label(r.label) = v_label
            or private.norm_label(r.inverse_label) = v_label)
  ),
  reach(id, d) as (
    select s.id, 0
      from public.snippets s
     where p_center is not null and s.id = p_center and s.world_id = p_world and s.deleted_at is null
    union
    select case when b.source_id = r.id then b.target_id else b.source_id end, r.d + 1
      from reach r
      join base b on b.source_id = r.id or b.target_id = r.id
     where r.d < v_depth
  ),
  degrees as (
    select id, count(*) as deg
      from (select source_id as id from base union all select target_id from base) e
     group by id
  ),
  distances as (
    select id, min(d) as dist from reach group by id
  ),
  -- Con join (non sottoquery correlate): con migliaia di snippet la differenza è di ordini di grandezza.
  candidates as (
    select s.id, s.title, 0 as dist, dg.deg
      from public.snippets s
      join degrees dg on dg.id = s.id
     where p_center is null and s.world_id = p_world and s.deleted_at is null
       and (p_category is null
            or exists (select 1 from public.snippet_categories c
                        where c.snippet_id = s.id and c.category_id = p_category))
    union all
    select s.id, s.title, ds.dist, coalesce(dg.deg, 0)
      from public.snippets s
      join distances ds on ds.id = s.id
      left join degrees dg on dg.id = s.id
     where p_center is not null and s.world_id = p_world and s.deleted_at is null
       and (p_category is null
            or s.id = p_center
            or exists (select 1 from public.snippet_categories c
                        where c.snippet_id = s.id and c.category_id = p_category))
  ),
  ranked as (
    select id, title, row_number() over (order by dist, deg desc, title, id) as rn
      from candidates
  ),
  chosen as (
    select id, title from ranked where rn <= v_max
  ),
  edges as (
    select b.source_id, b.target_id, b.label, b.inverse_label, b.from_mention
      from base b
     where b.source_id in (select id from chosen) and b.target_id in (select id from chosen)
  ),
  edge_degrees as (
    select id, count(*) as deg
      from (select source_id as id from edges union all select target_id from edges) e
     group by id
  )
  select jsonb_build_object(
    'nodes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id,
               'title', c.title,
               'category_ids', coalesce((
                  select jsonb_agg(sc.category_id order by sc.category_id)
                    from public.snippet_categories sc where sc.snippet_id = c.id), '[]'::jsonb),
               'degree', coalesce((select deg from edge_degrees ed where ed.id = c.id), 0))
             order by c.title, c.id)
        from chosen c), '[]'::jsonb),
    'edges', coalesce((
      select jsonb_agg(jsonb_build_object(
               'source', e.source_id, 'target', e.target_id, 'label', e.label,
               'inverse_label', e.inverse_label, 'from_mention', e.from_mention)
             order by e.source_id, e.target_id, e.label)
        from edges e), '[]'::jsonb),
    'truncated', exists (select 1 from ranked where rn > v_max)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.graph_data(uuid, uuid, integer, text, uuid, boolean, integer) from public, anon;
grant execute on function public.graph_data(uuid, uuid, integer, text, uuid, boolean, integer) to authenticated;
