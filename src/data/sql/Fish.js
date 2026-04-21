import pool from './mariadb.js';
import { USER_FLAGS } from '../../core/constants.js';

export async function storeFish(uid, type, size) {
  try {
    const [[{ id }]] = await pool.query(
      'CALL STORE_FISH(?, ?, ?)', [uid, type, size],
    );
    return id;
  } catch (error) {
    console.error(`SQL Error on storeFish: ${error.message}`);
  }
  return null;
}

/**
 * get information of single fish
 * @param id id of fish
 * @return fish { type, size, ts, caughtByUid, caughtByName } | null
 */
export async function getFishById(id) {
  try {
    const [fish] = await pool.query(
      `SELECT f.type, f.size, f.createdAt,
f.uid AS caughtByUid, u.name AS caughtByName, u.username AS caughtByUsername,
(u.flags & ?) != 0 AS isPrivate FROM Fishes f
  LEFT JOIN Users u ON u.id = f.uid
WHERE f.id = ?`,
      [0x01 << USER_FLAGS.PRIV, id],
    );
    if (fish) {
      fish.ts = fish.createdAt.getTime();
      delete fish.createdAt;
      return fish;
    }
  } catch (error) {
    console.error(`SQL Error on getFish: ${error.message}`);
  }
  return null;
}

export async function getFishesOfUser(uid) {
  const fishes = [];
  try {
    const fishModels = await pool.query(
      // eslint-disable-next-line max-len
      'SELECT id, type, size, createdAt FROM Fishes WHERE uid = ? ORDER BY createdAt DESC',
      [uid],
    );
    let i = fishModels.length;
    while (i > 0) {
      i -= 1;
      const { id, type, size, createdAt } = fishModels[i];
      fishes.push({ id, type, size, ts: createdAt.getTime() });
    }
  } catch (error) {
    console.error(`SQL Error on getFishesOfUser: ${error.message}`);
  }
  return fishes;
}
