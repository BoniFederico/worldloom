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

const createEncounter = (db: Db, uid: string, campaign: string, name = 'Imboscata') =>
  actAs(db, uid, () =>
    db.query(
      `insert into campaign_encounters (campaign_id, name, created_by) values ($1, $2, $3) returning id`,
      [campaign, name, uid],
    ),
  );

const addParticipant = (
  db: Db,
  uid: string,
  encounter: string,
  campaign: string,
  opts: { name?: string; characterId?: string | null; initiative?: number } = {},
) =>
  actAs(db, uid, () =>
    db.query(
      `insert into encounter_participants (encounter_id, campaign_id, character_id, name, initiative)
       values ($1, $2, $3, $4, $5) returning id`,
      [encounter, campaign, opts.characterId ?? null, opts.name ?? 'Goblin', opts.initiative ?? 10],
    ),
  );

describe('tracker di iniziativa: permessi', () => {
  it('un giocatore legge lo scontro ma non può crearne uno', async () => {
    await withTx(async (db) => {
      const { dm, p1, campaign } = await setup(db);
      const { rows } = await createEncounter(db, dm, campaign);
      const id = rows[0].id as string;
      const seen = await actAs(db, p1, () =>
        db.query('select id from campaign_encounters where id = $1', [id]),
      );
      expect(seen.rows).toHaveLength(1);
      await expect(createEncounter(db, p1, campaign)).rejects.toThrow(/row-level security/);
    });
  });

  it('un estraneo non vede né crea uno scontro', async () => {
    await withTx(async (db) => {
      const { dm, stranger, campaign } = await setup(db);
      const { rows } = await createEncounter(db, dm, campaign);
      const id = rows[0].id as string;
      const seen = await actAs(db, stranger, () =>
        db.query('select id from campaign_encounters where id = $1', [id]),
      );
      expect(seen.rows).toEqual([]);
      await expect(createEncounter(db, stranger, campaign)).rejects.toThrow(/row-level security/);
    });
  });

  it('il co-DM avanza il turno; un giocatore no', async () => {
    await withTx(async (db) => {
      const { dm, co, p1, campaign } = await setup(db);
      const { rows } = await createEncounter(db, dm, campaign);
      const id = rows[0].id as string;
      const ok = await actAs(db, co, () =>
        db.query('update campaign_encounters set turn_index = 1 where id = $1', [id]),
      );
      expect(ok.rowCount).toBe(1);
      const forbidden = await actAs(db, p1, () =>
        db.query('update campaign_encounters set turn_index = 2 where id = $1', [id]),
      );
      expect(forbidden.rowCount).toBe(0);
    });
  });

  it('un giocatore legge i partecipanti ma non ne aggiunge', async () => {
    await withTx(async (db) => {
      const { dm, p1, campaign } = await setup(db);
      const { rows } = await createEncounter(db, dm, campaign);
      const encounter = rows[0].id as string;
      await addParticipant(db, dm, encounter, campaign);
      const seen = await actAs(db, p1, () =>
        db.query('select id from encounter_participants where encounter_id = $1', [encounter]),
      );
      expect(seen.rows).toHaveLength(1);
      await expect(addParticipant(db, p1, encounter, campaign)).rejects.toThrow(
        /row-level security/,
      );
    });
  });

  it('un personaggio collegato deve appartenere alla stessa campagna dello scontro', async () => {
    await withTx(async (db) => {
      const { dm, campaign } = await setup(db);
      const other = await actAs(db, dm, () =>
        db.query(`insert into campaigns (name, owner_id) values ('Altra', $1) returning id`, [dm]),
      ).then((r) => r.rows[0].id as string);
      const foreignCharacter = await actAs(db, dm, () =>
        db.query(
          `insert into characters (campaign_id, kind, name, created_by) values ($1, 'npc', 'Straniero', $2) returning id`,
          [other, dm],
        ),
      ).then((r) => r.rows[0].id as string);
      const encounter = await createEncounter(db, dm, campaign).then((r) => r.rows[0].id as string);
      await expect(
        addParticipant(db, dm, encounter, campaign, { characterId: foreignCharacter }),
      ).rejects.toThrow(/row-level security/);
    });
  });

  it('eliminare lo scontro elimina anche i partecipanti (cascata)', async () => {
    await withTx(async (db) => {
      const { dm, campaign } = await setup(db);
      const encounter = await createEncounter(db, dm, campaign).then((r) => r.rows[0].id as string);
      await addParticipant(db, dm, encounter, campaign);
      await actAs(db, dm, () =>
        db.query('delete from campaign_encounters where id = $1', [encounter]),
      );
      const left = await actAs(db, dm, () =>
        db.query('select id from encounter_participants where encounter_id = $1', [encounter]),
      );
      expect(left.rows).toEqual([]);
    });
  });
});
