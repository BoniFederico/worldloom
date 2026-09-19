import { describe, expect, it } from 'vitest';
import { actAs, createUser, withTx } from './helpers';

describe('profili', () => {
  it('alla registrazione viene creato un profilo con nome derivato dall’email', async () => {
    await withTx(async (db) => {
      const id = await createUser(db, 'ada');
      const { rows } = await db.query('select display_name from profiles where id = $1', [id]);
      expect(rows[0].display_name).toMatch(/^ada-/);
    });
  });

  it('un utente non vede il profilo di un estraneo e non modifica quello altrui', async () => {
    await withTx(async (db) => {
      const [a, b] = [await createUser(db), await createUser(db)];
      const seen = await actAs(db, a, () => db.query('select id from profiles'));
      expect(seen.rows.map((r) => r.id)).toEqual([a]);
      const upd = await actAs(db, a, () =>
        db.query(`update profiles set display_name = 'X' where id = $1`, [b]),
      );
      expect(upd.rowCount).toBe(0);
    });
  });
});
