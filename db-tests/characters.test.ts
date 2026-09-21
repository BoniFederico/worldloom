import { describe, expect, it } from 'vitest';
import { actAs, createUser, withTx, type Db } from './helpers';

/** DM, co-DM, due giocatori, un osservatore e un estraneo; la campagna con uno schema di statistiche. */
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

const addCharacter = (
  db: Db,
  uid: string,
  campaign: string,
  kind: 'pc' | 'npc',
  name: string,
  owner: string | null,
) =>
  actAs(db, uid, () =>
    db.query(
      `insert into characters (campaign_id, kind, name, owner_id, created_by) values ($1, $2, $3, $4, $5) returning id`,
      [campaign, kind, name, owner, uid],
    ),
  ).then((r) => r.rows[0].id as string);

const names = (db: Db, uid: string, campaign: string) =>
  actAs(db, uid, () =>
    db.query('select name from characters where campaign_id = $1 order by name', [campaign]),
  ).then((r) => r.rows.map((x) => x.name as string));

describe('schema di statistiche della campagna', () => {
  it('lo scrive solo il DM; lo leggono tutti i membri, non gli estranei', async () => {
    await withTx(async (db) => {
      const { dm, co, p1, obs, stranger, campaign } = await setup(db);
      const put = (uid: string) =>
        actAs(db, uid, () =>
          db.query(`insert into campaign_stats (campaign_id, schema) values ($1, '{"a":1}')`, [
            campaign,
          ]),
        );
      await expect(put(co)).rejects.toThrow(/row-level security/);
      await expect(put(p1)).rejects.toThrow(/row-level security/);
      await put(dm);
      for (const uid of [dm, co, p1, obs]) {
        const r = await actAs(db, uid, () =>
          db.query('select rev from campaign_stats where campaign_id = $1', [campaign]),
        );
        expect(r.rows).toEqual([{ rev: 1 }]);
      }
      expect(
        (
          await actAs(db, stranger, () =>
            db.query('select 1 from campaign_stats where campaign_id = $1', [campaign]),
          )
        ).rows,
      ).toEqual([]);
      // Un co-DM non lo cambia (l'aggiornamento non trova righe); il DM sì, e la revisione cresce.
      const co2 = await actAs(db, co, () =>
        db.query(`update campaign_stats set schema = '{"a":2}' where campaign_id = $1`, [campaign]),
      );
      expect(co2.rowCount).toBe(0);
      await actAs(db, dm, () =>
        db.query(`update campaign_stats set schema = '{"a":2}' where campaign_id = $1`, [campaign]),
      );
      const r = await db.query(
        'select rev, updated_by from campaign_stats where campaign_id = $1',
        [campaign],
      );
      expect(r.rows).toEqual([{ rev: 2, updated_by: dm }]);
    });
  });

  it('non accetta uno schema che non è un oggetto', async () => {
    await withTx(async (db) => {
      const { dm, campaign } = await setup(db);
      await expect(
        actAs(db, dm, () =>
          db.query(`insert into campaign_stats (campaign_id, schema) values ($1, '[1]')`, [
            campaign,
          ]),
        ),
      ).rejects.toThrow(/check/);
    });
  });
});

