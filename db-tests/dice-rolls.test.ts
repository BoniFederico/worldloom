import { describe, expect, it } from 'vitest';
import { actAs, createUser, withTx, type Db } from './helpers';

/** DM, co-DM, due giocatori e un osservatore, tutti membri della stessa campagna (autonoma, senza mondo). */
async function setup(db: Db) {
  const [dm, co, p1, p2, obs, stranger] = [
    await createUser(db, 'dm'),
    await createUser(db, 'codm'),
    await createUser(db, 'pg1'),
    await createUser(db, 'pg2'),
    await createUser(db, 'obs'),
    await createUser(db, 'estraneo'),
  ] as [string, string, string, string, string, string];
  const { rows } = await actAs(db, dm, () =>
    db.query(`insert into campaigns (name, owner_id) values ('La Corona', $1) returning id`, [dm]),
  );
  const campaign = rows[0].id as string;
  for (const [user, role] of [
    [co, 'co_dm'],
    [p1, 'player'],
    [p2, 'player'],
    [obs, 'observer'],
  ] as const) {
    await db.query(
      `insert into campaign_members (campaign_id, user_id, role) values ($1, $2, $3)`,
      [campaign, user, role],
    );
  }
  return { dm, co, p1, p2, obs, stranger, campaign };
}

const roll = (
  db: Db,
  uid: string,
  campaign: string,
  opts: { isPrivate?: boolean; characterId?: string | null } = {},
) =>
  actAs(db, uid, () =>
    db.query(
      `insert into campaign_dice_rolls (campaign_id, roller_id, character_id, notation, total, groups, is_private)
       values ($1, $2, $3, '1d6', 4, '[{"sides":6,"count":1,"rolls":[4]}]'::jsonb, $4) returning id`,
      [campaign, uid, opts.characterId ?? null, opts.isPrivate ?? false],
    ),
  );

const rollsOf = (db: Db, uid: string, campaign: string) =>
  actAs(db, uid, () =>
    db.query('select id, is_private from campaign_dice_rolls where campaign_id = $1', [campaign]),
  ).then((r) => r.rows);

describe('tiri di dado: storico condiviso e privati', () => {
  it('un giocatore tira; tutti i membri vedono il tiro condiviso, un estraneo no', async () => {
    await withTx(async (db) => {
      const { p1, obs, stranger, campaign } = await setup(db);
      await roll(db, p1, campaign);
      expect(await rollsOf(db, obs, campaign)).toHaveLength(1);
      expect(await rollsOf(db, stranger, campaign)).toEqual([]);
    });
  });

  it('un osservatore può tirare i dadi (non è "scrivere" contenuti della campagna)', async () => {
    await withTx(async (db) => {
      const { obs, campaign } = await setup(db);
      const { rows } = await roll(db, obs, campaign);
      expect(rows).toHaveLength(1);
    });
  });

  it('un estraneo non può tirare per una campagna a cui non appartiene', async () => {
    await withTx(async (db) => {
      const { stranger, campaign } = await setup(db);
      await expect(roll(db, stranger, campaign)).rejects.toThrow(/row-level security/);
    });
  });

  it('un tiro privato lo vede solo chi gestisce la campagna, non gli altri giocatori', async () => {
    await withTx(async (db) => {
      const { dm, co, p1, campaign } = await setup(db);
      await roll(db, dm, campaign, { isPrivate: true });
      expect(await rollsOf(db, co, campaign)).toHaveLength(1);
      expect(await rollsOf(db, p1, campaign)).toEqual([]);
    });
  });

  it('un giocatore non può marcare un proprio tiro come privato', async () => {
    await withTx(async (db) => {
      const { p1, campaign } = await setup(db);
      await expect(roll(db, p1, campaign, { isPrivate: true })).rejects.toThrow(
        /row-level security/,
      );
    });
  });

  it('un giocatore può usare il proprio personaggio nella formula, non quello di un altro', async () => {
    await withTx(async (db) => {
      const { p1, p2, campaign } = await setup(db);
      const own = await actAs(db, p1, () =>
        db.query(
          `insert into characters (campaign_id, kind, name, owner_id, created_by) values ($1, 'pc', 'Lyra', $2, $2) returning id`,
          [campaign, p1],
        ),
      ).then((r) => r.rows[0].id as string);
      const other = await actAs(db, p2, () =>
        db.query(
          `insert into characters (campaign_id, kind, name, owner_id, created_by) values ($1, 'pc', 'Bran', $2, $2) returning id`,
          [campaign, p2],
        ),
      ).then((r) => r.rows[0].id as string);

      const ok = await roll(db, p1, campaign, { characterId: own });
      expect(ok.rows).toHaveLength(1);
      await expect(roll(db, p1, campaign, { characterId: other })).rejects.toThrow(
        /row-level security/,
      );
    });
  });

  it('nessuno modifica un tiro già registrato: non c’è alcun permesso di update', async () => {
    await withTx(async (db) => {
      const { dm, campaign } = await setup(db);
      const { rows } = await roll(db, dm, campaign);
      const id = rows[0].id as string;
      await expect(
        actAs(db, dm, () =>
          db.query('update campaign_dice_rolls set notation = $1 where id = $2', ['2d6', id]),
        ),
      ).rejects.toThrow(/permission denied/);
    });
  });

  it('nessuno elimina un tiro già registrato: non c’è alcun permesso di delete', async () => {
    await withTx(async (db) => {
      const { dm, campaign } = await setup(db);
      const { rows } = await roll(db, dm, campaign);
      const id = rows[0].id as string;
      await expect(
        actAs(db, dm, () => db.query('delete from campaign_dice_rolls where id = $1', [id])),
      ).rejects.toThrow(/permission denied/);
    });
  });
});
