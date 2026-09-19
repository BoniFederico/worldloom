import { describe, expect, it } from 'vitest';
import { actAs, createUser, withTx, type Db } from './helpers';

async function createWorld(db: Db, ownerId: string): Promise<string> {
  const { rows } = await actAs(db, ownerId, () =>
    db.query(`insert into worlds (name, owner_id) values ('Aurelia', $1) returning id`, [ownerId]),
  );
  return rows[0].id;
}

const emailOf = async (db: Db, id: string) =>
  (await db.query('select email from auth.users where id = $1', [id])).rows[0].email as string;

const roleOf = async (db: Db, worldId: string, userId: string) =>
  (
    await db.query('select role from world_members where world_id = $1 and user_id = $2', [
      worldId,
      userId,
    ])
  ).rows[0]?.role as string | undefined;

const add = (db: Db, uid: string, worldId: string, email: string, role: string) =>
  actAs(db, uid, () => db.query('select add_world_member($1, $2, $3)', [worldId, email, role]));

describe('add_world_member', () => {
  it('il proprietario aggiunge un utente registrato per email, senza badare alle maiuscole', async () => {
    await withTx(async (db) => {
      const [owner, guest] = [await createUser(db), await createUser(db, 'ospite')];
      const worldId = await createWorld(db, owner);
      await add(db, owner, worldId, (await emailOf(db, guest)).toUpperCase(), 'editor');
      expect(await roleOf(db, worldId, guest)).toBe('editor');
    });
  });

  it('riaggiungere un membro ne aggiorna il ruolo', async () => {
    await withTx(async (db) => {
      const [owner, guest] = [await createUser(db), await createUser(db)];
      const worldId = await createWorld(db, owner);
      await add(db, owner, worldId, await emailOf(db, guest), 'reader');
      await add(db, owner, worldId, await emailOf(db, guest), 'commenter');
      expect(await roleOf(db, worldId, guest)).toBe('commenter');
    });
  });

  it('non permette di assegnare il ruolo owner', async () => {
    await withTx(async (db) => {
      const [owner, guest] = [await createUser(db), await createUser(db)];
      const worldId = await createWorld(db, owner);
      await expect(add(db, owner, worldId, await emailOf(db, guest), 'owner')).rejects.toThrow(
        /invalid_role/,
      );
    });
  });

  it('un editor o un estraneo non può aggiungere membri', async () => {
    await withTx(async (db) => {
      const [owner, editor, outsider, target] = [
        await createUser(db),
        await createUser(db),
        await createUser(db),
        await createUser(db),
      ];
      const worldId = await createWorld(db, owner);
      await add(db, owner, worldId, await emailOf(db, editor), 'editor');
      const email = await emailOf(db, target);
      await expect(add(db, editor, worldId, email, 'reader')).rejects.toThrow(/forbidden/);
      await expect(add(db, outsider, worldId, email, 'reader')).rejects.toThrow(/forbidden/);
      expect(await roleOf(db, worldId, target)).toBeUndefined();
    });
  });

  it('un email sconosciuto dà user_not_found', async () => {
    await withTx(async (db) => {
      const owner = await createUser(db);
      const worldId = await createWorld(db, owner);
      await expect(add(db, owner, worldId, 'nessuno@example.test', 'reader')).rejects.toThrow(
        /user_not_found/,
      );
    });
  });

  it('il proprietario non può retrocedersi aggiungendo la propria email', async () => {
    await withTx(async (db) => {
      const owner = await createUser(db);
      const worldId = await createWorld(db, owner);
      await add(db, owner, worldId, await emailOf(db, owner), 'reader');
      expect(await roleOf(db, worldId, owner)).toBe('owner');
    });
  });

  it('un utente anonimo non può chiamare la funzione', async () => {
    await withTx(async (db) => {
      const owner = await createUser(db);
      const worldId = await createWorld(db, owner);
      await expect(
        actAs(db, null, () =>
          db.query('select add_world_member($1, $2, $3)', [worldId, 'a@b.it', 'reader']),
        ),
      ).rejects.toThrow(/permission denied/);
    });
  });
});

describe('transfer_world_ownership', () => {
  const transfer = (db: Db, uid: string, worldId: string, to: string) =>
    actAs(db, uid, () => db.query('select transfer_world_ownership($1, $2)', [worldId, to]));

  it('passa la proprietà a un membro e retrocede il precedente a editor', async () => {
    await withTx(async (db) => {
      const [owner, member] = [await createUser(db), await createUser(db)];
      const worldId = await createWorld(db, owner);
      await add(db, owner, worldId, await emailOf(db, member), 'reader');
      await transfer(db, owner, worldId, member);
      expect(await roleOf(db, worldId, member)).toBe('owner');
      expect(await roleOf(db, worldId, owner)).toBe('editor');
      const world = await db.query('select owner_id from worlds where id = $1', [worldId]);
      expect(world.rows[0].owner_id).toBe(member);
      const renamed = await actAs(db, member, () =>
        db.query(`update worlds set name = 'Nuovo' where id = $1`, [worldId]),
      );
      expect(renamed.rowCount).toBe(1);
    });
  });

  it('solo il proprietario può trasferire, e solo a un membro', async () => {
    await withTx(async (db) => {
      const [owner, editor, outsider] = [
        await createUser(db),
        await createUser(db),
        await createUser(db),
      ];
      const worldId = await createWorld(db, owner);
      await add(db, owner, worldId, await emailOf(db, editor), 'editor');
      await expect(transfer(db, editor, worldId, editor)).rejects.toThrow(/forbidden/);
      await expect(transfer(db, owner, worldId, outsider)).rejects.toThrow(/not_a_member/);
      expect(await roleOf(db, worldId, owner)).toBe('owner');
    });
  });
});
