/*
 * factions
 */

import { DataTypes, QueryTypes } from 'sequelize';

import sequelize, { nestQuery } from './sequelize.js';
import { generateUUID, bufferToUUID } from '../../utils/hash.js';
import {
  FACTION_FLAGS, USER_FACTION_FLAGS, FACTION_ROLE_FLAGS, FACTION_PERMISSIONS,
} from '../../core/constants.js';

const Faction = sequelize.define('Faction', {
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

  /* [a-zA-Z0-9._-] */
  name: {
    // eslint-disable-next-line max-len
    type: `${DataTypes.STRING(32)} CHARACTER SET ascii COLLATE ascii_general_ci`,
    allowNull: false,
    unique: 'name',
  },

  title: {
    type: `${DataTypes.STRING(32)} CHARSET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    allowNull: false,
  },

  description: {
    // eslint-disable-next-line max-len
    type: `${DataTypes.STRING(1000)} CHARSET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    defaultValue: '',
    allowNull: false,
  },

  /*
   * faction chat channel,
   * user membership of those channels is still managed in UserChannels
   * seperately.
   * Factions are an addition to channels, not backed in.
   */
  cid: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
  },

  avatar: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: true,
  },

  memberCount: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    defaultValue: 0,
  },

  /*
   * from lowest to highest bit, see FACTION_FLAGS:
   * 0: priv (if faction is unfindable)
   * 1: public (if everybody can join without invite)
   */
  flags: {
    type: DataTypes.TINYINT.UNSIGNED,
    allowNull: false,
    defaultValue: 0,
  },

  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    allowNull: false,
  },
}, {
  indexes: [{
    name: 'faction_title',
    fields: ['title'],
  }],
});

/**
 * get factions of a user
 * @param uid user id
 * @param isOwnProfile if the information is given to the user itself, if not,
 *   we have to hide hidden factions
 * @return {
 *   factions: [{
 *     fid,
 *     name,
 *     title,
 *     description,
 *     memberCount,
 *     isPrivate,
 *     isPublic,
 *     isHidden,
 *     avatarId,
 *     roles: [{
 *       frid,
 *       name,
 *       customFlagId,
 *       factionlvl,
 *       isProtected,
 *       isDeault,
 *       isMember,
 *     }, ...],
 *   }, ...],
 *   activeFactionRole,
 *   }
 */
