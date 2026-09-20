-- Immagini dei mondi: bucket privato, un percorso per mondo (`<world_id>/<uuid>.<ext>`).
-- Solo chi può scrivere nel mondo carica ed elimina; chi è membro legge. Il tipo reale del file lo verifica
-- l'applicazione prima del caricamento (byte iniziali), il bucket limita comunque dimensione e tipi MIME.

create or replace function private.world_of_path(name text) returns uuid
language sql immutable set search_path = '' as $$
  select case
    when split_part(name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(name, '/', 1)::uuid
  end
$$;

revoke all on function private.world_of_path(text) from public;
grant execute on function private.world_of_path(text) to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'world-images', 'world-images', false, 5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy world_images_read on storage.objects for select to authenticated
  using (bucket_id = 'world-images' and private.world_role(private.world_of_path(name)) is not null);

create policy world_images_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'world-images'
    and private.can_write(private.world_of_path(name))
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|webp|gif)$'
  );
