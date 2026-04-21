/*
 * bans for factions
 */
import pool from './mariadb.js';
import { generateUUID, bufferToUUID } from '../../utils/hash.js';

/**
 * ban user
 * @param sqlFid id of faction
 * ...
 * @param duration duration in seconds
 * @return success
 */
export async function banUserFromFaction(
  sqlFid, uid, ipString, reason, duration, muid = null,
) {
  let conn;
  try {
    conn = await pool.getConnection();

    const fbid = bufferToUUID(generateUUID());

    await conn.query(
      // eslint-disable-next-line max-len
      'INSERT INTO FactionBans (uuid, fid, reason, expires, muid, createdAt) VALUES (UUID_TO_BIN(?), ?, ?, ?, ?, NOW())',
      [
        fbid, sqlFid, reason,
        (duration) ? new Date(Date.now() + duration * 1000) : null,
        muid,
      ],
    );
    const [model] = await conn.query(
      'SELECT id FROM FactionBans WHERE uuid = UUID_TO_BIN(?)', [fbid],
    );
    if (!model) {
      return false;
    }
    const bid = model.id;

    await Promise.all([
      conn.query(
        'INSERT INTO UserFactionBans (bid, uid) VALUES (?, ?)', [bid, uid],
      ),
      ipString && conn.query(
        'INSERT INTO IPFactionBans (bid, ip) VALUES (?, IP_TO_BIN(?))',
        [bid, ipString],
      ),
    ]);
    return true;
  } catch (error) {
    console.error('SQL Error on banUserFromFaction:', error.message);
  } finally {
    if (conn) conn.release();
  }
  return false;
}

/**
 * unban user
 * @param factionName name of faction
 * @param fbid uuid of faction ban
 * @return success
 */
export async function unbanFromFaction(factionName, fbid) {
  try {
    await pool.query(
      /* eslint-disable max-len */
      `DELETE FROM FactionBans WHERE uuid = UUID_TO_BIN(?) AND EXISTS(
  SELECT id FROM Factions f WHERE f.id = FactionBans.fid AND f.name = ?
)`,
      /* eslint-enable max-len */
      [fbid, factionName],
    );
    return true;
  } catch (error) {
    console.error('SQL Error on unbanFromFaction:', error.message);
  }
  return false;
}
