-- Con l'accesso OAuth (es. GitHub) il nome non arriva in `display_name` ma in `name` o `user_name`.
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(
      coalesce(
        nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
        nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
        nullif(btrim(new.raw_user_meta_data ->> 'user_name'), ''),
        split_part(new.email, '@', 1),
        ''
      ),
      60
    )
  );
  return new;
end $$;
