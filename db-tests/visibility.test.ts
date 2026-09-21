import { describe, expect, it } from 'vitest';
import { actAs, createUser, withTx, type Db } from './helpers';

const IMAGE = '22222222-2222-4222-8222-222222222222.png';

/** Mondo con DM (proprietario), un editor, due giocatori (lettori), un commentatore e un estraneo. */
async function setup(db: Db) {
  const [dm, editor, anna, bruno, chiara, stranger] = [
    await createUser(db, 'dm'),
    await createUser(db, 'editor'),
    await createUser(db, 'anna'),
    await createUser(db, 'bruno'),
    await createUser(db, 'chiara'),
    await createUser(db, 'estraneo'),
  ];
  const world = (
    await actAs(db, dm, () =>
      db.query(`insert into worlds (name, owner_id) values ('Aurelia', $1) returning id`, [dm]),
    )
  ).rows[0].id as string;
  for (const [user, role] of [
    [editor, 'editor'],
    [anna, 'reader'],
    [bruno, 'reader'],
    [chiara, 'commenter'],
  ] as const) {
    await db.query(`insert into world_members (world_id, user_id, role) values ($1, $2, $3)`, [
      world,
      user,
      role,
    ]);
  }
  const snippet = async (title: string, visibility = 'members', fields: object = {}) =>
    (
      await db.query(
        `insert into snippets (world_id, title, visibility, fields, created_by) values ($1, $2, $3, $4, $5) returning id`,
        [world, title, visibility, JSON.stringify(fields), dm],
      )
    ).rows[0].id as string;
  return { dm, editor, anna, bruno, chiara, stranger, world, snippet };
}

const titles = async (db: Db, uid: string | null) =>
  (await actAs(db, uid, () => db.query('select title from snippets order by title'))).rows.map(
    (r) => r.title as string,
  );

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

describe('snippet: i quattro livelli', () => {
  it('secret solo a chi scrive; members ai membri; public anche agli anonimi; shared ai soli scelti', async () => {
    await withTx(async (db) => {
      const { dm, editor, anna, bruno, chiara, stranger, snippet } = await setup(db);
      await snippet('Segreto', 'secret');
      await snippet('Condiviso', 'shared');
      await snippet('Membri', 'members');
      await snippet('Pubblico', 'public');
      // «shared» senza destinatari non è visibile ai giocatori.
      expect(await titles(db, anna)).toEqual(['Membri', 'Pubblico']);
      expect(await titles(db, dm)).toEqual(['Condiviso', 'Membri', 'Pubblico', 'Segreto']);
      expect(await titles(db, editor)).toEqual(['Condiviso', 'Membri', 'Pubblico', 'Segreto']);
      expect(await titles(db, chiara)).toEqual(['Membri', 'Pubblico']);
      expect(await titles(db, stranger)).toEqual(['Pubblico']);
      expect(await titles(db, null)).toEqual(['Pubblico']);
      expect(bruno).toBeTruthy();
    });
  });

  it('un elemento condiviso lo vedono solo i destinatari', async () => {
    await withTx(async (db) => {
      const { dm, anna, bruno, stranger, snippet } = await setup(db);
      const id = await snippet('Mappa del tesoro', 'secret');
      await setVisibility(db, dm, 'snippet', id, 'shared', { users: [anna] });
      expect(await titles(db, anna)).toEqual(['Mappa del tesoro']);
      expect(await titles(db, bruno)).toEqual([]);
      expect(await titles(db, stranger)).toEqual([]);
      expect(await titles(db, null)).toEqual([]);
    });
  });

  it('togliere un destinatario o tornare a secret lo nasconde subito', async () => {
    await withTx(async (db) => {
      const { dm, anna, bruno, snippet } = await setup(db);
      const id = await snippet('Mappa', 'secret');
      await setVisibility(db, dm, 'snippet', id, 'shared', { users: [anna, bruno] });
      expect(await titles(db, bruno)).toEqual(['Mappa']);
      await setVisibility(db, dm, 'snippet', id, 'shared', { users: [anna] });
      expect(await titles(db, bruno)).toEqual([]);
      expect(await titles(db, anna)).toEqual(['Mappa']);
      await setVisibility(db, dm, 'snippet', id, 'secret');
      expect(await titles(db, anna)).toEqual([]);
    });
  });

  it('un membro rimosso dal mondo perde le condivisioni; uno snippet eliminato le cancella', async () => {
    await withTx(async (db) => {
      const { dm, anna, world, snippet } = await setup(db);
      const id = await snippet('Mappa', 'secret');
      await setVisibility(db, dm, 'snippet', id, 'shared', { users: [anna] });
      await db.query('delete from world_members where world_id = $1 and user_id = $2', [
        world,
        anna,
      ]);
      expect(
        (await db.query('select 1 from visibility_shares where world_id = $1', [world])).rows,
      ).toEqual([]);
      const other = await snippet('Altro', 'secret');
      await db.query('insert into world_members (world_id, user_id, role) values ($1, $2, $3)', [
        world,
        anna,
        'reader',
      ]);
      await setVisibility(db, dm, 'snippet', other, 'shared', { users: [anna] });
      await db.query('delete from snippets where id = $1', [other]);
      expect(
        (await db.query('select 1 from visibility_shares where world_id = $1', [world])).rows,
      ).toEqual([]);
    });
  });
});

