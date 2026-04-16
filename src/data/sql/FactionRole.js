/*
 * Custom Roles of factions, those are like roles that the user can choose
 * from
 */

import { DataTypes, QueryTypes } from 'sequelize';

import sequelize from './sequelize.js';
import { generateUUID, bufferToUUID } from '../../utils/hash.js';
import {
  FACTION_ROLE_FLAGS, FACTION_PERMISSIONS,
} from '../../core/constants.js';

const FactionRole = sequelize.define('FactionRole', {
  id: {
    type: DataTypes.BIGINT.UNSIGNED,
    autoIncrement: true,
    primaryKey: true,
  },

  uuid: {
    type: 'BINARY(16)',
    allowNull: false,
    unique: 'uuid',
  },

  fid: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
  },

  /*
   * if null, users with this action role will show their geo flags or
   * choose their own
   */
  customFlag: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: true,
  },

  name: {
    // eslint-disable-next-line max-len
    type: 'VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin',
    allowNull: false,
  },

  /*
   * from lowest to highest bit
   * 0: assign per default
   */
  flags: {
    type: DataTypes.TINYINT.UNSIGNED,
    allowNull: false,
    defaultValue: 0,
  },

  /*
   * what user with role is allowed to do
   */
  factionlvl: {
    type: DataTypes.TINYINT,
    allowNull: false,
    defaultValue: FACTION_PERMISSIONS.PEASANT,
  },

  memberCount: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    defaultValue: 0,
  },
}, {
  indexes: [{
    name: 'role_fid',
    fields: ['fid'],
  }],
});


/**
 * get powerlevel and faction and role sql id of user in faction based on role
 * @param frid faction role uuid (NOT sql id)
 * @return { fid | null, sqlFrid | null, factionlvl | null }
 */
export async function getFactionRole(frid) {
  let fid = null;
  let sqlFrid = null;
  let factionlvl = 0;
  let isProtected = true;
  try {
    const model = await sequelize.query(
      // eslint-disable-next-line max-len
      `SELECT BIN_TO_UUID(f.uuid) AS fid, fr.id AS sqlFrid, fr.flags, fr.factionlvl FROM FactionRoles fr
  INNER JOIN Factions f ON fr.fid = f.id
WHERE fr.uuid = UUID_TO_BIN(?)`, {
        replacements: [frid],
        plain: true,
        type: QueryTypes.SELECT,
      },
    );
    if (model) {
      ({ fid, sqlFrid, factionlvl } = model);
      // eslint-disable-next-line max-len
      isProtected = (model.flags & (0x01 << FACTION_ROLE_FLAGS.PROTECTED)) !== 0;
    }
  } catch (error) {
    console.error(`SQL Error on getFactionRole: ${error.message}`);
  }
  return { fid, sqlFrid, factionlvl, isProtected };
}

/**
 * set custom flag for faction role
 * @param sqlFrid sql id of faction role
 * @param mediaId shortId:extension of media
 */
export async function setFactionRoleFlag(sqlFrid, mediaId = null) {
  try {
    if (!mediaId) {
      await sequelize.query(
        'UPDATE FactionRoles SET customFlag = NULL WHERE id = ?', {
          replacements: [sqlFrid],
          raw: true,
          type: QueryTypes.UPDATE,
        },
      );
      return true;
    }

    const [shortId, extension] = mediaId.split(':');
    if (!shortId || !extension) {
      return false;
    }
    await sequelize.query(
      // eslint-disable-next-line max-len
      'UPDATE FactionRoles SET customFlag = (SELECT id FROM Media WHERE shortId = ? AND extension = ?) WHERE id = ?', {
        replacements: [shortId, extension, sqlFrid],
        raw: true,
        type: QueryTypes.UPDATE,
      },
    );
    return true;
  } catch (err) {
    console.error('SQL Error on setUserAvatar:', err.message);
    return false;
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
    await sequelize.query(
      `UPDATE FactionRoles SET ${property} = ? WHERE id = ?`, {
        replacements: [value, sqlFrid],
        raw: true,
        type: QueryTypes.UPDATE,
      },
    );
    return true;
  } catch (error) {
    console.error(`SQL Error on setFactionRoleProperty: ${error.message}`);
  }
  return false;
}

