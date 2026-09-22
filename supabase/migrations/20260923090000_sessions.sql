-- Sessioni, diario e bacheca di campagna (#36). Una sessione ha un riepilogo condiviso, note private del DM (DM/co-DM) e note
-- private di ogni giocatore (mai lette da altri, nemmeno dal DM), eventi di timeline collegati (snippet del mondo della
-- campagna, se c'è) e gli elementi rivelati durante quella sessione (letti da `visibility_log`, D-032, che ora punta qui).
-- Diario condiviso e bacheca sono la stessa forma (`campaign_posts`, con `kind`): un elenco di messaggi di testo per campagna.

create table public.campaign_sessions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  -- Numero progressivo per campagna, assegnato dal trigger sotto (mai dal client).
  number int not null,
  title text not null default '' check (length(title) <= 150),
  played_on date,
  summary text not null default '' check (length(summary) <= 10000),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, number)
);
create index campaign_sessions_campaign on public.campaign_sessions (campaign_id, number desc);

-- Note del DM sulla sessione: tabella a parte, per poterla concedere solo a chi gestisce (RLS di riga, non di colonna).
create table public.session_dm_notes (
  session_id uuid primary key references public.campaign_sessions (id) on delete cascade,
  notes text not null default '' check (length(notes) <= 10000),
  updated_at timestamptz not null default now()
);

-- Note di un giocatore sulla sessione: private, mai lette da altri (nemmeno dal DM).
create table public.session_player_notes (
  session_id uuid not null references public.campaign_sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  notes text not null default '' check (length(notes) <= 10000),
  updated_at timestamptz not null default now(),
  primary key (session_id, user_id)
);

-- Snippet del mondo della campagna collegati alla sessione come eventi di timeline.
create table public.session_snippets (
  session_id uuid not null references public.campaign_sessions (id) on delete cascade,
  snippet_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (session_id, snippet_id)
);

-- Diario condiviso (`chronicle`) e bacheca di messaggi (`message`): stessa forma, un elenco di testi per campagna.
create table public.campaign_posts (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  kind text not null check (kind in ('chronicle', 'message')),
  author uuid references auth.users (id) on delete set null,
  body text not null check (length(btrim(body)) between 1 and 5000),
  created_at timestamptz not null default clock_timestamp()
);
create index campaign_posts_campaign on public.campaign_posts (campaign_id, kind, created_at desc);

-- Ora che la tabella esiste, la rivelazione (D-032) può puntarci: quando una sessione si elimina, il registro resta (con
-- sessione nulla) — la storia della visibilità non dipende dal fatto che la sessione sia ancora lì.
alter table public.visibility_log
  add constraint visibility_log_session_id_fkey foreign key (session_id)
    references public.campaign_sessions (id) on delete set null;

create trigger session_dm_notes_touch before update on public.session_dm_notes
  for each row execute function private.touch_updated_at();
create trigger session_player_notes_touch before update on public.session_player_notes
  for each row execute function private.touch_updated_at();

-- Numero progressivo: mai dal client, calcolato bloccando la riga della campagna (come le altre funzioni di guardia).
create function private.number_session() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.campaigns where id = new.campaign_id for update;
  select coalesce(max(number), 0) + 1 into new.number
    from public.campaign_sessions where campaign_id = new.campaign_id;
  return new;
end $$;
create trigger campaign_sessions_number before insert on public.campaign_sessions
  for each row execute function private.number_session();
create trigger campaign_sessions_touch before update on public.campaign_sessions
  for each row execute function private.touch_updated_at();

revoke all on function private.number_session() from public, anon, authenticated;

-- Permessi (RLS) --------------------------------------------------------------------------------------

alter table public.campaign_sessions enable row level security;
alter table public.session_dm_notes enable row level security;
alter table public.session_player_notes enable row level security;
alter table public.session_snippets enable row level security;
alter table public.campaign_posts enable row level security;

-- Sessioni: le legge chi fa parte della campagna, le scrive chi la gestisce (DM e co-DM).
create policy campaign_sessions_read on public.campaign_sessions for select to authenticated
  using (private.campaign_role(campaign_id) is not null);
