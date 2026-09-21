-- Campagne e inviti (#31). Una campagna può essere legata a un mondo o autonoma; ha un DM (chi la crea, uno solo), co-DM,
-- giocatori e osservatori. Si entra con un invito: un link con token (chiunque lo abbia) o legato a un'email (solo chi ha
-- quell'account). La visibilità dei contenuti del mondo ai giocatori arriva con #32: qui solo appartenenza e ruoli.

create type public.campaign_role as enum ('dm', 'co_dm', 'player', 'observer');

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 120),
  description text not null default '' check (length(description) <= 2000),
  -- Mondo collegato (facoltativo). Se il mondo viene eliminato la campagna diventa autonoma.
  world_id uuid references public.worlds (id) on delete set null,
  owner_id uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index campaigns_world on public.campaigns (world_id) where world_id is not null;

create table public.campaign_members (
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.campaign_role not null,
  created_at timestamptz not null default now(),
  primary key (campaign_id, user_id)
);
create index campaign_members_user on public.campaign_members (user_id);
-- Un solo DM per campagna: il co-DM è il ruolo per chi lo aiuta.
create unique index campaign_members_one_dm on public.campaign_members (campaign_id) where role = 'dm';

-- Invito: `token` è una credenziale al portatore (256 bit casuali), quindi lo leggono solo DM e co-DM. Con `email` lo può usare
-- solo l'utente con quell'account. Nessun invito per il ruolo DM.
create table public.campaign_invites (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  token text not null unique
    default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  role public.campaign_role not null check (role in ('co_dm', 'player', 'observer')),
  email text check (email is null or (length(email) <= 254 and email = lower(btrim(email)))),
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  max_uses int not null default 1 check (max_uses between 1 and 100),
  -- L'invito personale vale una volta sola.
  check (email is null or max_uses = 1),
  uses int not null default 0 check (uses >= 0),
  revoked_at timestamptz
);
create index campaign_invites_campaign on public.campaign_invites (campaign_id);

create trigger campaigns_touch before update on public.campaigns
  for each row execute function private.touch_updated_at();

-- Autorizzazione (security definer: legge i membri senza passare dalla loro RLS) ---------------------

create function private.campaign_role(c uuid) returns public.campaign_role
language sql stable security definer set search_path = '' as $$
  select role from public.campaign_members where campaign_id = c and user_id = (select auth.uid())
$$;

create function private.can_manage_campaign(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.campaign_role(c) in ('dm', 'co_dm'), false)
$$;

create function private.add_campaign_dm() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.campaign_members (campaign_id, user_id, role) values (new.id, new.owner_id, 'dm');
  return new;
end $$;
create trigger campaigns_add_dm after insert on public.campaigns
  for each row execute function private.add_campaign_dm();

-- Il proprietario non cambia; il mondo collegato lo cambia solo il DM, e deve essere uno di cui fa parte.
create function private.guard_campaign_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception 'owner_id è immutabile' using errcode = '42501';
  end if;
  -- Il collegamento che decade perché il mondo è stato eliminato (azione di chiave esterna, un livello di trigger più in
  -- profondità) passa: chi elimina il mondo può essere una persona diversa dal DM.
  if new.world_id is null and old.world_id is not null and pg_trigger_depth() > 1 then
    return new;
  end if;
  if new.world_id is distinct from old.world_id and (select auth.uid()) is distinct from old.owner_id then
    raise exception 'solo il DM cambia il mondo collegato' using errcode = '42501';
  end if;
  if new.world_id is distinct from old.world_id and new.world_id is not null
     and private.world_role(new.world_id) is null then
    raise exception 'mondo non accessibile' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger campaigns_guard before update on public.campaigns
  for each row execute function private.guard_campaign_update();

revoke all on function private.campaign_role(uuid), private.can_manage_campaign(uuid) from public, anon;
grant execute on function private.campaign_role(uuid), private.can_manage_campaign(uuid) to authenticated;
revoke all on function private.add_campaign_dm(), private.guard_campaign_update() from public, anon, authenticated;

-- RLS -----------------------------------------------------------------------------------------------

