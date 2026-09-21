import { describe, expect, it } from 'vitest';
import { actAs, createUser, withTx, type Db } from './helpers';

type Graph = {
  nodes: { id: string; title: string; category_ids: string[]; degree: number }[];
  edges: {
    source: string;
    target: string;
    label: string;
    inverse_label: string | null;
    from_mention: boolean;
  }[];
  truncated: boolean;
  edges_truncated: boolean;
};

async function setup(db: Db) {
  const [owner, reader] = [await createUser(db), await createUser(db)];
  const world = (
    await actAs(db, owner, () =>
      db.query(`insert into worlds (name, owner_id) values ('Atlante', $1) returning id`, [owner]),
    )
  ).rows[0].id as string;
  await db.query(`insert into world_members (world_id, user_id, role) values ($1, $2, 'reader')`, [
    world,
    reader,
  ]);
  const cats: string[] = [];
  for (const name of ['Persone', 'Luoghi']) {
    cats.push(
      (
        await db.query(`insert into categories (world_id, name) values ($1, $2) returning id`, [
          world,
          name,
        ])
      ).rows[0].id,
    );
  }
  const s: Record<string, string> = {};
  for (const [name, cat] of [
    ['A', 0],
    ['B', 0],
    ['C', 1],
    ['D', 1],
    ['E', 1],
  ] as const) {
    s[name] = (
      await db.query(
        `insert into snippets (world_id, title, created_by) values ($1, $2, $3) returning id`,
        [world, name, owner],
      )
    ).rows[0].id;
    await db.query(
      `insert into snippet_categories (world_id, snippet_id, category_id) values ($1, $2, $3)`,
      [world, s[name], cats[cat]],
    );
  }
  const rel = (a: string, b: string, label: string, inverse: string | null, mention = false) =>
    db.query(
      `insert into relations (world_id, source_id, target_id, label, inverse_label, from_mention, created_by)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [world, s[a], s[b], label, inverse, mention, owner],
    );
  await rel('A', 'B', 'alleato di', 'alleato di');
  await rel('B', 'C', 'vive a', 'ospita');
  await rel('C', 'D', 'vicino a', 'vicino a');
  await rel('A', 'C', 'menziona', 'menzionato in', true);
  return { owner, reader, world, s, cats };
}

type Args = {
  center?: string | null;
  depth?: number;
  label?: string | null;
  category?: string | null;
  mentions?: boolean;
  max?: number;
};

async function graph(db: Db, user: string, world: string, a: Args = {}): Promise<Graph> {
  const { rows } = await actAs(db, user, () =>
    db.query('select public.graph_data($1, $2, $3, $4, $5, $6, $7) as g', [
      world,
      a.center ?? null,
      a.depth ?? 2,
      a.label ?? null,
      a.category ?? null,
      a.mentions ?? true,
      a.max ?? 300,
    ]),
  );
  return rows[0].g as Graph;
}

const titles = (g: Graph) => g.nodes.map((n) => n.title).sort();

describe('graph_data', () => {
  it('senza centro mostra i nodi con relazioni e non gli isolati', async () => {
    await withTx(async (db) => {
      const { owner, world } = await setup(db);
      const g = await graph(db, owner, world);
      expect(titles(g)).toEqual(['A', 'B', 'C', 'D']);
      expect(g.edges).toHaveLength(4);
      expect(g.truncated).toBe(false);
    });
  });

  it('profondità dal nodo selezionato', async () => {
    await withTx(async (db) => {
      const { owner, world, s } = await setup(db);
      expect(titles(await graph(db, owner, world, { center: s.A, depth: 0 }))).toEqual(['A']);
      // A–B e, tramite la menzione, A–C.
      expect(titles(await graph(db, owner, world, { center: s.A, depth: 1 }))).toEqual([
        'A',
        'B',
        'C',
      ]);
      expect(titles(await graph(db, owner, world, { center: s.A, depth: 2 }))).toEqual([
        'A',
        'B',
        'C',
        'D',
      ]);
    });
  });

  it('si può escludere le relazioni da menzione', async () => {
    await withTx(async (db) => {
      const { owner, world, s } = await setup(db);
      const g = await graph(db, owner, world, { center: s.A, depth: 1, mentions: false });
      expect(titles(g)).toEqual(['A', 'B']);
      expect(g.edges.every((e) => !e.from_mention)).toBe(true);
    });
  });

  it('filtra per etichetta, anche quella inversa, senza badare alle maiuscole', async () => {
    await withTx(async (db) => {
      const { owner, world } = await setup(db);
      expect(titles(await graph(db, owner, world, { label: 'VIVE A' }))).toEqual(['B', 'C']);
      expect(titles(await graph(db, owner, world, { label: 'ospita' }))).toEqual(['B', 'C']);
      expect(titles(await graph(db, owner, world, { label: 'inesistente' }))).toEqual([]);
    });
  });

  it('filtra per categoria: restano solo i nodi della categoria e le relazioni fra loro', async () => {
    await withTx(async (db) => {
      const { owner, world, cats } = await setup(db);
      const g = await graph(db, owner, world, { category: cats[1] });
      expect(titles(g)).toEqual(['C', 'D']);
      expect(g.edges.map((e) => e.label)).toEqual(['vicino a']);
    });
  });

  it('un tetto sul numero di nodi segnala il troncamento', async () => {
    await withTx(async (db) => {
      const { owner, world } = await setup(db);
      const g = await graph(db, owner, world, { max: 2 });
      expect(g.nodes).toHaveLength(2);
      expect(g.truncated).toBe(true);
      expect(g.edges.every((e) => g.nodes.some((n) => n.id === e.source))).toBe(true);
    });
  });

  it('calcola grado e categorie dei nodi', async () => {
    await withTx(async (db) => {
      const { owner, world, cats } = await setup(db);
      const g = await graph(db, owner, world);
      const c = g.nodes.find((n) => n.title === 'C');
      expect(c?.degree).toBe(3);
      expect(c?.category_ids).toEqual([cats[1]]);
    });
  });

  it('rispetta i permessi: uno snippet segreto non compare a un lettore, né le sue relazioni', async () => {
    await withTx(async (db) => {
      const { owner, reader, world, s } = await setup(db);
      await db.query(`update snippets set visibility = 'secret' where id = $1`, [s.D]);
      const asReader = await graph(db, reader, world);
      expect(titles(asReader)).toEqual(['A', 'B', 'C']);
      expect(JSON.stringify(asReader)).not.toContain(s.D as string);
      expect(titles(await graph(db, owner, world))).toEqual(['A', 'B', 'C', 'D']);
    });
  });

  it('un centro inesistente o di un altro mondo non rivela nulla; profondità e tetto sono limitati', async () => {
    await withTx(async (db) => {
      const { owner, world, s } = await setup(db);
      const other = (
        await actAs(db, owner, () =>
          db.query(`insert into worlds (name, owner_id) values ('Altro', $1) returning id`, [
            owner,
          ]),
        )
      ).rows[0].id as string;
      expect((await graph(db, owner, other, { center: s.A })).nodes).toEqual([]);
      const huge = await graph(db, owner, world, { center: s.A, depth: 1000, max: 1_000_000 });
      expect(huge.nodes.length).toBeLessThanOrEqual(4);
    });
  });

  it('gli snippet nel cestino non fanno da ponte e non contano nel grado', async () => {
    await withTx(async (db) => {
      const { owner, world, s } = await setup(db);
      await db.query(`update snippets set deleted_at = now() where id = $1`, [s.B]);
      const g = await graph(db, owner, world, { center: s.A, depth: 3, mentions: false });
      expect(titles(g)).toEqual(['A']);
      const all = await graph(db, owner, world, { mentions: false });
      expect(titles(all)).toEqual(['C', 'D']);
      expect(all.nodes.find((n) => n.title === 'C')?.degree).toBe(1);
    });
  });

  it('segnala che gli archi non sono troncati quando sono pochi', async () => {
    await withTx(async (db) => {
      const { owner, world } = await setup(db);
      expect((await graph(db, owner, world)).edges_truncated).toBe(false);
    });
  });

  it('anon non può chiamarla', async () => {
    await withTx(async (db) => {
      const { world } = await setup(db);
      await expect(
        actAs(db, null, () =>
          db.query('select public.graph_data($1, null, 2, null, null, true, 10)', [world]),
        ),
      ).rejects.toThrow(/permission denied/);
    });
  });
});
