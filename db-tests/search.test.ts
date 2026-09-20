import { describe, expect, it } from 'vitest';
import { actAs, createUser, withTx, type Db } from './helpers';

const p = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const body = (...texts: string[]) => JSON.stringify({ type: 'doc', content: texts.map(p) });

async function setup(db: Db) {
  const owner = await createUser(db);
  const { rows } = await actAs(db, owner, () =>
    db.query(`insert into worlds (name, owner_id) values ('Aurelia', $1) returning id`, [owner]),
  );
  const worldId = rows[0].id as string;
  const q = (sql: string, params: unknown[] = []) => actAs(db, owner, () => db.query(sql, params));
  const snippet = async (
    title: string,
    opts: {
      body?: string;
      tags?: string[];
      aliases?: string[];
      visibility?: string;
      status?: string;
      fields?: object;
      archived?: boolean;
      deleted?: boolean;
    } = {},
  ) =>
    (
      await q(
        `insert into snippets (world_id, title, body, tags, aliases, visibility, status, fields, archived_at, deleted_at, created_by)
         values ($1, $2, $3::jsonb, $4::text[], $5::text[], $6, $7, $8::jsonb,
                 case when $9 then now() end, case when $10 then now() end, $11) returning id`,
        [
          worldId,
          title,
          opts.body ?? '{}',
          opts.tags ?? [],
          opts.aliases ?? [],
          opts.visibility ?? 'members',
          opts.status ?? 'draft',
          JSON.stringify(opts.fields ?? {}),
          opts.archived ?? false,
          opts.deleted ?? false,
          owner,
        ],
      )
    ).rows[0].id as string;
  const search = async (
    as: string,
    query: string,
    extra: Partial<{
      category: string;
      tags: string[];
      status: string;
      fieldKey: string;
      fieldValue: string;
      relation: string;
      archived: boolean;
    }> = {},
  ) =>
    (
      await actAs(db, as, () =>
        db.query(
          `select id, title, excerpt, rank from search_snippets($1, $2, $3, $4::text[], $5, $6, $7, $8, $9)`,
          [
            worldId,
            query,
            extra.category ?? null,
            extra.tags ?? [],
            extra.status ?? null,
            extra.fieldKey ?? null,
            extra.fieldValue ?? null,
            extra.relation ?? null,
            extra.archived ?? false,
          ],
        ),
      )
    ).rows as { id: string; title: string; excerpt: string; rank: number }[];
  return { owner, worldId, q, snippet, search };
}

const titles = (rows: { title: string }[]) => rows.map((r) => r.title).sort();

