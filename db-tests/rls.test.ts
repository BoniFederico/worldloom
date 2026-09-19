import { describe, expect, it } from 'vitest';
import { actAs, createUser, withTx, type Db } from './helpers';

type Role = 'owner' | 'editor' | 'commenter' | 'reader';

async function createWorld(db: Db, ownerId: string): Promise<string> {
  const { rows } = await actAs(db, ownerId, () =>
    db.query(`insert into worlds (name, owner_id) values ('Aurelia', $1) returning id`, [ownerId]),
  );
  return rows[0].id;
}

async function addMember(db: Db, worldId: string, userId: string, role: Role) {
  await db.query(`insert into world_members (world_id, user_id, role) values ($1, $2, $3)`, [
    worldId,
    userId,
    role,
  ]);
}

async function addSnippet(
  db: Db,
  worldId: string,
  userId: string,
  title: string,
  visibility: string,
) {
  const { rows } = await db.query(
    `insert into snippets (world_id, title, visibility, created_by) values ($1, $2, $3, $4) returning id`,
    [worldId, title, visibility, userId],
  );
  return rows[0].id as string;
}

const titlesSeenBy = (db: Db, userId: string | null) =>
  actAs(db, userId, async () => {
    const { rows } = await db.query('select title from snippets order by title');
    return rows.map((r) => r.title as string);
  });

describe('mondi e membri', () => {
  it('chi crea un mondo ne diventa proprietario e lo vede', async () => {
    await withTx(async (db) => {
      const owner = await createUser(db);
      const worldId = await createWorld(db, owner);
      const role = await db.query(
        'select role from world_members where world_id = $1 and user_id = $2',
        [worldId, owner],
      );
      expect(role.rows[0].role).toBe('owner');
    });
  });

  it('non si può creare un mondo a nome di un altro utente', async () => {
    await withTx(async (db) => {
      const [a, b] = [await createUser(db), await createUser(db)];
      await expect(
        actAs(db, a, () =>
          db.query(`insert into worlds (name, owner_id) values ('Falso', $1)`, [b]),
        ),
      ).rejects.toThrow(/row-level security/);
    });
  });

  it('un estraneo non vede il mondo altrui', async () => {
    await withTx(async (db) => {
      const [owner, outsider] = [await createUser(db), await createUser(db)];
      await createWorld(db, owner);
      const seen = await actAs(db, outsider, () => db.query('select id from worlds'));
      expect(seen.rowCount).toBe(0);
    });
  });

  it('un estraneo non può aggiungersi come membro (escalation)', async () => {
    await withTx(async (db) => {
      const [owner, outsider] = [await createUser(db), await createUser(db)];
      const worldId = await createWorld(db, owner);
      await expect(
        actAs(db, outsider, () =>
          db.query(
            `insert into world_members (world_id, user_id, role) values ($1, $2, 'editor')`,
            [worldId, outsider],
          ),
        ),
      ).rejects.toThrow(/row-level security/);
    });
  });

  it('un editor non può promuoversi a proprietario né invitare', async () => {
    await withTx(async (db) => {
      const [owner, editor, other] = [
        await createUser(db),
        await createUser(db),
        await createUser(db),
      ];
      const worldId = await createWorld(db, owner);
      await addMember(db, worldId, editor, 'editor');
      const promote = await actAs(db, editor, () =>
        db.query(`update world_members set role = 'owner' where world_id = $1 and user_id = $2`, [
          worldId,
          editor,
        ]),
      );
      expect(promote.rowCount).toBe(0);
      await expect(
        actAs(db, editor, () =>
          db.query(
            `insert into world_members (world_id, user_id, role) values ($1, $2, 'reader')`,
            [worldId, other],
          ),
        ),
      ).rejects.toThrow(/row-level security/);
    });
  });

  it('il proprietario invita ma non può creare un secondo proprietario', async () => {
    await withTx(async (db) => {
      const [owner, guest] = [await createUser(db), await createUser(db)];
      const worldId = await createWorld(db, owner);
      await actAs(db, owner, () =>
        db.query(`insert into world_members (world_id, user_id, role) values ($1, $2, 'reader')`, [
          worldId,
          guest,
        ]),
      );
      await expect(
        actAs(db, owner, () =>
          db.query(`update world_members set role = 'owner' where world_id = $1 and user_id = $2`, [
            worldId,
            guest,
          ]),
        ),
      ).rejects.toThrow(/row-level security/);
    });
  });
});

