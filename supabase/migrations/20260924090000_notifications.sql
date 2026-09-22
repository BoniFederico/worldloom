-- Notifiche in-app (#37): rivelazioni, nuove sessioni, menzioni e inviti. Ogni notifica è per un solo destinatario e nasce
-- solo da una funzione `security definer` (mai da una scrittura diretta): il client legge e segna «letta», nient'altro.
--
--  * `reveal`: chi riceve una rivelazione (D-032). «shared» notifica i destinatari scelti; «members»/«public» tutti i
--    membri del mondo. Agganciata a `set_visibility`.
--  * `session`: tutti i membri della campagna quando il DM crea una sessione (#36), tranne chi l'ha creata.
--  * `mention`: l'autore dello snippet citato, quando una menzione (@) crea una nuova relazione verso il suo snippet (#18).
--    Le menzioni oggi collegano solo snippet, mai persone: non esiste una @menzione di un membro.
--  * `invite_received` / `invite_accepted`: un invito per email (#31) che corrisponde a un account già registrato notifica
--    subito quell'utente; quando un invito (per email o a link) viene accettato, notifica chi lo ha creato.
--
-- `private.notify` è il solo punto di scrittura: salta in silenzio se il destinatario è la stessa persona che ha causato
-- l'evento (nessuno si notifica da solo) o se non è noto.

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('reveal', 'session', 'mention', 'invite_received', 'invite_accepted')),
  world_id uuid references public.worlds (id) on delete cascade,
  campaign_id uuid references public.campaigns (id) on delete cascade,
  data jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  check (
    (kind in ('reveal', 'mention') and world_id is not null and campaign_id is null)
    or (kind in ('session', 'invite_received', 'invite_accepted') and campaign_id is not null and world_id is null)
  )
);
create index notifications_user on public.notifications (user_id, created_at desc);
create index notifications_user_unread on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;

create policy notifications_read on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
-- L'unica scrittura concessa al client è segnare una notifica come letta (o non letta) della propria.
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.notifications from public, anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

-- Scrittura ---------------------------------------------------------------------------------------

create function private.notify(p_user uuid, p_kind text, p_world uuid, p_campaign uuid, p_data jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_user is null or p_user = (select auth.uid()) then
    return;
  end if;
  insert into public.notifications (user_id, kind, world_id, campaign_id, data)
  values (p_user, p_kind, p_world, p_campaign, coalesce(p_data, '{}'::jsonb));
end $$;

-- Chiamata anche da `private.sync_mentions`, che è `security invoker`: deve poter scrivere per un altro utente.
revoke all on function private.notify(uuid, text, uuid, uuid, jsonb) from public, anon;
grant execute on function private.notify(uuid, text, uuid, uuid, jsonb) to authenticated;

-- Rivelazioni (#32) ---------------------------------------------------------------------------------

-- Uguale a `set_visibility` della migrazione di #32, con l'aggiunta delle notifiche ai destinatari della rivelazione.
create or replace function public.set_visibility(
  p_kind text,
  p_item uuid,
  p_field text,
  p_level public.visibility,
  p_users uuid[] default '{}',
  p_session uuid default null,
  p_note text default ''
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_world uuid;
  v_from text;
  v_old_users uuid[];
  v_users uuid[];
  v_key text := coalesce(p_field, '');
  v_value jsonb;
  v_snippet public.snippets;
  v_is_reveal boolean;
begin
  if p_kind not in ('snippet', 'relation', 'pin', 'field') then
    raise exception 'invalid_kind' using errcode = '22023';
  end if;
  perform set_config('worldloom.set_visibility', 'on', true);
  if (p_kind = 'field') <> (v_key <> '') or (p_kind = 'field' and v_key !~ '^[a-z][a-z0-9_]{0,39}$') then
    raise exception 'invalid_field' using errcode = '22023';
  end if;
  if length(coalesce(p_note, '')) > 500 then
    raise exception 'invalid_note' using errcode = '22023';
  end if;

  if p_kind = 'snippet' then
    select world_id, visibility::text into v_world, v_from
      from public.snippets where id = p_item and deleted_at is null for update;
  elsif p_kind = 'relation' then
    select world_id, visibility::text into v_world, v_from from public.relations where id = p_item for update;
  elsif p_kind = 'pin' then
    select world_id, visibility::text into v_world, v_from from public.map_pins where id = p_item for update;
  else
    select * into v_snippet from public.snippets where id = p_item and deleted_at is null for update;
    v_world := v_snippet.world_id;
    v_from := coalesce(
      (select visibility::text from public.snippet_restricted_fields where snippet_id = p_item and key = v_key),
      'members'
    );
  end if;
  if v_world is null or not private.can_write(v_world) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_users := coalesce(array(select distinct u from unnest(coalesce(p_users, '{}')) as u), '{}');
  if p_level = 'shared' then
    if cardinality(v_users) = 0 then
      raise exception 'users_required' using errcode = '22023';
    end if;
    if exists (
      select 1 from unnest(v_users) as u
       where not exists (select 1 from public.world_members m where m.world_id = v_world and m.user_id = u)
    ) then
      raise exception 'invalid_users' using errcode = '22023';
    end if;
  else
    v_users := '{}';
  end if;

  v_old_users := coalesce(
    array(
      select user_id from public.visibility_shares
       where kind = p_kind and item_id = p_item and field_key = v_key
    ),
    '{}'
  );
  if v_from = p_level::text and v_users <@ v_old_users and v_old_users <@ v_users then
    return; -- nulla da cambiare
  end if;

  if p_kind = 'snippet' then
    update public.snippets set visibility = p_level where id = p_item;
  elsif p_kind = 'relation' then
    update public.relations set visibility = p_level where id = p_item;
  elsif p_kind = 'pin' then
    update public.map_pins set visibility = p_level where id = p_item;
  elsif p_level in ('secret', 'shared') then
    v_value := coalesce(
      (select value from public.snippet_restricted_fields where snippet_id = p_item and key = v_key),
      v_snippet.fields -> v_key,
      'null'::jsonb
    );
    insert into public.snippet_restricted_fields (snippet_id, world_id, key, value, visibility)
    values (p_item, v_world, v_key, v_value, p_level)
    on conflict (snippet_id, key) do update set visibility = excluded.visibility;
    update public.snippets set fields = fields - v_key where id = p_item;
  else
    select value into v_value from public.snippet_restricted_fields where snippet_id = p_item and key = v_key;
    delete from public.snippet_restricted_fields where snippet_id = p_item and key = v_key;
    if v_value is not null and v_value <> 'null'::jsonb then
      update public.snippets set fields = jsonb_set(fields, array[v_key], v_value) where id = p_item;
    end if;
  end if;

  delete from public.visibility_shares where kind = p_kind and item_id = p_item and field_key = v_key;
  if p_level = 'shared' then
    insert into public.visibility_shares (world_id, kind, item_id, field_key, user_id, created_by)
    select v_world, p_kind, p_item, v_key, u, (select auth.uid()) from unnest(v_users) as u;
  end if;

  v_is_reveal := private.visibility_rank(p_level::text) > private.visibility_rank(v_from)
    or (p_level = 'shared' and v_from = 'shared' and not (v_users <@ v_old_users));

  insert into public.visibility_log
    (world_id, kind, item_id, field_key, from_level, to_level, shared_with, is_reveal, session_id, note, changed_by)
  values (
    v_world, p_kind, p_item, v_key, v_from, p_level::text, v_users, v_is_reveal,
    p_session, coalesce(p_note, ''), (select auth.uid())
  );

  if v_is_reveal then
    if p_level = 'shared' then
      perform private.notify(
        u, 'reveal', v_world, null,
        jsonb_build_object('itemKind', p_kind, 'itemId', p_item, 'fieldKey', v_key, 'toLevel', p_level::text)
      )
      from unnest(v_users) as u;
    elsif p_level in ('members', 'public') then
      perform private.notify(
        m.user_id, 'reveal', v_world, null,
        jsonb_build_object('itemKind', p_kind, 'itemId', p_item, 'fieldKey', v_key, 'toLevel', p_level::text)
      )
      from public.world_members m where m.world_id = v_world;
    end if;
  end if;
end $$;

revoke all on function public.set_visibility(text, uuid, text, public.visibility, uuid[], uuid, text) from public, anon;
grant execute on function public.set_visibility(text, uuid, text, public.visibility, uuid[], uuid, text) to authenticated;

-- Sessioni (#36) -------------------------------------------------------------------------------------

create function private.notify_new_session() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.notify(
    m.user_id, 'session', null, new.campaign_id, jsonb_build_object('sessionId', new.id, 'number', new.number)
  )
  from public.campaign_members m where m.campaign_id = new.campaign_id;
  return new;
end $$;
create trigger campaign_sessions_notify after insert on public.campaign_sessions
  for each row execute function private.notify_new_session();

revoke all on function private.notify_new_session() from public, anon, authenticated;

-- Menzioni (#18) -------------------------------------------------------------------------------------

-- Uguale a `private.sync_mentions` della migrazione di #18, con la notifica all'autore di ogni snippet nuovamente citato.
-- La notifica parte solo se l'autore del bersaglio potrebbe già leggere lo snippet che lo cita: altrimenti rivelerebbe
-- che esiste un contenuto a lui nascosto (es. uno snippet «segreto» del DM), prima ancora che venga rivelato (D-032).
create or replace function private.sync_mentions(p_snippet uuid, p_mentions uuid[]) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  v_world uuid;
  v_source_visibility text;
  v_author uuid;
  r record;
begin
  p_mentions := coalesce(array_remove(p_mentions, null), '{}');
  if cardinality(p_mentions) > 200 then
    raise exception 'too_many_mentions' using errcode = 'P0001';
  end if;

  select world_id, visibility::text into v_world, v_source_visibility from public.snippets where id = p_snippet;
  if v_world is null then
    return;
  end if;

  delete from public.relations
   where source_id = p_snippet and from_mention and not (target_id = any (p_mentions));

  for r in
    insert into public.relations (world_id, source_id, target_id, label, inverse_label, from_mention, created_by)
      select v_world, p_snippet, s.id, 'menziona', 'menzionato in', true, (select auth.uid())
        from public.snippets s
       where s.world_id = v_world and s.id = any (p_mentions) and s.id <> p_snippet and s.deleted_at is null
      on conflict do nothing
      returning target_id
  loop
    select created_by into v_author from public.snippets where id = r.target_id;
    if v_author is not null and (
      v_source_visibility = 'public'
      or (
        v_source_visibility = 'members'
        and exists (select 1 from public.world_members m where m.world_id = v_world and m.user_id = v_author)
      )
      or (
        v_source_visibility = 'shared'
        and exists (
          select 1 from public.visibility_shares s
           where s.kind = 'snippet' and s.item_id = p_snippet and s.user_id = v_author
        )
      )
    ) then
      perform private.notify(
        v_author, 'mention', v_world, null,
        jsonb_build_object('sourceSnippetId', p_snippet, 'targetSnippetId', r.target_id)
      );
    end if;
  end loop;
end;
$$;

-- Inviti (#31) ---------------------------------------------------------------------------------------

-- L'invito per email che corrisponde già a un account registrato lo notifica subito (nessuna email inviata dall'app,
-- D-031: il link lo consegna il DM a parte). Un invito solo a link non ha un destinatario noto: nessuna notifica finché
-- non viene accettato.
create function private.notify_invite_created() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
begin
  if new.email is null then
    return new;
  end if;
  select id into v_user from auth.users where lower(email) = new.email and email_confirmed_at is not null;
  if v_user is not null and not exists (
    select 1 from public.campaign_members where campaign_id = new.campaign_id and user_id = v_user
  ) then
    -- Il nome della campagna va nella notifica stessa: chi la riceve non è ancora membro, quindi la sua RLS
    -- non gli lascia leggere la riga di `campaigns` (la leggiamo qui perché la funzione è `security definer`).
    perform private.notify(
      v_user, 'invite_received', null, new.campaign_id,
      jsonb_build_object(
        'inviteId', new.id, 'role', new.role::text,
        'campaignName', (select name from public.campaigns where id = new.campaign_id)
      )
    );
  end if;
  return new;
end $$;
create trigger campaign_invites_notify after insert on public.campaign_invites
  for each row execute function private.notify_invite_created();

revoke all on function private.notify_invite_created() from public, anon, authenticated;

-- Uguale a `accept_campaign_invite` della migrazione di #31, con la notifica a chi ha creato l'invito.
create or replace function public.accept_campaign_invite(p_token text)
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
  perform private.notify(
    v_invite.created_by, 'invite_accepted', null, v_invite.campaign_id,
    jsonb_build_object('inviteId', v_invite.id, 'userId', v_me, 'role', v_invite.role::text)
  );
  return v_invite.campaign_id;
end $$;

revoke all on function public.accept_campaign_invite(text) from public, anon;
grant execute on function public.accept_campaign_invite(text) to authenticated;