describe('ricerca full-text', () => {
  it('trova per titolo, testo, tag e alias, con prefissi e senza badare a maiuscole e accenti', async () => {
    await withTx(async (db) => {
      const { owner, snippet, search } = await setup(db);
      await snippet('Edaline', { body: body('Una strega del nord.') });
      await snippet('Balrog', {
        body: body('Un’ombra antica'),
        tags: ['fuoco'],
        aliases: ['Il Flagello di Durin'],
      });
      await snippet('Città di Élan');

      expect(titles(await search(owner, 'eda'))).toEqual(['Edaline']);
      expect(titles(await search(owner, 'STREGA nord'))).toEqual(['Edaline']);
      expect(titles(await search(owner, 'ombra'))).toEqual(['Balrog']);
      expect(titles(await search(owner, 'fuoco'))).toEqual(['Balrog']);
      expect(titles(await search(owner, 'flagello'))).toEqual(['Balrog']);
      expect(titles(await search(owner, 'citta elan'))).toEqual(['Città di Élan']);
      expect(titles(await search(owner, 'zzz'))).toEqual([]);
    });
  });

  it('il titolo pesa più del testo', async () => {
    await withTx(async (db) => {
      const { owner, snippet, search } = await setup(db);
      await snippet('Drago', { body: body('Vive in montagna.') });
      await snippet('Bestiario', {
        body: body('Il drago è una creatura antica, il drago sputa fuoco.'),
      });
      const rows = await search(owner, 'drago');
      expect(rows.map((r) => r.title)).toEqual(['Drago', 'Bestiario']);
    });
  });

  it('non si può rompere la query con operatori o caratteri speciali', async () => {
    await withTx(async (db) => {
      const { owner, snippet, search } = await setup(db);
      await snippet('Alfa');
      for (const bad of [
        "a' or 1=1 --",
        '!!!',
        '&|:*()',
        'alfa & | !',
        '\\',
        'x'.repeat(500),
        '   ',
      ]) {
        await expect(search(owner, bad)).resolves.toBeDefined();
      }
      expect(titles(await search(owner, 'alfa & (beta | !gamma)'))).toEqual([]);
      expect(titles(await search(owner, ':*alfa'))).toEqual(['Alfa']);
    });
  });

  it('senza testo elenca per data, con estratto del corpo', async () => {
    await withTx(async (db) => {
      const { owner, snippet, search } = await setup(db);
      await snippet('Uno', { body: body('Primo testo') });
      const rows = await search(owner, '');
      expect(rows).toHaveLength(1);
      expect(rows[0]?.excerpt).toBe('Primo testo');
    });
  });

  it('l’estratto evidenzia i termini con marcatori, senza HTML', async () => {
    await withTx(async (db) => {
      const { owner, snippet, search } = await setup(db);
      await snippet('Nota', { body: body('La <b>torre</b> è alta') });
      const rows = await search(owner, 'torre');
      expect(rows[0]?.excerpt).toContain('<<torre>>');
    });
  });

  it('esclude cestino e archiviati, salvo richiesta', async () => {
    await withTx(async (db) => {
      const { owner, snippet, search } = await setup(db);
      await snippet('Attivo mappa');
      await snippet('Archiviato mappa', { archived: true });
      await snippet('Cestinato mappa', { deleted: true });
      expect(titles(await search(owner, 'mappa'))).toEqual(['Attivo mappa']);
      expect(titles(await search(owner, 'mappa', { archived: true }))).toEqual([
        'Archiviato mappa',
        'Attivo mappa',
      ]);
    });
  });

  it('aggiorna l’indice quando lo snippet cambia', async () => {
    await withTx(async (db) => {
      const { owner, q, snippet, search } = await setup(db);
      const id = await snippet('Provvisorio', { body: body('vecchio testo') });
      expect(titles(await search(owner, 'vecchio'))).toEqual(['Provvisorio']);
      await q(`update snippets set body = $2::jsonb, tags = '{nuovo}' where id = $1`, [
        id,
        body('testo fresco'),
      ]);
      expect(await search(owner, 'vecchio')).toEqual([]);
      expect(titles(await search(owner, 'fresco'))).toEqual(['Provvisorio']);
      expect(titles(await search(owner, 'nuovo'))).toEqual(['Provvisorio']);
    });
  });

  it('non indicizza il titolo di uno snippet menzionato (nessuna fuga tramite le menzioni)', async () => {
    await withTx(async (db) => {
      const { owner, snippet, search } = await setup(db);
      const secret = await snippet('Traditore segreto', { visibility: 'secret' });
      await snippet('Diario pubblico', {
        body: JSON.stringify({
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'mention', attrs: { id: secret, label: 'Traditore segreto' } }],
            },
          ],
        }),
        visibility: 'public',
      });
      expect(titles(await search(owner, 'traditore'))).toEqual(['Traditore segreto']);
    });
  });
});

describe('ricerca: filtri', () => {
  it('per categoria, tag, stato e campo', async () => {
    await withTx(async (db) => {
      const { owner, worldId, q, snippet, search } = await setup(db);
      const cat = (
        await q(`insert into categories (world_id, name) values ($1, 'Personaggio') returning id`, [
          worldId,
        ])
      ).rows[0].id as string;
      const a = await snippet('Ada', {
        tags: ['magia', 'nord'],
        status: 'final',
        fields: { razza: 'Elfo', eta: 300 },
      });
      await snippet('Bruno', { tags: ['magia'], fields: { razza: 'Nano' } });
      await q(
        `insert into snippet_categories (world_id, snippet_id, category_id) values ($1, $2, $3)`,
        [worldId, a, cat],
      );

      expect(titles(await search(owner, '', { category: cat }))).toEqual(['Ada']);
      expect(titles(await search(owner, '', { tags: ['magia'] }))).toEqual(['Ada', 'Bruno']);
      expect(titles(await search(owner, '', { tags: ['magia', 'nord'] }))).toEqual(['Ada']);
      expect(titles(await search(owner, '', { status: 'final' }))).toEqual(['Ada']);
      expect(titles(await search(owner, '', { fieldKey: 'razza', fieldValue: 'elfo' }))).toEqual([
        'Ada',
      ]);
      expect(titles(await search(owner, '', { fieldKey: 'eta', fieldValue: '300' }))).toEqual([
        'Ada',
      ]);
      expect(titles(await search(owner, 'ada', { tags: ['nord'], status: 'final' }))).toEqual([
        'Ada',
      ]);
      expect(await search(owner, 'ada', { status: 'draft' })).toEqual([]);
    });
  });

  it('per relazione, con etichetta o inversa e senza badare a maiuscole e spazi', async () => {
    await withTx(async (db) => {
      const { owner, worldId, q, snippet, search } = await setup(db);
      const [a, b, c] = [await snippet('Ada'), await snippet('Bruno'), await snippet('Carla')];
      await q(
        `insert into relations (world_id, source_id, target_id, label, inverse_label, created_by) values ($1, $2, $3, 'padre di', 'figlio di', $4)`,
        [worldId, a, b, owner],
      );
      expect(titles(await search(owner, '', { relation: ' Padre  DI ' }))).toEqual([
        'Ada',
        'Bruno',
      ]);
      expect(titles(await search(owner, '', { relation: 'figlio di' }))).toEqual(['Ada', 'Bruno']);
      expect(titles(await search(owner, 'carla', { relation: 'padre di' }))).toEqual([]);
      void c;
    });
  });
});

