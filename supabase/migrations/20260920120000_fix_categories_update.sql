-- La funzione condivisa `forbid_identity_change` leggeva `new.created_by` anche per `categories`, che non
-- ha quella colonna: ogni UPDATE di una categoria falliva. Si separano i due controlli.

create function private.forbid_world_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.world_id is distinct from old.world_id then
    raise exception 'world_id è immutabile' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger categories_immutable on public.categories;
create trigger categories_immutable before update on public.categories
  for each row execute function private.forbid_world_change();

-- Snippet e relazioni hanno sempre `created_by`: la funzione originale resta corretta per loro.
create or replace function private.forbid_identity_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.world_id is distinct from old.world_id then
    raise exception 'world_id è immutabile' using errcode = '42501';
  end if;
  if new.created_by is distinct from old.created_by then
    raise exception 'created_by è immutabile' using errcode = '42501';
  end if;
  return new;
end $$;