describe('snippet e visibilità', () => {
  it('un estraneo non legge snippet di altri mondi', async () => {
    await withTx(async (db) => {
      const [owner, outsider] = [await createUser(db), await createUser(db)];
      const worldId = await createWorld(db, owner);
      await addSnippet(db, worldId, owner, 'Segreto del re', 'members');
      expect(await titlesSeenBy(db, outsider)).toEqual([]);
    });
  });

  it('il lettore vede solo membri/pubblico, mai i segreti', async () => {
    await withTx(async (db) => {
      const [owner, reader] = [await createUser(db), await createUser(db)];
      const worldId = await createWorld(db, owner);
      await addMember(db, worldId, reader, 'reader');
      await addSnippet(db, worldId, owner, 'A segreto', 'secret');
      await addSnippet(db, worldId, owner, 'B condiviso', 'shared');
      await addSnippet(db, worldId, owner, 'C membri', 'members');
      await addSnippet(db, worldId, owner, 'D pubblico', 'public');
      expect(await titlesSeenBy(db, reader)).toEqual(['C membri', 'D pubblico']);
      expect(await titlesSeenBy(db, owner)).toHaveLength(4);
    });
  });

  it('un utente anonimo vede solo gli snippet pubblici', async () => {
    await withTx(async (db) => {
      const owner = await createUser(db);
      const worldId = await createWorld(db, owner);
      await addSnippet(db, worldId, owner, 'Privato', 'members');
      await addSnippet(db, worldId, owner, 'Pubblico', 'public');
      expect(await titlesSeenBy(db, null)).toEqual(['Pubblico']);
    });
  });

  it('gli snippet nel cestino sono visibili solo a chi può scrivere', async () => {
    await withTx(async (db) => {
      const [owner, reader] = [await createUser(db), await createUser(db)];
      const worldId = await createWorld(db, owner);
      await addMember(db, worldId, reader, 'reader');
      const id = await addSnippet(db, worldId, owner, 'Eliminato', 'members');
      await db.query('update snippets set deleted_at = now() where id = $1', [id]);
      expect(await titlesSeenBy(db, reader)).toEqual([]);
      expect(await titlesSeenBy(db, owner)).toEqual(['Eliminato']);
    });
  });

  it('solo owner ed editor scrivono; il lettore no', async () => {
    await withTx(async (db) => {
      const [owner, editor, reader] = [
        await createUser(db),
        await createUser(db),
        await createUser(db),
      ];
      const worldId = await createWorld(db, owner);
      await addMember(db, worldId, editor, 'editor');
      await addMember(db, worldId, reader, 'reader');
      const insert = (uid: string) =>
        actAs(db, uid, () =>
          db.query(`insert into snippets (world_id, title, created_by) values ($1, 'Nuovo', $2)`, [
            worldId,
            uid,
          ]),
        );
      await expect(insert(editor)).resolves.toBeDefined();
      await expect(insert(reader)).rejects.toThrow(/row-level security/);
    });
  });

  it('IDOR: un estraneo non modifica né elimina snippet altrui', async () => {
    await withTx(async (db) => {
      const [owner, outsider] = [await createUser(db), await createUser(db)];
      const worldId = await createWorld(db, owner);
      const id = await addSnippet(db, worldId, owner, 'Intoccabile', 'public');
      const upd = await actAs(db, outsider, () =>
        db.query(`update snippets set title = 'X' where id = $1`, [id]),
      );
      const del = await actAs(db, outsider, () =>
        db.query('delete from snippets where id = $1', [id]),
      );
      expect([upd.rowCount, del.rowCount]).toEqual([0, 0]);
      const { rows } = await db.query('select title from snippets where id = $1', [id]);
      expect(rows[0].title).toBe('Intoccabile');
    });
  });

  it('created_by deve essere l’utente autenticato', async () => {
    await withTx(async (db) => {
      const [owner, other] = [await createUser(db), await createUser(db)];
      const worldId = await createWorld(db, owner);
      await expect(
        actAs(db, owner, () =>
          db.query(`insert into snippets (world_id, title, created_by) values ($1, 'X', $2)`, [
            worldId,
            other,
          ]),
        ),
      ).rejects.toThrow(/row-level security/);
    });
  });
});