alter table public.campaigns enable row level security;
alter table public.campaign_members enable row level security;
alter table public.campaign_invites enable row level security;

create policy campaigns_read on public.campaigns for select to authenticated
  using (owner_id = (select auth.uid()) or private.campaign_role(id) is not null);
-- Chi crea è il DM; il mondo collegato deve essere uno di cui fa parte.
create policy campaigns_insert on public.campaigns for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and (world_id is null or private.world_role(world_id) is not null)
  );
create policy campaigns_update on public.campaigns for update to authenticated
  using (private.can_manage_campaign(id))
  with check (private.can_manage_campaign(id));
create policy campaigns_delete on public.campaigns for delete to authenticated
  using (private.campaign_role(id) = 'dm');

-- I membri si cambiano solo con le funzioni sotto (nessuna scrittura diretta).
create policy campaign_members_read on public.campaign_members for select to authenticated
  using (private.campaign_role(campaign_id) is not null);

-- Il co-DM vede e crea solo inviti per giocatori e osservatori.
create policy campaign_invites_read on public.campaign_invites for select to authenticated
  using (
    private.campaign_role(campaign_id) = 'dm'
    or (private.campaign_role(campaign_id) = 'co_dm' and role in ('player', 'observer'))
  );
create policy campaign_invites_insert on public.campaign_invites for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and expires_at > now() and expires_at <= now() + interval '90 days'
    and (
      private.campaign_role(campaign_id) = 'dm'
      or (private.campaign_role(campaign_id) = 'co_dm' and role in ('player', 'observer'))
    )
  );
create policy campaign_invites_update on public.campaign_invites for update to authenticated
  using (
    private.campaign_role(campaign_id) = 'dm'
    or (private.campaign_role(campaign_id) = 'co_dm' and role in ('player', 'observer'))
  )
  with check (
    private.campaign_role(campaign_id) = 'dm'
    or (private.campaign_role(campaign_id) = 'co_dm' and role in ('player', 'observer'))
  );

revoke all on public.campaigns, public.campaign_members, public.campaign_invites from public, anon, authenticated;
grant select, insert (name, description, world_id, owner_id), update (name, description, world_id), delete
  on public.campaigns to authenticated;
grant select on public.campaign_members to authenticated;
-- Il token e i contatori non si scrivono dal client: il token nasce dal default, `uses` cambia solo accettando.
grant select on public.campaign_invites to authenticated;
grant insert (campaign_id, role, email, created_by, expires_at, max_uses) on public.campaign_invites to authenticated;
grant update (revoked_at) on public.campaign_invites to authenticated;

-- Chi è nella stessa campagna vede il nome degli altri membri.
drop policy profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using (
  id = (select auth.uid())
  or exists (
    select 1 from public.world_members mine
    join public.world_members theirs on theirs.world_id = mine.world_id
    where mine.user_id = (select auth.uid()) and theirs.user_id = profiles.id
  )
  or exists (
    select 1 from public.campaign_members mine
    join public.campaign_members theirs on theirs.campaign_id = mine.campaign_id
    where mine.user_id = (select auth.uid()) and theirs.user_id = profiles.id
  )
);

-- Funzioni ------------------------------------------------------------------------------------------

-- Cambia il ruolo di un membro. Il DM assegna co-DM, giocatore, osservatore; il co-DM solo giocatore e osservatore, e solo
-- a chi lo è già. Il DM non si cambia. La riga della campagna è bloccata: due chiamate concorrenti si serializzano.
create function public.set_campaign_member_role(p_campaign uuid, p_user uuid, p_role public.campaign_role)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me public.campaign_role;
  v_target public.campaign_role;
