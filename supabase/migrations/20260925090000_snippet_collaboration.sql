-- Collaborazione in tempo reale su uno snippet (#38): presenza e commenti. La «modifica simultanea senza perdita di
-- dati» è già garantita dal salvataggio automatico a concorrenza ottimistica (D-015): non sovrascrive mai, va in
-- conflitto e aspetta un ricaricamento. Qui si aggiunge solo ciò che serve per collaborare in tempo reale:
--
--  * `snippet_comments`: commenti su uno snippet, letti da chi legge lo snippet (stessa regola delle relazioni:
--    `exists` non `security definer`, quindi un commento non rivela l'esistenza di uno snippet nascosto), scritti da
--    qualunque membro che veda lo snippet (anche un lettore, non solo chi scrive), eliminati dall'autore o da chi
--    scrive nel mondo (moderazione). Nessuna menzione di persone nel testo: non esiste ancora quel meccanismo (D-037).
--  * La tabella entra nella pubblicazione `supabase_realtime`: il client si iscrive agli inserimenti per aggiornare
--    il pannello senza ricaricare la pagina.
--  * Presenza («chi sta guardando ora») e l'avviso «modifiche salvate da qualcun altro» non toccano il database:
--    usano un canale Realtime effimero (presence/broadcast), non righe permanenti.

create table public.snippet_comments (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.worlds (id) on delete cascade,
  snippet_id uuid not null,
  author uuid references auth.users (id) on delete set null,
  body text not null check (length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default clock_timestamp(),
  foreign key (world_id, snippet_id) references public.snippets (world_id, id) on delete cascade
);
create index snippet_comments_snippet on public.snippet_comments (snippet_id, created_at);

alter table public.snippet_comments enable row level security;

-- Si vede se si vede lo snippet (la sotto-query ha la RLS di chi legge): un commento non rivela mai uno snippet nascosto.
create policy snippet_comments_read on public.snippet_comments for select to anon, authenticated using (
  exists (select 1 from public.snippets s where s.id = snippet_id)
);
-- Commenta chiunque sia membro del mondo e possa leggere lo snippet, non solo chi scrive.
create policy snippet_comments_insert on public.snippet_comments for insert to authenticated with check (
  author = (select auth.uid())
  and private.world_role(world_id) is not null
  and exists (select 1 from public.snippets s where s.id = snippet_id)
);
-- Si elimina un proprio commento, o chi scrive modera quelli altrui.
create policy snippet_comments_delete on public.snippet_comments for delete to authenticated using (
  author = (select auth.uid()) or private.can_write(world_id)
);

revoke all on public.snippet_comments from public, anon, authenticated;
grant select on public.snippet_comments to anon, authenticated;
grant insert (world_id, snippet_id, author, body), delete on public.snippet_comments to authenticated;

-- Realtime: il client si iscrive agli inserimenti per il proprio snippet (la RLS di lettura si applica comunque
-- alla sottoscrizione, quindi nessuno riceve un commento su uno snippet che non potrebbe leggere).
alter publication supabase_realtime add table public.snippet_comments;