export async function getFactionsOfUser(uid, isOwnProfile) {
  let factions = [];
  let activeFactionRole = null;
  try {
    const [factionModels, activeFactionModel] = await Promise.all([
      /*
       * a user could be member of a faction without having a role, but we
       * disallow that case in routes to avoid confusion
       */
      sequelize.query(
        /* eslint-disable max-len */
        `SELECT BIN_TO_UUID(f.uuid) AS fid, f.name, f.title, f.description, f.memberCount, f.flags,
CONCAT(a.shortId, ':', a.extension) AS avatarId,
uf.flags AS userFactionFlags,
BIN_TO_UUID(fr.uuid) AS 'roles.frid',
CONCAT(frm.shortId, ':', frm.extension) AS 'roles.customFlagId',
EXISTS(SELECT 1 FROM UserFactionRoles ufr WHERE ufr.uid = uf.uid AND ufr.frid = fr.id) AS 'roles.isMember',
fr.name AS 'roles.name', fr.flags AS 'roles.flags',
fr.factionlvl AS 'roles.factionlvl' FROM Factions f
  INNER JOIN UserFactions uf ON uf.fid = f.id
  LEFT JOIN FactionRoles fr ON fr.fid = f.id
  LEFT JOIN Media a ON a.id = f.avatar
  LEFT JOIN Media frm ON frm.id = fr.customFlag
WHERE uf.uid = ?`, {
          replacements: [uid],
          raw: true,
          type: QueryTypes.SELECT,
        },
      ),
      sequelize.query(
        `SELECT BIN_TO_UUID(f.uuid) AS fid, BIN_TO_UUID(fr.uuid) AS frid FROM Factions f
  INNER JOIN FactionRoles fr ON fr.fid = f.id
  INNER JOIN Profiles p ON fr.id = p.activeRole
WHERE p.uid = ?`, {
        /* eslint-enable max-len */
          replacements: [uid],
          plain: true,
          type: QueryTypes.SELECT,
        },
      ),
    ]);
    if (factionModels) {
      let activeFid;
      if (activeFactionModel) {
        activeFid = activeFactionModel.fid;
        activeFactionRole = activeFactionModel.frid;
      }
      factions = nestQuery(factionModels, 'fid');

      for (let i = 0; i < factions.length; i += 1) {
        const model = factions[i];
        // whether or not searchable
        model.isPrivate = (model.flags & (0x01 << FACTION_FLAGS.PRIV)) !== 0;
        // whether or not joinable without invite
        model.isPublic = (model.flags & (0x01 << FACTION_FLAGS.PUBLIC)) !== 0;
        model.isHidden = false;
        if (model.userFactionFlags) {
          if (model.userFactionFlags & (0x01 << USER_FACTION_FLAGS.HIDDEN)) {
            if (model.fid === activeFid && !isOwnProfile) {
              activeFactionRole = null;
            }
            model.isHidden = true;
          }
          delete model.userFactionFlags;
        }
        delete model.flags;

        for (let u = 0; u < model.roles.length; u += 1) {
          const role = model.roles[u];
          // eslint-disable-next-line max-len
          role.isProtected = (role.flags & (0x01 << FACTION_ROLE_FLAGS.PROTECTED)) !== 0;
          // eslint-disable-next-line max-len
          role.isDefault = (role.flags & (0x01 << FACTION_ROLE_FLAGS.DEFAULT)) !== 0;
          delete role.flags;
        }
      }

      /* filter for public */
      if (!isOwnProfile) {
        factions = factions.filter((m) => !m.isHidden);
      }
    }
  } catch (error) {
    console.error(`SQL Error on getFactionsOfUser: ${error.message}`);
  }
  return { factions, activeFactionRole };
}

/**
 * set one bit in flags of user faction
 * @param uid user id
 * @param fid faction uuid (NOT sql id)
 * @param index index of flag
 * @param value 0 or 1, true or false
 * @return success boolean
 */
export async function setFlagOfUserFaction(uid, fid, index, value) {
  try {
    const mask = 0x01 << index;
    /* eslint-disable max-len */
    if (value) {
      await sequelize.query(
        'UPDATE UserFactions SET flags = flags | ? WHERE uid = ? AND fid = (SELECT id FROM Factions WHERE uuid = UUID_TO_BIN(?))', {
          replacements: [mask, uid, fid],
          raw: true,
          type: QueryTypes.UPDATE,
        },
      );
    } else {
      await sequelize.query(
        'UPDATE UserFactions SET flags = flags & ~(?) WHERE uid = ? AND fid = (SELECT id FROM Factions WHERE uuid = UUID_TO_BIN(?))', {
          replacements: [mask, uid, fid],
          raw: true,
          type: QueryTypes.UPDATE,
        },
      );
    }
    /* eslint-enable max-len */
    return true;
  } catch (error) {
    console.error(`SQL Error on setFlagOfUserFaction: ${error.message}`);
  }
  return false;
}

/**
 * set one bit in flags of faction
 * @param fid faction uuid (NOT sql id)
 * @param index index of flag
 * @param value 0 or 1, true or false
 * @return success boolean
 */
export async function setFlagOfFaction(fid, index, value) {
  try {
    const mask = 0x01 << index;
    if (value) {
      await sequelize.query(
        'UPDATE Factions SET flags = flags | ? WHERE uuid = UUID_TO_BIN(?)', {
          replacements: [mask, fid],
          raw: true,
          type: QueryTypes.UPDATE,
        },
      );
    } else {
      await sequelize.query(
        // eslint-disable-next-line max-len
        'UPDATE Factions SET flags = flags & ~(?) WHERE uuid = UUID_TO_BIN(?)', {
          replacements: [mask, fid],
          raw: true,
          type: QueryTypes.UPDATE,
        },
      );
    }
    return true;
  } catch (error) {
    console.error(`SQL Error on setFlagOfFaction: ${error.message}`);
  }
  return false;
}

