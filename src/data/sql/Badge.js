import pool from './mariadb.js';
import { USER_FLAGS } from '../../core/constants.js';

/**
 * get information of a speciic badge
 * @param id id of badge from UserBadges table
 */
export async function getBadgeById(id) {
  try {
    const [badge] = await pool.query(
      // eslint-disable-next-line max-len
      `SELECT b.name, b.description, ub.note,
ub.createdAt, u.id AS userId, u.name AS userDisplayName, u.username AS userName,
(u.flags & ?) != 0 AS isPrivate FROM Badges b
  INNER JOIN UserBadges ub ON ub.bid = b.id
  INNER JOIN Users u ON u.id = ub.uid
WHERE ub.id = ?`,
      [0x01 << USER_FLAGS.PRIV, id],
    );
    if (badge) {
      badge.ts = badge.createdAt.getTime();
      delete badge.createdAt;
      return badge;
    }
  } catch (error) {
    console.error(`SQL Error on getFish: ${error.message}`);
  }
  return null;
}

/**
 * get all badges of a user
 * @param uid user id
 * @return [{
 *   id: id of badge from UserBadges table
 *   name: name of badge, which is also used in the filename
 *   description: descriptive text
 * }, ...]
 */
export async function getBadgesOfUser(uid) {
  const badges = [];
  try {
    const results = await pool.query(
      `SELECT ub.id, b.name, b.description, ub.createdAt FROM Badges b
  INNER JOIN UserBadges ub ON ub.bid = b.id
  INNER JOIN Users u ON u.id = ub.uid
WHERE u.id = ?`,
      [uid],
    );
    let i = results.length;
    while (i > 0) {
      i -= 1;
      const { id, name, description, createdAt } = results[i];
      badges.push({ id, name, description, ts: createdAt.getTime() });
    }
  } catch (error) {
    console.error(`SQL Error on getBadgesOfUser: ${error.message}`);
  }
  return badges;
}

/**
 * ensure that a badge exists
 */
export async function ensureBadgeExistence(name, description) {
  let conn;
  try {
    conn = await pool.getConnection();

    const [found] = await conn.query(
      // eslint-disable-next-line max-len
      'SELECT description FROM Badges WHERE name = ?', [name],
    );
    if (found) {
      if (found.description !== description) {
        await conn.query(
          'UPDATE Badges SET description = ? WHERE name = ?',
          [description, name],
        );
      }
      return true;
    }
    await conn.query(
      // eslint-disable-next-line max-len
      'INSERT INTO Badges (name, description) VALUES (?, ?)',
      [name, description],
    );
    return true;
  } catch (error) {
    console.error(`SQL Error on ensureBadgeExistence: ${error.message}`);
  } finally {
    if (conn) conn.release();
  }
  return false;
}
