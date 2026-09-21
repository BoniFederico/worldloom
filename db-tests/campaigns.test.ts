import { describe, expect, it } from 'vitest';
import { actAs, createUser, withTx, type Db } from './helpers';

const emailOf = async (db: Db, id: string) =>
  (await db.query('select email from auth.users where id = $1', [id])).rows[0].email as string;

async function createCampaign(db: Db, dm: string, worldId: string | null = null): Promise<string> {
  const { rows } = await actAs(db, dm, () =>
    db.query(
      `insert into campaigns (name, world_id, owner_id) values ('La Corona', $1, $2) returning id`,
      [worldId, dm],
    ),
  );
  return rows[0].id;
}

async function createWorld(db: Db, owner: string): Promise<string> {
  const { rows } = await actAs(db, owner, () =>
    db.query(`insert into worlds (name, owner_id) values ('Aurelia', $1) returning id`, [owner]),
  );
  return rows[0].id;
}

const roleOf = async (db: Db, campaign: string, user: string) =>
  (
    await db.query('select role from campaign_members where campaign_id = $1 and user_id = $2', [
      campaign,
      user,
    ])
  ).rows[0]?.role as string | undefined;

/** Crea un invito come `uid` (giorni di validità e usi massimi a scelta) e ne restituisce il token. */
async function invite(
  db: Db,
  uid: string,
  campaign: string,
  role: string,
  opts: { email?: string | null; days?: number; uses?: number } = {},
): Promise<string> {
  const { rows } = await actAs(db, uid, () =>
    db.query(
      `insert into campaign_invites (campaign_id, role, email, created_by, expires_at, max_uses)
       values ($1, $2, $3, $4, now() + ($5 || ' days')::interval, $6) returning token`,
      [campaign, role, opts.email ?? null, uid, String(opts.days ?? 7), opts.uses ?? 1],
    ),
  );
  return rows[0].token;
}

const accept = (db: Db, uid: string, token: string) =>
  actAs(db, uid, () => db.query('select accept_campaign_invite($1) as id', [token]));

/** DM, e tre membri già dentro con i ruoli dati (aggiunti da un invito, come nell'uso reale). */
async function setup(db: Db) {
  const [dm, co, player, observer, stranger] = [
    await createUser(db, 'dm'),
    await createUser(db, 'codm'),
    await createUser(db, 'giocatore'),
    await createUser(db, 'osservatore'),
    await createUser(db, 'estraneo'),
  ];
  const campaign = await createCampaign(db, dm);
  await accept(db, co, await invite(db, dm, campaign, 'co_dm'));
  await accept(db, player, await invite(db, dm, campaign, 'player'));
  await accept(db, observer, await invite(db, dm, campaign, 'observer'));
  return { dm, co, player, observer, stranger, campaign };
}

