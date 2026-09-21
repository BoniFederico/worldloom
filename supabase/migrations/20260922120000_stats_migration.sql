-- Migrazione guidata dello schema di statistiche (#35). L'app calcola le nuove schede (src/lib/stats/migrate.ts); questa funzione
-- salva il nuovo schema e le schede riscritte in un'unica transazione, solo per il DM. Se qualcuno ha salvato lo schema o una
-- delle schede nel frattempo (revisione diversa da quella letta) non si scrive niente: conflitto.

create function public.apply_stats_migration(p_campaign uuid, p_schema jsonb, p_expected_rev int, p_sheets jsonb)
returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_item jsonb;
  v_rev int;
  v_count int := 0;
begin
  if private.campaign_role(p_campaign) is distinct from 'dm' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if jsonb_typeof(p_schema) is distinct from 'object' then
    raise exception 'invalid_schema' using errcode = '22023';
  end if;
  if jsonb_typeof(p_sheets) is distinct from 'array' or jsonb_array_length(p_sheets) > 500 then
    raise exception 'invalid_sheets' using errcode = '22023';
  end if;

  -- Serializza le migrazioni della stessa campagna.
  perform 1 from public.campaigns where id = p_campaign for update;

  select rev into v_rev from public.campaign_stats where campaign_id = p_campaign;
  if coalesce(v_rev, 0) <> p_expected_rev then
    raise exception 'conflict' using errcode = '40001';
  end if;
  if v_rev is null then
    insert into public.campaign_stats (campaign_id, schema) values (p_campaign, p_schema);
  else
    update public.campaign_stats set schema = p_schema where campaign_id = p_campaign;
  end if;

  for v_item in select value from jsonb_array_elements(p_sheets) loop
    update public.characters
      set sheet = v_item -> 'sheet'
      where id = (v_item ->> 'id')::uuid
        and campaign_id = p_campaign
        and rev = (v_item ->> 'rev')::int;
    if not found then
      raise exception 'conflict' using errcode = '40001';
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

revoke all on function public.apply_stats_migration(uuid, jsonb, int, jsonb) from public, anon;
grant execute on function public.apply_stats_migration(uuid, jsonb, int, jsonb) to authenticated;
