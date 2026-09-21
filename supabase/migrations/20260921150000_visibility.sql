-- Visibilità per elemento e rivelazione (#32). Quattro livelli (secret, shared, members, public) su snippet, relazioni, pin e
-- campi. «secret»: solo chi scrive nel mondo (il DM); «shared»: giocatori scelti; «members»: tutti i membri; «public»: anche gli
-- estranei. Il server non invia mai ciò che non si può vedere: la lettura la decide la RLS, non il codice dell'app.
--
--  * `visibility_shares`: a chi è condiviso un elemento «shared» (solo membri del mondo: chiave esterna composita).
--  * `snippet_restricted_fields`: i valori dei campi «secret» o «shared» stanno FUORI da `snippets.fields`, in una tabella con
--    la sua RLS; un trigger impedisce che tornino nella colonna pubblica da qualunque strada (salvataggio, ripristino versione).
--  * `visibility_log`: ogni cambio di livello o di destinatari è registrato (chi, quando, da/a, note, sessione).
--  * `set_visibility`: l'unico modo di cambiare livello (un trigger rifiuta le scritture dirette di `visibility`); solo chi scrive; atomico.

alter table public.map_pins
  add column visibility public.visibility not null default 'members';

-- Condivisioni ----------------------------------------------------------------------------------------

create table public.visibility_shares (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.worlds (id) on delete cascade,
  kind text not null check (kind in ('snippet', 'relation', 'pin', 'field')),
  -- Per i campi è lo snippet che li contiene, con la chiave del campo.
  item_id uuid not null,
  field_key text not null default '',
  user_id uuid not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (kind, item_id, field_key, user_id),
  check ((kind = 'field') = (field_key <> '')),
  -- Si condivide solo con chi è membro del mondo; se esce, la condivisione decade.
  foreign key (world_id, user_id) references public.world_members (world_id, user_id) on delete cascade
);
create index visibility_shares_user on public.visibility_shares (user_id, kind);
create index visibility_shares_item on public.visibility_shares (kind, item_id);

create table public.snippet_restricted_fields (
  snippet_id uuid not null,
  world_id uuid not null,
  key text not null check (key ~ '^[a-z][a-z0-9_]{0,39}$'),
  value jsonb not null,
  visibility public.visibility not null check (visibility in ('secret', 'shared')),
  primary key (snippet_id, key),
  foreign key (world_id, snippet_id) references public.snippets (world_id, id) on delete cascade
);
create index snippet_restricted_fields_world on public.snippet_restricted_fields (world_id);

create table public.visibility_log (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.worlds (id) on delete cascade,
  kind text not null check (kind in ('snippet', 'relation', 'pin', 'field')),
  item_id uuid not null,
  field_key text not null default '',
  from_level text not null,
  to_level text not null,
  shared_with uuid[] not null default '{}',
  -- Vero se l'elemento è diventato visibile a qualcuno che prima non lo vedeva (una rivelazione).
  is_reveal boolean not null,
  -- Sessione di gioco a cui la rivelazione è legata (la tabella delle sessioni arriva con #36, che aggiunge la chiave esterna).
  session_id uuid,
  note text not null default '' check (length(note) <= 500),
  changed_by uuid references auth.users (id) on delete set null,
  -- `clock_timestamp` (non `now`): più cambi nella stessa transazione restano in ordine.
  created_at timestamptz not null default clock_timestamp()
);
create index visibility_log_item on public.visibility_log (item_id, created_at desc);
create index visibility_log_world on public.visibility_log (world_id, created_at desc);

-- Funzioni di lettura per la RLS (security definer, valutate una sola volta per query) ---------------------

create function private.shared_with_me(k text) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select item_id from public.visibility_shares where kind = k and user_id = (select auth.uid())
$$;

create function private.shared_fields_with_me() returns table (snippet_id uuid, key text)
language sql stable security definer set search_path = '' as $$
  select item_id, field_key from public.visibility_shares where kind = 'field' and user_id = (select auth.uid())
$$;

revoke all on function private.shared_with_me(text), private.shared_fields_with_me() from public;
grant execute on function private.shared_with_me(text), private.shared_fields_with_me() to anon, authenticated;

-- Policy ----------------------------------------------------------------------------------------------

drop policy snippets_read on public.snippets;
create policy snippets_read on public.snippets for select to anon, authenticated using (
  world_id in (select private.writer_worlds())
  or (
    deleted_at is null
    and (
      visibility = 'public'
      or (visibility = 'members' and world_id in (select private.member_worlds()))
      or (visibility = 'shared' and id in (select private.shared_with_me('snippet')))
    )
  )
);

-- Una relazione si vede se se ne può leggere il livello e anche i suoi estremi (la sottoquery ha la RLS di chi legge).
drop policy relations_read on public.relations;
create policy relations_read on public.relations for select to anon, authenticated using (
  (
    world_id in (select private.writer_worlds())
    or visibility = 'public'
    or (visibility = 'members' and world_id in (select private.member_worlds()))
    or (visibility = 'shared' and id in (select private.shared_with_me('relation')))
  )
  and exists (select 1 from public.snippets s where s.id = source_id)
  and exists (select 1 from public.snippets s where s.id = target_id)
);

-- Un pin ha il suo livello e in più si vede solo se si vede il suo snippet.
drop policy map_pins_read on public.map_pins;
create policy map_pins_read on public.map_pins for select to authenticated using (
  private.world_role(world_id) is not null
  and (
    world_id in (select private.writer_worlds())
    or visibility in ('members', 'public')
    or (visibility = 'shared' and id in (select private.shared_with_me('pin')))
  )
  and exists (select 1 from public.snippets s where s.id = snippet_id)
);

alter table public.visibility_shares enable row level security;
alter table public.snippet_restricted_fields enable row level security;
alter table public.visibility_log enable row level security;

create policy visibility_shares_read on public.visibility_shares for select to authenticated
  using (world_id in (select private.writer_worlds()) or user_id = (select auth.uid()));

-- Un valore riservato lo legge chi scrive, o chi ne è destinatario (e vede lo snippet).
create policy restricted_fields_read on public.snippet_restricted_fields for select to authenticated using (
  world_id in (select private.writer_worlds())
  or (
    visibility = 'shared'
    and exists (select 1 from public.snippets s where s.id = snippet_id)
    and (snippet_id, key) in (select f.snippet_id, f.key from private.shared_fields_with_me() f)
  )
);
create policy restricted_fields_write on public.snippet_restricted_fields for all to authenticated
  using (private.can_write(world_id)) with check (private.can_write(world_id));

-- Il registro lo leggono chi scrive e i destinatari di una rivelazione.
create policy visibility_log_read on public.visibility_log for select to authenticated
  using (
    world_id in (select private.writer_worlds())
    or (is_reveal and (select auth.uid()) = any (shared_with))
  );

revoke all on public.visibility_shares, public.snippet_restricted_fields, public.visibility_log
  from public, anon, authenticated;
grant select on public.visibility_shares, public.visibility_log to authenticated;
-- I valori riservati si scrivono (`value`) e si creano (import), ma il livello e la cancellazione passano solo da `set_visibility`.
grant select, insert on public.snippet_restricted_fields to authenticated;
grant update (value) on public.snippet_restricted_fields to authenticated;

-- Coerenza --------------------------------------------------------------------------------------------

-- Un valore riservato non torna mai nella colonna pubblica: qualunque scrittura di `fields` (salvataggio, ripristino di una
-- versione, import) ne toglie le chiavi che hanno una riga riservata.
create function private.strip_restricted_fields() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.fields := new.fields - coalesce(
    (select array_agg(key) from public.snippet_restricted_fields where snippet_id = new.id),
    '{}'
  );
  return new;
end $$;
create trigger snippets_strip_restricted before update of fields on public.snippets
  for each row execute function private.strip_restricted_fields();

-- Il livello cambia solo con `set_visibility` (che imposta questo parametro di sessione, valido per la transazione): una scrittura
-- diretta via API lo rifiuterebbe senza lasciare traccia nel registro.
create function private.guard_visibility_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.visibility is distinct from old.visibility
     and coalesce(current_setting('worldloom.set_visibility', true), '') <> 'on' then
    raise exception 'visibility_via_function' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger snippets_guard_visibility before update of visibility on public.snippets
  for each row execute function private.guard_visibility_change();
create trigger relations_guard_visibility before update of visibility on public.relations
  for each row execute function private.guard_visibility_change();
create trigger map_pins_guard_visibility before update of visibility on public.map_pins
  for each row execute function private.guard_visibility_change();

-- Eliminando un elemento decadono le sue condivisioni.
create function private.drop_shares() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.visibility_shares
   where item_id = old.id
     and kind = case tg_table_name
       when 'snippets' then 'snippet' when 'relations' then 'relation' else 'pin' end;
  if tg_table_name = 'snippets' then
    delete from public.visibility_shares where kind = 'field' and item_id = old.id;
  end if;
  return old;
end $$;
create trigger snippets_drop_shares after delete on public.snippets
  for each row execute function private.drop_shares();
create trigger relations_drop_shares after delete on public.relations
  for each row execute function private.drop_shares();
create trigger map_pins_drop_shares after delete on public.map_pins
  for each row execute function private.drop_shares();

revoke all on function private.strip_restricted_fields(), private.drop_shares(), private.guard_visibility_change()
  from public, anon, authenticated;

-- Cambio di livello --------------------------------------------------------------------------------------

create function private.visibility_rank(v text) returns int
language sql immutable set search_path = '' as $$
  select case v when 'secret' then 0 when 'shared' then 1 when 'members' then 2 else 3 end
$$;

-- Cambia il livello di uno snippet, di una relazione, di un pin o di un campo (`p_field`), e i destinatari se il livello è
-- «shared». Solo chi scrive nel mondo. Registra il cambio nel registro; `p_session` lega la rivelazione a una sessione.
-- Un campo «secret» o «shared» passa nella tabella dei valori riservati; «members» e «public» lo riportano nello snippet
-- (un campo non è mai più visibile dello snippet che lo contiene).
create function public.set_visibility(
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

  insert into public.visibility_log
    (world_id, kind, item_id, field_key, from_level, to_level, shared_with, is_reveal, session_id, note, changed_by)
  values (
    v_world, p_kind, p_item, v_key, v_from, p_level::text, v_users,
    private.visibility_rank(p_level::text) > private.visibility_rank(v_from)
      or (p_level = 'shared' and v_from = 'shared' and not (v_users <@ v_old_users)),
    p_session, coalesce(p_note, ''), (select auth.uid())
  );
end $$;

revoke all on function private.visibility_rank(text) from public, anon;
grant execute on function private.visibility_rank(text) to authenticated;
revoke all on function public.set_visibility(text, uuid, text, public.visibility, uuid[], uuid, text) from public, anon;
grant execute on function public.set_visibility(text, uuid, text, public.visibility, uuid[], uuid, text) to authenticated;

-- Immagini (D-016): il bucket lo legge ogni membro, ma un file usato solo da uno snippet nascosto non deve uscire. Chi non scrive
-- può leggere un file solo se è usato da qualcosa che vede: una mappa, il testo o un campo di uno snippet leggibile (security
-- invoker: le sottoquery hanno la sua RLS). `p_file` ha il formato `<uuid>.<estensione>`, quindi il LIKE è sicuro.
create function public.can_read_image(p_world uuid, p_file text)
returns boolean
language sql stable security invoker set search_path = '' as $$
  select p_file ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp|gif)$'
    and (
      exists (select 1 from public.maps m where m.world_id = p_world and m.image = p_file)
      or exists (
        select 1 from public.snippets s
         where s.world_id = p_world and s.deleted_at is null
           and (s.body::text like '%' || p_file || '%' or s.fields::text like '%' || p_file || '%')
      )
      or exists (
        select 1 from public.snippet_restricted_fields f
         where f.world_id = p_world and f.value::text like '%' || p_file || '%'
      )
    )
$$;

revoke all on function public.can_read_image(uuid, text) from public, anon;
grant execute on function public.can_read_image(uuid, text) to authenticated;
