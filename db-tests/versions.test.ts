import { describe, expect, it } from 'vitest';
import { actAs, createUser, withTx, type Db } from './helpers';

async function setup(db: Db) {
  const [owner, reader, stranger] = [
    await createUser(db),
    await createUser(db),
    await createUser(db),
  ];
  const { rows } = await actAs(db, owner, () =>
    db.query(`insert into worlds (name, owner_id) values ('Aurelia', $1) returning id`, [owner]),
  );
  const worldId = rows[0].id as string;
  await db.query(`insert into world_members (world_id, user_id, role) values ($1, $2, 'reader')`, [
    worldId,
    reader,
  ]);
  const snippet = await actAs(db, owner, () =>
    db.query(
      `insert into snippets (world_id, title, created_by) values ($1, 'Elara', $2) returning id`,
      [worldId, owner],
    ),
  );
  return { owner, reader, stranger, worldId, id: snippet.rows[0].id as string };
}

const versions = (db: Db, id: string) =>
  db.query(
    'select version, title, restored_from from snippet_versions where snippet_id = $1 order by version',
    [id],
  );

const backdate = (db: Db) =>
  db.query(`update snippet_versions set created_at = now() - interval '11 minutes'`);

describe('cronologia versioni', () => {
  it('la creazione registra la versione 1', async () => {
    await withTx(async (db) => {
      const { id } = await setup(db);
      const { rows } = await versions(db, id);
      expect(rows).toEqual([{ version: 1, title: 'Elara', restored_from: null }]);
    });
  });

  it('una modifica ravvicinata dello stesso autore aggiorna la versione, non ne crea una', async () => {
    await withTx(async (db) => {
      const { owner, id } = await setup(db);
      await actAs(db, owner, () =>
        db.query(`update snippets set title = 'Elara B' where id = $1`, [id]),
      );
      const { rows } = await versions(db, id);
      expect(rows.map((r) => r.title)).toEqual(['Elara B']);
    });
  });

  it('una modifica dopo la finestra di 10 minuti crea una nuova versione', async () => {
    await withTx(async (db) => {
      const { owner, id } = await setup(db);
      await backdate(db);
      await actAs(db, owner, () =>
        db.query(`update snippets set title = 'Elara B' where id = $1`, [id]),
      );
      const { rows } = await versions(db, id);
      expect(rows.map((r) => [r.version, r.title])).toEqual([
        [1, 'Elara'],
        [2, 'Elara B'],
      ]);
    });
  });

  it('un altro autore crea sempre una nuova versione', async () => {
    await withTx(async (db) => {
      const { worldId, id } = await setup(db);
      const editor = await createUser(db);
      await db.query(
        `insert into world_members (world_id, user_id, role) values ($1, $2, 'editor')`,
        [worldId, editor],
      );
      await actAs(db, editor, () =>
        db.query(`update snippets set title = 'Elara B' where id = $1`, [id]),
      );
      expect((await versions(db, id)).rows).toHaveLength(2);
      const who = await db.query(
        'select created_by from snippet_versions where version = 2 and snippet_id = $1',
        [id],
      );
      expect(who.rows[0].created_by).toBe(editor);
    });
  });

  it('archivio e cestino non creano versioni', async () => {
    await withTx(async (db) => {
      const { owner, id } = await setup(db);
      await backdate(db);
      await actAs(db, owner, () =>
        db.query(`update snippets set archived_at = now(), deleted_at = now() where id = $1`, [id]),
      );
      expect((await versions(db, id)).rows).toHaveLength(1);
    });
  });

  it('conserva al massimo le ultime 100 versioni', async () => {
    await withTx(async (db) => {
      const { owner, id } = await setup(db);
      for (let i = 0; i < 105; i++) {
        await backdate(db);
        await actAs(db, owner, () =>
          db.query(`update snippets set title = $2 where id = $1`, [id, `Titolo ${i}`]),
        );
      }
      const { rows } = await db.query(
        'select max(version) as hi, count(*)::int as n from snippet_versions where snippet_id = $1',
        [id],
      );
      expect(rows[0].n).toBe(100);
      expect(rows[0].hi).toBe(106);
    });
  });

  it('solo chi può scrivere legge la cronologia', async () => {
    await withTx(async (db) => {
      const { owner, reader, stranger, id } = await setup(db);
      const q = (u: string) =>
        actAs(db, u, () => db.query('select 1 from snippet_versions where snippet_id = $1', [id]));
      expect((await q(owner)).rows).toHaveLength(1);
      expect((await q(reader)).rows).toHaveLength(0);
      expect((await q(stranger)).rows).toHaveLength(0);
    });
  });

  it('nessuno scrive o elimina direttamente nella cronologia', async () => {
    await withTx(async (db) => {
      const { owner, worldId, id } = await setup(db);
      await expect(
        actAs(db, owner, () =>
          db.query(
            `insert into snippet_versions (world_id, snippet_id, version, title, created_by)
             values ($1, $2, 9, 'x', $3)`,
            [worldId, id, owner],
          ),
        ),
      ).rejects.toThrow();
      await expect(
        actAs(db, owner, () =>
          db.query('delete from snippet_versions where snippet_id = $1', [id]),
        ),
      ).rejects.toThrow();
    });
  });

  it('il ripristino riporta il contenuto e registra una nuova versione senza fonderla', async () => {
    await withTx(async (db) => {
      const { owner, id } = await setup(db);
      await backdate(db);
      await actAs(db, owner, () =>
        db.query(`update snippets set title = 'Elara B', tags = '{eroe}' where id = $1`, [id]),
      );
      const cur = await db.query(
        'select updated_at::text as updated_at from snippets where id = $1',
        [id],
      );
      await actAs(db, owner, () =>
        db.query('select public.restore_snippet_version($1, 1, $2)', [id, cur.rows[0].updated_at]),
      );
      const s = await db.query('select title, tags from snippets where id = $1', [id]);
      expect(s.rows[0]).toEqual({ title: 'Elara', tags: [] });
      const { rows } = await versions(db, id);
      expect(rows.map((r) => [r.version, r.title, r.restored_from])).toEqual([
        [1, 'Elara', null],
        [2, 'Elara B', null],
        [3, 'Elara', 1],
      ]);
    });
  });

  it('il ripristino riallinea le relazioni da menzione al testo ripristinato', async () => {
    await withTx(async (db) => {
      const { owner, worldId, id } = await setup(db);
      const mk = async (title: string) =>
        (
          await actAs(db, owner, () =>
            db.query(
              'insert into snippets (world_id, title, created_by) values ($1, $2, $3) returning id',
              [worldId, title, owner],
            ),
          )
        ).rows[0].id as string;
      const [a, b] = [await mk('Aragorn'), await mk('Boromir')];
      const doc = (target: string) =>
        JSON.stringify({
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'mention', attrs: { id: target } }] }],
        });
      const save = async (target: string) => {
        const cur = await db.query('select updated_at::text as u from snippets where id = $1', [
          id,
        ]);
        await actAs(db, owner, () =>
          db.query('select public.autosave_snippet_body($1, $2, $3::jsonb, $4::uuid[])', [
            id,
            cur.rows[0].u,
            doc(target),
            [target],
          ]),
        );
      };
      await save(a);
      await backdate(db);
      await save(b);
      const targets = () =>
        db
          .query('select target_id from relations where source_id = $1 and from_mention', [id])
          .then((r) => r.rows.map((x) => x.target_id));
      expect(await targets()).toEqual([b]);

      const cur = await db.query('select updated_at::text as u from snippets where id = $1', [id]);
      await actAs(db, owner, () =>
        db.query('select public.restore_snippet_version($1, 1, $2)', [id, cur.rows[0].u]),
      );
      expect(await targets()).toEqual([a]);
    });
  });

  it('il ripristino rifiuta un token superato e un lettore', async () => {
    await withTx(async (db) => {
      const { owner, reader, id } = await setup(db);
      await expect(
        actAs(db, owner, () =>
          db.query(`select public.restore_snippet_version($1, 1, now() - interval '1 day')`, [id]),
        ),
      ).rejects.toThrow(/conflict/);
      const cur = await db.query(
        'select updated_at::text as updated_at from snippets where id = $1',
        [id],
      );
      await expect(
        actAs(db, reader, () =>
          db.query('select public.restore_snippet_version($1, 1, $2)', [
            id,
            cur.rows[0].updated_at,
          ]),
        ),
      ).rejects.toThrow();
    });
  });
});
