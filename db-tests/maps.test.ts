import { describe, expect, it } from 'vitest';
import { actAs, createUser, withTx, type Db } from './helpers';

const IMAGE = '11111111-1111-4111-8111-111111111111.png';

async function setup(db: Db) {
  const [owner, editor, reader, stranger] = [
    await createUser(db),
    await createUser(db),
    await createUser(db),
    await createUser(db),
  ];
  const world = (
    await actAs(db, owner, () =>
      db.query(`insert into worlds (name, owner_id) values ('Aurelia', $1) returning id`, [owner]),
    )
  ).rows[0].id as string;
  for (const [user, role] of [
    [editor, 'editor'],
    [reader, 'reader'],
  ] as const) {
    await db.query(`insert into world_members (world_id, user_id, role) values ($1, $2, $3)`, [
      world,
      user,
      role,
    ]);
  }
  const snippet = async (title: string, visibility = 'members') =>
    (
      await db.query(
        `insert into snippets (world_id, title, visibility, created_by) values ($1, $2, $3, $4) returning id`,
        [world, title, visibility, owner],
      )
    ).rows[0].id as string;
  return { owner, editor, reader, stranger, world, snippet };
}

const createMap = (db: Db, user: string, world: string, extra: { snippet?: string } = {}) =>
  actAs(db, user, () =>
    db.query(
      `insert into maps (world_id, name, image, snippet_id, created_by) values ($1, 'Regione', $2, $3, $4) returning id`,
      [world, IMAGE, extra.snippet ?? null, user],
    ),
  );

const pin = (db: Db, user: string, world: string, map: string, snippet: string, x = 0.5, y = 0.5) =>
  actAs(db, user, () =>
    db.query(
      `insert into map_pins (world_id, map_id, snippet_id, x, y) values ($1, $2, $3, $4, $5) returning id`,
      [world, map, snippet, x, y],
    ),
  );

