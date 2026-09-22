import { describe, expect, it } from 'vitest';
import { actAs, createUser, withTx, type Db } from './helpers';

async function createWorld(db: Db, owner: string): Promise<string> {
  const { rows } = await actAs(db, owner, () =>
    db.query(`insert into worlds (name, owner_id) values ('Aurelia', $1) returning id`, [owner]),
  );
  return rows[0].id as string;
}

async function createCampaign(db: Db, dm: string, worldId: string | null = null): Promise<string> {
  const { rows } = await actAs(db, dm, () =>
    db.query(
      `insert into campaigns (name, world_id, owner_id) values ('La Corona', $1, $2) returning id`,
      [worldId, dm],
    ),
  );
  return rows[0].id as string;
}

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
  const campaign = await createCampaign(db, dm);
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

const addSession = (db: Db, uid: string, campaign: string, title = 'Prima sessione') =>
  actAs(db, uid, () =>
    db.query(
      `insert into campaign_sessions (campaign_id, title, created_by) values ($1, $2, $3) returning id, number`,
      [campaign, title, uid],
    ),
  ).then((r) => r.rows[0] as { id: string; number: number });

describe('sessioni: numerazione e permessi', () => {
  it('il numero è progressivo per campagna, assegnato dal server', async () => {
    await withTx(async (db) => {
      const { dm, campaign } = await setup(db);
      const a = await addSession(db, dm, campaign, 'Prima');
      const b = await addSession(db, dm, campaign, 'Seconda');
      expect([a.number, b.number]).toEqual([1, 2]);
    });
  });

  it('due campagne numerano da 1 in modo indipendente', async () => {
    await withTx(async (db) => {
      const { dm, campaign } = await setup(db);
      const other = await createCampaign(db, dm);
      const a = await addSession(db, dm, campaign);
      const b = await addSession(db, dm, other);
      expect([a.number, b.number]).toEqual([1, 1]);
    });
  });

  it('solo chi gestisce (DM e co-DM) crea e modifica sessioni', async () => {
    await withTx(async (db) => {
      const { dm, co, p1, obs, stranger, campaign } = await setup(db);
      await addSession(db, co, campaign, 'Del co-DM');
      for (const uid of [p1, obs, stranger]) {
        await expect(addSession(db, uid, campaign)).rejects.toThrow(/row-level security/);
      }
      const s = await addSession(db, dm, campaign);
      await expect(
        actAs(db, p1, () =>
          db.query(`update campaign_sessions set title = 'X' where id = $1`, [s.id]),
        ).then((r) => {
          if (r.rowCount) throw new Error('non doveva scrivere');
        }),
      ).resolves.toBeUndefined();
      const upd = await actAs(db, co, () =>
        db.query(`update campaign_sessions set title = 'Rinominata' where id = $1`, [s.id]),
      );
      expect(upd.rowCount).toBe(1);
    });
  });

  it('ogni membro legge le sessioni; un estraneo no', async () => {
    await withTx(async (db) => {
      const { dm, co, p1, obs, stranger, campaign } = await setup(db);
      await addSession(db, dm, campaign);
      for (const uid of [dm, co, p1, obs]) {
        const r = await actAs(db, uid, () =>
          db.query('select id from campaign_sessions where campaign_id = $1', [campaign]),
        );
        expect(r.rows).toHaveLength(1);
      }
      const r = await actAs(db, stranger, () =>
        db.query('select id from campaign_sessions where campaign_id = $1', [campaign]),
      );
      expect(r.rows).toEqual([]);
    });
  });

  it('solo chi gestisce elimina una sessione', async () => {
    await withTx(async (db) => {
      const { dm, p1, campaign } = await setup(db);
      const s = await addSession(db, dm, campaign);
      const del = await actAs(db, p1, () =>
        db.query('delete from campaign_sessions where id = $1', [s.id]),
      );
      expect(del.rowCount).toBe(0);
      const ok = await actAs(db, dm, () =>
        db.query('delete from campaign_sessions where id = $1', [s.id]),
      );
      expect(ok.rowCount).toBe(1);
    });
  });
});

