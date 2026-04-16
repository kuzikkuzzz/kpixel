import { QueryTypes, DataTypes } from 'sequelize';

import sequelize from './sequelize.js';

const Profile = sequelize.define('Profile', {
  uid: {
    type: DataTypes.INTEGER.UNSIGNED,
    primaryKey: true,
  },

  /*
   * custom flags set by user
   */
  customFlag: {
    type: 'CHAR(2) CHARACTER SET ascii COLLATE ascii_general_ci',
    allowNull: true,
  },

  /*
   * id of active faction role,
   * have to manually ensure on changes that this role is from a faction the
   * user is actually a member of.
   * If this role has a flag set, use that instead of ours.
   */
  activeRole: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: true,
  },

  /*
   * media id foreign key
   */
  avatar: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: true,
  },
});

/**
 * set custom flag of a user
 * @param uid userId
 * @param code two letter flag code
 */
export async function setCustomFlag(uid, code = null) {
  try {
    if (!uid) {
      return false;
    }
    await sequelize.query(
      // eslint-disable-next-line max-len
      'INSERT INTO Profiles (uid, customFlag) VALUES (?, ?) ON DUPLICATE KEY UPDATE customFlag = VALUES(customFlag)', {
        replacements: [uid, code],
        raw: true,
        type: QueryTypes.INSERT,
      },
    );
    return true;
  } catch (err) {
    console.error('SQL Error on createCustomFlag:', err.message);
    return false;
  }
}

/**
 * set avatar of a user
 * @param uid userId
 * @param mediaId shortId:extension of media
 */
export async function setUserAvatar(uid, mediaId = null) {
  try {
    if (!mediaId) {
      await sequelize.query(
        // eslint-disable-next-line max-len
        'INSERT INTO Profiles (uid, avatar) VALUES (?, ?) ON DUPLICATE KEY UPDATE avatar = VALUES(avatar)', {
          replacements: [uid, null],
          raw: true,
          type: QueryTypes.INSERT,
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
      'INSERT INTO Profiles (uid, avatar) SELECT ?, m.id FROM Media m WHERE m.shortId = ? AND m.extension = ? ON DUPLICATE KEY UPDATE avatar = VALUES(avatar)', {
        replacements: [uid, shortId, extension],
        raw: true,
        type: QueryTypes.INSERT,
      },
    );
    return true;
  } catch (err) {
    console.error('SQL Error on setUserAvatar:', err.message);
    return false;
  }
}

/**
 * set active faction role of user
 * @param uid userId
 * @param factionRole uuid of faction role
 * @return boolean if successful
 */
export async function setActiveFactionRole(uid, factionRole = null) {
  try {
    if (!uid) {
      return false;
    }
    let activeRole = null;
    if (factionRole) {
      /* make sure user has that role and is in that faction */
      const model = await sequelize.query(
        `SELECT fr.id AS sqlFrid FROM UserFactionRoles ufr
  INNER JOIN FactionRoles fr ON ufr.frid = fr.id
  INNER JOIN Factions f ON fr.fid = f.id
  INNER JOIN UserFactions uf ON uf.fid = f.id
WHERE ufr.uid = ? AND uf.uid = ? AND fr.uuid = UUID_TO_BIN(?)`, {
          replacements: [uid, uid, factionRole],
          plain: true,
          type: QueryTypes.SELECT,
        },
      );
      if (!model) {
        return false;
      }
      activeRole = model.sqlFrid;
    }

    await sequelize.query(
      // eslint-disable-next-line max-len
      'INSERT INTO Profiles (uid, activeRole) VALUES (?, ?) ON DUPLICATE KEY UPDATE activeRole = VALUES(activeRole)', {
        replacements: [uid, activeRole],
        raw: true,
        type: QueryTypes.INSERT,
      },
    );
    return true;
  } catch (err) {
    console.error('SQL Error on setActiveFactionRole:', err.message);
    return false;
  }
}

/**
 * get custom flag of user
 * @param uid user id
 * @return two letter flag code or null
 */
export async function getCustomFlagById(uid) {
  try {
    const flag = await sequelize.query(
      'SELECT code FROM CustomFlags WHERE uid = $1', {
        bind: [uid],
        type: QueryTypes.SELECT,
        plain: true,
      },
    );
    return flag?.code;
  } catch (error) {
    console.error(`SQL Error on getCustomFlagById: ${error.message}`);
  }
  return null;
}

/**
 * get avatar of user
 * @param uid user id
 * @return two letter flag code or null
 */
export async function getAvatarById(uid) {
  try {
    const model = await sequelize.query(
      `SELECT CONCAT(a.shortId, ':', a.extension) AS avatarId FROM Profiles p
  LEFT JOIN Media a ON a.id = p.avatar
WHERE p.uid = ?`, {
        replacements: [uid],
        type: QueryTypes.SELECT,
        plain: true,
      },
    );
    return model?.avatarId;
  } catch (error) {
    console.error(`SQL Error on getAvatarById: ${error.message}`);
  }
  return null;
}

export default Profile;
