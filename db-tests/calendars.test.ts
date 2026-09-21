import { describe, expect, it } from 'vitest';
import { actAs, createUser, withTx, type Db } from './helpers';

async function setup(db: Db) {
  const [owner, editor, reader, stranger] = [
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
    [reader, 'reader'],
  ] as const) {
    await db.query(`insert into world_members (world_id, user_id, role) values ($1, $2, $3)`, [
      worldId,
      user,
      role,
    ]);
  }
  return { owner, editor, reader, stranger, worldId };
}

const definition = JSON.stringify({
  months: [{ name: 'Alba', days: 20 }],
  weekdays: [],
  eras: [],
  epochWeekday: 0,
});

const create = (db: Db, user: string, worldId: string, name = 'Calendario di Aurelia') =>
  actAs(db, user, () =>
    db.query(
      `insert into calendars (world_id, name, definition, created_by) values ($1, $2, $3, $4) returning id`,
      [worldId, name, definition, user],
    ),
  );

describe('calendari', () => {
  it('chi scrive li crea, modifica ed elimina; i lettori li vedono ma non li cambiano', async () => {
    await withTx(async (db) => {
      const { editor, reader, worldId } = await setup(db);
      const { rows } = await create(db, editor, worldId);
      const id = rows[0].id as string;

      const seen = await actAs(db, reader, () => db.query('select name from calendars'));
      expect(seen.rows).toEqual([{ name: 'Calendario di Aurelia' }]);

      await expect(create(db, reader, worldId, 'Altro')).rejects.toThrow();
      const renamed = await actAs(db, reader, () =>
        db.query(`update calendars set name = 'Hack' where id = $1 returning id`, [id]),
      );
      expect(renamed.rows).toEqual([]);
      const removed = await actAs(db, reader, () =>
        db.query('delete from calendars where id = $1 returning id', [id]),
      );
      expect(removed.rows).toEqual([]);

      const updated = await actAs(db, editor, () =>
        db.query(`update calendars set name = 'Nuovo nome' where id = $1 returning id`, [id]),
      );
      expect(updated.rows).toHaveLength(1);
      const gone = await actAs(db, editor, () =>
        db.query('delete from calendars where id = $1 returning id', [id]),
      );
      expect(gone.rows).toHaveLength(1);
    });
  });

  it('gli estranei e gli anonimi non vedono né creano calendari', async () => {
    await withTx(async (db) => {
      const { editor, stranger, worldId } = await setup(db);
      await create(db, editor, worldId);
      expect((await actAs(db, stranger, () => db.query('select 1 from calendars'))).rows).toEqual(
        [],
      );
      await expect(create(db, stranger, worldId, 'Intruso')).rejects.toThrow();
      await expect(actAs(db, null, () => db.query('select 1 from calendars'))).rejects.toThrow();
    });
  });

  it('il nome è univoco nel mondo (senza distinguere maiuscole) e il mondo non si può cambiare', async () => {
    await withTx(async (db) => {
      const { editor, worldId } = await setup(db);
      await create(db, editor, worldId, 'Solare');
      await expect(create(db, editor, worldId, '  solare ')).rejects.toThrow(/calendars_name/);
    });
    await withTx(async (db) => {
      const { owner, editor, worldId } = await setup(db);
      const other = await actAs(db, owner, () =>
        db.query(`insert into worlds (name, owner_id) values ('Altro', $1) returning id`, [owner]),
      );
      const { rows } = await create(db, editor, worldId);
      await expect(
        actAs(db, owner, () =>
          db.query('update calendars set world_id = $1 where id = $2', [
            other.rows[0].id,
            rows[0].id,
          ]),
        ),
      ).rejects.toThrow();
    });
  });

  it('la definizione deve essere un oggetto di dimensione ragionevole; eliminare il mondo li elimina', async () => {
    await withTx(async (db) => {
      const { editor, owner, worldId } = await setup(db);
      await expect(
        actAs(db, editor, () =>
          db.query(`insert into calendars (world_id, name, definition) values ($1, 'X', '[]')`, [
            worldId,
          ]),
        ),
      ).rejects.toThrow();
      await create(db, editor, worldId);
      await actAs(db, owner, () => db.query('delete from worlds where id = $1', [worldId]));
      const left = await db.query('select 1 from calendars where world_id = $1', [worldId]);
      expect(left.rows).toEqual([]);
    });
  });
});
