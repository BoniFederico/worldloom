import { describe, expect, it } from 'vitest';
import { actAs, createUser, withTx, type Db } from './helpers';

async function setup(db: Db) {
  const owner = await createUser(db);
  const { rows } = await actAs(db, owner, () =>
    db.query(`insert into worlds (name, owner_id) values ('Aurelia', $1) returning id`, [owner]),
  );
  const worldId = rows[0].id as string;
  const snippet = async (title: string) =>
    (
      await actAs(db, owner, () =>
        db.query(
          `insert into snippets (world_id, title, created_by) values ($1, $2, $3) returning id`,
          [worldId, title, owner],
        ),
      )
    ).rows[0].id as string;
  const [a, b] = [await snippet('A'), await snippet('B')];
  const relate = (
    label: string,
    extra: {
      from?: object | null;
      to?: object | null;
      notes?: string;
      source?: string;
      target?: string;
    } = {},
  ) =>
    actAs(db, owner, () =>
      db.query(
        `insert into relations (world_id, source_id, target_id, label, notes, valid_from, valid_to, created_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          worldId,
          extra.source ?? a,
          extra.target ?? b,
          label,
          extra.notes ?? '',
          extra.from ? JSON.stringify(extra.from) : null,
          extra.to ? JSON.stringify(extra.to) : null,
          owner,
        ],
      ),
    );
  return { relate, a, b };
}

describe('relazioni: vincoli sui dati', () => {
  it('non ammette doppioni sulla stessa coppia, senza badare alle maiuscole né agli spazi ai lati', async () => {
    await withTx(async (db) => {
      const { relate } = await setup(db);
      await relate('amico di');
      await expect(relate('  Amico DI ')).rejects.toThrow(/relations_no_duplicates/);
    });
  });

  it('la stessa etichetta è ammessa su coppie diverse o in direzione opposta', async () => {
    await withTx(async (db) => {
      const { relate, a, b } = await setup(db);
      await relate('amico di');
      await relate('amico di', { source: b, target: a });
    });
  });

  it('un intervallo di validità deve avere un anno numerico', async () => {
    await withTx(async (db) => {
      const { relate } = await setup(db);
      for (const bad of [
        {},
        { year: 'x' },
        { year: 1.5 },
        { year: 1, month: 0 },
        { year: 1, day: 100 },
        { year: 1, month: '5' },
        { year: 1, day: 5 },
        [],
      ]) {
        await expect(relate('r', { from: bad })).rejects.toThrow(/relations_valid_time/);
      }
      await relate('ok', { from: { calendar: 'default', year: -300, month: 2, day: 10 } });
    });
  });

  it('con due estremi malformati fallisce il CHECK, non un errore di cast', async () => {
    await withTx(async (db) => {
      const { relate } = await setup(db);
      await expect(relate('r', { from: { year: 'x' }, to: { year: 5 } })).rejects.toThrow(
        /relations_valid_time/,
      );
      await expect(relate('r', { from: { year: 1.5 }, to: { year: 5 } })).rejects.toThrow(
        /relations_valid_time/,
      );
    });
  });

  it('la fine non può precedere l’inizio', async () => {
    await withTx(async (db) => {
      const { relate } = await setup(db);
      await expect(relate('r', { from: { year: 20 }, to: { year: 10 } })).rejects.toThrow(
        /relations_valid_time/,
      );
      await relate('uguali', { from: { year: 10 }, to: { year: 10 } });
    });
  });

  it('limita la lunghezza delle note', async () => {
    await withTx(async (db) => {
      const { relate } = await setup(db);
      await expect(relate('r', { notes: 'x'.repeat(2001) })).rejects.toThrow(
        /relations_notes_length/,
      );
    });
  });
});

describe('tipi di relazione', () => {
  async function typed(db: Db) {
    const owner = await createUser(db);
    const { rows } = await actAs(db, owner, () =>
      db.query(`insert into worlds (name, owner_id) values ('Aurelia', $1) returning id`, [owner]),
    );
    const worldId = rows[0].id as string;
    const q = (sql: string, params: unknown[] = []) =>
      actAs(db, owner, () => db.query(sql, params));
    const category = async (name: string) =>
      (
        await q(`insert into categories (world_id, name) values ($1, $2) returning id`, [
          worldId,
          name,
        ])
      ).rows[0].id as string;
    const snippet = async (title: string, ...cats: string[]) => {
      const id = (
        await q(
          `insert into snippets (world_id, title, created_by) values ($1, $2, $3) returning id`,
          [worldId, title, owner],
        )
      ).rows[0].id as string;
      for (const c of cats) {
        await q(
          `insert into snippet_categories (world_id, snippet_id, category_id) values ($1, $2, $3)`,
          [worldId, id, c],
        );
      }
      return id;
    };
    const type = (
      label: string,
      inverse: string | null,
      source: string | null,
      target: string | null,
    ) =>
      q(
        `insert into relation_types (world_id, label, inverse_label, source_category_id, target_category_id)
         values ($1, $2, $3, $4, $5)`,
        [worldId, label, inverse, source, target],
      );
    const relate = (source: string, target: string, label: string, inverse: string | null = null) =>
      q(
        `insert into relations (world_id, source_id, target_id, label, inverse_label, created_by)
         values ($1, $2, $3, $4, $5, $6) returning inverse_label`,
        [worldId, source, target, label, inverse, owner],
      );
    return { worldId, owner, q, category, snippet, type, relate };
  }

  it('rispetta i vincoli sulle categorie di origine e destinazione', async () => {
    await withTx(async (db) => {
      const { category, snippet, type, relate } = await typed(db);
      const [person, place] = [await category('Personaggio'), await category('Luogo')];
      await type('nato a', 'luogo di nascita di', person, place);
      const [elara, city, other] = [
        await snippet('Elara', person),
        await snippet('Aurelia', place),
        await snippet('Altro'),
      ];
      await relate(elara, city, 'nato a');
      await expect(relate(city, elara, 'nato a')).rejects.toThrow('relation_constraint_source');
      await expect(relate(elara, other, 'Nato A')).rejects.toThrow('relation_constraint_target');
    });
  });

  it('un’etichetta senza tipo resta libera', async () => {
    await withTx(async (db) => {
      const { snippet, relate } = await typed(db);
      await relate(await snippet('A'), await snippet('B'), 'amico di');
    });
  });

  it('il tipo fornisce l’inversa se manca, senza sovrascrivere quella data', async () => {
    await withTx(async (db) => {
      const { snippet, type, relate } = await typed(db);
      await type('padre di', 'figlio di', null, null);
      const [a, b, c] = [await snippet('A'), await snippet('B'), await snippet('C')];
      expect((await relate(a, b, 'padre di')).rows[0].inverse_label).toBe('figlio di');
      expect((await relate(a, c, 'padre di', 'figlia di')).rows[0].inverse_label).toBe('figlia di');
    });
  });

  it('un tipo vincolato non si aggira modificando l’etichetta o gli estremi', async () => {
    await withTx(async (db) => {
      const { q, category, snippet, type, relate } = await typed(db);
      const person = await category('Personaggio');
      await type('nato a', null, person, null);
      const [a, b] = [await snippet('A', person), await snippet('B')];
      await relate(a, b, 'libera');
      await expect(
        q(`update relations set label = 'nato a' where source_id = $1`, [b]),
      ).resolves.toBeDefined();
      await relate(b, a, 'libera');
      await expect(
        q(`update relations set label = 'nato a' where source_id = $1`, [b]),
      ).rejects.toThrow('relation_constraint_source');
    });
  });

  it('un tipo per etichetta, senza badare alle maiuscole', async () => {
    await withTx(async (db) => {
      const { type } = await typed(db);
      await type('alleato di', null, null, null);
      await expect(type(' Alleato DI ', null, null, null)).rejects.toThrow(/relation_types_label/);
    });
  });

  it('eliminando la categoria il vincolo decade ma il tipo resta', async () => {
    await withTx(async (db) => {
      const { q, category, type, worldId } = await typed(db);
      const c = await category('Luogo');
      await type('nato a', null, null, c);
      await q(`delete from categories where id = $1`, [c]);
      const { rows } = await q(
        `select target_category_id from relation_types where world_id = $1`,
        [worldId],
      );
      expect(rows).toEqual([{ target_category_id: null }]);
    });
  });

  it('solo chi può scrivere modifica i tipi; i membri li leggono, gli estranei no', async () => {
    await withTx(async (db) => {
      const { worldId, type } = await typed(db);
      await type('alleato di', null, null, null);
      const reader = await createUser(db);
      await db.query(
        `insert into world_members (world_id, user_id, role) values ($1, $2, 'reader')`,
        [worldId, reader],
      );
      const stranger = await createUser(db);
      const read = (uid: string) =>
        actAs(db, uid, () =>
          db.query(`select 1 from relation_types where world_id = $1`, [worldId]),
        );
      expect((await read(reader)).rows).toHaveLength(1);
      expect((await read(stranger)).rows).toHaveLength(0);
      await expect(
        actAs(db, reader, () =>
          db.query(`insert into relation_types (world_id, label) values ($1, 'x')`, [worldId]),
        ),
      ).rejects.toThrow();
    });
  });
});
