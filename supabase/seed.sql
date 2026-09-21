-- Dati di seed (eseguiti da `supabase db reset`). Solo per sviluppo locale e demo: mai in produzione.
--
-- Utente demo:  demo@worldloom.test  /  Demo-Worldloom-1
--   1. «Aurelia (demo)»: un piccolo mondo di esempio con categorie, campi, menzioni e relazioni.
--   2. «Prova di carico»: dati sintetici (5.000 snippet, 20.000 relazioni) per misurare ricerca, viste e prestazioni.
--
-- Il seed è rieseguibile: prima rimuove i mondi e l'utente demo.

-- Guard: il seed crea un utente con password pubblica. Si esegue solo sul database locale di Supabase CLI, riconosciuto dal
-- segreto JWT di default; su un progetto cloud (`db push --include-seed`, `db reset --linked`) si interrompe.
do $$
begin
  if coalesce(current_setting('app.settings.jwt_secret', true), '') <> 'super-secret-jwt-token-with-at-least-32-characters-long' then
    raise exception 'seed.sql è solo per il database locale: interrotto';
  end if;
end
$$;

delete from public.worlds where owner_id = '00000000-0000-4000-8000-00000000d3a0';
delete from auth.identities where user_id = '00000000-0000-4000-8000-00000000d3a0';
delete from auth.users where id = '00000000-0000-4000-8000-00000000d3a0';

insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
   confirmation_token, recovery_token, email_change, email_change_token_new)
values
  ('00000000-0000-4000-8000-00000000d3a0', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'demo@worldloom.test', extensions.crypt('Demo-Worldloom-1', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"Demo"}', now(), now(),
   '', '', '', '');

