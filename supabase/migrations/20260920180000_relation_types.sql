-- Tipi di relazione: etichetta (con inversa) e vincoli opzionali sulle categorie collegabili.
-- Se l'etichetta di una relazione coincide con quella di un tipo, valgono i suoi vincoli; il tipo fornisce anche
-- l'etichetta inversa se manca. Le relazioni con etichette senza tipo restano libere.

-- Etichetta normalizzata come fa l'app: spazi (anche non separabili) collassati, ai lati tolti, minuscole.
-- Vale per indici e trigger, così chi scrive via API non aggira i vincoli con spazi doppi o tabulazioni.
create or replace function private.norm_label(t text) returns text
language sql immutable set search_path = '' as $$
  select lower(btrim(regexp_replace(translate(t, chr(160), ' '), '[[:space:]]+', ' ', 'g')))
$$;
grant execute on function private.norm_label(text) to anon, authenticated;

create table public.relation_types (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.worlds (id) on delete cascade,
  label text not null check (length(btrim(label)) between 1 and 120),
  inverse_label text check (inverse_label is null or length(btrim(inverse_label)) between 1 and 120),
  source_category_id uuid,
  target_category_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Se la categoria viene eliminata il vincolo decade (l'etichetta resta un tipo senza quel limite).
  foreign key (world_id, source_category_id) references public.categories (world_id, id)
    on delete set null (source_category_id),
  foreign key (world_id, target_category_id) references public.categories (world_id, id)
    on delete set null (target_category_id)
);
create unique index relation_types_label on public.relation_types (world_id, private.norm_label(label));

-- Anche i doppioni tra relazioni usano la stessa normalizzazione.
drop index if exists public.relations_no_duplicates;
create unique index relations_no_duplicates
  on public.relations (source_id, target_id, private.norm_label(label));
create trigger relation_types_touch before update on public.relation_types
  for each row execute function private.touch_updated_at();

alter table public.relation_types enable row level security;
create policy relation_types_read on public.relation_types for select to authenticated
  using (private.world_role(world_id) is not null);
create policy relation_types_write on public.relation_types for all to authenticated
  using (private.can_write(world_id)) with check (private.can_write(world_id));

-- World immutabile, come per categorie e relazioni.
create trigger relation_types_world_immutable before update on public.relation_types
  for each row execute function private.forbid_world_change();

create or replace function private.enforce_relation_type() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  t public.relation_types;
begin
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

revoke all on function private.enforce_relation_type() from public, anon, authenticated;

create trigger relations_enforce_type before insert or update of label, source_id, target_id on public.relations
  for each row execute function private.enforce_relation_type();