describe('mappe', () => {
  it('chi scrive crea, i lettori leggono, gli estranei e gli anonimi non vedono nulla', async () => {
    await withTx(async (db) => {
      const { editor, reader, stranger, world } = await setup(db);
      await createMap(db, editor, world);
      expect((await actAs(db, reader, () => db.query('select name from maps'))).rows).toEqual([
        { name: 'Regione' },
      ]);
      await expect(createMap(db, reader, world)).rejects.toThrow();
      expect((await actAs(db, stranger, () => db.query('select 1 from maps'))).rows).toEqual([]);
      await expect(createMap(db, stranger, world)).rejects.toThrow();
      await expect(actAs(db, null, () => db.query('select 1 from maps'))).rejects.toThrow();
    });
  });

  it('il file deve avere il formato del bucket', async () => {
    await withTx(async (db) => {
      const { editor, world } = await setup(db);
      for (const image of ['../x.png', 'immagine.png', `${IMAGE}.svg`, 'a/b.png']) {
        await expect(
          actAs(db, editor, () =>
            db.query(`insert into maps (world_id, name, image) values ($1, 'X', $2)`, [
              world,
              image,
            ]),
          ),
        ).rejects.toThrow();
      }
    });
  });

  it('un luogo segreto non ha pin visibili ai lettori, e non rivela la propria esistenza', async () => {
    await withTx(async (db) => {
      const { owner, reader, world, snippet } = await setup(db);
      const open = await snippet('Porto Verde');
      const hidden = await snippet('Covo', 'secret');
      const map = (await createMap(db, owner, world)).rows[0].id as string;
      await pin(db, owner, world, map, open, 0.2, 0.3);
      await pin(db, owner, world, map, hidden, 0.8, 0.9);
      const seenByOwner = await actAs(db, owner, () =>
        db.query('select count(*)::int as n from map_pins'),
      );
      expect(seenByOwner.rows[0].n).toBe(2);
      const seen = await actAs(db, reader, () => db.query('select x, y from map_pins'));
      expect(seen.rows).toEqual([{ x: 0.2, y: 0.3 }]);
    });
  });

  it('coordinate fuori da 0–1 e pin doppi sullo stesso luogo sono rifiutati; la mappa non si cambia', async () => {
    await withTx(async (db) => {
      const { owner, world, snippet } = await setup(db);
      const s = await snippet('Porto Verde');
      const map = (await createMap(db, owner, world)).rows[0].id as string;
      await expect(pin(db, owner, world, map, s, 1.2, 0.5)).rejects.toThrow();
      await expect(pin(db, owner, world, map, s, 0.5, -0.1)).rejects.toThrow();
    });
    await withTx(async (db) => {
      const { owner, world, snippet } = await setup(db);
      const s = await snippet('Porto Verde');
      const map = (await createMap(db, owner, world)).rows[0].id as string;
      const other = (await createMap(db, owner, world)).rows[0].id as string;
      const id = (await pin(db, owner, world, map, s)).rows[0].id as string;
      await expect(pin(db, owner, world, map, s, 0.1, 0.1)).rejects.toThrow(
        /map_pins_map_id_snippet_id_key/,
      );
      await expect(
        actAs(db, owner, () =>
          db.query('update map_pins set map_id = $1 where id = $2', [other, id]),
        ),
      ).rejects.toThrow();
    });
  });

  it('una mappa può raffigurare un luogo; se il luogo sparisce il legame decade, i pin del luogo spariscono', async () => {
    await withTx(async (db) => {
      const { owner, world, snippet } = await setup(db);
      const place = await snippet('Porto Verde');
      const region = (await createMap(db, owner, world)).rows[0].id as string;
      const city = (await createMap(db, owner, world, { snippet: place })).rows[0].id as string;
      await pin(db, owner, world, region, place);
      await db.query('delete from snippets where id = $1', [place]);
      const after = await db.query('select snippet_id from maps where id = $1', [city]);
      expect(after.rows).toEqual([{ snippet_id: null }]);
      expect((await db.query('select 1 from map_pins where world_id = $1', [world])).rows).toEqual(
        [],
      );
    });
  });

  it('i percorsi hanno da 2 a 30 tappe, solo pin della stessa mappa; togliere un pin lo toglie dal percorso', async () => {
    await withTx(async (db) => {
      const { owner, editor, reader, world, snippet } = await setup(db);
      const a = await snippet('A');
      const b = await snippet('B');
      const c = await snippet('C');
      const map = (await createMap(db, owner, world)).rows[0].id as string;
      const other = (await createMap(db, owner, world)).rows[0].id as string;
      const pa = (await pin(db, owner, world, map, a)).rows[0].id as string;
      const pb = (await pin(db, owner, world, map, b)).rows[0].id as string;
      const pc = (await pin(db, owner, world, map, c)).rows[0].id as string;
      const foreign = (await pin(db, owner, world, other, a)).rows[0].id as string;

      const route = (user: string, stops: string[], mapId = map) =>
        actAs(db, user, () =>
          db.query(
            `insert into map_routes (world_id, map_id, name, stops) values ($1, $2, 'Viaggio', $3) returning id`,
            [world, mapId, stops],
          ),
        );
      await expect(route(owner, [pa])).rejects.toThrow();
      await expect(route(owner, [pa, foreign])).rejects.toThrow(/route_stops_invalid/);
      await expect(route(reader, [pa, pb])).rejects.toThrow();
      const id = (await route(editor, [pa, pb, pc])).rows[0].id as string;

      await db.query('delete from map_pins where id = $1', [pb]);
      const stops = await db.query('select stops from map_routes where id = $1', [id]);
      expect(stops.rows[0].stops).toEqual([pa, pc]);
    });
  });

  it('eliminare la mappa elimina pin e percorsi; il mondo non si cambia', async () => {
    await withTx(async (db) => {
      const { owner, world, snippet } = await setup(db);
      const a = await snippet('A');
      const b = await snippet('B');
      const map = (await createMap(db, owner, world)).rows[0].id as string;
      const pa = (await pin(db, owner, world, map, a)).rows[0].id as string;
      const pb = (await pin(db, owner, world, map, b)).rows[0].id as string;
      await actAs(db, owner, () =>
        db.query(
          `insert into map_routes (world_id, map_id, name, stops) values ($1, $2, 'V', $3)`,
          [world, map, [pa, pb]],
        ),
      );
      const other = (
        await actAs(db, owner, () =>
          db.query(`insert into worlds (name, owner_id) values ('Altro', $1) returning id`, [
            owner,
          ]),
        )
      ).rows[0].id as string;
      await expect(
        actAs(db, owner, () =>
          db.query('update maps set world_id = $1 where id = $2', [other, map]),
        ),
      ).rejects.toThrow();
      await actAs(db, owner, () => db.query('delete from maps where id = $1', [map]));
      expect((await db.query('select 1 from map_pins where world_id = $1', [world])).rows).toEqual(
        [],
      );
      expect(
        (await db.query('select 1 from map_routes where world_id = $1', [world])).rows,
      ).toEqual([]);
    });
  });
});