describe('set_visibility: permessi e validazione', () => {
  it('solo chi scrive; giocatori, commentatori ed estranei ricevono forbidden', async () => {
    await withTx(async (db) => {
      const { editor, anna, chiara, stranger, snippet } = await setup(db);
      const id = await snippet('Mappa', 'members');
      for (const user of [anna, chiara, stranger]) {
        await expect(setVisibility(db, user, 'snippet', id, 'public')).rejects.toThrow(/forbidden/);
      }
      await setVisibility(db, editor, 'snippet', id, 'public');
      expect(await titles(db, null)).toEqual(['Mappa']);
    });
  });

  it('non si condivide con chi non è membro, né senza destinatari; anonimi non chiamano la funzione', async () => {
    await withTx(async (db) => {
      const { dm, stranger, anna, world, snippet } = await setup(db);
      const id = await snippet('Mappa', 'members');
      await expect(
        setVisibility(db, dm, 'snippet', id, 'shared', { users: [stranger] }),
      ).rejects.toThrow(/invalid_users/);
      await expect(setVisibility(db, dm, 'snippet', id, 'shared')).rejects.toThrow(
        /users_required/,
      );
      await expect(
        actAs(db, null, () =>
          db.query(`select set_visibility('snippet', $1, null, 'public', '{}', null, '')`, [id]),
        ),
      ).rejects.toThrow(/permission denied/);
      // Con un livello diverso da «shared» i destinatari passati vengono ignorati.
      await setVisibility(db, dm, 'snippet', id, 'secret', { users: [anna] });
      expect(
        (await db.query('select 1 from visibility_shares where world_id = $1', [world])).rows,
      ).toEqual([]);
    });
  });

  it('input non validi: tipo, campo e nota', async () => {
    await withTx(async (db) => {
      const { dm, snippet } = await setup(db);
      const id = await snippet('Mappa');
      await expect(setVisibility(db, dm, 'foo', id, 'secret')).rejects.toThrow(/invalid_kind/);
      await expect(
        setVisibility(db, dm, 'field', id, 'secret', { field: 'MAIUSCOLO' }),
      ).rejects.toThrow(/invalid_field/);
      await expect(setVisibility(db, dm, 'field', id, 'secret')).rejects.toThrow(/invalid_field/);
      await expect(setVisibility(db, dm, 'snippet', id, 'secret', { field: 'x' })).rejects.toThrow(
        /invalid_field/,
      );
      await expect(
        setVisibility(db, dm, 'snippet', id, 'secret', { note: 'x'.repeat(501) }),
      ).rejects.toThrow(/invalid_note/);
      await expect(
        setVisibility(db, dm, 'snippet', '00000000-0000-4000-8000-000000000000', 'secret'),
      ).rejects.toThrow(/forbidden/);
    });
  });

  it('non si scrivono condivisioni, log o valori riservati a mano da un giocatore', async () => {
    await withTx(async (db) => {
      const { anna, world, snippet } = await setup(db);
      const id = await snippet('Mappa', 'members');
      await expect(
        actAs(db, anna, () =>
          db.query(
            `insert into visibility_shares (world_id, kind, item_id, user_id) values ($1, 'snippet', $2, $3)`,
            [world, id, anna],
          ),
        ),
      ).rejects.toThrow(/permission denied/);
      await expect(
        actAs(db, anna, () =>
          db.query(`update snippets set visibility = 'public' where id = $1`, [id]),
        ),
      ).resolves.toMatchObject({ rowCount: 0 });
      await expect(
        actAs(db, anna, () =>
          db.query(
            `insert into snippet_restricted_fields (snippet_id, world_id, key, value, visibility) values ($1, $2, 'x', '1', 'secret')`,
            [id, world],
          ),
        ),
      ).rejects.toThrow(/row-level security/);
    });
  });
});