describe('creazione e lettura', () => {
  it('chi crea una campagna ne è il DM e la legge; un estraneo no', async () => {
    await withTx(async (db) => {
      const { dm, stranger, campaign } = await setup(db);
      expect(await roleOf(db, campaign, dm)).toBe('dm');
      const mine = await actAs(db, dm, () => db.query('select id from campaigns'));
      expect(mine.rows.map((r) => r.id)).toContain(campaign);
      const theirs = await actAs(db, stranger, () => db.query('select id from campaigns'));
      expect(theirs.rows).toEqual([]);
      const members = await actAs(db, stranger, () => db.query('select * from campaign_members'));
      expect(members.rows).toEqual([]);
    });
  });

  it('non si crea una campagna a nome di un altro, né da anonimi', async () => {
    await withTx(async (db) => {
      const [a, b] = [await createUser(db), await createUser(db)];
      await expect(
        createCampaign(db, a).then(() =>
          actAs(db, a, () =>
            db.query(`insert into campaigns (name, owner_id) values ('X', $1)`, [b]),
          ),
        ),
      ).rejects.toThrow(/row-level security/);
      await expect(
        actAs(db, null, () =>
          db.query(`insert into campaigns (name, owner_id) values ('X', $1)`, [a]),
        ),
      ).rejects.toThrow(/permission denied/);
    });
  });

  it('il mondo collegato deve essere uno di cui si fa parte; il DM può cambiarlo, il co-DM no', async () => {
    await withTx(async (db) => {
      const { dm, co, campaign, stranger } = await setup(db);
      const foreign = await createWorld(db, stranger);
      await expect(createCampaign(db, dm, foreign)).rejects.toThrow(/row-level security/);
      await expect(
        actAs(db, dm, () =>
          db.query('update campaigns set world_id = $1 where id = $2', [foreign, campaign]),
        ),
      ).rejects.toThrow(/mondo non accessibile/);
      const own = await createWorld(db, dm);
      await actAs(db, dm, () =>
        db.query('update campaigns set world_id = $1 where id = $2', [own, campaign]),
      );
      // Il co-DM può rinominare ma non spostare il collegamento (anche verso un mondo suo).
      const coWorld = await createWorld(db, co);
      await actAs(db, co, () =>
        db.query(`update campaigns set name = 'Nuovo' where id = $1`, [campaign]),
      );
      await expect(
        actAs(db, co, () =>
          db.query('update campaigns set world_id = $1 where id = $2', [coWorld, campaign]),
        ),
      ).rejects.toThrow(/solo il DM/);
    });
  });

  it('eliminare un mondo collegato alla campagna di un altro la rende autonoma', async () => {
    await withTx(async (db) => {
      const [worldOwner, dm] = [await createUser(db), await createUser(db)];
      const worldId = await createWorld(db, worldOwner);
      const dmEmail = await emailOf(db, dm);
      await actAs(db, worldOwner, () =>
        db.query('select add_world_member($1, $2, $3)', [worldId, dmEmail, 'reader']),
      );
      const campaign = await createCampaign(db, dm, worldId);
      await actAs(db, worldOwner, () => db.query('delete from worlds where id = $1', [worldId]));
      const { rows } = await db.query('select world_id from campaigns where id = $1', [campaign]);
      expect(rows[0].world_id).toBeNull();
    });
  });

  it("un giocatore non modifica né elimina la campagna; l'owner non cambia; solo il DM elimina", async () => {
    await withTx(async (db) => {
      const { dm, co, player, campaign } = await setup(db);
      const renamed = await actAs(db, player, () =>
        db.query(`update campaigns set name = 'Hack' where id = $1 returning id`, [campaign]),
      );
      expect(renamed.rowCount).toBe(0);
      await expect(
        actAs(db, dm, () =>
          db.query('update campaigns set owner_id = $1 where id = $2', [player, campaign]),
        ),
      ).rejects.toThrow(/permission denied/);
      const byCo = await actAs(db, co, () =>
        db.query('delete from campaigns where id = $1', [campaign]),
      );
      expect(byCo.rowCount).toBe(0);
      const byDm = await actAs(db, dm, () =>
        db.query('delete from campaigns where id = $1', [campaign]),
      );
      expect(byDm.rowCount).toBe(1);
    });
  });
});

