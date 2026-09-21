-- Schede personaggio (#34). Lo schema di statistiche di una campagna (#33) lo scrive solo il DM; le schede (PG e PNG) le legge e le
-- scrive chi gestisce la campagna (DM e co-DM) e, per il proprio PG, il giocatore. La cronologia delle modifiche la scrive un
-- trigger: chi ha cambiato cosa e quando. Il contenuto dello schema e dei valori lo valida l'applicazione (src/lib/stats);
-- qui restano tipo, dimensione e permessi.

create table public.campaign_stats (
  campaign_id uuid primary key references public.campaigns (id) on delete cascade,
  schema jsonb not null check (jsonb_typeof(schema) = 'object' and pg_column_size(schema) <= 250000),
  -- Numero di revisione: cresce a ogni salvataggio dello schema (serve a rilevare le schede scritte con uno schema più vecchio).
  rev int not null default 1,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

create type public.character_kind as enum ('pc', 'npc');

create table public.characters (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  kind public.character_kind not null,
  name text not null check (length(btrim(name)) between 1 and 120),
  -- Il giocatore a cui appartiene un PG. Un PNG non ha proprietario.
  owner_id uuid references auth.users (id) on delete set null,
  -- Valori: { attributes: {chiave: numero}, resources: {chiave: numero}, lists: {chiave: [ {colonna: valore} ]}, text: {chiave: testo} }.
  sheet jsonb not null default '{}' check (jsonb_typeof(sheet) = 'object' and pg_column_size(sheet) <= 250000),
  notes text not null default '' check (length(notes) <= 20000),
  -- Revisione: il client la rimanda al salvataggio; se non coincide qualcun altro ha salvato prima (conflitto).
  rev int not null default 1,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind = 'pc' or owner_id is null)
);
create index characters_campaign on public.characters (campaign_id, kind, name);
create index characters_owner on public.characters (owner_id) where owner_id is not null;

create table public.character_history (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  changed_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  action text not null check (action in ('create', 'update')),
  -- { "name": [prima, dopo], "attributes.str": [10, 12], "lists.skills": true, "notes": true, ... }
  changes jsonb not null default '{}'
);
create index character_history_character on public.character_history (character_id, created_at desc);

-- Limiti e coerenza -----------------------------------------------------------------------------------

create function private.guard_character() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_role public.campaign_role;
begin
  if tg_op = 'UPDATE' then
    if new.campaign_id is distinct from old.campaign_id or new.created_by is distinct from old.created_by then
      raise exception 'campaign_id e created_by sono immutabili' using errcode = '42501';
    end if;
    -- Chi non gestisce la campagna (il giocatore del proprio PG) non cambia tipo né proprietario.
    if not private.can_manage_campaign(new.campaign_id)
       and (new.kind is distinct from old.kind or new.owner_id is distinct from old.owner_id) then
      raise exception 'solo chi gestisce la campagna cambia tipo e proprietario' using errcode = '42501';
    end if;
    new.rev := old.rev + 1;
  end if;

  if new.owner_id is not null then
    select role into v_role from public.campaign_members
      where campaign_id = new.campaign_id and user_id = new.owner_id;
    if v_role is null or v_role = 'observer' then
      raise exception 'il proprietario deve essere un giocatore della campagna' using errcode = '23514';
    end if;
  end if;

  if tg_op = 'INSERT' then
    if (select count(*) from public.characters where campaign_id = new.campaign_id) >= 500 then
      raise exception 'too_many_characters' using errcode = '54000';
    end if;
    if new.owner_id is not null
       and (select count(*) from public.characters where campaign_id = new.campaign_id and owner_id = new.owner_id) >= 10 then
      raise exception 'too_many_characters' using errcode = '54000';
    end if;
  end if;
  return new;
end $$;
create trigger characters_guard before insert or update on public.characters
  for each row execute function private.guard_character();
create trigger characters_touch before update on public.characters
  for each row execute function private.touch_updated_at();

create function private.touch_campaign_stats() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    new.rev := old.rev + 1;
  end if;
  new.updated_at := now();
  new.updated_by := (select auth.uid());
  return new;
end $$;
create trigger campaign_stats_touch before insert or update on public.campaign_stats
  for each row execute function private.touch_campaign_stats();

-- Cronologia: un trigger confronta il prima e il dopo. Numeri: [prima, dopo]; liste, testi e note: solo «cambiato» (true), per
-- non copiare testi lunghi. Si conservano le ultime 200 voci per scheda.
create function private.log_character_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_changes jsonb := '{}';
  v_section text;
  v_key text;
  v_old jsonb;
  v_new jsonb;
begin
  if tg_op = 'INSERT' then
    insert into public.character_history (character_id, campaign_id, changed_by, action, changes)
    values (new.id, new.campaign_id, (select auth.uid()), 'create', jsonb_build_object('name', jsonb_build_array(null, new.name)));
    return new;
  end if;

  if new.name is distinct from old.name then
    v_changes := v_changes || jsonb_build_object('name', jsonb_build_array(old.name, new.name));
  end if;
  if new.owner_id is distinct from old.owner_id then
    v_changes := v_changes || jsonb_build_object('owner', jsonb_build_array(old.owner_id, new.owner_id));
  end if;
  if new.kind is distinct from old.kind then
    v_changes := v_changes || jsonb_build_object('kind', jsonb_build_array(old.kind, new.kind));
  end if;
  if new.notes is distinct from old.notes then
    v_changes := v_changes || jsonb_build_object('notes', true);
  end if;
  foreach v_section in array array['attributes', 'resources', 'lists', 'text'] loop
    for v_key in
      select k from (
        select jsonb_object_keys(case when jsonb_typeof(old.sheet -> v_section) = 'object' then old.sheet -> v_section else '{}' end) as k
        union
        select jsonb_object_keys(case when jsonb_typeof(new.sheet -> v_section) = 'object' then new.sheet -> v_section else '{}' end)
      ) keys
    loop
      v_old := old.sheet -> v_section -> v_key;
      v_new := new.sheet -> v_section -> v_key;
      if v_old is distinct from v_new then
        v_changes := v_changes || jsonb_build_object(
          v_section || '.' || v_key,
          case when v_section in ('attributes', 'resources') then jsonb_build_array(v_old, v_new) else 'true'::jsonb end
        );
      end if;
    end loop;
  end loop;

  if v_changes <> '{}' then
    insert into public.character_history (character_id, campaign_id, changed_by, action, changes)
    values (new.id, new.campaign_id, (select auth.uid()), 'update', v_changes);
    delete from public.character_history
      where id in (
        select id from public.character_history where character_id = new.id
        order by created_at desc offset 200
      );
  end if;
  return new;
end $$;
create trigger characters_log after insert or update on public.characters
  for each row execute function private.log_character_change();

revoke all on function private.guard_character(), private.touch_campaign_stats(), private.log_character_change()
  from public, anon, authenticated;

-- Permessi (RLS) --------------------------------------------------------------------------------------

-- Chi legge e scrive una scheda: chi gestisce la campagna, oppure il giocatore proprietario (che deve ancora essere giocatore).
create function private.can_use_character(c uuid, o uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.can_manage_campaign(c)
    or (o is not null and o = (select auth.uid()) and private.campaign_role(c) = 'player')
$$;
revoke all on function private.can_use_character(uuid, uuid) from public, anon;
grant execute on function private.can_use_character(uuid, uuid) to authenticated;

alter table public.campaign_stats enable row level security;
alter table public.characters enable row level security;
alter table public.character_history enable row level security;

-- Lo schema lo leggono tutti i membri (la scheda si genera da esso) e lo scrive solo il DM.
create policy campaign_stats_read on public.campaign_stats for select to authenticated
  using (private.campaign_role(campaign_id) is not null);
create policy campaign_stats_insert on public.campaign_stats for insert to authenticated
  with check (private.campaign_role(campaign_id) = 'dm');
create policy campaign_stats_update on public.campaign_stats for update to authenticated
  using (private.campaign_role(campaign_id) = 'dm')
  with check (private.campaign_role(campaign_id) = 'dm');
create policy campaign_stats_delete on public.campaign_stats for delete to authenticated
  using (private.campaign_role(campaign_id) = 'dm');

create policy characters_read on public.characters for select to authenticated
  using (private.can_use_character(campaign_id, owner_id));
-- Chi gestisce crea PG (con proprietario) e PNG; un giocatore crea solo un PG per sé.
create policy characters_insert on public.characters for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (
      private.can_manage_campaign(campaign_id)
      or (kind = 'pc' and owner_id = (select auth.uid()) and private.campaign_role(campaign_id) = 'player')
    )
  );
create policy characters_update on public.characters for update to authenticated
  using (private.can_use_character(campaign_id, owner_id))
  with check (private.can_use_character(campaign_id, owner_id));
create policy characters_delete on public.characters for delete to authenticated
  using (private.can_use_character(campaign_id, owner_id));

-- La cronologia la legge chi legge la scheda (la RLS di `characters` si applica alla sottoquery); nessuno la scrive.
create policy character_history_read on public.character_history for select to authenticated
  using (character_id in (select id from public.characters));

revoke all on public.campaign_stats, public.characters, public.character_history from public, anon, authenticated;
grant select, insert (campaign_id, schema), update (schema), delete on public.campaign_stats to authenticated;
grant select, insert (campaign_id, kind, name, owner_id, sheet, notes, created_by),
  update (kind, name, owner_id, sheet, notes), delete on public.characters to authenticated;
grant select on public.character_history to authenticated;
