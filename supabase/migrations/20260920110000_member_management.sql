-- Gestione membri che la RLS da sola non può esprimere: cercare un utente per email
-- (auth.users non è leggibile dai client) e passare la proprietà in modo atomico.

create function public.add_world_member(p_world uuid, p_email text, p_role public.world_role)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
begin
  -- Blocca la riga del mondo prima del controllo: due chiamate concorrenti si serializzano e
  -- il controllo di proprietà non usa uno stato ormai superato.
  perform 1 from public.worlds where id = p_world for update;
  if not private.is_owner(p_world) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_role = 'owner' then
    raise exception 'invalid_role' using errcode = '22023';
  end if;

  select id into v_user from auth.users where lower(email) = lower(btrim(p_email));
  if v_user is null then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;

  if v_user = (select owner_id from public.worlds where id = p_world) then
    raise exception 'already_owner' using errcode = '22023';
  end if;

  -- Un membro già presente cambia ruolo.
  insert into public.world_members (world_id, user_id, role)
  values (p_world, v_user, p_role)
  on conflict (world_id, user_id) do update set role = excluded.role;
  return v_user;
end $$;

create function public.transfer_world_ownership(p_world uuid, p_new_owner uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  -- Blocca la riga del mondo prima del controllo: due chiamate concorrenti si serializzano e
  -- il controllo di proprietà non usa uno stato ormai superato.
  perform 1 from public.worlds where id = p_world for update;
  if not private.is_owner(p_world) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_new_owner = (select owner_id from public.worlds where id = p_world) then
    raise exception 'already_owner' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.world_members where world_id = p_world and user_id = p_new_owner
  ) then
    raise exception 'not_a_member' using errcode = 'P0002';
  end if;

  -- L'indice univoco ammette un solo proprietario: prima si retrocede il corrente.
  update public.world_members set role = 'editor' where world_id = p_world and role = 'owner';
  update public.world_members set role = 'owner' where world_id = p_world and user_id = p_new_owner;
  update public.worlds set owner_id = p_new_owner where id = p_world;
end $$;

revoke all on function public.add_world_member(uuid, text, public.world_role) from public, anon;
revoke all on function public.transfer_world_ownership(uuid, uuid) from public, anon;
grant execute on function public.add_world_member(uuid, text, public.world_role) to authenticated;
grant execute on function public.transfer_world_ownership(uuid, uuid) to authenticated;
