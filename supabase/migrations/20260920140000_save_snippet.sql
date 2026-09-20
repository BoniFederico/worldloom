-- Salvataggio atomico di uno snippet: aggiornamento dei campi e sincronizzazione delle categorie
-- in un'unica transazione. Gira con i permessi di chi chiama (RLS applicata) e non sovrascrive mai
-- una modifica più recente: se `updated_at` non coincide solleva `conflict`.

create or replace function public.save_snippet(
  p_id uuid,
  p_updated timestamptz,
  p_title text,
  p_status public.snippet_status,
  p_body jsonb,
  p_fields jsonb,
  p_categories uuid[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_world uuid;
begin
  update public.snippets
     set title = p_title, status = p_status, body = p_body, fields = p_fields
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

revoke all on function public.save_snippet(uuid, timestamptz, text, public.snippet_status, jsonb, jsonb, uuid[])
  from public, anon;
grant execute on function public.save_snippet(uuid, timestamptz, text, public.snippet_status, jsonb, jsonb, uuid[])
  to authenticated;