describe('relazioni', () => {
  it('non si collegano snippet di mondi diversi (vincolo a livello dati)', async () => {
    await withTx(async (db) => {
      const owner = await createUser(db);
      const [w1, w2] = [await createWorld(db, owner), await createWorld(db, owner)];
      const a = await addSnippet(db, w1, owner, 'A', 'members');
      const b = await addSnippet(db, w2, owner, 'B', 'members');
      await expect(
        db.query(
          `insert into relations (world_id, source_id, target_id, label, created_by) values ($1, $2, $3, 'alleato di', $4)`,
          [w1, a, b, owner],
        ),
      ).rejects.toThrow(/foreign key/);
    });
  });

  it('una relazione non rivela uno snippet segreto al lettore', async () => {
    await withTx(async (db) => {
      const [owner, reader] = [await createUser(db), await createUser(db)];
      const worldId = await createWorld(db, owner);
      await addMember(db, worldId, reader, 'reader');
      const pub = await addSnippet(db, worldId, owner, 'Visibile', 'members');
      const secret = await addSnippet(db, worldId, owner, 'Nascosto', 'secret');
      await db.query(
        `insert into relations (world_id, source_id, target_id, label, visibility, created_by) values ($1, $2, $3, 'traditore di', 'members', $4)`,
        [worldId, pub, secret, owner],
      );
      const asReader = await actAs(db, reader, () => db.query('select label from relations'));
      const asOwner = await actAs(db, owner, () => db.query('select label from relations'));
      expect([asReader.rowCount, asOwner.rowCount]).toEqual([0, 1]);
    });
  });

  it('le relazioni segrete non sono visibili ai lettori', async () => {
    await withTx(async (db) => {
      const [owner, reader] = [await createUser(db), await createUser(db)];
      const worldId = await createWorld(db, owner);
      await addMember(db, worldId, reader, 'reader');
      const a = await addSnippet(db, worldId, owner, 'A', 'members');
      const b = await addSnippet(db, worldId, owner, 'B', 'members');
      await db.query(
        `insert into relations (world_id, source_id, target_id, label, visibility, created_by) values ($1, $2, $3, 'nemico di', 'secret', $4)`,
        [worldId, a, b, owner],
      );
      const seen = await actAs(db, reader, () => db.query('select label from relations'));
      expect(seen.rowCount).toBe(0);
    });
  });
});

describe('categorie', () => {
  it('lo snippet può avere più categorie solo dello stesso mondo', async () => {
    await withTx(async (db) => {
      const owner = await createUser(db);
      const [w1, w2] = [await createWorld(db, owner), await createWorld(db, owner)];
      const cat = await db.query(
        `insert into categories (world_id, name) values ($1, 'Luogo') returning id`,
        [w2],
      );
      const snippet = await addSnippet(db, w1, owner, 'Torre', 'members');
      await expect(
        db.query(
          `insert into snippet_categories (world_id, snippet_id, category_id) values ($1, $2, $3)`,
          [w1, snippet, cat.rows[0].id],
        ),
      ).rejects.toThrow(/foreign key/);
    });
  });
});

describe('campi immutabili', () => {
  it('un editor non può falsificare created_by né spostare uno snippet in un altro mondo', async () => {
    await withTx(async (db) => {
      const [owner, editor] = [await createUser(db), await createUser(db)];
      const [w1, w2] = [await createWorld(db, owner), await createWorld(db, owner)];
      await addMember(db, w1, editor, 'editor');
      const id = await addSnippet(db, w1, owner, 'Originale', 'members');
      await expect(
        actAs(db, editor, () =>
          db.query('update snippets set created_by = $1 where id = $2', [editor, id]),
        ),
      ).rejects.toThrow(/immutabile/);
      await expect(
        actAs(db, owner, () =>
          db.query('update snippets set world_id = $1 where id = $2', [w2, id]),
        ),
      ).rejects.toThrow(/immutabile/);
      const { rows } = await db.query('select world_id, created_by from snippets where id = $1', [
        id,
      ]);
      expect(rows[0]).toEqual({ world_id: w1, created_by: owner });
    });
  });

  it('world_id di categorie e relazioni non cambia', async () => {
    await withTx(async (db) => {
      const owner = await createUser(db);
      const [w1, w2] = [await createWorld(db, owner), await createWorld(db, owner)];
      const cat = await db.query(
        `insert into categories (world_id, name) values ($1, 'Luogo') returning id`,
        [w1],
      );
      await expect(
        actAs(db, owner, () =>
          db.query('update categories set world_id = $1 where id = $2', [w2, cat.rows[0].id]),
        ),
      ).rejects.toThrow(/immutabile/);
    });
  });
});