/**
 * get powerlevel and faction sql id of user in faction
 * @param uid user id
 * @param fidOrName faction uuid (NOT sql id) or name
 * @return {
 *   sqlFid: null if not member of the faction or it doesn't exist,
 *   powerlvl: 0 if member but no role, null if not member or faction not exist
 * }
 */
export async function getFactionLvlOfUser(uid, fidOrName) {
  let sqlFid = null;
  let powerlvl = null;
  try {
    const model = await sequelize.query(
      /* eslint-disable max-len */
      `SELECT f.id AS sqlFid, fr.factionlvl AS powerlvl FROM Factions f
  INNER JOIN UserFactions uf ON uf.fid = f.id
  LEFT JOIN UserFactionRoles ufr ON ufr.uid = uf.uid
  LEFT JOIN FactionRoles fr ON fr.id = ufr.frid AND fr.fid = f.id
WHERE uf.uid = ? AND ${
  (fidOrName.length === 36) ? 'f.uuid = UUID_TO_BIN(?)' : 'f.name = ?'
} ORDER BY fr.factionlvl DESC LIMIT 1`, {
      /* eslint-enable max-len */
        replacements: [uid, fidOrName],
        plain: true,
        type: QueryTypes.SELECT,
      },
    );
    if (model) {
      sqlFid = model.sqlFid;
      /* if user is in faction but has no role assigned to him */
      powerlvl = model.powerlvl || 0;
    }
  } catch (error) {
    console.error(`SQL Error on getFactionLvlOfUser: ${error.message}`);
  }
  return { sqlFid, powerlvl };
}

/**
 * get amount of sovereign of a faction
 * @param sqlFid sql id of faction
 * @return number
 */
export async function getAmountOfFactionOwners(sqlFid) {
  try {
    const model = await sequelize.query(
      `SELECT COUNT(DISTINCT ufr.uid) AS count FROM UserFactionRoles ufr
  INNER JOIN FactionRoles fr ON ufr.frid = fr.id
WHERE fr.fid = ? AND fr.factionlvl >= ?`, {
        replacements: [sqlFid, FACTION_PERMISSIONS.SOVEREIGN],
        plain: true,
        type: QueryTypes.SELECT,
      },
    );
    if (model) {
      return model.count;
    }
  } catch (error) {
    console.error(`SQL Error on getAmountOfFactionOwners: ${error.message}`);
  }
  return 0;
}

/**
 * get all members of a faction
 * @param sqlFid sql id of faction
 * @return [ userId1, userId2, ...]
 */
export async function getAllMembersOfFaction(sqlFid) {
  try {
    const models = await sequelize.query(
      'SELECT uid FROM UserFactions WHERE fid = ?', {
        replacements: [sqlFid],
        raw: true,
        type: QueryTypes.SELECT,
      },
    );
    if (models) {
      return models.map(({ uid }) => uid);
    }
  } catch (error) {
    console.error(`SQL Error on getAllMembersOfFaction: ${error.message}`);
  }
  return [];
}

/**
 * check if a faction with a given name exists
 * @param name
 * @return boolean
 */
export async function checkIfFactionExists(name) {
  try {
    const model = await sequelize.query(
      'SELECT 1 FROM Factions WHERE name = ?', {
        replacements: [name],
        plain: true,
        type: QueryTypes.SELECT,
      },
    );
    if (!model) {
      return false;
    }
  } catch (error) {
    console.error(`SQL Error on checkIfFactionExists: ${error.message}`);
  }
  return true;
}

/**
 * set avatar of faction
 * @param sqlFid sql id of faction
 * @param mediaId shortId:extension of media
 */
export async function setFactionAvatar(sqlFid, mediaId = null) {
  try {
    if (!mediaId) {
      await sequelize.query(
        // eslint-disable-next-line max-len
        'UPDATE Factions SET avatar = NULL WHERE id = ?', {
          replacements: [sqlFid],
          raw: true,
          type: QueryTypes.UPDATE,
        },
      );
    } else {
      const [shortId, extension] = mediaId.split(':');
      if (!shortId || !extension) {
        return false;
      }
      await sequelize.query(
        // eslint-disable-next-line max-len
        'UPDATE Factions SET avatar = (SELECT id FROM Media WHERE shortId = ? AND extension = ?) WHERE id = ?', {
          replacements: [shortId, extension, sqlFid],
          raw: true,
          type: QueryTypes.UPDATE,
        },
      );
    }
    return true;
  } catch (error) {
    console.error('SQL Error on setFactionAvatar:', error.message);
    return false;
  }
}