create policy campaign_sessions_insert on public.campaign_sessions for insert to authenticated
  with check (private.can_manage_campaign(campaign_id) and created_by = (select auth.uid()));
create policy campaign_sessions_update on public.campaign_sessions for update to authenticated
  using (private.can_manage_campaign(campaign_id))
  with check (private.can_manage_campaign(campaign_id));
create policy campaign_sessions_delete on public.campaign_sessions for delete to authenticated
  using (private.can_manage_campaign(campaign_id));

-- Note del DM: solo chi gestisce la campagna della sessione.
create policy session_dm_notes_all on public.session_dm_notes for all to authenticated
  using (
    exists (
      select 1 from public.campaign_sessions s
      where s.id = session_id and private.can_manage_campaign(s.campaign_id)
    )
  )
  with check (
    exists (
      select 1 from public.campaign_sessions s
      where s.id = session_id and private.can_manage_campaign(s.campaign_id)
    )
  );

-- Note di un giocatore: solo lui, e solo se ancora fa parte della campagna.
create policy session_player_notes_all on public.session_player_notes for all to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.campaign_sessions s
      where s.id = session_id and private.campaign_role(s.campaign_id) is not null
    )
  )
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.campaign_sessions s
      where s.id = session_id and private.campaign_role(s.campaign_id) is not null
    )
  );

-- Eventi collegati: chi gestisce la campagna li aggiunge o toglie; la lettura passa anche dalla RLS dello snippet (`exists` non
-- è `security definer`, quindi lo snippet si vede solo se chi guarda potrebbe leggerlo comunque: nessuna fuga di id segreti).
create policy session_snippets_read on public.session_snippets for select to authenticated
  using (
    exists (
      select 1 from public.campaign_sessions s
      where s.id = session_id and private.campaign_role(s.campaign_id) is not null
    )
    and exists (select 1 from public.snippets sn where sn.id = snippet_id)
  );
create policy session_snippets_insert on public.session_snippets for insert to authenticated
  with check (
    exists (
      select 1 from public.campaign_sessions s
      where s.id = session_id and private.can_manage_campaign(s.campaign_id)
    )
    and exists (select 1 from public.snippets sn where sn.id = snippet_id)
  );
create policy session_snippets_delete on public.session_snippets for delete to authenticated
  using (
    exists (
      select 1 from public.campaign_sessions s
      where s.id = session_id and private.can_manage_campaign(s.campaign_id)
    )
  );

-- Diario e bacheca: li legge chiunque fa parte della campagna; li scrive chiunque non sia solo osservatore; ogni voce si
-- elimina da chi l'ha scritta o da chi gestisce (moderazione). Niente modifica: un messaggio inviato non si cambia.
create policy campaign_posts_read on public.campaign_posts for select to authenticated
  using (private.campaign_role(campaign_id) is not null);
create policy campaign_posts_insert on public.campaign_posts for insert to authenticated
  with check (
    author = (select auth.uid())
    and private.campaign_role(campaign_id) in ('dm', 'co_dm', 'player')
  );
create policy campaign_posts_delete on public.campaign_posts for delete to authenticated
  using (author = (select auth.uid()) or private.can_manage_campaign(campaign_id));

revoke all on public.campaign_sessions, public.session_dm_notes, public.session_player_notes,
  public.session_snippets, public.campaign_posts from public, anon, authenticated;
grant select, insert (campaign_id, title, played_on, summary, created_by),
  update (title, played_on, summary), delete on public.campaign_sessions to authenticated;
-- `update` include anche la chiave (session_id / user_id): l'upsert di PostgREST genera un `on conflict do update` che
-- assegna anche le colonne della chiave (`col = excluded.col`, anche se il valore non cambia), quindi serve il privilegio
-- di scrittura pure su di esse. La RLS impedisce comunque di spostare una riga su una sessione o un utente non propri.
grant select, insert (session_id, notes), update (session_id, notes), delete on public.session_dm_notes to authenticated;
grant select, insert (session_id, user_id, notes), update (session_id, user_id, notes), delete
  on public.session_player_notes to authenticated;
grant select, insert (session_id, snippet_id), delete on public.session_snippets to authenticated;
grant select, insert (campaign_id, kind, author, body), delete on public.campaign_posts to authenticated;