describe('inviti', () => {
  it('il token lo legge solo chi gestisce; il co-DM non vede gli inviti per co-DM', async () => {
    await withTx(async (db) => {
      const { dm, co, player, campaign } = await setup(db);
      await invite(db, dm, campaign, 'player');
      const coInvite = await invite(db, dm, campaign, 'co_dm');
      const asPlayer = await actAs(db, player, () =>
        db.query('select token from campaign_invites'),
      );
      expect(asPlayer.rows).toEqual([]);
      const asCo = await actAs(db, co, () => db.query('select token from campaign_invites'));
      expect(asCo.rows.map((r) => r.token)).not.toContain(coInvite);
      const asDm = await actAs(db, dm, () => db.query('select token from campaign_invites'));
      expect(asDm.rows.map((r) => r.token)).toContain(coInvite);
    });
  });

  it('il client non sceglie il token né i contatori', async () => {
    await withTx(async (db) => {
      const { dm, campaign } = await setup(db);
      await expect(
        actAs(db, dm, () =>
          db.query(
            `insert into campaign_invites (campaign_id, role, created_by, expires_at, token)
             values ($1, 'player', $2, now() + interval '1 day', 'debole')`,
            [campaign, dm],
          ),
        ),
      ).rejects.toThrow(/permission denied/);
      const token = await invite(db, dm, campaign, 'player');
      await expect(
        actAs(db, dm, () =>
          db.query('update campaign_invites set uses = 0 where token = $1', [token]),
        ),
      ).rejects.toThrow(/permission denied/);
      const long = await invite(db, dm, campaign, 'player');
      expect(long).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  it('nessun invito per il ruolo DM, e nessuna scadenza oltre 90 giorni', async () => {
    await withTx(async (db) => {
      const { dm, campaign } = await setup(db);
      await expect(invite(db, dm, campaign, 'dm')).rejects.toThrow(/check constraint/);
      await expect(invite(db, dm, campaign, 'player', { days: 91 })).rejects.toThrow(
        /row-level security/,
      );
      await expect(invite(db, dm, campaign, 'player', { days: 0 })).rejects.toThrow(
        /row-level security/,
      );
    });
  });

  it('osservatori e giocatori non creano inviti; il co-DM solo per giocatori e osservatori', async () => {
    await withTx(async (db) => {
      const { co, player, observer, campaign } = await setup(db);
      await expect(invite(db, player, campaign, 'player')).rejects.toThrow(/row-level security/);
      await expect(invite(db, observer, campaign, 'observer')).rejects.toThrow(
        /row-level security/,
      );
      await expect(invite(db, co, campaign, 'co_dm')).rejects.toThrow(/row-level security/);
      expect(await invite(db, co, campaign, 'observer')).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  it("con l'invito si entra con il ruolo dell'invito e si consuma un uso; poi non vale più", async () => {
    await withTx(async (db) => {
      const { dm, stranger, campaign } = await setup(db);
      const late = await createUser(db, 'tardivo');
      const token = await invite(db, dm, campaign, 'player');
      const joined = await accept(db, stranger, token);
      expect(joined.rows[0].id).toBe(campaign);
      expect(await roleOf(db, campaign, stranger)).toBe('player');
      await expect(accept(db, late, token)).rejects.toThrow(/invalid_invite/);
      expect(await roleOf(db, campaign, late)).toBeUndefined();
    });
  });

  it('un link con più usi vale finché ce ne sono; un membro già dentro non consuma nulla', async () => {
    await withTx(async (db) => {
      const { dm, stranger, campaign } = await setup(db);
      const [b, c] = [await createUser(db), await createUser(db)];
      const token = await invite(db, dm, campaign, 'observer', { uses: 2 });
      await accept(db, stranger, token);
      await expect(accept(db, stranger, token)).rejects.toThrow(/already_member/);
      await accept(db, b, token);
      await expect(accept(db, c, token)).rejects.toThrow(/invalid_invite/);
      const { rows } = await db.query('select uses from campaign_invites where token = $1', [
        token,
      ]);
      expect(rows[0].uses).toBe(2);
    });
  });

  it('invito scaduto, revocato o con token inventato: stesso errore', async () => {
    await withTx(async (db) => {
      const { dm, stranger, campaign } = await setup(db);
      const expired = await invite(db, dm, campaign, 'player');
      await db.query(
        `update campaign_invites set expires_at = now() - interval '1 second' where token = $1`,
        [expired],
      );
      const revoked = await invite(db, dm, campaign, 'player');
      await actAs(db, dm, () =>
        db.query('update campaign_invites set revoked_at = now() where token = $1', [revoked]),
      );
      for (const token of [expired, revoked, 'x'.repeat(64), '']) {
        await expect(accept(db, stranger, token)).rejects.toThrow(/invalid_invite/);
      }
      expect(await roleOf(db, campaign, stranger)).toBeUndefined();
    });
  });

  it("l'invito personale vale una volta sola anche dall'API", async () => {
    await withTx(async (db) => {
      const { dm, campaign } = await setup(db);
      await expect(
        invite(db, dm, campaign, 'player', { email: 'a@example.test', uses: 5 }),
      ).rejects.toThrow(/check constraint/);
    });
  });

  it("un'email non confermata non riscatta un invito personale", async () => {
    await withTx(async (db) => {
      const { dm, stranger, campaign } = await setup(db);
      const token = await invite(db, dm, campaign, 'player', {
        email: await emailOf(db, stranger),
      });
      await db.query('update auth.users set email_confirmed_at = null where id = $1', [stranger]);
      await expect(accept(db, stranger, token)).rejects.toThrow(/invalid_invite/);
      await db.query('update auth.users set email_confirmed_at = now() where id = $1', [stranger]);
      await accept(db, stranger, token);
      expect(await roleOf(db, campaign, stranger)).toBe('player');
    });
  });

  it("l'invito legato a un'email vale solo per quell'account (senza badare alle maiuscole)", async () => {
    await withTx(async (db) => {
      const { dm, stranger, campaign } = await setup(db);
      const wrong = await createUser(db, 'sbagliato');
      const email = (await emailOf(db, stranger)).toLowerCase();
      const token = await invite(db, dm, campaign, 'player', { email });
      await expect(accept(db, wrong, token)).rejects.toThrow(/invalid_invite/);
      // Il tentativo sbagliato non consuma l'invito.
      await db.query('update auth.users set email = upper(email) where id = $1', [stranger]);
      await accept(db, stranger, token);
      expect(await roleOf(db, campaign, stranger)).toBe('player');
    });
  });

  it("l'anteprima mostra nome e ruolo solo a chi può usare l'invito", async () => {
    await withTx(async (db) => {
      const { dm, stranger, campaign } = await setup(db);
      const other = await createUser(db);
      const open = await invite(db, dm, campaign, 'observer');
      const bound = await invite(db, dm, campaign, 'player', {
        email: await emailOf(db, stranger),
      });
      const peek = (uid: string | null, token: string) =>
        actAs(db, uid, () => db.query('select * from preview_campaign_invite($1)', [token]));
      const a = await peek(stranger, open);
      expect(a.rows[0]).toMatchObject({
        campaign_name: 'La Corona',
        role: 'observer',
        already_member: false,
      });
      expect((await peek(stranger, bound)).rows).toHaveLength(1);
      expect((await peek(other, bound)).rows).toEqual([]);
      expect((await peek(other, 'nope')).rows).toEqual([]);
      await expect(peek(null, open)).rejects.toThrow(/permission denied/);
    });
  });

  it('un anonimo non accetta inviti', async () => {
    await withTx(async (db) => {
      const { dm, campaign } = await setup(db);
      const token = await invite(db, dm, campaign, 'player');
      await expect(
        actAs(db, null, () => db.query('select accept_campaign_invite($1)', [token])),
      ).rejects.toThrow(/permission denied/);
    });
  });
});

describe('ruoli', () => {
  const setRole = (db: Db, uid: string, campaign: string, user: string, role: string) =>
    actAs(db, uid, () =>
      db.query('select set_campaign_member_role($1, $2, $3)', [campaign, user, role]),
    );
  const remove = (db: Db, uid: string, campaign: string, user: string) =>
    actAs(db, uid, () => db.query('select remove_campaign_member($1, $2)', [campaign, user]));

  it('il DM assegna co-DM, giocatore e osservatore ma mai DM, e non si cambia', async () => {
    await withTx(async (db) => {
      const { dm, player, campaign } = await setup(db);
      await setRole(db, dm, campaign, player, 'co_dm');
      expect(await roleOf(db, campaign, player)).toBe('co_dm');
      await expect(setRole(db, dm, campaign, player, 'dm')).rejects.toThrow(/invalid_role/);
      await expect(setRole(db, dm, campaign, dm, 'player')).rejects.toThrow(/forbidden/);
    });
  });

  it('il co-DM cambia solo giocatori e osservatori, e solo fra loro: niente escalation', async () => {
    await withTx(async (db) => {
      const { dm, co, player, observer, campaign } = await setup(db);
      await setRole(db, co, campaign, player, 'observer');
      expect(await roleOf(db, campaign, player)).toBe('observer');
      await expect(setRole(db, co, campaign, observer, 'co_dm')).rejects.toThrow(/forbidden/);
      await expect(setRole(db, co, campaign, co, 'co_dm')).rejects.toThrow(/forbidden/);
      await expect(setRole(db, co, campaign, dm, 'player')).rejects.toThrow(/forbidden/);
    });
  });

  it('giocatori e osservatori non cambiano ruoli né tolgono membri; nessuna scrittura diretta', async () => {
    await withTx(async (db) => {
      const { player, observer, campaign } = await setup(db);
      await expect(setRole(db, player, campaign, observer, 'player')).rejects.toThrow(/forbidden/);
      await expect(remove(db, observer, campaign, player)).rejects.toThrow(/forbidden/);
      await expect(
        actAs(db, player, () =>
          db.query(`update campaign_members set role = 'co_dm' where user_id = $1`, [player]),
        ),
      ).rejects.toThrow(/permission denied/);
      await expect(
        actAs(db, player, () =>
          db.query('delete from campaign_members where user_id = $1', [observer]),
        ),
      ).rejects.toThrow(/permission denied/);
      await expect(
        actAs(db, player, () =>
          db.query(
            `insert into campaign_members (campaign_id, user_id, role) values ($1, $2, 'co_dm')`,
            [campaign, player],
          ),
        ),
      ).rejects.toThrow(/permission denied/);
    });
  });

  it('un estraneo non agisce su campagne altrui (né conosce se esistono)', async () => {
    await withTx(async (db) => {
      const { player, stranger, campaign } = await setup(db);
      await expect(setRole(db, stranger, campaign, player, 'observer')).rejects.toThrow(
        /forbidden/,
      );
      await expect(remove(db, stranger, campaign, player)).rejects.toThrow(/forbidden/);
      await expect(
        actAs(db, stranger, () => db.query('select leave_campaign($1)', [campaign])),
      ).rejects.toThrow(/not_a_member/);
    });
  });

  it('il co-DM toglie giocatori e osservatori, non il DM né un altro co-DM; il DM toglie chi vuole', async () => {
    await withTx(async (db) => {
      const { dm, co, player, campaign } = await setup(db);
      const second = await createUser(db);
      await accept(db, second, await invite(db, dm, campaign, 'co_dm'));
      await remove(db, co, campaign, player);
      expect(await roleOf(db, campaign, player)).toBeUndefined();
      await expect(remove(db, co, campaign, dm)).rejects.toThrow(/forbidden/);
      await expect(remove(db, co, campaign, second)).rejects.toThrow(/forbidden/);
      await remove(db, dm, campaign, second);
      expect(await roleOf(db, campaign, second)).toBeUndefined();
      await expect(remove(db, dm, campaign, dm)).rejects.toThrow(/forbidden/);
    });
  });

  it('si esce dalla campagna, ma il DM no; chi è uscito non vede più nulla', async () => {
    await withTx(async (db) => {
      const { dm, player, campaign } = await setup(db);
      await actAs(db, player, () => db.query('select leave_campaign($1)', [campaign]));
      expect(await roleOf(db, campaign, player)).toBeUndefined();
      const seen = await actAs(db, player, () => db.query('select id from campaigns'));
      expect(seen.rows).toEqual([]);
      await expect(
        actAs(db, dm, () => db.query('select leave_campaign($1)', [campaign])),
      ).rejects.toThrow(/owner_cannot_leave/);
    });
  });
});

describe('profili', () => {
  it('i membri della stessa campagna vedono i nomi; gli estranei no', async () => {
    await withTx(async (db) => {
      const { dm, player, stranger } = await setup(db);
      const asPlayer = await actAs(db, player, () => db.query('select id from profiles'));
      expect(asPlayer.rows.map((r) => r.id)).toContain(dm);
      const asStranger = await actAs(db, stranger, () => db.query('select id from profiles'));
      expect(asStranger.rows.map((r) => r.id)).not.toContain(dm);
    });
  });
});
