import { randomUUID } from 'node:crypto';
import { Client } from 'pg';

export const DB_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

export type Db = Client;

/** Esegue `fn` in una transazione come superuser e la annulla sempre: i test non lasciano dati. */
export async function withTx(fn: (db: Db) => Promise<void>): Promise<void> {
  const db = new Client({ connectionString: DB_URL });
  await db.connect();
  try {
    await db.query('begin');
    await fn(db);
  } finally {
    await db.query('rollback');
    await db.end();
  }
}

export async function createUser(
  db: Db,
  name = 'utente',
  meta: Record<string, string> = {},
): Promise<string> {
  const id = randomUUID();
  await db.query(
    `insert into auth.users (id, email, aud, role, raw_user_meta_data)
     values ($1, $2, 'authenticated', 'authenticated', $3)`,
    [id, `${name}-${id}@example.test`, JSON.stringify(meta)],
  );
  return id;
}

/** Simula una richiesta PostgREST: ruolo `authenticated` con il JWT dell'utente (o `anon`). */
export async function actAs<T>(db: Db, userId: string | null, fn: () => Promise<T>): Promise<T> {
  await db.query('savepoint act');
  try {
    if (userId) {
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: userId, role: 'authenticated' }),
      ]);
      await db.query('set local role authenticated');
    } else {
      await db.query(`select set_config('request.jwt.claims', '', true)`);
      await db.query('set local role anon');
    }
    const result = await fn();
    await db.query('reset role');
    await db.query('release savepoint act');
    return result;
  } catch (error) {
    // Un errore (es. violazione RLS) aborta la transazione: si torna al savepoint per proseguire.
    await db.query('rollback to savepoint act');
    await db.query('reset role');
    throw error;
  }
}