/**
 * create a new faction
 * @param uid user id of owner
 * @return [number, fid]
 *   0 success
 *   1 max amount of factions reached
 *   2 max amount of owned factions reached
 *   3 user too young
 *   4 media doesnt exist
 *   5 faction name already taken
 *   -1 failure
 */
export async function createFaction(
  uid, name, title, description, isPrivate, isPublic, avatarId,
) {
  let flags = 0;
  if (isPrivate) {
    flags |= 0x01 << FACTION_FLAGS.PRIV;
  }
  if (isPublic) {
    flags |= 0x01 << FACTION_FLAGS.PUBLIC;
  }

  try {
    const fid = bufferToUUID(generateUUID());
    const sovereignFrid = bufferToUUID(generateUUID());
    const peasantFrid = bufferToUUID(generateUUID());

    const model = await sequelize.query(
      'CALL CREATE_FACTION(?, ?, ?, ?, ?, ?, ?, ?, ?)', {
        replacements: [
          uid, name, title, description, flags, avatarId,
          fid, sovereignFrid, peasantFrid,
        ],
        plain: true,
        type: QueryTypes.SELECT,
      },
    );
    const ret = model?.[0]?.result;
    if (ret || ret === 0) {
      return [ret, ret === 0 ? fid : null];
    }
  } catch (error) {
    console.error('SQL Error on createFaction:', error.message);
  }
  return [-1, null];
}

/**
 * delete faction
 * @param sqlFid sql faction id
 * @return [userId1, userId2, ...] affected users
 */
export async function deleteFaction(sqlFid) {
  try {
    const affectedUsers = await getAllMembersOfFaction();
    /*
     * faction channel deletion should cascade to everything related, since
     * faction depends on it
     */
    await sequelize.query(
      // eslint-disable-next-line max-len
      'DELETE FROM Channels WHERE id = (SELECT f.cid FROM Factions f WHERE f.id = ?)', {
        replacements: [sqlFid],
        raw: true,
        type: QueryTypes.DELETE,
      },
    );
    return affectedUsers;
  } catch (error) {
    console.error('SQL Error on deleteFaction:', error.message);
  }
  return [];
}

/**
 * leave faction
 * @param uid user id
 * @param fid uuid of faction
 * @return [number, hadRoleActive]
 *   0 success
 *   1 no such faction
 *   2 no other sovereign
 *   -1 failure
 */
export async function leaveFaction(uid, fid) {
  try {
    const model = await sequelize.query(
      'CALL LEAVE_FACTION(?, ?)', {
        replacements: [uid, fid],
        plain: true,
        type: QueryTypes.SELECT,
      },
    );
    const returnCode = model?.[0]?.result;
    if (returnCode || returnCode === 0) {
      if (returnCode === 0) {
        const { 0: { hadRoleActive } } = model;
        return [returnCode, !!hadRoleActive];
      }
      return [returnCode, false];
    }
  } catch (error) {
    console.error('SQL Error on leaveFaction:', error.message);
  }
  return [-1, false];
}

/**
 * join user to a faction
 * @param uid user id
 * @param fid uuid of faction
 * @return number
 *   0 success
 *   1 no such faction
 *   2 max factions reached
 *   3 banned
 *   4 already joined
 *   5 faction full
 *   6 faction not public
 *   -1 failure
 */
export async function joinFactionPublic(uid, ipString, fid) {
  try {
    const model = await sequelize.query(
      'CALL JOIN_FACTION_PUBLIC(?, ?, ?)', {
        replacements: [uid, ipString, fid],
        plain: true,
        type: QueryTypes.SELECT,
      },
    );
    const ret = model?.[0]?.result;
    if (ret || ret === 0) {
      return ret;
    }
  } catch (error) {
    console.error('SQL Error on joinFaction:', error.message);
  }
  return -1;
}