begin
  perform 1 from public.campaigns where id = p_campaign for update;
  v_me := private.campaign_role(p_campaign);
  if v_me is null or v_me not in ('dm', 'co_dm') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_role = 'dm' then
    raise exception 'invalid_role' using errcode = '22023';
  end if;
  select role into v_target from public.campaign_members where campaign_id = p_campaign and user_id = p_user;
  if v_target is null then
    raise exception 'not_a_member' using errcode = 'P0002';
  end if;
  if v_target = 'dm' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_me = 'co_dm' and (v_target not in ('player', 'observer') or p_role not in ('player', 'observer')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.campaign_members set role = p_role where campaign_id = p_campaign and user_id = p_user;
end $$;

-- Toglie un membro. Il DM non si toglie; il co-DM toglie solo giocatori e osservatori.
create function public.remove_campaign_member(p_campaign uuid, p_user uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me public.campaign_role;
  v_target public.campaign_role;
begin
  perform 1 from public.campaigns where id = p_campaign for update;
  v_me := private.campaign_role(p_campaign);
  if v_me is null or v_me not in ('dm', 'co_dm') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select role into v_target from public.campaign_members where campaign_id = p_campaign and user_id = p_user;
  if v_target is null then
    raise exception 'not_a_member' using errcode = 'P0002';
  end if;
  if v_target = 'dm' or (v_me = 'co_dm' and v_target not in ('player', 'observer')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  delete from public.campaign_members where campaign_id = p_campaign and user_id = p_user;
end $$;

-- Esce dalla campagna. Il DM non può: la elimina.
create function public.leave_campaign(p_campaign uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me public.campaign_role;
begin
  perform 1 from public.campaigns where id = p_campaign for update;
  v_me := private.campaign_role(p_campaign);
  if v_me is null then
    raise exception 'not_a_member' using errcode = 'P0002';
  end if;
  if v_me = 'dm' then
    raise exception 'owner_cannot_leave' using errcode = '22023';
  end if;
  delete from public.campaign_members where campaign_id = p_campaign and user_id = (select auth.uid());
end $$;

-- Cosa offre un invito valido a chi lo apre (nome della campagna e ruolo). Nulla se il token non vale per questo utente:
-- inesistente, scaduto, revocato, esaurito o legato a un'altra email sono indistinguibili.
create function public.preview_campaign_invite(p_token text)
returns table (campaign_name text, role public.campaign_role, already_member boolean)
language sql stable security definer set search_path = '' as $$
  select c.name, i.role, exists (
    select 1 from public.campaign_members m where m.campaign_id = c.id and m.user_id = (select auth.uid())
  )
  from public.campaign_invites i
  join public.campaigns c on c.id = i.campaign_id
  where i.token = p_token
    and (select auth.uid()) is not null
    and i.revoked_at is null and i.expires_at > now() and i.uses < i.max_uses
    and (
      i.email is null
      or i.email = (
        select lower(u.email) from auth.users u
        where u.id = (select auth.uid()) and u.email_confirmed_at is not null
      )
    )
$$;

-- Accetta un invito: aggiunge l'utente con il ruolo dell'invito e consuma un uso. Chi è già membro non consuma nulla.
create function public.accept_campaign_invite(p_token text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := (select auth.uid());
  v_invite public.campaign_invites;
begin
  if v_me is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_invite from public.campaign_invites where token = p_token for update;
  if v_invite.id is null
     or v_invite.revoked_at is not null or v_invite.expires_at <= now() or v_invite.uses >= v_invite.max_uses
     or (
       v_invite.email is not null
       and v_invite.email is distinct from (
         select lower(u.email) from auth.users u where u.id = v_me and u.email_confirmed_at is not null
       )
     ) then
    raise exception 'invalid_invite' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.campaign_members where campaign_id = v_invite.campaign_id and user_id = v_me
  ) then
    raise exception 'already_member' using errcode = '22023';
  end if;
  insert into public.campaign_members (campaign_id, user_id, role)
  values (v_invite.campaign_id, v_me, v_invite.role);
  update public.campaign_invites set uses = uses + 1 where id = v_invite.id;
  return v_invite.campaign_id;
end $$;

revoke all on function
  public.set_campaign_member_role(uuid, uuid, public.campaign_role),
  public.remove_campaign_member(uuid, uuid),
  public.leave_campaign(uuid),
  public.preview_campaign_invite(text),
  public.accept_campaign_invite(text)
from public, anon;
grant execute on function
  public.set_campaign_member_role(uuid, uuid, public.campaign_role),
  public.remove_campaign_member(uuid, uuid),
  public.leave_campaign(uuid),
  public.preview_campaign_invite(text),
  public.accept_campaign_invite(text)
to authenticated;
