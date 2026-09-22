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

async function createCampaign(db: Db, dm: string, worldId: string | null = null): Promise<string> {
  const { rows } = await actAs(db, dm, () =>
    db.query(
      `insert into campaigns (name, world_id, owner_id) values ('La Corona', $1, $2) returning id`,
      [worldId, dm],
    ),
  );
  return rows[0].id as string;
}

async function addCampaignMember(db: Db, campaign: string, user: string, role: string) {
  await db.query(`insert into campaign_members (campaign_id, user_id, role) values ($1, $2, $3)`, [
    campaign,
    user,
    role,
  ]);
}

const emailOf = async (db: Db, user: string) =>
  (await db.query('select email from auth.users where id = $1', [user])).rows[0].email as string;

const notificationsFor = (db: Db, user: string) =>
  actAs(db, user, () =>
    db.query(
      'select kind, world_id, campaign_id, data, read_at from notifications order by created_at',
    ),
  ).then((r) => r.rows);

const setVisibility = (
  db: Db,
  uid: string,
  kind: string,
  item: string,
  level: string,
  opts: { field?: string | null; users?: string[]; session?: string | null; note?: string } = {},
) =>
  actAs(db, uid, () =>
    db.query('select set_visibility($1, $2, $3, $4, $5, $6, $7)', [
      kind,
      item,
      opts.field ?? null,
      level,
      opts.users ?? [],
      opts.session ?? null,
      opts.note ?? '',
    ]),
  );

describe('notifiche: rivelazioni', () => {
  it('«shared» notifica solo i destinatari scelti, non gli altri membri né chi rivela', async () => {
    await withTx(async (db) => {
      const [dm, anna, bruno] = [
        await createUser(db, 'dm'),
        await createUser(db, 'anna'),
        await createUser(db, 'bruno'),
      ];
      const world = await createWorld(db, dm);
      await addWorldMember(db, world, anna, 'reader');
      await addWorldMember(db, world, bruno, 'reader');
      const snippet = await createSnippet(db, world, dm, 'Segreto', 'secret');
      await setVisibility(db, dm, 'snippet', snippet, 'shared', { users: [anna] });

      const forAnna = await notificationsFor(db, anna);
      expect(forAnna).toHaveLength(1);
      expect(forAnna[0]).toMatchObject({ kind: 'reveal', world_id: world, campaign_id: null });
      expect(forAnna[0].data).toMatchObject({
        itemKind: 'snippet',
        itemId: snippet,
        toLevel: 'shared',
      });
      expect(forAnna[0].read_at).toBeNull();

      expect(await notificationsFor(db, bruno)).toEqual([]);
      expect(await notificationsFor(db, dm)).toEqual([]);
    });
  });

  it('«members» notifica tutti i membri del mondo tranne chi rivela', async () => {
    await withTx(async (db) => {
      const [dm, anna, bruno] = [
        await createUser(db, 'dm'),
        await createUser(db, 'anna'),
        await createUser(db, 'bruno'),
      ];
      const world = await createWorld(db, dm);
      await addWorldMember(db, world, anna, 'reader');
      await addWorldMember(db, world, bruno, 'reader');
      const snippet = await createSnippet(db, world, dm, 'Segreto', 'secret');
      await setVisibility(db, dm, 'snippet', snippet, 'members');

      expect(await notificationsFor(db, anna)).toHaveLength(1);
      expect(await notificationsFor(db, bruno)).toHaveLength(1);
      expect(await notificationsFor(db, dm)).toEqual([]);
    });
  });

  it('nessuna notifica quando il livello scende (non è una rivelazione)', async () => {
    await withTx(async (db) => {
      const [dm, anna] = [await createUser(db, 'dm'), await createUser(db, 'anna')];
      const world = await createWorld(db, dm);
      await addWorldMember(db, world, anna, 'reader');
      const snippet = await createSnippet(db, world, dm, 'Pubblico', 'public');
      await setVisibility(db, dm, 'snippet', snippet, 'secret');
      expect(await notificationsFor(db, anna)).toEqual([]);
    });
  });
});

describe('notifiche: sessioni', () => {
  it('una nuova sessione notifica tutti i membri della campagna tranne chi l’ha creata', async () => {
    await withTx(async (db) => {
      const [dm, p1, p2] = [
        await createUser(db, 'dm'),
        await createUser(db, 'p1'),
        await createUser(db, 'p2'),
      ];
      const campaign = await createCampaign(db, dm);
      await addCampaignMember(db, campaign, p1, 'player');
      await addCampaignMember(db, campaign, p2, 'player');
      const { rows } = await actAs(db, dm, () =>
        db.query(
          `insert into campaign_sessions (campaign_id, created_by) values ($1, $2) returning id, number`,
          [campaign, dm],
        ),
      );
      const session = rows[0];

      for (const uid of [p1, p2]) {
        const n = await notificationsFor(db, uid);
        expect(n).toHaveLength(1);
        expect(n[0]).toMatchObject({ kind: 'session', campaign_id: campaign, world_id: null });
        expect(n[0].data).toMatchObject({ sessionId: session.id, number: session.number });
      }
      expect(await notificationsFor(db, dm)).toEqual([]);
    });
  });
});