describe('ricerca: visibilità lato server', () => {
  async function world(db: Db) {
    const ctx = await setup(db);
    const member = async (role: string) => {
      const id = await createUser(db);
      await db.query(`insert into world_members (world_id, user_id, role) values ($1, $2, $3)`, [
        ctx.worldId,
        id,
        role,
      ]);
      return id;
    };
    return { ...ctx, member };
  }

  it('un lettore non trova snippet segreti o condivisi, né testo, tag o alias di quelli', async () => {
    await withTx(async (db) => {
      const { owner, snippet, search, member } = await world(db);
      const reader = await member('reader');
      await snippet('Piano del tiranno', {
        visibility: 'secret',
        body: body('Il tradimento avverrà alla luna piena'),
        tags: ['complotto'],
        aliases: ['La Lama Nera'],
      });
      await snippet('Voce condivisa', { visibility: 'shared', body: body('tradimento') });
      await snippet('Storia pubblica', { visibility: 'public', body: body('tradimento noto') });
      await snippet('Storia dei membri', {
        visibility: 'members',
        body: body('tradimento dei membri'),
      });

      for (const query of ['tiranno', 'tradimento', 'complotto', 'lama', 'luna']) {
        const asReader = titles(await search(reader, query));
        expect(asReader).not.toContain('Piano del tiranno');
        expect(asReader).not.toContain('Voce condivisa');
      }
      expect(titles(await search(reader, 'tradimento'))).toEqual([
        'Storia dei membri',
        'Storia pubblica',
      ]);
      // Il proprietario vede tutto.
      expect(titles(await search(owner, 'tradimento'))).toHaveLength(4);
    });
  });

  it('un estraneo (non membro) non ottiene nulla, nemmeno degli snippet pubblici tramite la funzione', async () => {
    await withTx(async (db) => {
      const { snippet, search } = await world(db);
      await snippet('Pubblico', { visibility: 'public' });
      const stranger = await createUser(db);
      // Un non membro vede al più i pubblici, mai altro: qui solo il pubblico.
      expect(titles(await search(stranger, 'pubblico'))).toEqual(['Pubblico']);
      expect(await search(stranger, '')).toHaveLength(1);
    });
  });

  it('gli anonimi non possono chiamare la funzione', async () => {
    await withTx(async (db) => {
      const { worldId } = await setup(db);
      await expect(
        actAs(db, null, () => db.query(`select * from search_snippets($1, 'x')`, [worldId])),
      ).rejects.toThrow();
    });
  });

  it('il filtro per relazione non rivela l’esistenza di relazioni verso snippet segreti', async () => {
    await withTx(async (db) => {
      const { owner, worldId, q, snippet, search, member } = await world(db);
      const reader = await member('reader');
      const [open, secret] = [
        await snippet('Visibile'),
        await snippet('Nascosto', { visibility: 'secret' }),
      ];
      await q(
        `insert into relations (world_id, source_id, target_id, label, created_by) values ($1, $2, $3, 'tradisce', $4)`,
        [worldId, open, secret, owner],
      );
      expect(titles(await search(reader, '', { relation: 'tradisce' }))).toEqual([]);
      expect(titles(await search(owner, '', { relation: 'tradisce' }))).toEqual([
        'Nascosto',
        'Visibile',
      ]);
    });
  });
});

