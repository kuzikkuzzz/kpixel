/*
 * Custom Roles of factions, those are like roles that the user can choose
 * from
 */
import pool from './mariadb.js';
import { generateUUID, bufferToUUID } from '../../utils/hash.js';
import { FACTION_ROLE_FLAGS } from '../../core/constants.js';


/**
 * get powerlevel and faction and role sql id of user in faction based on role
 * @param frid faction role uuid (NOT sql id)
 * @return { factionName | null, sqlFrid | null, factionlvl | null }
 */
export async function getFactionRole(frid) {
  let factionName = null;
  let sqlFrid = null;
  let factionlvl = 0;
  let isProtected = true;
  try {
    const [model] = await pool.query(
      // eslint-disable-next-line max-len
      `SELECT f.name AS factionName, fr.id AS sqlFrid, fr.flags, fr.factionlvl FROM FactionRoles fr
  INNER JOIN Factions f ON fr.fid = f.id
WHERE fr.uuid = UUID_TO_BIN(?)`,
      [frid],
    );
    if (model) {
      ({ factionName, sqlFrid, factionlvl } = model);
      // eslint-disable-next-line max-len
      isProtected = (model.flags & (0x01 << FACTION_ROLE_FLAGS.PROTECTED)) !== 0;
    }
  } catch (error) {
    console.error(`SQL Error on getFactionRole: ${error.message}`);
  }
  return { factionName, sqlFrid, factionlvl, isProtected };
}

/**
 * set custom flag for faction role
 * @param sqlFrid sql id of faction role
 * @param mediaId shortId:extension of media
 */
export async function setFactionRoleFlag(sqlFrid, mediaId = null) {
  let conn;
  try {
    conn = await pool.getConnection();

    if (!mediaId) {
      await conn.query(
        'UPDATE FactionRoles SET customFlag = NULL WHERE id = ?', [sqlFrid],
      );
      return true;
    }

    const [shortId, extension] = mediaId.split(':');
    if (!shortId || !extension) {
      return false;
    }
    await conn.query(
      // eslint-disable-next-line max-len
      'UPDATE FactionRoles SET customFlag = (SELECT id FROM Media WHERE shortId = ? AND extension = ?) WHERE id = ?',
      [shortId, extension, sqlFrid],
    );
    return true;
  } catch (err) {
    console.error('SQL Error on setFactionRoleFlag:', err.message);
    return false;
  } finally {
    if (conn) conn.release();
  }
}

/**
 * change a property of a faction role
 * @param sqlFrid sql id of faction role
 * @param property
 * @param value
 * @return success
 */
export async function setFactionRoleProperty(sqlFrid, property, value) {
  try {
    await pool.query(
      `UPDATE FactionRoles SET ${property} = ? WHERE id = ?`, [value, sqlFrid],
    );
    return true;
  } catch (error) {
    console.error(`SQL Error on setFactionRoleProperty: ${error.message}`);
  }
  return false;
}

/**
 * create a new faction role
 * @param factionName name of faction
 * @return [number, frid]
 *   0 success
 *   1 faction doesn't exist
 *   2 customFlagId invalid
 *   3 max role count reached
 *   -1 failure
 */
export async function createFactionRole(
  factionName, name, factionlvl, customFlagId, isDefault,
) {
  let flags = 0;
  if (isDefault) {
    flags |= 0x01 << FACTION_ROLE_FLAGS.DEFAULT;
  }

  try {
    const frid = bufferToUUID(generateUUID());

    const [[{ result }]] = await pool.query(
      'CALL CREATE_FACTION_ROLE(?, ?, ?, ?, ?, ?)', [
        factionName, frid, name, factionlvl, customFlagId, flags,
      ],
    );
    if (result || result === 0) {
      return [result, result === 0 ? frid : null];
    }
  } catch (error) {
    console.error('SQL Error on createFactionRole:', error.message);
  }
  return [-1, null];
}

/**
 * delete a faction role
 * @param uid user id
 * @param frid faction role uuid
 * @return [number, factionName, affectedUsers, affectedActiveRoleUsers]
 *   0 success
 *   1 faction or role doesn't exist
 *   2 role is sovereign
 *   3 role is protected
 *   4 user not member of this faction
 *   5 user powerlvl too low to create roles
 *   6 user powerlvl below role
 *   7 user powerlvl equal to role but not allowed
 *   -1 failure
 */