/**
 * create a new faction role
 * @param fid uuid of faction
 * @return [number, frid]
 *   0 success
 *   1 faction doesn't exist
 *   2 customFlagId invalid
 *   3 max role count reached
 *   -1 failure
 */
export async function createFactionRole(
  fid, name, factionlvl, customFlagId, isDefault,
) {
  let flags = 0;
  if (isDefault) {
    flags |= 0x01 << FACTION_ROLE_FLAGS.DEFAULT;
  }

  try {
    const frid = bufferToUUID(generateUUID());

    const model = await sequelize.query(
      'CALL CREATE_FACTION_ROLE(?, ?, ?, ?, ?, ?)', {
        replacements: [
          fid, frid, name, factionlvl, customFlagId, flags,
        ],
        plain: true,
        type: QueryTypes.SELECT,
      },
    );
    const ret = model?.[0]?.result;
    if (ret || ret === 0) {
      return [ret, ret === 0 ? frid : null];
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
 * @return [number, fid, affectedUsers, affectedActiveRoleUsers]
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
  let fid = null;
  try {
    let models = await sequelize.query(
      'CALL DELETE_FACTION_ROLE(?, ?)', {
        replacements: [uid, frid],
        raw: true,
        type: QueryTypes.SELECT,
      },
    );
    const returnCode = models?.[0]?.[0]?.result;
    if (returnCode || returnCode === 0) {
      if (returnCode === 0) {
        [{ 0: { fid } }] = models;
        models = Object.values(models[1]);
        for (let i = 0; i < models.length; i += 1) {
          const { uid: memberUid, hadRoleActive } = models[i];
          if (hadRoleActive) {
            affectedActiveRoleUsers.push(memberUid);
          }
          affectedUsers.push(memberUid);
        }
      }
      return [returnCode, fid, affectedUsers, affectedActiveRoleUsers];
    }
  } catch (error) {
    console.error('SQL Error on deleteFactionRole:', error.message);
  }
  return [-1, fid, affectedUsers, affectedActiveRoleUsers];
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
      await sequelize.query(
        'UPDATE FactionRoles SET flags = flags | ? WHERE id = ?', {
          replacements: [mask, sqlFrid],
          raw: true,
          type: QueryTypes.UPDATE,
        },
      );
    } else {
      await sequelize.query(
        'UPDATE FactionRoles SET flags = flags & ~(?) WHERE id = ?', {
          replacements: [mask, sqlFrid],
          raw: true,
          type: QueryTypes.UPDATE,
        },
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
  try {
    const [[, insertedRows]] = await Promise.all([
      sequelize.query(
        `INSERT INTO UserFactionRoles (uid, frid)
    SELECT ?, ? WHERE EXISTS (
      SELECT 1 FROM UserFactions uf
        INNER JOIN Factions f ON uf.fid = f.id
        INNER JOIN FactionRoles fr ON fr.fid = f.id
      WHERE uf.uid = ? AND fr.id = ?
    )`, {
          replacements: [uid, sqlFrid, uid, sqlFrid],
          raw: true,
          type: QueryTypes.INSERT,
        },
      ),
      sequelize.query(
        'UPDATE FactionRoles SET memberCount = memberCount + 1 WHERE id = ?', {
          replacements: [sqlFrid],
          raw: true,
          type: QueryTypes.UPDATE,
        },
      ),
    ]);
    return insertedRows > 0;
  } catch (error) {
    console.error(`SQL Error on setFactionRoleProperty: ${error.message}`);
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
    const model = await sequelize.query(
      'CALL LEAVE_FACTION_ROLE(?, ?, ?)', {
        replacements: [initiatorUid, subjectUid, frid],
        plain: true,
        type: QueryTypes.SELECT,
      },
    );
    const returnCode = model?.[0]?.result;
    if (returnCode || returnCode === 0) {
      if (returnCode === 0) {
        const { 0: { hadRoleActive, fid } } = model;
        return [returnCode, !!hadRoleActive, fid];
      }
      return [returnCode, false, null];
    }
  } catch (error) {
    console.error('SQL Error on leaveFactionRole:', error.message);
  }
  return [-1, false, null];
}

export default FactionRole;