describe('note della sessione', () => {
  it('le note del DM le leggono e scrivono solo DM e co-DM', async () => {
    await withTx(async (db) => {
      const { dm, co, p1, obs, stranger, campaign } = await setup(db);
      const s = await addSession(db, dm, campaign);
      await actAs(db, dm, () =>
        db.query(`insert into session_dm_notes (session_id, notes) values ($1, 'segreto')`, [s.id]),
      );
      for (const uid of [dm, co]) {
        const r = await actAs(db, uid, () =>
          db.query('select notes from session_dm_notes where session_id = $1', [s.id]),
        );
        expect(r.rows).toEqual([{ notes: 'segreto' }]);
      }
      for (const uid of [p1, obs, stranger]) {
        const r = await actAs(db, uid, () =>
          db.query('select notes from session_dm_notes where session_id = $1', [s.id]),
        );
        expect(r.rows).toEqual([]);
      }
      await expect(
        actAs(db, p1, () =>
          db.query(`insert into session_dm_notes (session_id, notes) values ($1, 'x')`, [s.id]),
        ),
      ).rejects.toThrow(/row-level security|duplicate key/);
    });
  });

  it('l’upsert usato dall’app (insert con on conflict) funziona per il DM e per un giocatore', async () => {
    // L'app fa un upsert (PostgREST: insert con `on conflict do update`), che assegna anche la colonna chiave
    // (`col = excluded.col`, anche se invariata): serve il privilegio di scrittura anche lì, non solo su `notes`.
    await withTx(async (db) => {
      const { dm, p1, campaign } = await setup(db);
      const s = await addSession(db, dm, campaign);
      await actAs(db, dm, () =>
        db.query(
          `insert into session_dm_notes (session_id, notes) values ($1, 'a')
           on conflict (session_id) do update set notes = excluded.notes`,
          [s.id],
        ),
      );
      await actAs(db, dm, () =>
        db.query(
          `insert into session_dm_notes (session_id, notes) values ($1, 'b')
           on conflict (session_id) do update set notes = excluded.notes`,
          [s.id],
        ),
      );
      const dmRow = await db.query('select notes from session_dm_notes where session_id = $1', [
        s.id,
      ]);
      expect(dmRow.rows).toEqual([{ notes: 'b' }]);

      await actAs(db, p1, () =>
        db.query(
          `insert into session_player_notes (session_id, user_id, notes) values ($1, $2, 'a')
           on conflict (session_id, user_id) do update set notes = excluded.notes`,
          [s.id, p1],
        ),
      );
      await actAs(db, p1, () =>
        db.query(
          `insert into session_player_notes (session_id, user_id, notes) values ($1, $2, 'b')
           on conflict (session_id, user_id) do update set notes = excluded.notes`,
          [s.id, p1],
        ),
      );
      const playerRow = await actAs(db, p1, () =>
        db.query('select notes from session_player_notes where session_id = $1', [s.id]),
      );
      expect(playerRow.rows).toEqual([{ notes: 'b' }]);
    });
  });

  it('le note di un giocatore sono solo sue: nemmeno il DM le legge', async () => {
    await withTx(async (db) => {
      const { dm, p1, p2, campaign } = await setup(db);
      const s = await addSession(db, dm, campaign);
      await actAs(db, p1, () =>
        db.query(
          `insert into session_player_notes (session_id, user_id, notes) values ($1, $2, 'mie note')`,
          [s.id, p1],
        ),
      );
      const mine = await actAs(db, p1, () =>
        db.query('select notes from session_player_notes where session_id = $1', [s.id]),
      );
      expect(mine.rows).toEqual([{ notes: 'mie note' }]);
      const dmView = await actAs(db, dm, () =>
        db.query('select notes from session_player_notes where session_id = $1', [s.id]),
      );
      expect(dmView.rows).toEqual([]);
      const otherView = await actAs(db, p2, () =>
        db.query('select notes from session_player_notes where session_id = $1', [s.id]),
      );
      expect(otherView.rows).toEqual([]);
      await expect(
        actAs(db, p2, () =>
          db.query(
            `insert into session_player_notes (session_id, user_id, notes) values ($1, $2, 'furbata')`,
            [s.id, p1],
          ),
        ),
      ).rejects.toThrow(/row-level security/);
    });
  });

  it('un utente che esce dalla campagna perde l’accesso alle proprie note', async () => {
    await withTx(async (db) => {
      const { dm, p1, campaign } = await setup(db);
      const s = await addSession(db, dm, campaign);
      await actAs(db, p1, () =>
        db.query(
          `insert into session_player_notes (session_id, user_id, notes) values ($1, $2, 'x')`,
          [s.id, p1],
        ),
      );
      await db.query('delete from campaign_members where campaign_id = $1 and user_id = $2', [
        campaign,
        p1,
      ]);
      const r = await actAs(db, p1, () =>
        db.query('select notes from session_player_notes where session_id = $1', [s.id]),
      );
      expect(r.rows).toEqual([]);
    });
  });
});