/**
 * get public info of faction
 * @param fidOrName uuid or name of faction
 * @return {
 *   fid,
 *   sqlFid,
 *   name,
 *   title,
 *   description,
 *   memberCount,
 *   isPrivate,
 *   isPublic,
 *   avatarId,
 *   channelId,
 *   roles: [{
 *     frid,
 *     customFlagId,
 *     name,
 *     factionlvl,
 *     isProtected,
 *     isDefault,
 *   }, ...]
 * } | null
 */
export async function getFactionInfo(fidOrName) {
  try {
    let model = await sequelize.query(
      // eslint-disable-next-line max-len
      `SELECT f.id AS sqlFid, BIN_TO_UUID(f.uuid) AS fid, f.name, f.title, f.description, f.memberCount, f.flags, f.cid AS channelId,
CONCAT(a.shortId, ':', a.extension) AS avatarId,
BIN_TO_UUID(fr.uuid) AS 'roles.frid',
CONCAT(frm.shortId, ':', frm.extension) AS 'roles.customFlagId',
fr.name AS 'roles.name', fr.flags AS 'roles.flags',
fr.factionlvl AS 'roles.factionlvl' FROM Factions f
  LEFT JOIN Media a ON a.id = f.avatar
  LEFT JOIN FactionRoles fr ON fr.fid = f.id
  LEFT JOIN Media frm ON frm.id = fr.customFlag
WHERE ${
  (fidOrName.length === 36) ? 'f.uuid = UUID_TO_BIN(?)' : 'f.name = ?'
}`, {
        replacements: [fidOrName],
        raw: true,
        type: QueryTypes.SELECT,
      },
    );
    if (model?.length) {
      model = nestQuery(model);
      // whether or not searchable
      model.isPrivate = (model.flags & (0x01 << FACTION_FLAGS.PRIV)) !== 0;
      // whether or not joinable without invite
      model.isPublic = (model.flags & (0x01 << FACTION_FLAGS.PUBLIC)) !== 0;
      delete model.flags;
      for (let i = 0; i < model.roles.length; i += 1) {
        const role = model.roles[i];
        // eslint-disable-next-line max-len
        role.isProtected = (role.flags & (0x01 << FACTION_ROLE_FLAGS.PROTECTED)) !== 0;
        // eslint-disable-next-line max-len
        role.isDefault = (role.flags & (0x01 << FACTION_ROLE_FLAGS.DEFAULT)) !== 0;
        delete role.flags;
      }
      return model;
    }
  } catch (error) {
    console.error('SQL Error on getFactionInfo:', error.message);
  }
  return null;
}

/**
 * get faction members
 * @param sqlFid sql id of faction
 * @return [{
 *   uid,
 *   name,
 *   username,
 *   avatarId,
 *   roles: [frid1, frid2,..]
 * }, ...]
 */
export async function getFactionMemberInfo(sqlFid, showHiddenUsers) {
  try {
    let model = await sequelize.query(
      `SELECT u.id AS uid, u.name, u.username,
CONCAT(a.shortId, ':', a.extension) AS avatarId,
(uf.flags & ?) != 0 AS isHidden,
BIN_TO_UUID(fr.uuid) AS 'roles.frid' FROM Users u
  INNER JOIN UserFactions uf ON uf.uid = u.id
  LEFT JOIN Profiles p ON p.uid = u.id
  LEFT JOIN Media a ON a.id = p.avatar
  LEFT JOIN UserFactionRoles ufr ON ufr.uid = u.id
  LEFT JOIN FactionRoles fr ON fr.id = ufr.frid AND fr.fid = uf.fid
WHERE uf.fid = ?`, {
        replacements: [0x01 << USER_FACTION_FLAGS.HIDDEN, sqlFid],
        raw: true,
        type: QueryTypes.SELECT,
      },
    );
    if (model) {
      model = nestQuery(model, 'uid');
      if (!showHiddenUsers) {
        model = model.filter((m) => m.isHidden === 0);
      }
      for (let i = 0; i < model.length; i += 1) {
        const userInfo = model[i];
        userInfo.roles = userInfo.roles.map((r) => r.frid);
        delete userInfo.isHidden;
      }
      return model;
    }
  } catch (error) {
    console.error('SQL Error on getFactionMemberInfo:', error.message);
  }
  return null;
}

