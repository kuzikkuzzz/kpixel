import pool from './mariadb.js';

/**
 * check if user blocks another
 * @param uid user to check
 * @param buid user to know whether he is blocks
 * @return boolean
 */
export async function isUserBlockedBy(uid, buid) {
  const models = await pool.query(
    'SELECT 1 FROM UserBlocks WHERE uid = ? AND buid = ?', [uid, buid],
  );
  return models.length > 0;
}

/**
 * block user
 * @param uid id of the user that is blocking someone else
 * @param buid id of user who gets blocked
 * @return boolean if successful
 */
export async function blockUser(uid, buid) {
  try {
    await pool.query(
      'INSERT IGNORE INTO UserBlocks (uid, buid) VALUES (?, ?)', [uid, buid],
    );
    return true;
  } catch (error) {
    console.error(`SQL Error on blockUser: ${error.message}`);
  }
  return false;
}

/**
 * unblock user
 * @param uid id of the user that is blocking someone else
 * @param buid id of user who is blocked
 * @return boolnea if successful
 */
export async function unblockUser(uid, buid) {
  try {
    await pool.query(
      'DELETE FROM UserBlocks WHERE uid = ? AND buid = ?', [uid, buid],
    );
    return true;
  } catch (error) {
    console.error(`SQL Error on blockUser: ${error.message}`);
  }
  return false;
}
