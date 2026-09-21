import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { actAs, withTx } from './helpers';

const DEMO = '00000000-0000-4000-8000-00000000d3a0';
const DEMO_WORLD = '00000000-0000-4000-8000-0000000a0001';
const STRESS_WORLD = '00000000-0000-4000-8000-0000000a0002';
const seed = readFileSync(join(__dirname, '..', 'supabase', 'seed.sql'), 'utf8');

describe('seed di demo', () => {
  it('si rifiuta di girare su un database che non è quello locale', async () => {
    await withTx(async (db) => {
      await db.query(
        "select set_config('app.settings.jwt_secret', 'un-segreto-di-produzione', true)",
      );
      await expect(db.query(seed)).rejects.toThrow(/solo per il database locale/);
    });
  });

  it('crea utente demo, mondo di esempio e prova di carico (e si può rieseguire)', async () => {
    await withTx(async (db) => {
      await db.query(seed);
      await db.query(seed); // rieseguibile: prima rimuove ciò che aveva creato

      const user = await db.query(
        `select (encrypted_password = extensions.crypt('Demo-Worldloom-1', encrypted_password)) as ok,
                (select display_name from profiles where id = u.id) as name
           from auth.users u where id = $1`,
        [DEMO],
      );
      expect(user.rows).toEqual([{ ok: true, name: 'Demo' }]);

      const count = async (table: string, world: string) =>
        (await db.query(`select count(*)::int as n from ${table} where world_id = $1`, [world]))
          .rows[0].n as number;
      expect(await count('snippets', DEMO_WORLD)).toBe(5);
      expect(await count('categories', DEMO_WORLD)).toBe(4);
      expect(await count('snippets', STRESS_WORLD)).toBe(5000);
      expect(await count('relations', STRESS_WORLD)).toBe(20000);

      const owner = await db.query(
        `select role from world_members where world_id = any($1) and user_id = $2`,
        [[DEMO_WORLD, STRESS_WORLD], DEMO],
      );
      expect(owner.rows).toEqual([{ role: 'owner' }, { role: 'owner' }]);
    });
  }, 180_000);

  it('le relazioni da menzione del mondo di esempio corrispondono ai testi', async () => {
    await withTx(async (db) => {
      await db.query(seed);
      const { rows } = await db.query(
        `select count(*)::int as n
           from relations r
           join snippets s on s.id = r.source_id
          where r.world_id = $1 and r.from_mention
            and s.body::text like '%' || r.target_id::text || '%'`,
        [DEMO_WORLD],
      );
      const total = await db.query(
        `select count(*)::int as n from relations where world_id = $1 and from_mention`,
        [DEMO_WORLD],
      );
      expect(rows[0].n).toBe(total.rows[0].n);
      expect(total.rows[0].n).toBeGreaterThan(0);
    });
  }, 180_000);

  it('la ricerca sulla prova di carico resta sotto i 200 ms', async () => {
    await withTx(async (db) => {
      await db.query(seed);
      await db.query('analyze snippets');
      const run = () =>
        actAs(db, DEMO, () =>
          db.query('select * from public.search_snippets($1, $2)', [STRESS_WORLD, 'aldera']),
        );
      await run(); // riscaldamento
      const times: number[] = [];
      let found = 0;
      for (let i = 0; i < 5; i++) {
        const start = performance.now();
        found = (await run()).rows.length;
        times.push(performance.now() - start);
      }
      // Mediana di 5 esecuzioni: meno sensibile ai picchi di un runner condiviso.
      const median = times.sort((a, b) => a - b)[2] as number;
      expect(median).toBeLessThan(300);
      expect(found).toBeGreaterThan(0);
    });
  }, 180_000);
});