describe('relazioni', () => {
  const relation = async (
    db: Db,
    world: string,
    dm: string,
    a: string,
    b: string,
    visibility = 'members',
    label = 'alleato di',
  ) =>
    (
      await db.query(
        `insert into relations (world_id, source_id, target_id, label, visibility, created_by)
         values ($1, $2, $3, $6, $4, $5) returning id`,
        [world, a, b, visibility, dm, label],
      )
    ).rows[0].id as string;
  const labels = async (db: Db, uid: string | null) =>
    (await actAs(db, uid, () => db.query('select label from relations'))).rows.length;

  it('livelli delle relazioni, e una relazione non rivela uno snippet nascosto', async () => {
    await withTx(async (db) => {
      const { dm, anna, bruno, stranger, world, snippet } = await setup(db);
      const [a, b, hidden] = [
        await snippet('A'),
        await snippet('B'),
        await snippet('Nascosto', 'secret'),
      ];
      const open = await relation(db, world, dm, a, b);
      const secret = await relation(db, world, dm, a, b, 'secret', 'rivale di');
      const shared = await relation(db, world, dm, a, b, 'shared', 'mentore di');
      await relation(db, world, dm, a, hidden);
      expect(await labels(db, dm)).toBe(4);
      expect(await labels(db, anna)).toBe(1);
      await setVisibility(db, dm, 'relation', shared, 'shared', { users: [anna] });
      expect(await labels(db, anna)).toBe(2);
      expect(await labels(db, bruno)).toBe(1);
      await setVisibility(db, dm, 'relation', secret, 'public');
      // Una relazione pubblica non basta: gli estremi (A e B) sono per i soli membri, quindi agli estranei non arriva nulla.
      expect(await labels(db, null)).toBe(0);
      expect(await labels(db, stranger)).toBe(0);
      expect(open).toBeTruthy();
    });
  });

  it("anche una relazione condivisa non si vede se l'estremo è nascosto al destinatario", async () => {
    await withTx(async (db) => {
      const { dm, anna, world, snippet } = await setup(db);
      const [a, hidden] = [await snippet('A'), await snippet('Nascosto', 'secret')];
      const r = await relation(db, world, dm, a, hidden, 'secret');
      await setVisibility(db, dm, 'relation', r, 'shared', { users: [anna] });
      expect(await labels(db, anna)).toBe(0);
    });
  });
});

describe('pin', () => {
  it('un pin segreto o condiviso non si vede agli altri anche se lo snippet è visibile', async () => {
    await withTx(async (db) => {
      const { dm, anna, bruno, world, snippet } = await setup(db);
      const place = await snippet('Rovine');
      const map = (
        await db.query(
          `insert into maps (world_id, name, image, created_by) values ($1, 'Regione', $2, $3) returning id`,
          [world, IMAGE, dm],
        )
      ).rows[0].id as string;
      const pin = (
        await db.query(
          `insert into map_pins (world_id, map_id, snippet_id, x, y) values ($1, $2, $3, 0.5, 0.5) returning id`,
          [world, map, place],
        )
      ).rows[0].id as string;
      const count = async (uid: string) =>
        (await actAs(db, uid, () => db.query('select 1 from map_pins'))).rows.length;
      expect(await count(anna)).toBe(1);
      await setVisibility(db, dm, 'pin', pin, 'secret');
      expect(await count(anna)).toBe(0);
      expect(await count(dm)).toBe(1);
      await setVisibility(db, dm, 'pin', pin, 'shared', { users: [bruno] });
      expect(await count(bruno)).toBe(1);
      expect(await count(anna)).toBe(0);
    });
  });
});

