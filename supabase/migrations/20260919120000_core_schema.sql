-- Schema di base: mondi, membri, categorie, snippet, relazioni.
-- Multi-tenancy e visibilità sono imposti qui (RLS + chiavi esterne composite), non nel codice applicativo.

create type public.world_role as enum ('owner', 'editor', 'commenter', 'reader');
create type public.visibility as enum ('secret', 'shared', 'members', 'public');
create type public.snippet_status as enum ('draft', 'final');

create schema private;
grant usage on schema private to anon, authenticated;

create function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- Profili -------------------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now()
);

create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1), ''));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- Mondi e membri ------------------------------------------------------------------------------

create table public.worlds (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 120),
  owner_id uuid not null references auth.users (id),
  settings jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger worlds_touch before update on public.worlds
  for each row execute function private.touch_updated_at();

create table public.world_members (
  world_id uuid not null references public.worlds (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.world_role not null,
  created_at timestamptz not null default now(),
  primary key (world_id, user_id)
);
create index on public.world_members (user_id);
-- Un solo proprietario per mondo.
create unique index world_members_one_owner on public.world_members (world_id) where role = 'owner';

-- Funzioni di autorizzazione (security definer: leggono i membri senza passare dalla loro RLS).
create function private.world_role(w uuid) returns public.world_role
language sql stable security definer set search_path = '' as $$
  select role from public.world_members where world_id = w and user_id = (select auth.uid())
$$;

create function private.can_write(w uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.world_role(w) in ('owner', 'editor'), false)
$$;

create function private.is_owner(w uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.world_role(w) = 'owner', false)
$$;

-- Regola di lettura per elemento. 'shared' (giocatori scelti) resta chiuso ai non-editor finché
-- non esistono i permessi per singolo utente (campagne, issue #32): fallire chiuso è la scelta sicura.
create function private.can_read(w uuid, v public.visibility) returns boolean
language sql stable security definer set search_path = '' as $$
  select case private.world_role(w)
    when 'owner' then true
    when 'editor' then true
    when 'commenter' then v in ('members', 'public')
    when 'reader' then v in ('members', 'public')
    else v = 'public'
  end
$$;

create function private.add_owner_member() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.world_members (world_id, user_id, role) values (new.id, new.owner_id, 'owner');
  return new;
end $$;
create trigger worlds_add_owner after insert on public.worlds
  for each row execute function private.add_owner_member();

-- Categorie -----------------------------------------------------------------------------------

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.worlds (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  icon text,
  color text,
  fields_schema jsonb not null default '[]',
  content_template jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (world_id, id)
);
create trigger categories_touch before update on public.categories
  for each row execute function private.touch_updated_at();

-- Snippet -------------------------------------------------------------------------------------

create table public.snippets (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.worlds (id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 300),
  body jsonb not null default '{}',
  fields jsonb not null default '{}',
  tags text[] not null default '{}',
  aliases text[] not null default '{}',
  status public.snippet_status not null default 'draft',
  visibility public.visibility not null default 'members',
  archived_at timestamptz,
  deleted_at timestamptz,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (world_id, id)
);
create index on public.snippets (world_id) where deleted_at is null;
create trigger snippets_touch before update on public.snippets
  for each row execute function private.touch_updated_at();

create table public.snippet_categories (
  world_id uuid not null,
  snippet_id uuid not null,
  category_id uuid not null,
  primary key (snippet_id, category_id),
  foreign key (world_id, snippet_id) references public.snippets (world_id, id) on delete cascade,
  foreign key (world_id, category_id) references public.categories (world_id, id) on delete cascade
);

-- Relazioni -----------------------------------------------------------------------------------

create table public.relations (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.worlds (id) on delete cascade,
  source_id uuid not null,
  target_id uuid not null,
  label text not null check (length(btrim(label)) between 1 and 120),
  inverse_label text check (inverse_label is null or length(btrim(inverse_label)) between 1 and 120),
  notes text not null default '',
  valid_from jsonb,
  valid_to jsonb,
  fields jsonb not null default '{}',
  visibility public.visibility not null default 'members',
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Le chiavi composite impediscono a livello dati di collegare snippet di mondi diversi.
  foreign key (world_id, source_id) references public.snippets (world_id, id) on delete cascade,
  foreign key (world_id, target_id) references public.snippets (world_id, id) on delete cascade,
  check (source_id <> target_id)
);
create index on public.relations (world_id, source_id);
create index on public.relations (world_id, target_id);
create trigger relations_touch before update on public.relations
  for each row execute function private.touch_updated_at();

-- RLS -----------------------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.worlds enable row level security;
alter table public.world_members enable row level security;
alter table public.categories enable row level security;
alter table public.snippets enable row level security;
alter table public.snippet_categories enable row level security;
alter table public.relations enable row level security;

create policy profiles_read on public.profiles for select to authenticated using (
  id = (select auth.uid())
  or exists (
    select 1 from public.world_members mine
    join public.world_members theirs on theirs.world_id = mine.world_id
    where mine.user_id = (select auth.uid()) and theirs.user_id = profiles.id
  )
);
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy worlds_read on public.worlds for select to authenticated
  using (owner_id = (select auth.uid()) or private.world_role(id) is not null);
create policy worlds_insert on public.worlds for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy worlds_update on public.worlds for update to authenticated
  using (private.is_owner(id)) with check (private.is_owner(id) and owner_id = (select auth.uid()));
create policy worlds_delete on public.worlds for delete to authenticated
  using (private.is_owner(id));

create policy members_read on public.world_members for select to authenticated
  using (private.world_role(world_id) is not null);
create policy members_insert on public.world_members for insert to authenticated
  with check (private.is_owner(world_id) and role <> 'owner');
create policy members_update on public.world_members for update to authenticated
  using (private.is_owner(world_id) and role <> 'owner')
  with check (private.is_owner(world_id) and role <> 'owner');
create policy members_delete on public.world_members for delete to authenticated
  using ((private.is_owner(world_id) or user_id = (select auth.uid())) and role <> 'owner');

create policy categories_read on public.categories for select to authenticated
  using (private.world_role(world_id) is not null);
create policy categories_write on public.categories for all to authenticated
  using (private.can_write(world_id)) with check (private.can_write(world_id));

create policy snippets_read on public.snippets for select to anon, authenticated
  using (private.can_read(world_id, visibility) and (deleted_at is null or private.can_write(world_id)));
create policy snippets_insert on public.snippets for insert to authenticated
  with check (private.can_write(world_id) and created_by = (select auth.uid()));
create policy snippets_update on public.snippets for update to authenticated
  using (private.can_write(world_id)) with check (private.can_write(world_id));
create policy snippets_delete on public.snippets for delete to authenticated
  using (private.can_write(world_id));

create policy snippet_categories_read on public.snippet_categories for select to authenticated
  using (exists (select 1 from public.snippets s where s.id = snippet_id));
create policy snippet_categories_write on public.snippet_categories for all to authenticated
  using (private.can_write(world_id)) with check (private.can_write(world_id));

-- Una relazione è leggibile solo se lo è anche per i suoi estremi (le sotto-query rispettano la RLS
-- di chi legge), così un'etichetta non rivela mai l'esistenza di uno snippet segreto.
create policy relations_read on public.relations for select to anon, authenticated using (
  private.can_read(world_id, visibility)
  and exists (select 1 from public.snippets s where s.id = source_id)
  and exists (select 1 from public.snippets s where s.id = target_id)
);
create policy relations_insert on public.relations for insert to authenticated
  with check (private.can_write(world_id) and created_by = (select auth.uid()));
create policy relations_update on public.relations for update to authenticated
  using (private.can_write(world_id)) with check (private.can_write(world_id));
create policy relations_delete on public.relations for delete to authenticated
  using (private.can_write(world_id));

-- Le funzioni di autorizzazione non devono essere richiamabili come RPC dall'esterno.
revoke all on function private.world_role(uuid), private.can_write(uuid), private.is_owner(uuid),
  private.can_read(uuid, public.visibility) from public;
grant execute on function private.world_role(uuid), private.can_write(uuid), private.is_owner(uuid),
  private.can_read(uuid, public.visibility) to anon, authenticated;

-- Campi immutabili: world_id non si sposta (le FK composite non bastano per righe senza figli) e
-- created_by non si falsifica.
create function private.forbid_identity_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.world_id is distinct from old.world_id then
    raise exception 'world_id è immutabile' using errcode = '42501';
  end if;
  if tg_table_name in ('snippets', 'relations') and new.created_by is distinct from old.created_by then
    raise exception 'created_by è immutabile' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger snippets_immutable before update on public.snippets
  for each row execute function private.forbid_identity_change();
create trigger relations_immutable before update on public.relations
  for each row execute function private.forbid_identity_change();
create trigger categories_immutable before update on public.categories
  for each row execute function private.forbid_identity_change();