describe('eventi di timeline collegati', () => {
  it('chi gestisce collega uno snippet leggibile; la lettura segue la RLS dello snippet', async () => {
    await withTx(async (db) => {
      const [dm, p1, stranger] = [
        await createUser(db, 'dm'),
        await createUser(db, 'pg1'),
        await createUser(db, 'estraneo'),
      ];
      const world = await createWorld(db, dm);
      await db.query(
        `insert into world_members (world_id, user_id, role) values ($1, $2, 'reader')`,
        [world, p1],
      );
      const campaign = await createCampaign(db, dm, world);
      await db.query(
        `insert into campaign_members (campaign_id, user_id, role) values ($1, $2, 'player')`,
        [campaign, p1],
      );
      const { rows: snip } = await actAs(db, dm, () =>
        db.query(
          `insert into snippets (world_id, title, visibility, created_by) values ($1, 'Battaglia', 'secret', $2) returning id`,
          [world, dm],
        ),
      );
      const snippetId = snip[0].id as string;
      const s = await addSession(db, dm, campaign);
      await actAs(db, dm, () =>
        db.query('insert into session_snippets (session_id, snippet_id) values ($1, $2)', [
          s.id,
          snippetId,
        ]),
      );
      const dmView = await actAs(db, dm, () =>
        db.query('select snippet_id from session_snippets where session_id = $1', [s.id]),
      );
      expect(dmView.rows).toEqual([{ snippet_id: snippetId }]);
      // Lo snippet è segreto: il giocatore vede il collegamento della sessione, ma non lo snippet dietro.
      const playerView = await actAs(db, p1, () =>
        db.query('select snippet_id from session_snippets where session_id = $1', [s.id]),
      );
      expect(playerView.rows).toEqual([]);
      const strangerView = await actAs(db, stranger, () =>
        db.query('select snippet_id from session_snippets where session_id = $1', [s.id]),
      );
      expect(strangerView.rows).toEqual([]);
      await expect(
        actAs(db, p1, () =>
          db.query('insert into session_snippets (session_id, snippet_id) values ($1, $2)', [
            s.id,
            snippetId,
          ]),
        ),
      ).rejects.toThrow(/row-level security/);
    });
  });
});

describe('diario e bacheca', () => {
  const post = (
    db: Db,
    uid: string,
    campaign: string,
    kind: 'chronicle' | 'message',
    body: string,
  ) =>
    actAs(db, uid, () =>
      db.query(
        `insert into campaign_posts (campaign_id, kind, author, body) values ($1, $2, $3, $4) returning id`,
        [campaign, kind, uid, body],
      ),
    );

  it('DM, co-DM e giocatori scrivono; un osservatore e un estraneo no', async () => {
    await withTx(async (db) => {
      const { dm, co, p1, obs, stranger, campaign } = await setup(db);
      for (const uid of [dm, co, p1]) {
        await expect(post(db, uid, campaign, 'chronicle', 'Capitolo uno.')).resolves.toBeDefined();
      }
      await expect(post(db, obs, campaign, 'message', 'Ciao')).rejects.toThrow(
        /row-level security/,
      );
      await expect(post(db, stranger, campaign, 'message', 'Ciao')).rejects.toThrow(
        /row-level security/,
      );
    });
  });

  it('un messaggio vuoto o troppo lungo è rifiutato', async () => {
    await withTx(async (db) => {
      const { dm, campaign } = await setup(db);
      await expect(post(db, dm, campaign, 'message', '   ')).rejects.toThrow(/check/);
      await expect(post(db, dm, campaign, 'message', 'x'.repeat(5001))).rejects.toThrow(/check/);
    });
  });

  it('ogni membro legge diario e bacheca; un estraneo no', async () => {
    await withTx(async (db) => {
      const { dm, obs, stranger, campaign } = await setup(db);
      await post(db, dm, campaign, 'chronicle', 'Cronaca.');
      await post(db, dm, campaign, 'message', 'Messaggio.');
      const mine = await actAs(db, obs, () =>
        db.query('select kind from campaign_posts where campaign_id = $1 order by kind', [
          campaign,
        ]),
      );
      expect(mine.rows).toEqual([{ kind: 'chronicle' }, { kind: 'message' }]);
      const theirs = await actAs(db, stranger, () =>
        db.query('select kind from campaign_posts where campaign_id = $1', [campaign]),
      );
      expect(theirs.rows).toEqual([]);
    });
  });

  it('un messaggio si elimina da chi l’ha scritto o da chi gestisce, non da un altro giocatore', async () => {
    await withTx(async (db) => {
      const { dm, p1, p2, campaign } = await setup(db);
      const mine = (await post(db, p1, campaign, 'message', 'Mio.')).rows[0].id as string;
      const del1 = await actAs(db, p2, () =>
        db.query('delete from campaign_posts where id = $1', [mine]),
      );
      expect(del1.rowCount).toBe(0);
      const del2 = await actAs(db, dm, () =>
        db.query('delete from campaign_posts where id = $1', [mine]),
      );
      expect(del2.rowCount).toBe(1);
    });
  });

  it('nessuno modifica un messaggio già inviato: non c’è alcun permesso di update', async () => {
    await withTx(async (db) => {
      const { dm, campaign } = await setup(db);
      const id = (await post(db, dm, campaign, 'message', 'Originale.')).rows[0].id as string;
      await expect(
        actAs(db, dm, () =>
          db.query(`update campaign_posts set body = 'Cambiato' where id = $1`, [id]),
        ),
      ).rejects.toThrow(/permission denied/);
    });
  });
});