insert into auth.identities
  (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
values
  ('00000000-0000-4000-8000-00000000d3a1', '00000000-0000-4000-8000-00000000d3a0',
   '00000000-0000-4000-8000-00000000d3a0', 'email',
   '{"sub":"00000000-0000-4000-8000-00000000d3a0","email":"demo@worldloom.test","email_verified":true}',
   now(), now(), now());

-- 1. Mondo di esempio ---------------------------------------------------------------------------

insert into public.worlds (id, name, owner_id)
values ('00000000-0000-4000-8000-0000000a0001', 'Aurelia (demo)', '00000000-0000-4000-8000-00000000d3a0');

insert into public.categories (id, world_id, name, icon, color, fields_schema) values
  ('00000000-0000-4000-8000-0000000c0001', '00000000-0000-4000-8000-0000000a0001', 'Personaggio', 'user', 'teal',
   '[{"key":"eta","label":"Età","type":"number","min":0},{"key":"ruolo","label":"Ruolo","type":"choice","options":["Protagonista","Alleato","Antagonista"]}]'),
  ('00000000-0000-4000-8000-0000000c0002', '00000000-0000-4000-8000-0000000a0001', 'Luogo', 'map-pin', 'moss',
   '[{"key":"abitanti","label":"Abitanti","type":"number","min":0}]'),
  ('00000000-0000-4000-8000-0000000c0003', '00000000-0000-4000-8000-0000000a0001', 'Fazione', 'flag', 'plum', '[]'),
  ('00000000-0000-4000-8000-0000000c0004', '00000000-0000-4000-8000-0000000a0001', 'Evento', 'calendar', 'rust', '[]');

insert into public.snippets (id, world_id, title, status, tags, aliases, fields, body, created_by, created_at) values
  ('00000000-0000-4000-8000-0000000d0001', '00000000-0000-4000-8000-0000000a0001', 'Elara Venti', 'final',
   '{eroe,navigatrice}', '{La Saggia}', '{"eta":34,"ruolo":"Protagonista"}',
   '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Cartografa e navigatrice di "},{"type":"mention","attrs":{"id":"00000000-0000-4000-8000-0000000d0002"}},{"type":"text","text":", cerca le rotte perdute per conto della "},{"type":"mention","attrs":{"id":"00000000-0000-4000-8000-0000000d0003"}},{"type":"text","text":"."}]}]}',
   '00000000-0000-4000-8000-00000000d3a0', now() - interval '30 days'),
  ('00000000-0000-4000-8000-0000000d0002', '00000000-0000-4000-8000-0000000a0001', 'Porto Verde', 'final',
   '{porto,commercio}', '{}', '{"abitanti":12000}',
   '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Città portuale costruita sulle scogliere. Sede della "},{"type":"mention","attrs":{"id":"00000000-0000-4000-8000-0000000d0003"}},{"type":"text","text":"."}]}]}',
   '00000000-0000-4000-8000-00000000d3a0', now() - interval '29 days'),
  ('00000000-0000-4000-8000-0000000d0003', '00000000-0000-4000-8000-0000000a0001', 'Gilda dei Cartografi', 'final',
   '{gilda,mappe}', '{Cartografi}', '{}',
   '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Custodisce le mappe dell’arcipelago e finanzia le spedizioni."}]}]}',
   '00000000-0000-4000-8000-00000000d3a0', now() - interval '28 days'),
  ('00000000-0000-4000-8000-0000000d0004', '00000000-0000-4000-8000-0000000a0001', 'Corvo Nero', 'draft',
   '{antagonista}', '{}', '{"eta":51,"ruolo":"Antagonista"}',
   '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Contrabbandiere che vende mappe false. Rivale di "},{"type":"mention","attrs":{"id":"00000000-0000-4000-8000-0000000d0001"}},{"type":"text","text":"."}]}]}',
   '00000000-0000-4000-8000-00000000d3a0', now() - interval '27 days'),
  ('00000000-0000-4000-8000-0000000d0005', '00000000-0000-4000-8000-0000000a0001', 'La Grande Marea', 'draft',
   '{storia}', '{}', '{}',
   '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"L’inondazione che ha diviso l’arcipelago, dodici anni fa. Ha colpito soprattutto "},{"type":"mention","attrs":{"id":"00000000-0000-4000-8000-0000000d0002"}},{"type":"text","text":"."}]}]}',
   '00000000-0000-4000-8000-00000000d3a0', now() - interval '26 days');

insert into public.snippet_categories (world_id, snippet_id, category_id) values
  ('00000000-0000-4000-8000-0000000a0001', '00000000-0000-4000-8000-0000000d0001', '00000000-0000-4000-8000-0000000c0001'),
  ('00000000-0000-4000-8000-0000000a0001', '00000000-0000-4000-8000-0000000d0002', '00000000-0000-4000-8000-0000000c0002'),
  ('00000000-0000-4000-8000-0000000a0001', '00000000-0000-4000-8000-0000000d0003', '00000000-0000-4000-8000-0000000c0003'),
  ('00000000-0000-4000-8000-0000000a0001', '00000000-0000-4000-8000-0000000d0004', '00000000-0000-4000-8000-0000000c0001'),
  ('00000000-0000-4000-8000-0000000a0001', '00000000-0000-4000-8000-0000000d0005', '00000000-0000-4000-8000-0000000c0004');

insert into public.relation_types (world_id, label, inverse_label, source_category_id, target_category_id) values
  ('00000000-0000-4000-8000-0000000a0001', 'abita a', 'ospita', '00000000-0000-4000-8000-0000000c0001', '00000000-0000-4000-8000-0000000c0002'),
  ('00000000-0000-4000-8000-0000000a0001', 'rivale di', 'rivale di', null, null);

insert into public.relations
  (world_id, source_id, target_id, label, inverse_label, notes, valid_from, from_mention, created_by) values
  ('00000000-0000-4000-8000-0000000a0001', '00000000-0000-4000-8000-0000000d0001', '00000000-0000-4000-8000-0000000d0002',
   'abita a', 'ospita', 'Dopo la Grande Marea.', '{"calendar":"default","year":12}', false, '00000000-0000-4000-8000-00000000d3a0'),
  ('00000000-0000-4000-8000-0000000a0001', '00000000-0000-4000-8000-0000000d0001', '00000000-0000-4000-8000-0000000d0004',
   'rivale di', 'rivale di', '', null, false, '00000000-0000-4000-8000-00000000d3a0'),
  -- Relazioni nate dalle menzioni nel testo (etichette fisse).
  ('00000000-0000-4000-8000-0000000a0001', '00000000-0000-4000-8000-0000000d0001', '00000000-0000-4000-8000-0000000d0002',
   'menziona', 'menzionato in', '', null, true, '00000000-0000-4000-8000-00000000d3a0'),
  ('00000000-0000-4000-8000-0000000a0001', '00000000-0000-4000-8000-0000000d0001', '00000000-0000-4000-8000-0000000d0003',
   'menziona', 'menzionato in', '', null, true, '00000000-0000-4000-8000-00000000d3a0'),
  ('00000000-0000-4000-8000-0000000a0001', '00000000-0000-4000-8000-0000000d0002', '00000000-0000-4000-8000-0000000d0003',
   'menziona', 'menzionato in', '', null, true, '00000000-0000-4000-8000-00000000d3a0'),
  ('00000000-0000-4000-8000-0000000a0001', '00000000-0000-4000-8000-0000000d0004', '00000000-0000-4000-8000-0000000d0001',
   'menziona', 'menzionato in', '', null, true, '00000000-0000-4000-8000-00000000d3a0'),
  ('00000000-0000-4000-8000-0000000a0001', '00000000-0000-4000-8000-0000000d0005', '00000000-0000-4000-8000-0000000d0002',
   'menziona', 'menzionato in', '', null, true, '00000000-0000-4000-8000-00000000d3a0');

-- 2. Prova di carico: 5.000 snippet e 20.000 relazioni sintetici --------------------------------
-- Ids deterministici (md5 → uuid) così il seed è ripetibile; relazioni distribuite su tutta la rete.

insert into public.worlds (id, name, owner_id)
values ('00000000-0000-4000-8000-0000000a0002', 'Prova di carico (5.000 snippet)', '00000000-0000-4000-8000-00000000d3a0');

insert into public.categories (id, world_id, name, fields_schema)
select md5('stress-c-' || i)::uuid, '00000000-0000-4000-8000-0000000a0002',
       (array['Personaggio','Luogo','Fazione','Evento','Oggetto'])[i],
       '[{"key":"valore","label":"Valore","type":"number"}]'::jsonb
  from generate_series(1, 5) as i;

insert into public.snippets (id, world_id, title, status, tags, fields, body, created_by, created_at)
select md5('stress-s-' || i)::uuid,
       '00000000-0000-4000-8000-0000000a0002',
       'Elemento ' || lpad(i::text, 4, '0') || ' ' || (array['Aldera','Borin','Cael','Dorna','Evelin','Fenn','Gorak','Hylda'])[1 + i % 8],
       case when i % 3 = 0 then 'final'::public.snippet_status else 'draft'::public.snippet_status end,
       array['tag' || (i % 25), 'gruppo' || (i % 7)],
       jsonb_build_object('valore', i % 100),
       jsonb_build_object('type', 'doc', 'content', jsonb_build_array(jsonb_build_object(
         'type', 'paragraph', 'content', jsonb_build_array(jsonb_build_object(
           'type', 'text',
           'text', 'Voce sintetica numero ' || i || ' della prova di carico: cronache, luoghi e alleanze dell’arcipelago.')))))
       ,
       '00000000-0000-4000-8000-00000000d3a0',
       now() - (i || ' minutes')::interval
  from generate_series(1, 5000) as i;

insert into public.snippet_categories (world_id, snippet_id, category_id)
select '00000000-0000-4000-8000-0000000a0002', md5('stress-s-' || i)::uuid, md5('stress-c-' || (1 + i % 5))::uuid
  from generate_series(1, 5000) as i;

-- 20.000 relazioni distinte: per ogni snippet quattro destinazioni a distanze diverse (mai se stesso).
insert into public.relations (world_id, source_id, target_id, label, inverse_label, created_by)
select '00000000-0000-4000-8000-0000000a0002',
       md5('stress-s-' || i)::uuid,
       md5('stress-s-' || (1 + (i - 1 + step) % 5000))::uuid,
       (array['alleato di','rivale di','vive vicino a','commercia con'])[k],
       (array['alleato di','rivale di','vicino di','commercia con'])[k],
       '00000000-0000-4000-8000-00000000d3a0'
  from generate_series(1, 5000) as i,
       (values (1, 1), (2, 37), (3, 251), (4, 1013)) as t(k, step);