describe('schede: permessi', () => {
  it('il giocatore vede solo le proprie; DM e co-DM tutte; osservatore ed estraneo nessuna', async () => {
    await withTx(async (db) => {
      const { dm, co, p1, p2, obs, stranger, campaign } = await setup(db);
      await addCharacter(db, dm, campaign, 'pc', 'Alfa', p1);
      await addCharacter(db, p2, campaign, 'pc', 'Beta', p2);
      await addCharacter(db, co, campaign, 'npc', 'Gamma', null);
      expect(await names(db, dm, campaign)).toEqual(['Alfa', 'Beta', 'Gamma']);
      expect(await names(db, co, campaign)).toEqual(['Alfa', 'Beta', 'Gamma']);
      expect(await names(db, p1, campaign)).toEqual(['Alfa']);
      expect(await names(db, p2, campaign)).toEqual(['Beta']);
      expect(await names(db, obs, campaign)).toEqual([]);
      expect(await names(db, stranger, campaign)).toEqual([]);
    });
  });

  it('un giocatore crea solo un PG per sé; un PNG o il PG di un altro no', async () => {
    await withTx(async (db) => {
      const { p1, p2, obs, stranger, campaign } = await setup(db);
      await addCharacter(db, p1, campaign, 'pc', 'Mio', p1);
      await expect(addCharacter(db, p1, campaign, 'npc', 'Oste', null)).rejects.toThrow(
        /row-level security/,
      );
      await expect(addCharacter(db, p1, campaign, 'pc', 'Rubato', p2)).rejects.toThrow(
        /row-level security/,
      );
      await expect(addCharacter(db, obs, campaign, 'pc', 'Osservato', obs)).rejects.toThrow(
        /row-level security|proprietario/,
      );
      await expect(addCharacter(db, stranger, campaign, 'pc', 'Intruso', stranger)).rejects.toThrow(
        /row-level security|proprietario/,
      );
    });
  });

  it('il proprietario deve essere un giocatore della campagna; un PNG non ha proprietario', async () => {
    await withTx(async (db) => {
      const { dm, obs, stranger, campaign } = await setup(db);
      await expect(addCharacter(db, dm, campaign, 'pc', 'Osservatore', obs)).rejects.toThrow(
        /proprietario/,
      );
      await expect(addCharacter(db, dm, campaign, 'pc', 'Estraneo', stranger)).rejects.toThrow(
        /proprietario/,
      );
      await expect(addCharacter(db, dm, campaign, 'npc', 'Oste', stranger)).rejects.toThrow(
        /check|proprietario/,
      );
    });
  });

  it('il giocatore modifica il proprio PG ma non cambia tipo né proprietario; non tocca quelli altrui', async () => {
    await withTx(async (db) => {
      const { dm, p1, p2, campaign } = await setup(db);
      const mine = await addCharacter(db, dm, campaign, 'pc', 'Alfa', p1);
      const theirs = await addCharacter(db, dm, campaign, 'pc', 'Beta', p2);
      const edit = (uid: string, id: string, set: string) =>
        actAs(db, uid, () => db.query(`update characters set ${set} where id = $1`, [id]));
      expect((await edit(p1, mine, `notes = 'ok'`)).rowCount).toBe(1);
      expect((await edit(p1, theirs, `notes = 'no'`)).rowCount).toBe(0);
      await expect(edit(p1, mine, `owner_id = '${p2}'`)).rejects.toThrow(/tipo e proprietario/);
      await expect(edit(p1, mine, `kind = 'npc', owner_id = null`)).rejects.toThrow(
        /tipo e proprietario/,
      );
      // Chi gestisce cambia proprietario.
      expect((await edit(dm, mine, `owner_id = '${p2}'`)).rowCount).toBe(1);
      // E il giocatore non vede più ciò che non è più suo.
      expect(await names(db, p1, campaign)).toEqual([]);
    });
  });

  it('campagna e autore non cambiano; un ex giocatore perde l’accesso alla propria scheda', async () => {
    await withTx(async (db) => {
      const { dm, p1, campaign } = await setup(db);
      const other = (
        await actAs(db, dm, () =>
          db.query(`insert into campaigns (name, owner_id) values ('Altra', $1) returning id`, [
            dm,
          ]),
        )
      ).rows[0].id as string;
      const id = await addCharacter(db, dm, campaign, 'pc', 'Alfa', p1);
      await expect(
        actAs(db, dm, () =>
          db.query(`update characters set campaign_id = $2 where id = $1`, [id, other]),
        ),
      ).rejects.toThrow(/permission denied|immutabili/);
      await db.query(`delete from campaign_members where campaign_id = $1 and user_id = $2`, [
        campaign,
        p1,
      ]);
      expect(await names(db, p1, campaign)).toEqual([]);
    });
  });

  it('elimina chi gestisce o il proprietario; non un altro giocatore', async () => {
    await withTx(async (db) => {
      const { dm, p1, p2, campaign } = await setup(db);
      const a = await addCharacter(db, dm, campaign, 'pc', 'Alfa', p1);
      const b = await addCharacter(db, dm, campaign, 'pc', 'Beta', p1);
      const del = (uid: string, id: string) =>
        actAs(db, uid, () => db.query('delete from characters where id = $1', [id]));
      expect((await del(p2, a)).rowCount).toBe(0);
      expect((await del(p1, a)).rowCount).toBe(1);
      expect((await del(dm, b)).rowCount).toBe(1);
    });
  });

  it('i limiti: dieci PG per giocatore', async () => {
    await withTx(async (db) => {
      const { p1, campaign } = await setup(db);
      for (let n = 0; n < 10; n++) await addCharacter(db, p1, campaign, 'pc', `PG ${n}`, p1);
      await expect(addCharacter(db, p1, campaign, 'pc', 'Undicesimo', p1)).rejects.toThrow(
        /too_many_characters/,
      );
    });
  });
});