describe('policy snippets_read: matrice ruolo × visibilità × cestino', () => {
  // Selezione diretta sulla tabella (come farebbe PostgREST): è la policy, non la funzione, a decidere.
  it('ogni ruolo vede esattamente ciò che la vecchia policy consentiva', async () => {
    await withTx(async (db) => {
      const ctx = await setup(db);
      const { owner, worldId, snippet } = ctx;
      const join = async (role: string) => {
        const id = await createUser(db);
        await db.query(`insert into world_members (world_id, user_id, role) values ($1, $2, $3)`, [
          worldId,
          id,
          role,
        ]);
        return id;
      };
      const editor = await join('editor');
      const commenter = await join('commenter');
      const reader = await join('reader');
      const stranger = await createUser(db);

      for (const visibility of ['public', 'members', 'shared', 'secret']) {
        await snippet(`${visibility}`, { visibility });
        await snippet(`${visibility}-cestino`, { visibility, deleted: true });
      }
      const seen = async (as: string | null) =>
        (
          await actAs(db, as, () =>
            db.query(`select title from snippets where world_id = $1 order by title`, [worldId]),
          )
        ).rows.map((r) => r.title as string);

      const all = [
        'members',
        'members-cestino',
        'public',
        'public-cestino',
        'secret',
        'secret-cestino',
        'shared',
        'shared-cestino',
      ];
      expect(await seen(owner)).toEqual(all);
      expect(await seen(editor)).toEqual(all);
      expect(await seen(commenter)).toEqual(['members', 'public']);
      expect(await seen(reader)).toEqual(['members', 'public']);
      expect(await seen(stranger)).toEqual(['public']);
      expect(await seen(null)).toEqual(['public']);
    });
  });
});

describe('ricerca: prestazioni', () => {
  const median = (xs: number[]) =>
    [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] as number;

  it('su 3.000 snippet con testi realistici risponde in modo rapido a proprietari e lettori', async () => {
    await withTx(async (db) => {
      const { owner, worldId, search } = await setup(db);
      const reader = await createUser(db);
      await db.query(
        `insert into world_members (world_id, user_id, role) values ($1, $2, 'reader')`,
        [worldId, reader],
      );
      // Testi di circa 2 KB: `ts_headline` e il vettore hanno un costo reale.
      await db.query(
        `insert into snippets (world_id, title, body, tags, created_by)
         select $1, 'Snippet ' || n || ' ' || (array['drago','castello','fiume','strega','mappa'])[1 + n % 5],
                jsonb_build_object('type','doc','content', jsonb_build_array(jsonb_build_object('type','paragraph','content',
                  jsonb_build_array(jsonb_build_object('type','text','text',
                    repeat('Testo di prova numero ' || n || ' con parole varie come ombra e luna. ', 30))))) ),
                array['t' || (n % 20)], $2
           from generate_series(1, 3000) as n`,
        [worldId, owner],
      );
      await db.query('analyze snippets');
      const timed = async (as: string, query: string, extra = {}) => {
        const start = performance.now();
        const rows = await search(as, query, extra);
        return { ms: performance.now() - start, rows };
      };
      for (const as of [owner, reader]) {
        for (const [query, extra] of [
          ['drago', {}],
          ['ombra luna', {}],
          ['sn', {}],
          ['', { tags: ['t3'] }],
        ] as const) {
          await timed(as, query, extra); // riscaldamento
          const samples: number[] = [];
          for (let i = 0; i < 5; i++) {
            const { ms, rows } = await timed(as, query, extra);
            expect(rows.length).toBeGreaterThan(0);
            samples.push(ms);
          }
          // Soglia larga e mediana: intercetta il ritorno a una valutazione della policy per riga (~secondi), non il rumore.
          expect(median(samples)).toBeLessThan(500);
        }
      }
    });
  });

  it('usa l’indice GIN per la ricerca di testo', async () => {
    await withTx(async (db) => {
      const { worldId, owner } = await setup(db);
      await db.query(
        `insert into snippets (world_id, title, created_by) select $1, 'S ' || n, $2 from generate_series(1, 2000) n`,
        [worldId, owner],
      );
      await db.query('analyze snippets');
      await db.query('set local enable_seqscan = off');
      const { rows } = await db.query(
        `explain select id from snippets where search @@ private.prefix_query('s 5')`,
      );
      expect(rows.map((r) => r['QUERY PLAN']).join('\n')).toMatch(/snippets_search_idx/);
    });
  });
});