describe('campi', () => {
  const fieldsOf = async (db: Db, uid: string, id: string) =>
    (await actAs(db, uid, () => db.query('select fields from snippets where id = $1', [id])))
      .rows[0]?.fields as Record<string, unknown> | undefined;
  const restrictedOf = async (db: Db, uid: string) =>
    (
      await actAs(db, uid, () =>
        db.query('select key, value from snippet_restricted_fields order by key'),
      )
    ).rows as { key: string; value: unknown }[];

  it('un campo segreto esce dalla colonna pubblica e lo legge solo chi scrive', async () => {
    await withTx(async (db) => {
      const { dm, anna, snippet } = await setup(db);
      const id = await snippet('Elara', 'members', { eta: 42, segreto: 'è un drago' });
      await setVisibility(db, dm, 'field', id, 'secret', { field: 'segreto' });
      expect(await fieldsOf(db, anna, id)).toEqual({ eta: 42 });
      expect(await fieldsOf(db, dm, id)).toEqual({ eta: 42 });
      expect(await restrictedOf(db, anna)).toEqual([]);
      expect(await restrictedOf(db, dm)).toEqual([{ key: 'segreto', value: 'è un drago' }]);
    });
  });

  it('un campo condiviso lo vedono solo i destinatari; poi torna pubblico con il suo valore', async () => {
    await withTx(async (db) => {
      const { dm, anna, bruno, world, snippet } = await setup(db);
      const id = await snippet('Elara', 'members', { segreto: 'è un drago' });
      await setVisibility(db, dm, 'field', id, 'shared', { field: 'segreto', users: [anna] });
      expect(await restrictedOf(db, anna)).toEqual([{ key: 'segreto', value: 'è un drago' }]);
      expect(await restrictedOf(db, bruno)).toEqual([]);
      expect(await fieldsOf(db, bruno, id)).toEqual({});
      await setVisibility(db, dm, 'field', id, 'members', { field: 'segreto' });
      expect(await restrictedOf(db, anna)).toEqual([]);
      expect(await fieldsOf(db, bruno, id)).toEqual({ segreto: 'è un drago' });
      expect(
        (await db.query('select 1 from visibility_shares where world_id = $1', [world])).rows,
      ).toEqual([]);
    });
  });

  it('un campo riservato non torna nella colonna pubblica con nessuna scrittura', async () => {
    await withTx(async (db) => {
      const { dm, editor, anna, snippet } = await setup(db);
      const id = await snippet('Elara', 'members', { segreto: 'uno' });
      await setVisibility(db, dm, 'field', id, 'secret', { field: 'segreto' });
      // Salvataggio, ripristino o import che riscrivono `fields` con la chiave: il trigger la toglie.
      await actAs(db, editor, () =>
        db.query(`update snippets set fields = '{"segreto": "due", "eta": 1}' where id = $1`, [id]),
      );
      expect(await fieldsOf(db, anna, id)).toEqual({ eta: 1 });
    });
  });

  it('un campo senza valore si può comunque riservare, e un giocatore non vede il valore altrui', async () => {
    await withTx(async (db) => {
      const { dm, anna, snippet } = await setup(db);
      const id = await snippet('Elara');
      await setVisibility(db, dm, 'field', id, 'secret', { field: 'segreto' });
      expect(await restrictedOf(db, dm)).toEqual([{ key: 'segreto', value: null }]);
      await setVisibility(db, dm, 'field', id, 'members', { field: 'segreto' });
      expect(await fieldsOf(db, anna, id)).toEqual({});
    });
  });
});