describe('schede: revisione e cronologia', () => {
  const sheet = (attributes: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
    JSON.stringify({ attributes, resources: {}, lists: {}, text: {}, ...extra });

  it('la revisione cresce a ogni modifica', async () => {
    await withTx(async (db) => {
      const { dm, campaign } = await setup(db);
      const id = await addCharacter(db, dm, campaign, 'npc', 'Oste', null);
      await actAs(db, dm, () => db.query(`update characters set notes = 'a' where id = $1`, [id]));
      await actAs(db, dm, () => db.query(`update characters set notes = 'b' where id = $1`, [id]));
      const r = await db.query('select rev from characters where id = $1', [id]);
      expect(r.rows[0].rev).toBe(3);
    });
  });

  it('registra chi ha cambiato cosa, con prima e dopo dei numeri', async () => {
    await withTx(async (db) => {
      const { dm, p1, campaign } = await setup(db);
      const id = await addCharacter(db, dm, campaign, 'pc', 'Alfa', p1);
      await actAs(db, p1, () =>
        db.query(`update characters set sheet = $2 where id = $1`, [
          id,
          sheet({ str: 12 }, { text: { bio: 'x' } }),
        ]),
      );
      await actAs(db, p1, () =>
        db.query(`update characters set sheet = $2, name = 'Alfa II', notes = 'n' where id = $1`, [
          id,
          sheet({ str: 14 }, { text: { bio: 'x' } }),
        ]),
      );
      const { rows } = await db.query(
        'select action, changed_by, changes from character_history where character_id = $1 order by created_at',
        [id],
      );
      expect(rows.map((r) => r.action)).toEqual(['create', 'update', 'update']);
      expect(rows[0]).toMatchObject({ changed_by: dm, changes: { name: [null, 'Alfa'] } });
      expect(rows[1]).toMatchObject({
        changed_by: p1,
        changes: { 'attributes.str': [null, 12], 'text.bio': true },
      });
      expect(rows[2]).toMatchObject({
        changed_by: p1,
        changes: { 'attributes.str': [12, 14], name: ['Alfa', 'Alfa II'], notes: true },
      });
    });
  });

  it('un salvataggio senza differenze non aggiunge voci', async () => {
    await withTx(async (db) => {
      const { dm, campaign } = await setup(db);
      const id = await addCharacter(db, dm, campaign, 'npc', 'Oste', null);
      await actAs(db, dm, () =>
        db.query(`update characters set name = 'Oste' where id = $1`, [id]),
      );
      const { rows } = await db.query(
        'select count(*)::int as n from character_history where character_id = $1',
        [id],
      );
      expect(rows[0].n).toBe(1);
    });
  });

  it('un valore non oggetto in una sezione non rompe il salvataggio', async () => {
    await withTx(async (db) => {
      const { dm, campaign } = await setup(db);
      const id = await addCharacter(db, dm, campaign, 'npc', 'Oste', null);
      await actAs(db, dm, () =>
        db.query(`update characters set sheet = '{"attributes": 5, "lists": []}' where id = $1`, [
          id,
        ]),
      );
    });
  });

  it('la cronologia la legge chi legge la scheda e nessuno la scrive', async () => {
    await withTx(async (db) => {
      const { dm, co, p1, p2, obs, campaign } = await setup(db);
      const id = await addCharacter(db, dm, campaign, 'pc', 'Alfa', p1);
      const read = (uid: string) =>
        actAs(db, uid, () =>
          db.query('select id from character_history where character_id = $1', [id]),
        );
      expect((await read(dm)).rows).toHaveLength(1);
      expect((await read(co)).rows).toHaveLength(1);
      expect((await read(p1)).rows).toHaveLength(1);
      expect((await read(p2)).rows).toHaveLength(0);
      expect((await read(obs)).rows).toHaveLength(0);
      await expect(
        actAs(db, dm, () =>
          db.query(
            `insert into character_history (character_id, campaign_id, action) values ($1, $2, 'update')`,
            [id, campaign],
          ),
        ),
      ).rejects.toThrow(/permission denied/);
      await expect(
        actAs(db, dm, () =>
          db.query('delete from character_history where character_id = $1', [id]),
        ),
      ).rejects.toThrow(/permission denied/);
    });
  });

  it('conserva le ultime 200 voci', async () => {
    await withTx(async (db) => {
      const { dm, campaign } = await setup(db);
      const id = await addCharacter(db, dm, campaign, 'npc', 'Oste', null);
      for (let n = 0; n < 205; n++) {
        await actAs(db, dm, () =>
          db.query(`update characters set notes = $2 where id = $1`, [id, `n${n}`]),
        );
      }
      const { rows } = await db.query(
        'select count(*)::int as n from character_history where character_id = $1',
        [id],
      );
      expect(rows[0].n).toBe(200);
    });
  });
});
