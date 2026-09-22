-- Wiki pubblica del mondo (#42). Un mondo con `wiki_slug` impostato è navigabile da chiunque (anche senza account) a
-- `/w/<wiki_slug>`: indice e pagine degli snippet con visibilità «public» (D-032 li rende già leggibili da `anon` a
-- livello di riga; questa migrazione aggiunge solo ciò che serve a *navigare* quel contenuto — categorie e immagini —
-- e resta un'aggiunta pura: nessuna policy esistente cambia).

alter table public.worlds
  add column wiki_slug text unique,
  add constraint worlds_wiki_slug_format
    check (wiki_slug is null or (wiki_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(wiki_slug) between 3 and 60));

-- Nessun indice dedicato: il vincolo `unique` sopra ne crea già uno, sufficiente per la lettura per slug.

-- Un mondo pubblicato è leggibile anche da chi non è membro (policy aggiuntiva, si somma a `worlds_read`).
create policy worlds_public_read on public.worlds for select to anon, authenticated
  using (wiki_slug is not null);

-- Le categorie di un mondo pubblicato servono a mostrare nome/icona/colore nella wiki, ma solo quelle usate da
-- almeno uno snippet pubblico: una categoria usata solo da contenuto riservato non deve trapelare (nome, icona)
-- solo perché il mondo ha una wiki pubblicata.
create policy categories_public_read on public.categories for select to anon, authenticated using (
  exists (
    select 1 from public.snippet_categories sc
    join public.snippets s on s.id = sc.snippet_id
    join public.worlds w on w.id = sc.world_id
    where sc.category_id = categories.id
      and s.visibility = 'public' and s.deleted_at is null and w.wiki_slug is not null
  )
);

-- Il collegamento snippet-categoria, solo per snippet effettivamente pubblici in un mondo pubblicato (uno snippet
-- «public» in un mondo non pubblicato resta leggibile via `snippets_read` ma senza rivelare le sue categorie qui).
create policy snippet_categories_public_read on public.snippet_categories for select to anon, authenticated using (
  exists (
    select 1 from public.snippets s
    join public.worlds w on w.id = s.world_id
    where s.id = snippet_id and s.visibility = 'public' and s.deleted_at is null and w.wiki_slug is not null
  )
);

-- Immagini: un file è leggibile dalla wiki solo se citato dal corpo o dai campi di uno snippet pubblico di un mondo
-- pubblicato (security invoker: nessun accesso più ampio di quello che la RLS di `snippets` concede già a chi chiama).
create function public.can_read_wiki_image(p_world uuid, p_file text)
returns boolean
language sql stable security invoker set search_path = '' as $$
  select p_file ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp|gif)$'
    and exists (select 1 from public.worlds w where w.id = p_world and w.wiki_slug is not null)
    and exists (
      select 1 from public.snippets s
       where s.world_id = p_world and s.visibility = 'public' and s.deleted_at is null
         and (s.body::text like '%' || p_file || '%' or s.fields::text like '%' || p_file || '%')
    )
$$;

revoke all on function public.can_read_wiki_image(uuid, text) from public;
grant execute on function public.can_read_wiki_image(uuid, text) to anon, authenticated;

-- Il bucket resta privato; questa policy apre solo i file che `can_read_wiki_image` approva.
create policy world_images_public_read on storage.objects for select to anon, authenticated using (
  bucket_id = 'world-images'
  and public.can_read_wiki_image(private.world_of_path(name), split_part(name, '/', 2))
);