/**
 * get faction bans
 * @param sqlFid sql id of faction
 * @return [{
 *   fbid,
 *   affects: dstring describing user or iid if no user,
 *   reason,
 *   createdBy: username of mod,
 *   [expires],
 *   [createdAt],
 * },...] | null
 */
export async function getFactionBanInfo(sqlFid) {
  try {
    let model = await sequelize.query(
      // eslint-disable-next-line max-len
      `SELECT BIN_TO_UUID(fb.uuid) AS fbid, fb.reason, fb.expires, fb.createdAt,
u.id AS 'users.id', u.name AS 'users.name', u.username AS 'users.username',
mu.username AS createdBy,
BIN_TO_UUID(i.uuid) AS 'ips.iid' FROM FactionBans fb
  LEFT JOIN UserFactionBans ufb ON ufb.bid = fb.id
  LEFT JOIN Users u ON ufb.uid = u.id
  LEFT JOIN IPFactionBans ifb ON ifb.bid = fb.id
  LEFT JOIN IPs i ON ifb.ip = i.ip
  LEFT JOIN Users mu ON mu.id = fb.muid
WHERE fb.fid = ?`, {
        replacements: [sqlFid],
        raw: true,
        type: QueryTypes.SELECT,
      },
    );
    if (model) {
      model = nestQuery(model, 'fbid');
      for (let i = 0; i < model.length; i += 1) {
        const banInfo = model[i];
        if (banInfo.users.length) {
          const user = banInfo.users[0];
          banInfo.affects = `${user.name} [${user.username}]`;
        } else if (banInfo.ips.length) {
          banInfo.affects = banInfo.ips[0].iid;
        } else {
          banInfo.affects = 'N/A';
        }
        delete banInfo.users;
        delete banInfo.ips;

        if (banInfo.expires) {
          banInfo.expires = banInfo.expires.toLocaleString();
        }
        if (banInfo.createdAt) {
          banInfo.createdAt = banInfo.createdAt.toLocaleString();
        }
      }
      return model;
    }
  } catch (error) {
    console.error('SQL Error on getFactionBanInfo:', error.message);
  }
  return null;
}

/**
 * get factions by search term
 * @param term search term
 * @return [{
 *   fid,
 *   name,
 *   title,
 *   description,
 *   isPublic,
 *   memberCount,
 *   avatarId,
 * }, ...]
 */
export async function searchFaction(term) {
  try {
    const sqlTerm = `%${term}%`;
    const model = await sequelize.query(
      `SELECT BIN_TO_UUID(f.uuid) AS fid, f.name, f.title, f.description,
f.memberCount,
(f.flags & ?) != 0 AS isPublic,
CONCAT(a.shortId, ':', a.extension) AS avatarId FROM Factions f
  LEFT JOIN Media a ON a.id = f.avatar
WHERE (f.flags & ?) = 0 AND (
  f.name LIKE ? OR f.title LIKE ? OR f.description LIKE ?
) LIMIT 50`, {
        replacements: [
          0x01 << FACTION_FLAGS.PUBLIC, 0x01 << FACTION_FLAGS.PRIV,
          sqlTerm, sqlTerm, sqlTerm,
        ],
        raw: true,
        type: QueryTypes.SELECT,
      },
    );
    if (model) {
      for (let i = 0; i < model.length; i += 1) {
        const faction = model[i];
        faction.isPublic = faction.isPublic === 1;
      }
      return model;
    }
  } catch (error) {
    console.error('SQL Error on searchFaction:', error.message);
  }
  return [];
}

/**
 * change a property of a faction
 * @param sqlFid sql id of faction
 * @param property
 * @param value
 * @return success
 */
export async function setFactionProperty(sqlFid, property, value) {
  try {
    await sequelize.query(
      `UPDATE Factions SET ${property} = ? WHERE id = ?`, {
        replacements: [value, sqlFid],
        raw: true,
        type: QueryTypes.UPDATE,
      },
    );
    return true;
  } catch (error) {
    console.error(`SQL Error on setFactionProperty: ${error.message}`);
  }
  return false;
}

export default Faction;