describe('registro delle rivelazioni', () => {
  const log = async (db: Db, uid: string) =>
    (
      await actAs(db, uid, () =>
        db.query(
          'select kind, from_level, to_level, is_reveal, session_id, note, shared_with from visibility_log order by created_at, id',
        ),
      )
    ).rows;

  it('ogni cambio è registrato con chi, da/a, sessione e nota; nulla se non cambia niente', async () => {
    await withTx(async (db) => {
      const { dm, anna, snippet } = await setup(db);
      const id = await snippet('Mappa', 'secret');
      const session = '33333333-3333-4333-8333-333333333333';
      await setVisibility(db, dm, 'snippet', id, 'shared', {
        users: [anna],
        session,
        note: 'Sessione 3',
      });
      await setVisibility(db, dm, 'snippet', id, 'shared', { users: [anna] }); // invariato
      await setVisibility(db, dm, 'snippet', id, 'secret');
      const rows = await log(db, dm);
      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({
        kind: 'snippet',
        from_level: 'secret',
        to_level: 'shared',
        is_reveal: true,
        session_id: session,
        note: 'Sessione 3',
        shared_with: [anna],
      });
      expect(rows[1]).toMatchObject({ from_level: 'shared', to_level: 'secret', is_reveal: false });
    });
  });

  it('aggiungere un destinatario a un elemento già condiviso è una rivelazione; toglierlo no', async () => {
    await withTx(async (db) => {
      const { dm, anna, bruno, snippet } = await setup(db);
      const id = await snippet('Mappa', 'secret');
      await setVisibility(db, dm, 'snippet', id, 'shared', { users: [anna] });
      await setVisibility(db, dm, 'snippet', id, 'shared', { users: [anna, bruno] });
      await setVisibility(db, dm, 'snippet', id, 'shared', { users: [anna] });
      const rows = await log(db, dm);
      expect(rows.map((r) => r.is_reveal)).toEqual([true, true, false]);
    });
  });

  it('il registro lo leggono chi scrive e i destinatari di una rivelazione, non gli altri giocatori', async () => {
    await withTx(async (db) => {
      const { dm, anna, bruno, stranger, snippet } = await setup(db);
      const id = await snippet('Mappa', 'secret');
      await setVisibility(db, dm, 'snippet', id, 'shared', { users: [anna] });
      expect(await log(db, anna)).toHaveLength(1);
      expect(await log(db, bruno)).toEqual([]);
      expect(await log(db, stranger)).toEqual([]);
      await expect(
        actAs(db, dm, () => db.query(`update visibility_log set note = 'x'`)),
      ).rejects.toThrow(/permission denied/);
    });
  });
});

describe('ricerca e grafo con la visibilità', () => {
  it('search_snippets e graph_data non restituiscono ciò che il giocatore non può vedere', async () => {
    await withTx(async (db) => {
      const { dm, anna, bruno, world, snippet } = await setup(db);
      const [open, hidden, mine] = [
        await snippet('Drago pubblico'),
        await snippet('Drago segreto', 'secret'),
        await snippet('Drago condiviso', 'secret'),
      ];
      await setVisibility(db, dm, 'snippet', mine, 'shared', { users: [anna] });
      await db.query(
        `insert into relations (world_id, source_id, target_id, label, visibility, created_by)
         values ($1, $2, $3, 'nemico di', 'members', $4), ($1, $2, $5, 'nemico di', 'members', $4)`,
        [world, open, hidden, dm, mine],
      );
      const found = async (uid: string) =>
        (
          await actAs(db, uid, () =>
            db.query(
              `select title from search_snippets($1, 'drago', null, '{}', null, null, null, null, false, 50)`,
              [world],
            ),
          )
        ).rows.map((r) => r.title as string);
      expect((await found(anna)).sort()).toEqual(['Drago condiviso', 'Drago pubblico']);
      expect(await found(bruno)).toEqual(['Drago pubblico']);
      expect((await found(dm)).sort()).toEqual([
        'Drago condiviso',
        'Drago pubblico',
        'Drago segreto',
      ]);

      const nodes = async (uid: string) =>
        (
          await actAs(db, uid, () =>
            db.query('select public.graph_data($1, $2, 2, null, null, true, 50) as g', [
              world,
              open,
            ]),
          )
        ).rows[0].g.nodes
          .map((n: { title: string }) => n.title)
          .sort() as string[];
      expect(await nodes(anna)).toEqual(['Drago condiviso', 'Drago pubblico']);
      expect(await nodes(bruno)).toEqual(['Drago pubblico']);
      expect(await nodes(dm)).toEqual(['Drago condiviso', 'Drago pubblico', 'Drago segreto']);
    });
  });
});

