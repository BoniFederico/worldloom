-- Relazioni: note limitate, intervallo di validità con forma controllata, niente doppioni.
-- L'intervallo è `{calendar, year, month?, day?}`; `calendar` vale 'default' finché non esistono i calendari (#26).

create or replace function private.valid_time(v jsonb) returns boolean
language sql immutable set search_path = '' as $$
  -- coalesce: un CHECK con risultato NULL passerebbe; una forma incompleta deve invece fallire.
  select v is null or coalesce((
    jsonb_typeof(v) = 'object'
    and jsonb_typeof(v -> 'year') = 'number'
    and (v ->> 'year') ~ '^-?[0-9]{1,9}$'
    and (v -> 'month' is null or (
      jsonb_typeof(v -> 'month') = 'number' and (v ->> 'month') ~ '^[0-9]{1,2}$'
      and (v ->> 'month')::int between 1 and 99))
    -- il giorno richiede il mese
    and (v -> 'day' is null or (
      v -> 'month' is not null
      and jsonb_typeof(v -> 'day') = 'number' and (v ->> 'day') ~ '^[0-9]{1,2}$'
      and (v ->> 'day')::int between 1 and 99))
    and (v -> 'calendar' is null or jsonb_typeof(v -> 'calendar') = 'string')
  ), false)
$$;

grant execute on function private.valid_time(jsonb) to anon, authenticated;

-- Un solo CHECK: il confronto degli anni si valuta solo se entrambe le forme sono valide (CASE, non AND).
alter table public.relations
  add constraint relations_notes_length check (length(notes) <= 2000),
  add constraint relations_valid_time check (
    private.valid_time(valid_from) and private.valid_time(valid_to)
    and case
      when valid_from is null or valid_to is null then true
      else (valid_from ->> 'year')::bigint <= (valid_to ->> 'year')::bigint
    end
  );

create unique index relations_no_duplicates
  on public.relations (source_id, target_id, lower(btrim(label)));
