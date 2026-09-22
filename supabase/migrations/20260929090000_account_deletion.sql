-- GDPR: cancellazione completa dell'account (#44). Chi cancella l'account non deve possedere mondi o campagne
-- (si trasferiscono o si eliminano prima, con le funzioni già esistenti): senza questo, `worlds.owner_id` e
-- `campaigns.owner_id` (NOT NULL, senza cascata) impedirebbero comunque la cancellazione della riga in
-- `auth.users`. Il contenuto scritto altrove (snippet, relazioni, viste salvate in mondi di ALTRI, dove
-- l'utente era solo editor/lettore) NON si cancella: resta nel mondo di chi lo possiede, ma l'autore diventa
-- l'account segnaposto «Account eliminato» qui sotto (decisione dell'utente: anonimizzare, non cancellare a
-- cascata contenuto altrui). Le altre colonne che puntano a `auth.users` sono già `on delete set null` o
-- `on delete cascade` (verificato su ogni migrazione precedente) e non richiedono altro.

-- Account segnaposto: mai autenticabile (nessuna password, nessuna identità, email non instradabile).
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'deleted-user@worldloom.invalid', null, null, '{}', '{"display_name":"Account eliminato"}', now(), now()
) on conflict (id) do nothing;

-- `created_by` di snippets/relations (D-018 in poi) e saved_views è protetto da un trigger di immutabilità:
-- serve un lasciapassare per transazione, come già fa `set_visibility` per il livello di visibilità.
create or replace function private.forbid_identity_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.world_id is distinct from old.world_id then
    raise exception 'world_id è immutabile' using errcode = '42501';
  end if;
  if tg_table_name in ('snippets', 'relations') and new.created_by is distinct from old.created_by
     and coalesce(current_setting('worldloom.reassign_author', true), '') <> 'on' then
    raise exception 'created_by è immutabile' using errcode = '42501';
  end if;
  return new;
end $$;

create or replace function private.saved_views_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.world_id is distinct from old.world_id or new.kind is distinct from old.kind then
    raise exception 'world_id, created_by e kind sono immutabili' using errcode = '42501';
  end if;
  if new.created_by is distinct from old.created_by
     and coalesce(current_setting('worldloom.reassign_author', true), '') <> 'on' then
    raise exception 'world_id, created_by e kind sono immutabili' using errcode = '42501';
  end if;
  return new;
end $$;

create function public.delete_own_account() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_deleted constant uuid := '00000000-0000-0000-0000-000000000001';
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.worlds where owner_id = v_user) then
    raise exception 'owns_worlds' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.campaigns where owner_id = v_user) then
    raise exception 'owns_campaigns' using errcode = 'P0001';
  end if;

  perform set_config('worldloom.reassign_author', 'on', true);
  update public.snippets set created_by = v_deleted where created_by = v_user;
  update public.relations set created_by = v_deleted where created_by = v_user;
  update public.saved_views set created_by = v_deleted where created_by = v_user;

  -- Tutto il resto (appartenenze, notifiche, note di sessione, mondi/campagne posseduti — già esclusi sopra,
  -- profilo) si cancella da sé: sono `on delete cascade` verso `auth.users`, o l'utente non ne possiede più.
  delete from auth.users where id = v_user;
end;
$$;

revoke all on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;