describe('immagini', () => {
  const FILE = '44444444-4444-4444-8444-444444444444.png';
  const canRead = async (db: Db, uid: string, world: string, file = FILE) =>
    (await actAs(db, uid, () => db.query('select can_read_image($1, $2) as ok', [world, file])))
      .rows[0].ok as boolean;

  it('un file usato solo da uno snippet nascosto non lo legge un giocatore', async () => {
    await withTx(async (db) => {
      const { dm, anna, bruno, world, snippet } = await setup(db);
      const id = await snippet('Mappa segreta', 'secret');
      await db.query(`update snippets set body = $1 where id = $2`, [
        JSON.stringify({
          type: 'doc',
          content: [{ type: 'image', attrs: { src: `/worlds/${world}/images/${FILE}` } }],
        }),
        id,
      ]);
      expect(await canRead(db, dm, world)).toBe(true);
      expect(await canRead(db, anna, world)).toBe(false);
      await setVisibility(db, dm, 'snippet', id, 'shared', { users: [anna] });
      expect(await canRead(db, anna, world)).toBe(true);
      expect(await canRead(db, bruno, world)).toBe(false);
      await setVisibility(db, dm, 'snippet', id, 'members');
      expect(await canRead(db, bruno, world)).toBe(true);
    });
  });

  it('il file di una mappa visibile si legge; formati non validi e file sconosciuti no', async () => {
    await withTx(async (db) => {
      const { dm, anna, world } = await setup(db);
      await db.query(
        `insert into maps (world_id, name, image, created_by) values ($1, 'Regione', $2, $3)`,
        [world, FILE, dm],
      );
      expect(await canRead(db, anna, world)).toBe(true);
      expect(await canRead(db, anna, world, '../../etc/passwd')).toBe(false);
      expect(await canRead(db, anna, world, '55555555-5555-4555-8555-555555555555.png')).toBe(
        false,
      );
    });
  });
});

describe('scritture dirette', () => {
  it('nemmeno un editor cambia il livello senza set_visibility (resterebbe fuori dal registro)', async () => {
    await withTx(async (db) => {
      const { editor, world, snippet } = await setup(db);
      const id = await snippet('Mappa', 'members');
      await expect(
        actAs(db, editor, () =>
          db.query(`update snippets set visibility = 'public' where id = $1`, [id]),
        ),
      ).rejects.toThrow(/visibility_via_function/);
      const [a, b] = [await snippet('A'), await snippet('B')];
      const rel = (
        await db.query(
          `insert into relations (world_id, source_id, target_id, label, created_by) values ($1, $2, $3, 'x', $4) returning id`,
          [world, a, b, editor],
        )
      ).rows[0].id as string;
      await expect(
        actAs(db, editor, () =>
          db.query(`update relations set visibility = 'public' where id = $1`, [rel]),
        ),
      ).rejects.toThrow(/visibility_via_function/);
      // Altre modifiche dello stesso elemento restano possibili.
      await actAs(db, editor, () =>
        db.query(`update snippets set title = 'Nuovo' where id = $1`, [id]),
      );
    });
  });

  it('un editor aggiorna il valore di un campo riservato ma non ne cambia il livello né lo cancella', async () => {
    await withTx(async (db) => {
      const { dm, editor, snippet } = await setup(db);
      const id = await snippet('Elara', 'members', { segreto: 'uno' });
      await setVisibility(db, dm, 'field', id, 'secret', { field: 'segreto' });
      await actAs(db, editor, () =>
        db.query(`update snippet_restricted_fields set value = '"due"' where snippet_id = $1`, [
          id,
        ]),
      );
      await expect(
        actAs(db, editor, () =>
          db.query(
            `update snippet_restricted_fields set visibility = 'shared' where snippet_id = $1`,
            [id],
          ),
        ),
      ).rejects.toThrow(/permission denied/);
      await expect(
        actAs(db, editor, () =>
          db.query('delete from snippet_restricted_fields where snippet_id = $1', [id]),
        ),
      ).rejects.toThrow(/permission denied/);
    });
  });

  it('un anonimo non vede relazioni né pin condivisi o segreti', async () => {
    await withTx(async (db) => {
      const { dm, world, snippet } = await setup(db);
      const [a, b] = [await snippet('A', 'public'), await snippet('B', 'public')];
      await db.query(
        `insert into relations (world_id, source_id, target_id, label, visibility, created_by) values ($1, $2, $3, 'x', 'secret', $4), ($1, $3, $2, 'y', 'shared', $4), ($1, $2, $3, 'z', 'members', $4)`,
        [world, a, b, dm],
      );
      const rows = await actAs(db, null, () => db.query('select label from relations'));
      expect(rows.rows).toEqual([]);
    });
  });
});