describe('notifiche: menzioni', () => {
  it('menzionare uno snippet altrui notifica il suo autore, non chi lo cita', async () => {
    await withTx(async (db) => {
      const [autoreA, autoreB] = [await createUser(db, 'autoreA'), await createUser(db, 'autoreB')];
      const world = await createWorld(db, autoreA);
      await addWorldMember(db, world, autoreB, 'editor');
      const target = await createSnippet(db, world, autoreB, 'Bersaglio');
      const source = await createSnippet(db, world, autoreA, 'Fonte');
      await actAs(db, autoreA, () =>
        db.query(
          `select save_snippet($1, updated_at, title, status, body, fields, '{}', tags, aliases, $2)
             from snippets where id = $1`,
          [source, [target]],
        ),
      );

      const n = await notificationsFor(db, autoreB);
      expect(n).toHaveLength(1);
      expect(n[0]).toMatchObject({ kind: 'mention', world_id: world, campaign_id: null });
      expect(n[0].data).toMatchObject({ sourceSnippetId: source, targetSnippetId: target });
      expect(await notificationsFor(db, autoreA)).toEqual([]);
    });
  });

  it('menzionare un proprio snippet non genera notifiche', async () => {
    await withTx(async (db) => {
      const autore = await createUser(db, 'autore');
      const world = await createWorld(db, autore);
      const target = await createSnippet(db, world, autore, 'Bersaglio');
      const source = await createSnippet(db, world, autore, 'Fonte');
      await actAs(db, autore, () =>
        db.query(
          `select save_snippet($1, updated_at, title, status, body, fields, '{}', tags, aliases, $2)
             from snippets where id = $1`,
          [source, [target]],
        ),
      );
      expect(await notificationsFor(db, autore)).toEqual([]);
    });
  });
});

describe('notifiche: inviti', () => {
  it('un invito per email di un account registrato lo notifica subito', async () => {
    await withTx(async (db) => {
      const [dm, giocatrice] = [await createUser(db, 'dm'), await createUser(db, 'giocatrice')];
      const campaign = await createCampaign(db, dm);
      const email = await emailOf(db, giocatrice);
      await actAs(db, dm, () =>
        db.query(
          `insert into campaign_invites (campaign_id, role, email, created_by, expires_at)
           values ($1, 'player', $2, $3, now() + interval '7 days')`,
          [campaign, email, dm],
        ),
      );
      const n = await notificationsFor(db, giocatrice);
      expect(n).toHaveLength(1);
      expect(n[0]).toMatchObject({
        kind: 'invite_received',
        campaign_id: campaign,
        world_id: null,
      });
      expect(n[0].data).toMatchObject({ role: 'player' });
    });
  });

  it('un invito a link (senza email) non notifica nessuno alla creazione', async () => {
    await withTx(async (db) => {
      const dm = await createUser(db, 'dm');
      const campaign = await createCampaign(db, dm);
      await actAs(db, dm, () =>
        db.query(
          `insert into campaign_invites (campaign_id, role, created_by, expires_at, max_uses)
           values ($1, 'player', $2, now() + interval '7 days', 10)`,
          [campaign, dm],
        ),
      );
      expect(await notificationsFor(db, dm)).toEqual([]);
    });
  });

  it('accettare un invito notifica chi lo ha creato', async () => {
    await withTx(async (db) => {
      const [dm, ospite] = [await createUser(db, 'dm'), await createUser(db, 'ospite')];
      const campaign = await createCampaign(db, dm);
      const { rows } = await actAs(db, dm, () =>
        db.query(
          `insert into campaign_invites (campaign_id, role, created_by, expires_at, max_uses)
           values ($1, 'player', $2, now() + interval '7 days', 10) returning token`,
          [campaign, dm],
        ),
      );
      await actAs(db, ospite, () => db.query('select accept_campaign_invite($1)', [rows[0].token]));

      const n = await notificationsFor(db, dm);
      expect(n).toHaveLength(1);
      expect(n[0]).toMatchObject({
        kind: 'invite_accepted',
        campaign_id: campaign,
        world_id: null,
      });
      expect(n[0].data).toMatchObject({ userId: ospite, role: 'player' });
      expect(await notificationsFor(db, ospite)).toEqual([]);
    });
  });
});

describe('notifiche: permessi', () => {
  it('ognuno legge solo le proprie notifiche e può solo segnarle come lette', async () => {
    await withTx(async (db) => {
      const [dm, anna, bruno] = [
        await createUser(db, 'dm'),
        await createUser(db, 'anna'),
        await createUser(db, 'bruno'),
      ];
      const world = await createWorld(db, dm);
      await addWorldMember(db, world, anna, 'reader');
      const snippet = await createSnippet(db, world, dm, 'Segreto', 'secret');
      await setVisibility(db, dm, 'snippet', snippet, 'shared', { users: [anna] });
      const [{ id }] = await actAs(db, anna, () => db.query('select id from notifications')).then(
        (r) => r.rows,
      );

      expect(
        await actAs(db, bruno, () => db.query('select id from notifications')).then((r) => r.rows),
      ).toEqual([]);

      const forbidden = await actAs(db, bruno, () =>
        db.query('update notifications set read_at = now() where id = $1', [id]),
      );
      expect(forbidden.rowCount).toBe(0);

      const ok = await actAs(db, anna, () =>
        db.query('update notifications set read_at = now() where id = $1', [id]),
      );
      expect(ok.rowCount).toBe(1);

      await expect(
        actAs(db, anna, () =>
          db.query(
            'insert into notifications (user_id, kind, world_id, data) values ($1, $2, $3, $4)',
            [anna, 'reveal', world, {}],
          ),
        ),
      ).rejects.toThrow(/permission denied|row-level security/);
    });
  });
});
