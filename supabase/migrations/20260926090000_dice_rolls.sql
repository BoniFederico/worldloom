-- Tiratore di dadi (#39). Storico condiviso per campagna, con tiri privati di chi gestisce (DM/co-DM), visibili solo a
-- loro. La notazione, i dadi tirati e il calcolo (anche con formule che leggono le statistiche, es. `1d20+str_mod`)
-- restano lato applicazione (src/lib/dice/roll.ts, riusa l'interprete di formule sandboxed di #33): qui restano il
-- permesso e la persistenza del risultato già calcolato, mai un ricalcolo lato server.

create table public.campaign_dice_rolls (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  roller_id uuid references auth.users (id) on delete set null,
  -- Personaggio usato per la formula (facoltativo): solo per mostrare "chi" ha tirato con quale scheda.
  character_id uuid references public.characters (id) on delete set null,
  label text not null default '' check (length(label) <= 120),
  notation text not null check (length(btrim(notation)) between 1 and 200),
  mode text not null default 'normal' check (mode in ('normal', 'advantage', 'disadvantage')),
  total double precision not null,
  -- [{ sides, count, rolls: [...] }, ...] — i singoli risultati, per mostrare la trasparenza del tiro.
  groups jsonb not null check (jsonb_typeof(groups) = 'array'),
  -- Con vantaggio/svantaggio, il tentativo scartato (stessa forma di groups/total): null per un tiro normale.
  other jsonb,
  -- Tiro privato: lo vede solo chi gestisce la campagna (SPEC: "tiri privati del DM").
  is_private boolean not null default false,
  created_at timestamptz not null default clock_timestamp()
);
create index campaign_dice_rolls_campaign on public.campaign_dice_rolls (campaign_id, created_at desc);

alter table public.campaign_dice_rolls enable row level security;

-- Un tiro condiviso lo vede chiunque fa parte della campagna; uno privato solo chi la gestisce.
create policy campaign_dice_rolls_read on public.campaign_dice_rolls for select to authenticated
  using (
    private.campaign_role(campaign_id) is not null
    and (not is_private or private.can_manage_campaign(campaign_id))
  );

-- Chiunque faccia parte della campagna (anche un osservatore: tirare i dadi non è "scrivere" contenuti) può tirare;
-- solo chi gestisce può marcare un tiro come privato, e un personaggio si può usare solo se è il proprio o si gestisce
-- la campagna (stesso permesso delle schede, #34).
create policy campaign_dice_rolls_insert on public.campaign_dice_rolls for insert to authenticated
  with check (
    roller_id = (select auth.uid())
    and private.campaign_role(campaign_id) is not null
    and (not is_private or private.can_manage_campaign(campaign_id))
    and (
      character_id is null
      or exists (
        select 1 from public.characters c
        where c.id = character_id
          and c.campaign_id = campaign_dice_rolls.campaign_id
          and private.can_use_character(c.campaign_id, c.owner_id)
      )
    )
  );

-- Niente update né delete: un tiro è un fatto storico, come le voci di diario e bacheca (#36).
revoke all on public.campaign_dice_rolls from public, anon, authenticated;
grant select,
  insert (campaign_id, roller_id, character_id, label, notation, mode, total, groups, other, is_private)
  on public.campaign_dice_rolls to authenticated;
