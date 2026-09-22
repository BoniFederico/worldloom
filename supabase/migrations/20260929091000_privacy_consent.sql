-- GDPR: registra quando l'utente ha accettato l'informativa sulla privacy (#44). Solo la registrazione con
-- email+password passa dal modulo con la spunta obbligatoria; l'accesso OAuth (GitHub) non la registra ancora
-- (limite noto, D-044): la pagina di login/registrazione mostra comunque il link all'informativa vicino al
-- pulsante OAuth.

alter table public.profiles add column privacy_accepted_at timestamptz;

-- Stessa logica di 20260920100000 (nome da display_name/name/user_name/email): qui si aggiunge solo la data di
-- accettazione dell'informativa.
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name, privacy_accepted_at)
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
    ),
    nullif(new.raw_user_meta_data ->> 'privacy_accepted_at', '')::timestamptz
  );
  return new;
end $$;
