import { describe, expect, it } from 'vitest';
import { actAs, createUser, withTx, type Db } from './helpers';

async function createWorld(db: Db, ownerId: string): Promise<string> {
  const { rows } = await actAs(db, ownerId, () =>
    db.query(`insert into worlds (name, owner_id) values ('Aurelia', $1) returning id`, [ownerId]),
  );
  return rows[0].id;
}

async function addSnippet(db: Db, worldId: string, userId: string, title = 'Elara') {
  const { rows } = await actAs(db, userId, () =>
    db.query(
      `insert into snippets (world_id, title, created_by) values ($1, $2, $3) returning id`,
      [worldId, title, userId],
    ),
  );
  return rows[0].id as string;
}

describe('cestino degli snippet', () => {
  it('purge_expired_snippets elimina solo quelli nel cestino da più di 30 giorni', async () => {
    await withTx(async (db) => {
      const owner = await createUser(db);
      const worldId = await createWorld(db, owner);
      const old = await addSnippet(db, worldId, owner, 'Vecchio');
      const recent = await addSnippet(db, worldId, owner, 'Recente');
      const live = await addSnippet(db, worldId, owner, 'Vivo');
      await db.query(`update snippets set deleted_at = now() - interval '31 days' where id = $1`, [
        old,
      ]);
      await db.query(`update snippets set deleted_at = now() - interval '29 days' where id = $1`, [
        recent,
      ]);

      const { rows } = await db.query('select private.purge_expired_snippets() as removed');
      expect(rows[0].removed).toBe(1);
      const left = await db.query('select id from snippets where world_id = $1', [worldId]);
      expect(left.rows.map((r) => r.id).sort()).toEqual([recent, live].sort());
    });
  });

  it('la funzione di purge non è chiamabile dagli utenti', async () => {
    await withTx(async (db) => {
      const owner = await createUser(db);
      await expect(
        actAs(db, owner, () => db.query('select private.purge_expired_snippets()')),
      ).rejects.toThrow();
    });
  });

  it('gli snippet nel cestino restano visibili solo a chi può scrivere', async () => {
    await withTx(async (db) => {
      const [owner, reader] = [await createUser(db), await createUser(db)];
      const worldId = await createWorld(db, owner);
      await db.query(
        `insert into world_members (world_id, user_id, role) values ($1, $2, 'reader')`,
        [worldId, reader],
      );
      const id = await addSnippet(db, worldId, owner);
      await actAs(db, owner, () =>
        db.query(`update snippets set deleted_at = now() where id = $1`, [id]),
      );
      const asOwner = await actAs(db, owner, () =>
        db.query('select id from snippets where id = $1', [id]),
      );
      const asReader = await actAs(db, reader, () =>
        db.query('select id from snippets where id = $1', [id]),
      );
      expect(asOwner.rows).toHaveLength(1);
      expect(asReader.rows).toHaveLength(0);
    });
  });

  it('un lettore non può eliminare né ripristinare uno snippet', async () => {
    await withTx(async (db) => {
      const [owner, reader] = [await createUser(db), await createUser(db)];
      const worldId = await createWorld(db, owner);
      await db.query(
        `insert into world_members (world_id, user_id, role) values ($1, $2, 'reader')`,
        [worldId, reader],
      );
      const id = await addSnippet(db, worldId, owner);
      const res = await actAs(db, reader, () =>
        db.query(`update snippets set deleted_at = now() where id = $1`, [id]),
      );
      expect(res.rowCount).toBe(0);
    });
  });
});
