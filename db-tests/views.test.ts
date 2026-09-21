import { describe, expect, it } from 'vitest';
import { actAs, createUser, withTx, type Db } from './helpers';

async function setup(db: Db) {
  const [owner, editor, editor2, reader, stranger] = [
    await createUser(db),
    await createUser(db),
    await createUser(db),
    await createUser(db),
    await createUser(db),
  ];
  const { rows } = await actAs(db, owner, () =>
    db.query(`insert into worlds (name, owner_id) values ('Aurelia', $1) returning id`, [owner]),
  );
  const worldId = rows[0].id as string;
  for (const [user, role] of [
    [editor, 'editor'],
    [editor2, 'editor'],
    [reader, 'reader'],
  ] as const) {
    await db.query(`insert into world_members (world_id, user_id, role) values ($1, $2, $3)`, [
      worldId,
      user,
      role,
    ]);
  }
  return { owner, editor, editor2, reader, stranger, worldId };
}

const create = (
  db: Db,
  user: string,
  worldId: string,
  extra: { shared?: boolean; name?: string; kind?: string; config?: unknown; by?: string } = {},
) =>
  actAs(db, user, () =>
    db.query(
      `insert into saved_views (world_id, name, kind, filters, config, shared, created_by)
       values ($1, $2, $3, '{"q":"elfo"}', $4, $5, $6) returning id`,
      [
        worldId,
        extra.name ?? 'Elfi',
        extra.kind ?? 'list',
        JSON.stringify(extra.config ?? {}),
        extra.shared ?? true,
        extra.by ?? user,
      ],
    ),
  );

const visible = (db: Db, user: string | null) =>
  actAs(db, user, () => db.query('select name from saved_views order by name'));

describe('viste salvate', () => {
  it('chi scrive crea una vista condivisa: la leggono tutti i membri, non gli estranei', async () => {
    await withTx(async (db) => {
      const { editor, reader, stranger, worldId } = await setup(db);
      await create(db, editor, worldId);
      expect((await visible(db, reader)).rows).toEqual([{ name: 'Elfi' }]);
      expect((await visible(db, editor)).rows).toEqual([{ name: 'Elfi' }]);
      expect((await visible(db, stranger)).rows).toEqual([]);
      await expect(visible(db, null)).rejects.toThrow(/permission denied/);
    });
  });

  it('una vista non condivisa la legge solo chi l’ha creata', async () => {
    await withTx(async (db) => {
      const { editor, editor2, owner, worldId } = await setup(db);
      await create(db, editor, worldId, { shared: false });
      expect((await visible(db, editor)).rows).toHaveLength(1);
      expect((await visible(db, editor2)).rows).toHaveLength(0);
      expect((await visible(db, owner)).rows).toHaveLength(0);
    });
  });

  it('un lettore non può creare viste e nessuno le crea a nome altrui', async () => {
    await withTx(async (db) => {
      const { editor, editor2, reader, worldId } = await setup(db);
      await expect(create(db, reader, worldId)).rejects.toThrow();
      await expect(create(db, editor, worldId, { by: editor2 })).rejects.toThrow();
    });
  });

  it('modifica ed eliminazione: il creatore e il proprietario, non gli altri editor', async () => {
    await withTx(async (db) => {
      const { owner, editor, editor2, worldId } = await setup(db);
      const id = (await create(db, editor, worldId)).rows[0].id as string;
      const rename = (user: string) =>
        actAs(db, user, () =>
          db.query(`update saved_views set name = 'Nuovo' where id = $1 returning id`, [id]),
        );
      expect((await rename(editor2)).rows).toHaveLength(0);
      expect((await rename(editor)).rows).toHaveLength(1);
      const del = (user: string) =>
        actAs(db, user, () => db.query('delete from saved_views where id = $1 returning id', [id]));
      expect((await del(editor2)).rows).toHaveLength(0);
      expect((await del(owner)).rows).toHaveLength(1);
    });
  });

  it('world_id, created_by e tipo non cambiano dopo la creazione', async () => {
    await withTx(async (db) => {
      const { editor, editor2, worldId } = await setup(db);
      const id = (await create(db, editor, worldId)).rows[0].id as string;
      for (const set of [
        `created_by = '${editor2}'`,
        `kind = 'table'`,
        `world_id = gen_random_uuid()`,
      ]) {
        await expect(
          actAs(db, editor, () => db.query(`update saved_views set ${set} where id = $1`, [id])),
        ).rejects.toThrow();
      }
    });
  });

  it('valida tipo, nome e dimensione di filtri e configurazione', async () => {
    await withTx(async (db) => {
      const { editor, worldId } = await setup(db);
      await expect(create(db, editor, worldId, { kind: 'sconosciuto' })).rejects.toThrow();
      await expect(create(db, editor, worldId, { name: '   ' })).rejects.toThrow();
      await expect(create(db, editor, worldId, { name: 'x'.repeat(81) })).rejects.toThrow();
      await expect(
        create(db, editor, worldId, { config: { blob: 'x'.repeat(20_000) } }),
      ).rejects.toThrow();
      await expect(create(db, editor, worldId, { kind: 'table' })).resolves.toBeDefined();
    });
  });

  it('le viste sono eliminate insieme al mondo', async () => {
    await withTx(async (db) => {
      const { editor, worldId } = await setup(db);
      await create(db, editor, worldId);
      await db.query('delete from worlds where id = $1', [worldId]);
      const { rows } = await db.query('select 1 from saved_views where world_id = $1', [worldId]);
      expect(rows).toHaveLength(0);
    });
  });
});
