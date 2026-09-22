import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { actAs, createUser, withTx, type Db } from './helpers';

async function setup(db: Db) {
  const [owner, reader, stranger] = [
    await createUser(db),
    await createUser(db),
    await createUser(db),
  ];
  const world = (
    await actAs(db, owner, () =>
      db.query(`insert into worlds (name, owner_id) values ('Aurelia', $1) returning id`, [owner]),
    )
  ).rows[0].id as string;
  await db.query(`insert into world_members (world_id, user_id, role) values ($1, $2, 'reader')`, [
    world,
    reader,
  ]);
  const category = (
    await db.query(
      `insert into categories (world_id, name) values ($1, 'Personaggio') returning id`,
      [world],
    )
  ).rows[0].id as string;
  const snippet = async (title: string, visibility = 'members') => {
    const id = (
      await db.query(
        `insert into snippets (world_id, title, visibility, created_by) values ($1, $2, $3, $4) returning id`,
        [world, title, visibility, owner],
      )
    ).rows[0].id as string;
    await db.query(
      `insert into snippet_categories (world_id, snippet_id, category_id) values ($1, $2, $3)`,
      [world, id, category],
    );
    return id;
  };
  return { owner, reader, stranger, world, category, snippet };
}

describe('wiki pubblica: mondo pubblicato', () => {
  it('un mondo senza wiki_slug è invisibile agli estranei; con wiki_slug è leggibile da chiunque', async () => {
    await withTx(async (db) => {
      const { world, stranger } = await setup(db);
      const readWorld = (uid: string | null) =>
        actAs(db, uid, () => db.query(`select id from worlds where id = $1`, [world]));
      expect((await readWorld(stranger)).rows).toHaveLength(0);
      expect((await readWorld(null)).rows).toHaveLength(0);

      await db.query(`update worlds set wiki_slug = 'aurelia' where id = $1`, [world]);
      expect((await readWorld(stranger)).rows).toHaveLength(1);
      expect((await readWorld(null)).rows).toHaveLength(1);
    });
  });

  it('lo slug deve avere il formato giusto ed essere unico', async () => {
    await withTx(async (db) => {
      const { world, owner } = await setup(db);
      await expect(
        actAs(db, owner, () =>
          db.query(`update worlds set wiki_slug = 'Non Valido' where id = $1`, [world]),
        ),
      ).rejects.toThrow();
      await actAs(db, owner, () =>
        db.query(`update worlds set wiki_slug = 'aurelia' where id = $1`, [world]),
      );
      const world2 = (
        await actAs(db, owner, () =>
          db.query(`insert into worlds (name, owner_id) values ('Altro', $1) returning id`, [
            owner,
          ]),
        )
      ).rows[0].id as string;
      await expect(
        actAs(db, owner, () =>
          db.query(`update worlds set wiki_slug = 'aurelia' where id = $1`, [world2]),
        ),
      ).rejects.toThrow();
    });
  });

  it('le categorie si vedono solo quando il mondo è pubblicato; i collegamenti anche agli anonimi', async () => {
    await withTx(async (db) => {
      const { world, category, snippet, stranger } = await setup(db);
      const membersOnly = await snippet('Solo membri', 'members');
      const pub = await snippet('Pubblico', 'public');

      const readCategories = () =>
        actAs(db, stranger, () =>
          db.query(`select id from categories where world_id = $1`, [world]),
        );
      // Un utente autenticato qualunque vede già i collegamenti di uno snippet pubblico (RLS di `snippets`,
      // indipendente dalla wiki): il caso nuovo di questa migrazione è l'accesso anonimo.
      const readLinksAnon = (sid: string) =>
        actAs(db, null, () =>
          db.query(`select 1 from snippet_categories where snippet_id = $1`, [sid]),
        );

      expect((await readCategories()).rows).toHaveLength(0);
      expect((await readLinksAnon(pub)).rows).toHaveLength(0);

      await db.query(`update worlds set wiki_slug = 'aurelia' where id = $1`, [world]);
      expect((await readCategories()).rows).toHaveLength(1);
      // Lo snippet «members» resta leggibile solo dai membri: nessun collegamento categoria per l'anonimo.
      expect((await readLinksAnon(membersOnly)).rows).toHaveLength(0);
      expect((await readLinksAnon(pub)).rows).toHaveLength(1);
      void category;
    });
  });
});

describe('wiki pubblica: immagini', () => {
  const image = (worldId: string) => `${worldId}/${randomUUID()}.png`;

  const upload = (db: Db, uid: string, name: string) =>
    actAs(db, uid, () =>
      db.query(
        `insert into storage.objects (bucket_id, name, owner, metadata)
         values ('world-images', $1, $2, '{"mimetype":"image/png"}'::jsonb)`,
        [name, uid],
      ),
    );

  const readImage = (db: Db, uid: string | null, name: string) =>
    actAs(db, uid, () => db.query(`select 1 from storage.objects where name = $1`, [name]));

  it('un file citato da uno snippet pubblico di un mondo pubblicato si legge senza account', async () => {
    await withTx(async (db) => {
      const { owner, stranger, world, snippet } = await setup(db);
      const file = image(world);
      const fileName = file.split('/')[1];
      await upload(db, owner, file);
      const id = await snippet('Pubblico', 'public');
      await db.query(`update snippets set body = $2 where id = $1`, [
        id,
        JSON.stringify({
          type: 'doc',
          content: [{ type: 'image', attrs: { src: `/x/${fileName}` } }],
        }),
      ]);

      expect((await readImage(db, null, file)).rows).toHaveLength(0);
      await db.query(`update worlds set wiki_slug = 'aurelia' where id = $1`, [world]);
      expect((await readImage(db, null, file)).rows).toHaveLength(1);
      expect((await readImage(db, stranger, file)).rows).toHaveLength(1);
    });
  });

  it('un file non citato da nessuno snippet pubblico resta chiuso agli estranei', async () => {
    await withTx(async (db) => {
      const { owner, world, snippet } = await setup(db);
      const file = image(world);
      await upload(db, owner, file);
      await snippet('Membri', 'members');
      await db.query(`update worlds set wiki_slug = 'aurelia' where id = $1`, [world]);
      expect((await readImage(db, null, file)).rows).toHaveLength(0);
    });
  });
});
