import { describe, expect, it } from 'vitest';
import { actAs, createUser, withTx, type Db } from './helpers';

async function createWorld(db: Db, owner: string): Promise<string> {
  const { rows } = await actAs(db, owner, () =>
    db.query(`insert into worlds (name, owner_id) values ('Aurelia', $1) returning id`, [owner]),
  );
  return rows[0].id as string;
}

async function addWorldMember(db: Db, world: string, user: string, role = 'reader') {
  await db.query(`insert into world_members (world_id, user_id, role) values ($1, $2, $3)`, [
    world,
    user,
    role,
  ]);
}

async function createSnippet(
  db: Db,
  world: string,
  author: string,
  title = 'Uno snippet',
  visibility = 'members',
): Promise<string> {
  const { rows } = await actAs(db, author, () =>
    db.query(
      `insert into snippets (world_id, title, visibility, created_by) values ($1, $2, $3, $4) returning id`,
      [world, title, visibility, author],
    ),
  );
  return rows[0].id as string;
}

const addComment = (db: Db, uid: string, world: string, snippet: string, body = 'Un commento') =>
  actAs(db, uid, () =>
    db.query(
      `insert into snippet_comments (world_id, snippet_id, author, body) values ($1, $2, $3, $4) returning id`,
      [world, snippet, uid, body],
    ),
  );

const commentsOf = (db: Db, uid: string | null, snippet: string) =>
  actAs(db, uid, () =>
    db.query('select id, author, body from snippet_comments where snippet_id = $1', [snippet]),
  ).then((r) => r.rows);

describe('commenti su uno snippet', () => {
  it('un lettore commenta (non solo chi scrive); tutti i membri leggono', async () => {
    await withTx(async (db) => {
      const [dm, lettrice] = [await createUser(db, 'dm'), await createUser(db, 'lettrice')];
      const world = await createWorld(db, dm);
      await addWorldMember(db, world, lettrice, 'reader');
      const snippet = await createSnippet(db, world, dm);
      await addComment(db, lettrice, world, snippet, 'Bella idea!');
      const forDm = await commentsOf(db, dm, snippet);
      expect(forDm).toHaveLength(1);
      expect(forDm[0]).toMatchObject({ body: 'Bella idea!', author: lettrice });
    });
  });

  it('un estraneo non legge né scrive commenti su uno snippet segreto', async () => {
    await withTx(async (db) => {
      const [dm, estraneo] = [await createUser(db, 'dm'), await createUser(db, 'estraneo')];
      const world = await createWorld(db, dm);
      const snippet = await createSnippet(db, world, dm, 'Segreto', 'secret');
      expect(await commentsOf(db, estraneo, snippet)).toEqual([]);
      await expect(addComment(db, estraneo, world, snippet)).rejects.toThrow(/row-level security/);
    });
  });

  it('un membro senza accesso allo snippet (livello «giocatori scelti») non vede né scrive i suoi commenti', async () => {
    await withTx(async (db) => {
      const [dm, escluso] = [await createUser(db, 'dm'), await createUser(db, 'escluso')];
      const world = await createWorld(db, dm);
      await addWorldMember(db, world, escluso, 'reader');
      const snippet = await createSnippet(db, world, dm, 'Riservato', 'secret');
      expect(await commentsOf(db, escluso, snippet)).toEqual([]);
      await expect(addComment(db, escluso, world, snippet)).rejects.toThrow(/row-level security/);
    });
  });

  it('l’autore elimina il proprio commento; chi scrive nel mondo modera quelli altrui', async () => {
    await withTx(async (db) => {
      const [dm, lettrice, altro] = [
        await createUser(db, 'dm'),
        await createUser(db, 'lettrice'),
        await createUser(db, 'altro'),
      ];
      const world = await createWorld(db, dm);
      await addWorldMember(db, world, lettrice, 'reader');
      await addWorldMember(db, world, altro, 'reader');
      const snippet = await createSnippet(db, world, dm);
      const { rows } = await addComment(db, lettrice, world, snippet);
      const id = rows[0].id as string;

      const forbidden = await actAs(db, altro, () =>
        db.query('delete from snippet_comments where id = $1', [id]),
      );
      expect(forbidden.rowCount).toBe(0);

      const ok = await actAs(db, dm, () =>
        db.query('delete from snippet_comments where id = $1', [id]),
      );
      expect(ok.rowCount).toBe(1);
    });
  });
});