export async function deleteFactionRole(uid, frid) {
  const affectedUsers = [];
  const affectedActiveRoleUsers = [];
  let factionName = null;
  try {
    let models = await pool.query(
      'CALL DELETE_FACTION_ROLE(?, ?)', [uid, frid],
    );
    const [[{ result }]] = models;
    if (result || result === 0) {
      if (result === 0) {
        [[{ factionName }]] = models;
        models = Object.values(models[1]);
        for (let i = 0; i < models.length; i += 1) {
          const { uid: memberUid, hadRoleActive } = models[i];
          if (hadRoleActive) {
            affectedActiveRoleUsers.push(memberUid);
          }
          affectedUsers.push(memberUid);
        }
      }
      return [result, factionName, affectedUsers, affectedActiveRoleUsers];
    }
  } catch (error) {
    console.error('SQL Error on deleteFactionRole:', error.message);
  }
  return [-1, factionName, affectedUsers, affectedActiveRoleUsers];
}

/**
 * set one bit in flags of faction role
 * @param sqlFrid faction role sql id
 * @param index index of flag
 * @param value 0 or 1, true or false
 * @return success boolean
 */
export async function setFlagOfFactionRole(sqlFrid, index, value) {
  try {
    const mask = 0x01 << index;
    /* eslint-disable max-len */
    if (value) {
      await pool.query(
        'UPDATE FactionRoles SET flags = flags | ? WHERE id = ?',
        [mask, sqlFrid],
      );
    } else {
      await pool.query(
        'UPDATE FactionRoles SET flags = flags & ~(?) WHERE id = ?',
        [mask, sqlFrid],
      );
    }
    /* eslint-enable max-len */
    return true;
  } catch (error) {
    console.error(`SQL Error on setFlagOfFactionRole: ${error.message}`);
  }
  return false;
}

/**
 * add user to a faction role
 * @param sqlFrid sql id of faction role
 * @param uid user id
 * @return success
 */
export async function joinFactionRole(sqlFrid, uid) {
  let conn;
  try {
    conn = await pool.getConnection();

    const [[{ affectedRows }]] = await Promise.all([
      conn.query(
        `INSERT INTO UserFactionRoles (uid, frid)
    SELECT ?, ? WHERE EXISTS (
      SELECT 1 FROM UserFactions uf
        INNER JOIN Factions f ON uf.fid = f.id
        INNER JOIN FactionRoles fr ON fr.fid = f.id
      WHERE uf.uid = ? AND fr.id = ?
    )`,
        [uid, sqlFrid, uid, sqlFrid],
      ),
      conn.query(
        'UPDATE FactionRoles SET memberCount = memberCount + 1 WHERE id = ?',
        [sqlFrid],
      ),
    ]);
    return affectedRows > 0;
  } catch (error) {
    console.error(`SQL Error on setFactionRoleProperty: ${error.message}`);
  } finally {
    if (conn) conn.release();
  }
  return false;
}

/**
 * remove user from a faction role
 * @param initiatorUid user id of initiator
 * @param subjectUid user id of user to join
 * @param frid faction role uuid
 * @return [number, hadRoleActive, fid]
 *   0 success
 *   1 faction doesn't exist
 *   2 initiator not in faction
 *   3 initiator not enough permissions
 *   4 subject not in faction or not in role
 *   5 subject has more power than initiator
 *   6 would orphan faction
 *   -1 failure
 */
export async function leaveFactionRole(initiatorUid, subjectUid, frid) {
  try {
    const [[{ result, hadRoleActive, factionName }]] = await pool.query(
      'CALL LEAVE_FACTION_ROLE(?, ?, ?)', [initiatorUid, subjectUid, frid],
    );
    if (result || result === 0) {
      if (result === 0) {
        return [result, hadRoleActive > 0, factionName];
      }
      return [result, false, null];
    }
  } catch (error) {
    console.error('SQL Error on leaveFactionRole:', error.message);
  }
  return [-1, false, null];
}
