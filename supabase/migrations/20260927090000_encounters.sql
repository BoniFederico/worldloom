-- Tracker di iniziativa e scontro (#40). Un "encounter" appartiene a una campagna; i partecipanti (personaggi della
-- campagna o comparse senza scheda, es. mostri generici) hanno un'iniziativa, punti ferita e condizioni. Turni e round
-- li avanza solo chi gestisce la campagna (DM/co-DM), come per le sessioni (#36); i giocatori leggono per seguire il
-- proprio turno. I punti ferita qui sono uno **scoppio** (snapshot) preso al momento in cui si aggiunge il
-- partecipante, non sincronizzato con la scheda: lo scontro è un artefatto della sessione al tavolo, la scheda resta
-- la fonte di verità a lungo termine (si aggiorna a parte, come sempre, dal DM). L'etichetta della risorsa
-- (`resource_label`, es. «Punti ferita») è testo libero: lo schema di statistiche (#33) è generico, non esiste un
-- campo "hp" fisso da leggere.

create table public.campaign_encounters (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  name text not null default '' check (length(name) <= 120),
  round int not null default 1 check (round >= 1),
  -- Indice (0-based) di chi ha il turno nell'ordine di iniziativa (decrescente); si ricalcola lato applicazione, mai
  -- persistito come riferimento a una riga (l'ordine può cambiare se l'iniziativa di qualcuno cambia).
  turn_index int not null default 0 check (turn_index >= 0),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index campaign_encounters_campaign on public.campaign_encounters (campaign_id, created_at desc);

create table public.encounter_participants (
  id uuid primary key default gen_random_uuid(),
  encounter_id uuid not null references public.campaign_encounters (id) on delete cascade,
  -- Denormalizzato: evita una join con campaign_encounters nella RLS di questa tabella (stesso motivo di D-036 per
  -- session_id in visibility_log, qui ancora più diretto perché serve anche a validare character_id sotto).
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  character_id uuid references public.characters (id) on delete set null,
  name text not null check (length(btrim(name)) between 1 and 120),
  initiative numeric not null default 0,
  hp_current int check (hp_current is null or hp_current >= 0),
  hp_max int check (hp_max is null or hp_max >= 0),
  resource_label text not null default '' check (length(resource_label) <= 40),
  conditions text[] not null default '{}',
  created_at timestamptz not null default clock_timestamp()
);
create index encounter_participants_encounter
  on public.encounter_participants (encounter_id, initiative desc, created_at);

create trigger campaign_encounters_touch before update on public.campaign_encounters
  for each row execute function private.touch_updated_at();

alter table public.campaign_encounters enable row level security;
alter table public.encounter_participants enable row level security;

-- Lo scontro lo legge chi fa parte della campagna (per seguire il proprio turno); lo gestisce solo chi la gestisce.
create policy campaign_encounters_read on public.campaign_encounters for select to authenticated
  using (private.campaign_role(campaign_id) is not null);
create policy campaign_encounters_insert on public.campaign_encounters for insert to authenticated
  with check (private.can_manage_campaign(campaign_id) and created_by = (select auth.uid()));
create policy campaign_encounters_update on public.campaign_encounters for update to authenticated
  using (private.can_manage_campaign(campaign_id))
  with check (private.can_manage_campaign(campaign_id));
create policy campaign_encounters_delete on public.campaign_encounters for delete to authenticated
  using (private.can_manage_campaign(campaign_id));

-- I partecipanti li legge chi fa parte della campagna; li scrive solo chi gestisce. Un personaggio collegato deve
-- appartenere alla stessa campagna dello scontro (come per i tiri di dado, #39): niente riferimenti incrociati.
create policy encounter_participants_read on public.encounter_participants for select to authenticated
  using (private.campaign_role(campaign_id) is not null);
create policy encounter_participants_insert on public.encounter_participants for insert to authenticated
  with check (
    private.can_manage_campaign(campaign_id)
    and exists (
      select 1 from public.campaign_encounters e
      where e.id = encounter_id and e.campaign_id = encounter_participants.campaign_id
    )
    and (
      character_id is null
      or exists (
        select 1 from public.characters c
        where c.id = character_id and c.campaign_id = encounter_participants.campaign_id
      )
    )
  );
create policy encounter_participants_update on public.encounter_participants for update to authenticated
  using (private.can_manage_campaign(campaign_id))
  with check (private.can_manage_campaign(campaign_id));
create policy encounter_participants_delete on public.encounter_participants for delete to authenticated
  using (private.can_manage_campaign(campaign_id));

revoke all on public.campaign_encounters, public.encounter_participants from public, anon, authenticated;
grant select, insert (campaign_id, name, created_by), update (name, round, turn_index), delete
  on public.campaign_encounters to authenticated;
grant select,
  insert (
    encounter_id, campaign_id, character_id, name, initiative, hp_current, hp_max, resource_label, conditions
  ),
  update (initiative, hp_current, hp_max, conditions),
  delete
  on public.encounter_participants to authenticated;
