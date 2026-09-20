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
        [],
      ]) {
        await expect(relate('r', { from: bad })).rejects.toThrow(/relations_valid_time/);
      }
      await relate('ok', { from: { calendar: 'default', year: -300, month: 2, day: 10 } });
    });
  });

  it('la fine non può precedere l’inizio', async () => {
    await withTx(async (db) => {
      const { relate } = await setup(db);
      await expect(relate('r', { from: { year: 20 }, to: { year: 10 } })).rejects.toThrow(
        /relations_valid_order/,
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
