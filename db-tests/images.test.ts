import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { actAs, createUser, withTx, type Db } from './helpers';

async function createWorld(db: Db, ownerId: string): Promise<string> {
  const { rows } = await actAs(db, ownerId, () =>
    db.query(`insert into worlds (name, owner_id) values ('Aurelia', $1) returning id`, [ownerId]),
  );
  return rows[0].id;
}

const upload = (db: Db, uid: string, name: string) =>
  actAs(db, uid, () =>
    db.query(
      `insert into storage.objects (bucket_id, name, owner, metadata)
       values ('world-images', $1, $2, '{"mimetype":"image/png"}'::jsonb)`,
      [name, uid],
    ),
  );

const path = (worldId: string, ext = 'png') => `${worldId}/${randomUUID()}.${ext}`;

async function member(db: Db, worldId: string, role: string) {
  const id = await createUser(db);
  await db.query(`insert into world_members (world_id, user_id, role) values ($1, $2, $3)`, [
    worldId,
    id,
    role,
  ]);
  return id;
}

describe('immagini dei mondi (storage)', () => {
  it('il bucket è privato con limiti di dimensione e tipo', async () => {
    await withTx(async (db) => {
      const { rows } = await db.query(
        `select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'world-images'`,
      );
      expect(rows[0].public).toBe(false);
      expect(Number(rows[0].file_size_limit)).toBe(5242880);
      expect(rows[0].allowed_mime_types).toEqual([
        'image/png',
        'image/jpeg',
        'image/webp',
        'image/gif',
      ]);
    });
  });

  it('proprietario ed editor caricano nel proprio mondo', async () => {
    await withTx(async (db) => {
      const owner = await createUser(db);
      const worldId = await createWorld(db, owner);
      const editor = await member(db, worldId, 'editor');
      await upload(db, owner, path(worldId));
      await upload(db, editor, path(worldId, 'webp'));
    });
  });

  it('un lettore, un commentatore e un estraneo non caricano', async () => {
    await withTx(async (db) => {
      const owner = await createUser(db);
      const worldId = await createWorld(db, owner);
      const reader = await member(db, worldId, 'reader');
      const commenter = await member(db, worldId, 'commenter');
      const stranger = await createUser(db);
      for (const uid of [reader, commenter, stranger]) {
        await expect(upload(db, uid, path(worldId))).rejects.toThrow();
      }
    });
  });

  it('non si carica nella cartella di un altro mondo', async () => {
    await withTx(async (db) => {
      const [a, b] = [await createUser(db), await createUser(db)];
      const worldA = await createWorld(db, a);
      await createWorld(db, b);
      await expect(upload(db, b, path(worldA))).rejects.toThrow();
    });
  });

  it('percorsi fuori formato vengono rifiutati', async () => {
    await withTx(async (db) => {
      const owner = await createUser(db);
      const worldId = await createWorld(db, owner);
      for (const name of [
        `${worldId}/x.png`,
        `${worldId}/${randomUUID()}.svg`,
        `${worldId}/../${randomUUID()}.png`,
        `${worldId}/sub/${randomUUID()}.png`,
        `non-un-uuid/${randomUUID()}.png`,
      ]) {
        await expect(upload(db, owner, name)).rejects.toThrow();
      }
    });
  });

  it('i membri leggono, gli estranei no', async () => {
    await withTx(async (db) => {
      const owner = await createUser(db);
      const worldId = await createWorld(db, owner);
      const reader = await member(db, worldId, 'reader');
      const stranger = await createUser(db);
      const name = path(worldId);
      await upload(db, owner, name);
      const read = (uid: string) =>
        actAs(db, uid, () => db.query(`select 1 from storage.objects where name = $1`, [name]));
      expect((await read(owner)).rows).toHaveLength(1);
      expect((await read(reader)).rows).toHaveLength(1);
      expect((await read(stranger)).rows).toHaveLength(0);
    });
  });
});
