import { randomUUID } from 'node:crypto';
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

describe('save_snippet', () => {
  const save = (
    db: Db,
    uid: string,
    id: string,
    updated: string,
    cats: string[],
    title = 'Nuovo',
    tags: string[] = [],
    aliases: string[] = [],
    mentions: string[] = [],
  ) =>
    actAs(db, uid, () =>
      db.query(
        `select save_snippet($1, $2, $3, 'draft', '{}'::jsonb, '{}'::jsonb, $4, $5::text[], $6::text[], $7::uuid[])`,
        [id, updated, title, cats, tags, aliases, mentions],
      ),
    );

  async function setup(db: Db) {
    const owner = await createUser(db);
    const worldId = await createWorld(db, owner);
    const id = await addSnippet(db, worldId, owner);
    const cat = async (name: string) =>
      (
        await db.query(`insert into categories (world_id, name) values ($1, $2) returning id`, [
          worldId,
          name,
        ])
      ).rows[0].id as string;
    const updated = async () =>
      (await db.query('select updated_at::text as u from snippets where id = $1', [id])).rows[0]
        .u as string;
    return { owner, worldId, id, cat, updated };
  }

  it('aggiorna i campi e sincronizza le categorie', async () => {
    await withTx(async (db) => {
      const { owner, id, cat, updated } = await setup(db);
      const [a, b] = [await cat('A'), await cat('B')];
      await save(db, owner, id, await updated(), [a]);
      await save(db, owner, id, await updated(), [b], 'Secondo');
      const { rows } = await db.query(
        'select category_id from snippet_categories where snippet_id = $1',
        [id],
      );
      expect(rows.map((r) => r.category_id)).toEqual([b]);
      expect((await db.query('select title from snippets where id = $1', [id])).rows[0].title).toBe(
        'Secondo',
      );
    });
  });

  it('con un token superato dà conflict e non cambia nulla, nemmeno le categorie', async () => {
    await withTx(async (db) => {
      const { owner, id, cat } = await setup(db);
      const a = await cat('A');
      const stale = '2000-01-01T00:00:00Z'; // la transazione di test congela now()
      await expect(save(db, owner, id, stale, [a])).rejects.toThrow('conflict');
      const { rows } = await db.query('select 1 from snippet_categories where snippet_id = $1', [
        id,
      ]);
      expect(rows).toHaveLength(0);
    });
  });

  it('un lettore non può salvare', async () => {
    await withTx(async (db) => {
      const { worldId, id, updated } = await setup(db);
      const reader = await createUser(db);
      await db.query(
        `insert into world_members (world_id, user_id, role) values ($1, $2, 'reader')`,
        [worldId, reader],
      );
      await expect(save(db, reader, id, await updated(), [])).rejects.toThrow('conflict');
    });
  });

  it('salva tag e alias', async () => {
    await withTx(async (db) => {
      const { owner, id, updated } = await setup(db);
      await save(db, owner, id, await updated(), [], 'T', ['magia', 'draghi'], ['Il Lupo']);
      const { rows } = await db.query('select tags, aliases from snippets where id = $1', [id]);
      expect(rows[0].tags).toEqual(['magia', 'draghi']);
      expect(rows[0].aliases).toEqual(['Il Lupo']);
    });
  });

  it('rifiuta tag o alias vuoti o troppo lunghi, senza cambiare nulla', async () => {
    await withTx(async (db) => {
      const { owner, id, updated } = await setup(db);
      const token = await updated();
      await expect(save(db, owner, id, token, [], 'X', ['x'.repeat(41)])).rejects.toThrow(
        'invalid_labels',
      );
      await expect(save(db, owner, id, token, [], 'X', ['  '])).rejects.toThrow('invalid_labels');
      await expect(save(db, owner, id, token, [], 'X', [], ['y'.repeat(101)])).rejects.toThrow(
        'invalid_labels',
      );
      expect((await db.query('select title from snippets where id = $1', [id])).rows[0].title).toBe(
        'Elara',
      );
    });
  });

  it('limita il numero di tag e di alias', async () => {
    await withTx(async (db) => {
      const { owner, id, updated } = await setup(db);
      const many = (n: number) => Array.from({ length: n }, (_, i) => `t${i}`);
      await expect(save(db, owner, id, await updated(), [], 'X', many(31))).rejects.toThrow();
      await expect(save(db, owner, id, await updated(), [], 'X', [], many(21))).rejects.toThrow();
    });
  });

  it('i vincoli valgono anche per gli update diretti sulla tabella', async () => {
    await withTx(async (db) => {
      const { owner, id } = await setup(db);
      const direct = (col: string, value: string[]) =>
        actAs(db, owner, () =>
          db.query(`update snippets set ${col} = $1::text[] where id = $2`, [value, id]),
        );
      await expect(direct('tags', ['x'.repeat(41)])).rejects.toThrow(/snippets_tags_valid/);
      await expect(direct('tags', ['a,b'])).rejects.toThrow(/snippets_tags_valid/);
      await expect(direct('tags', ['a"b'])).rejects.toThrow(/snippets_tags_valid/);
      await expect(direct('tags', ['  '])).rejects.toThrow(/snippets_tags_valid/);
      await expect(direct('aliases', ['y'.repeat(101)])).rejects.toThrow(/snippets_aliases_valid/);
      await direct('aliases', ['Smith, John']);
    });
  });

  describe('menzioni', () => {
    const autosave = (db: Db, uid: string, id: string, updated: string, mentions: string[]) =>
      actAs(db, uid, () =>
        db.query(`select autosave_snippet_body($1, $2, '{}'::jsonb, $3::uuid[]) as updated`, [
          id,
          updated,
          mentions,
        ]),
      );
    const mentionRelations = async (db: Db, source: string) =>
      (
        await db.query(
          `select target_id, label, inverse_label from relations where source_id = $1 and from_mention`,
          [source],
        )
      ).rows;

    it('una menzione crea la relazione, e sparisce se la menzione sparisce', async () => {
      await withTx(async (db) => {
        const { owner, worldId, id, updated } = await setup(db);
        const target = await addSnippet(db, worldId, owner, 'Citato');
        await save(db, owner, id, await updated(), [], 'T', [], [], [target]);
        expect(await mentionRelations(db, id)).toEqual([
          { target_id: target, label: 'menziona', inverse_label: 'menzionato in' },
        ]);
        await save(db, owner, id, '2000-01-01T00:00:00Z', [], 'T', [], [], []).catch(() => {});
        await save(db, owner, id, await updated(), [], 'T', [], [], []);
        expect(await mentionRelations(db, id)).toEqual([]);
      });
    });

    it('ignora se stesso, snippet di altri mondi e snippet nel cestino', async () => {
      await withTx(async (db) => {
        const { owner, worldId, id, updated } = await setup(db);
        const other = await createUser(db);
        const foreignWorld = await createWorld(db, other);
        const foreign = await addSnippet(db, foreignWorld, other, 'Estraneo');
        const trashed = await addSnippet(db, worldId, owner, 'Cestinato');
        await db.query(`update snippets set deleted_at = now() where id = $1`, [trashed]);
        await save(db, owner, id, await updated(), [], 'T', [], [], [id, foreign, trashed]);
        expect(await mentionRelations(db, id)).toEqual([]);
      });
    });

    it('non tocca le relazioni fatte a mano, nemmeno con la stessa etichetta', async () => {
      await withTx(async (db) => {
        const { owner, worldId, id, updated } = await setup(db);
        const target = await addSnippet(db, worldId, owner, 'Citato');
        await actAs(db, owner, () =>
          db.query(
            `insert into relations (world_id, source_id, target_id, label, created_by) values ($1, $2, $3, 'menziona', $4)`,
            [worldId, id, target, owner],
          ),
        );
        await save(db, owner, id, await updated(), [], 'T', [], [], [target]);
        await save(db, owner, id, await updated(), [], 'T', [], [], []);
        const { rows } = await db.query(`select from_mention from relations where source_id = $1`, [
          id,
        ]);
        expect(rows).toEqual([{ from_mention: false }]);
      });
    });

    it('un tipo vincolato con la stessa etichetta non fa fallire il salvataggio', async () => {
      await withTx(async (db) => {
        const { owner, worldId, id, updated } = await setup(db);
        const category = (
          await actAs(db, owner, () =>
            db.query(`insert into categories (world_id, name) values ($1, 'Luogo') returning id`, [
              worldId,
            ]),
          )
        ).rows[0].id;
        await actAs(db, owner, () =>
          db.query(
            `insert into relation_types (world_id, label, source_category_id) values ($1, 'menziona', $2)`,
            [worldId, category],
          ),
        );
        const target = await addSnippet(db, worldId, owner, 'Citato');
        await save(db, owner, id, await updated(), [], 'T', [], [], [target]);
        expect(await mentionRelations(db, id)).toHaveLength(1);
      });
    });

    it('autosave: aggiorna corpo e menzioni e restituisce il nuovo token; con un token vecchio dà conflict', async () => {
      await withTx(async (db) => {
        const { owner, worldId, id, updated } = await setup(db);
        const target = await addSnippet(db, worldId, owner, 'Citato');
        const result = await autosave(db, owner, id, await updated(), [target]);
        expect(result.rows[0].updated).toBeTruthy();
        expect(await mentionRelations(db, id)).toHaveLength(1);
        await expect(autosave(db, owner, id, '2000-01-01T00:00:00Z', [])).rejects.toThrow(
          'conflict',
        );
        expect(await mentionRelations(db, id)).toHaveLength(1);
      });
    });

    it('elementi NULL e troppe menzioni: NULL scartati, oltre 200 rifiutate', async () => {
      await withTx(async (db) => {
        const { owner, worldId, id, updated } = await setup(db);
        const target = await addSnippet(db, worldId, owner, 'Citato');
        await save(db, owner, id, await updated(), [], 'T', [], [], [target]);
        expect(await mentionRelations(db, id)).toHaveLength(1);
        // Un array con NULL: il NULL è ignorato e la menzione sparita viene comunque rimossa.
        const token = await updated();
        await actAs(db, owner, () =>
          db.query(
            `select save_snippet($1, $2, 'T', 'draft', '{}'::jsonb, '{}'::jsonb, '{}'::uuid[], '{}'::text[], '{}'::text[], array[null]::uuid[])`,
            [id, token],
          ),
        );
        expect(await mentionRelations(db, id)).toEqual([]);
        const many = Array.from({ length: 201 }, () => randomUUID());
        await expect(save(db, owner, id, await updated(), [], 'T', [], [], many)).rejects.toThrow(
          'too_many_mentions',
        );
      });
    });

    it('from_mention non si imposta a mano né si cambia dopo, e vale solo con le etichette fisse', async () => {
      await withTx(async (db) => {
        const { owner, worldId, id, updated } = await setup(db);
        void updated;
        const a = id;
        const b = await addSnippet(db, worldId, owner, 'Altro');
        const insert = (label: string, inverse: string | null) =>
          actAs(db, owner, () =>
            db.query(
              `insert into relations (world_id, source_id, target_id, label, inverse_label, from_mention, created_by)
               values ($1, $2, $3, $4, $5, true, $6)`,
              [worldId, a, b, label, inverse, owner],
            ),
          );
        await expect(insert('amico di', null)).rejects.toThrow('invalid_mention_relation');
        await expect(insert('menziona', 'altro')).rejects.toThrow('invalid_mention_relation');
        await insert(' Menziona ', 'menzionato in');
        await expect(
          actAs(db, owner, () =>
            db.query(`update relations set from_mention = false where source_id = $1`, [a]),
          ),
        ).rejects.toThrow();
        await actAs(db, owner, () =>
          db.query(
            `insert into relations (world_id, source_id, target_id, label, created_by) values ($1, $2, $3, 'x', $4)`,
            [worldId, b, a, owner],
          ),
        );
        await expect(
          actAs(db, owner, () =>
            db.query(`update relations set from_mention = true where source_id = $1`, [b]),
          ),
        ).rejects.toThrow();
      });
    });

    it('un lettore non può salvare né creare menzioni', async () => {
      await withTx(async (db) => {
        const { worldId, id, updated, owner } = await setup(db);
        const target = await addSnippet(db, worldId, owner, 'Citato');
        const reader = await createUser(db);
        await db.query(
          `insert into world_members (world_id, user_id, role) values ($1, $2, 'reader')`,
          [worldId, reader],
        );
        await expect(autosave(db, reader, id, await updated(), [target])).rejects.toThrow(
          'conflict',
        );
        expect(await mentionRelations(db, id)).toEqual([]);
      });
    });
  });
});