describe('rivelazioni legate a una sessione', () => {
  it('set_visibility con p_session registra la sessione nel registro; un membro estraneo alla rivelazione non la vede', async () => {
    await withTx(async (db) => {
      const [dm, p1, p2] = [
        await createUser(db, 'dm'),
        await createUser(db, 'pg1'),
        await createUser(db, 'pg2'),
      ];
      const world = await createWorld(db, dm);
      for (const uid of [p1, p2]) {
        await db.query(
          `insert into world_members (world_id, user_id, role) values ($1, $2, 'reader')`,
          [world, uid],
        );
      }
      const campaign = await createCampaign(db, dm, world);
      for (const uid of [p1, p2]) {
        await db.query(
          `insert into campaign_members (campaign_id, user_id, role) values ($1, $2, 'player')`,
          [campaign, uid],
        );
      }
      const { rows: snip } = await actAs(db, dm, () =>
        db.query(
          `insert into snippets (world_id, title, visibility, created_by) values ($1, 'Segreto', 'secret', $2) returning id`,
          [world, dm],
        ),
      );
      const s = await addSession(db, dm, campaign);
      await actAs(db, dm, () =>
        db.query(
          `select set_visibility('snippet', $1, null, 'shared', array[$2]::uuid[], $3, '')`,
          [snip[0].id, p1, s.id],
        ),
      );
      const log = await actAs(db, dm, () =>
        db.query('select session_id, is_reveal from visibility_log where item_id = $1', [
          snip[0].id,
        ]),
      );
      expect(log.rows).toEqual([{ session_id: s.id, is_reveal: true }]);
      const seenByP1 = await actAs(db, p1, () =>
        db.query('select is_reveal from visibility_log where item_id = $1', [snip[0].id]),
      );
      expect(seenByP1.rows).toEqual([{ is_reveal: true }]);
      const seenByP2 = await actAs(db, p2, () =>
        db.query('select is_reveal from visibility_log where item_id = $1', [snip[0].id]),
      );
      expect(seenByP2.rows).toEqual([]);
    });
  });

  it('eliminare la sessione non elimina il registro: la sessione diventa nulla', async () => {
    await withTx(async (db) => {
      const [dm, p1] = [await createUser(db, 'dm'), await createUser(db, 'pg1')];
      const world = await createWorld(db, dm);
      await db.query(
        `insert into world_members (world_id, user_id, role) values ($1, $2, 'reader')`,
        [world, p1],
      );
      const campaign = await createCampaign(db, dm, world);
      await db.query(
        `insert into campaign_members (campaign_id, user_id, role) values ($1, $2, 'player')`,
        [campaign, p1],
      );
      const { rows: snip } = await actAs(db, dm, () =>
        db.query(
          `insert into snippets (world_id, title, visibility, created_by) values ($1, 'Segreto', 'secret', $2) returning id`,
          [world, dm],
        ),
      );
      const s = await addSession(db, dm, campaign);
      await actAs(db, dm, () =>
        db.query(
          `select set_visibility('snippet', $1, null, 'shared', array[$2]::uuid[], $3, '')`,
          [snip[0].id, p1, s.id],
        ),
      );
      await actAs(db, dm, () => db.query('delete from campaign_sessions where id = $1', [s.id]));
      const log = await db.query('select session_id from visibility_log where item_id = $1', [
        snip[0].id,
      ]);
      expect(log.rows).toEqual([{ session_id: null }]);
    });
  });
});
