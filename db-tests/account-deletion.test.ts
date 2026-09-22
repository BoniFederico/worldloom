import { describe, expect, it } from 'vitest';
import { actAs, createUser, withTx, type Db } from './helpers';

const DELETED_USER = '00000000-0000-0000-0000-000000000001';

const createWorld = async (db: Db, owner: string, name = 'Aurelia') =>
  (
    await actAs(db, owner, () =>
      db.query(`insert into worlds (name, owner_id) values ($1, $2) returning id`, [name, owner]),
    )
  ).rows[0].id as string;

const addMember = (db: Db, worldId: string, userId: string, role: string) =>
  db.query(`insert into world_members (world_id, user_id, role) values ($1, $2, $3)`, [
    worldId,
    userId,
    role,
  ]);

const deleteAccount = (db: Db, uid: string) =>
  actAs(db, uid, () => db.query(`select delete_own_account()`));

describe('cancellazione dell’account (GDPR, #44)', () => {
  it('non si può cancellare senza una sessione', async () => {
    await withTx(async (db) => {
      await expect(
        actAs(db, null, () => db.query(`select delete_own_account()`)),
      ).rejects.toThrow();
    });
  });

  it('chi possiede un mondo non può cancellare l’account finché non lo trasferisce o elimina', async () => {
    await withTx(async (db) => {
      const owner = await createUser(db);
      await createWorld(db, owner);
      await expect(deleteAccount(db, owner)).rejects.toThrow(/owns_worlds/);
    });
  });

  it('chi possiede una campagna non può cancellare l’account', async () => {
    await withTx(async (db) => {
      const owner = await createUser(db);
      await actAs(db, owner, () =>
        db.query(`insert into campaigns (name, owner_id) values ('Prova', $1)`, [owner]),
      );
      await expect(deleteAccount(db, owner)).rejects.toThrow(/owns_campaigns/);
    });
  });

  it('un editor che ha scritto in un mondo altrui cancella l’account: il contenuto resta, l’autore diventa «Account eliminato»', async () => {
    await withTx(async (db) => {
      const owner = await createUser(db);
      const editor = await createUser(db);
      const worldId = await createWorld(db, owner);
      await addMember(db, worldId, editor, 'editor');

      const snippetId = (
        await actAs(db, editor, () =>
          db.query(
            `insert into snippets (world_id, title, created_by) values ($1, 'Scritto da editor', $2) returning id`,
            [worldId, editor],
          ),
        )
      ).rows[0].id as string;
      const other = (
        await actAs(db, owner, () =>
          db.query(
            `insert into snippets (world_id, title, created_by) values ($1, 'Altro', $2) returning id`,
            [worldId, owner],
          ),
        )
      ).rows[0].id as string;
      const relationId = (
        await actAs(db, editor, () =>
          db.query(
            `insert into relations (world_id, source_id, target_id, label, created_by) values ($1, $2, $3, 'vede', $4) returning id`,
            [worldId, snippetId, other, editor],
          ),
        )
      ).rows[0].id as string;
      const viewId = (
        await actAs(db, editor, () =>
          db.query(
            `insert into saved_views (world_id, name, kind, created_by) values ($1, 'Vista', 'list', $2) returning id`,
            [worldId, editor],
          ),
        )
      ).rows[0].id as string;

      await deleteAccount(db, editor);

      // L'utente e la sua appartenenza al mondo sono spariti.
      const { rows: users } = await db.query(`select 1 from auth.users where id = $1`, [editor]);
      expect(users).toHaveLength(0);
      const { rows: members } = await db.query(
        `select 1 from world_members where world_id = $1 and user_id = $2`,
        [worldId, editor],
      );
      expect(members).toHaveLength(0);

      // Il contenuto resta, con l'autore riassegnato al segnaposto.
      const authorOf = async (table: string, id: string) =>
        (await db.query(`select created_by from ${table} where id = $1`, [id])).rows[0]
          .created_by as string;
      expect(await authorOf('snippets', snippetId)).toBe(DELETED_USER);
      expect(await authorOf('relations', relationId)).toBe(DELETED_USER);
      expect(await authorOf('saved_views', viewId)).toBe(DELETED_USER);

      const { rows: title } = await db.query(`select title from snippets where id = $1`, [
        snippetId,
      ]);
      expect(title[0].title).toBe('Scritto da editor');
    });
  });

  it('chi non ha mai posseduto né scritto nulla cancella l’account senza effetti collaterali', async () => {
    await withTx(async (db) => {
      const lonely = await createUser(db);
      await deleteAccount(db, lonely);
      const { rows } = await db.query(`select 1 from auth.users where id = $1`, [lonely]);
      expect(rows).toHaveLength(0);
    });
  });
});
