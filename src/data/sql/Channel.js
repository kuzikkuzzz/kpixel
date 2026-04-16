/*
 *
 * Database layout for Chat Channels
 *
 */

import { DataTypes, QueryTypes } from 'sequelize';

import sequelize from './sequelize.js';
import UserChannel from './association_models/UserChannel.js';

import { CHANNEL_TYPES } from '../../core/constants.js';

export { CHANNEL_TYPES };

const Channel = sequelize.define('Channel', {
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    autoIncrement: true,
    primaryKey: true,
  },

  name: {
    type: 'VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci',
    allowNull: true,
    set(value) {
      this.setDataValue('name', value.slice(0, 32));
    },
  },

  type: {
    type: DataTypes.TINYINT.UNSIGNED,
    allowNull: false,
  },

  lastMessage: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    allowNull: false,
  },

  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    allowNull: false,
  },
});

/**
 * add a user to a channel
 * @param uid user id
 * @param cid channel id
 * @return boolean success
 */
export async function addUserToChannel(uid, cid) {
  try {
    const [, created] = await UserChannel.findOrCreate({
      where: { uid, cid },
      raw: true,
    });
    return created;
  } catch (error) {
    console.error(`SQL Error on addUserToChannel: ${error.message}`);
  }
  return false;
}

/**
 * find DM channel between users
 * @param uidA user id of user A
 * @param uidB user id of user B
 * @return channel id of DM channel or null if none exists
 */
export async function findDMChannel(uidA, uidB) {
  if (!uidA || !uidB) {
    return null;
  }
  try {
    const channel = await sequelize.query(
      /* eslint-disable max-len */
      `SELECT c.id FROM Channels c
  INNER JOIN UserChannels uc ON c.id = uc.cid
WHERE c.type = ? AND uc.uid IN (?, ?) GROUP BY c.id HAVING COUNT(DISTINCT uc.uid) = 2`, {
        /* eslint-disable max-len */
        replacements: [CHANNEL_TYPES.DM, uidA, uidB],
        raw: true,
        type: QueryTypes.SELECT,
      },
    );
    return channel[0]?.id;
  } catch (error) {
    console.error(`SQL Error on findDMChannel: ${error.message}`);
  }
  return null;
}

/**
 * create DM between two users
 * @param uidA user id of user A
 * @param uidB user id of user B
 * @return [cid, created] cid can be set and created false if DM channel
 *   already exists
 */
export async function createDMChannel(uidA, uidB) {
  let cid = await findDMChannel(uidA, uidB);
  if (cid) {
    return [cid, false];
  }
  const transaction = await sequelize.transaction();

  try {
    const channel = await Channel.create({
      type: CHANNEL_TYPES.DM,
    }, { transaction });
    cid = channel.id;
    await UserChannel.bulkCreate([
      { uid: uidA, cid }, { uid: uidB, cid },
    ], { transaction });

    await transaction.commit();
    return [cid, true];
  } catch (error) {
    if (transaction && !transaction.finished) {
      await transaction.rollback();
    }
    console.error(`SQL Error on createDMChannel: ${error.message}`);
    throw error;
  }
}

/**
 * delete dem channel between users if one exists
 * @param uidA user id of user A
 * @param uidB user id of user B
 * @return channelId if success, null if not
 */
export async function deleteDMChannel(uidA, uidB) {
  try {
    const channelId = await findDMChannel(uidA, uidB);
    if (channelId) {
      await sequelize.query(
        'DELETE FROM Channels WHERE id = ?', {
          replacements: [channelId],
          raw: true,
          type: QueryTypes.DELETE,
        },
      );
      return channelId;
    }
  } catch (error) {
    console.error(`SQL Error on deleteDMChannel: ${error.message}`);
  }
  return null;
}

/**
 * user leaving a channel
 * @param uid user id
 * @param cid channel id
 * @return affectedUsers or null
 */
export async function leaveChannel(uid, cid) {
  try {
    const model = await sequelize.query(
      `SELECT type, (SELECT COUNT(*) FROM UserChannels WHERE cid = ?) AS memberAmount FROM Channels c
  INNER JOIN UserChannels uc ON uc.cid = c.id
WHERE c.id = ? AND uc.uid = ?`, {
        replacements: [cid, cid, uid],
        plain: true,
        type: QueryTypes.SELECT,
      },
    );
    if (!model) {
      return null;
    }
    const { type, memberAmount } = model;
    /*
     * only dm and group channels can be left
     */
    if (type !== CHANNEL_TYPES.DM && type !== CHANNEL_TYPES.GROUP) {
      return null;
    }
    /*
     * delete whole channel if only one person or nobody would be left
     */
    const affectedUsers = [uid];
    if (memberAmount === 2) {
      const partnerModel = await sequelize.query(
        'SELECT uid FROM UserChannels WHERE cid = ? and uid != ?', {
          replacements: [cid, uid],
          plain: true,
          type: QueryTypes.SELECT,
        },
      );
      if (partnerModel) {
        affectedUsers.push(partnerModel.uid);
      }
    }
    if (memberAmount <= 2) {
      await sequelize.query(
        'DELETE FROM Channels WHERE id = ?', {
          replacements: [cid],
          raw: true,
          type: QueryTypes.DELETE,
        },
      );
    } else {
      await sequelize.query(
        'DELETE FROM UserChannels WHERE cid = ? AND uid = ?', {
          replacements: [cid, uid],
          raw: true,
          type: QueryTypes.DELETE,
        },
      );
    }
    return affectedUsers;
  } catch (error) {
    console.error(`SQL Error on leaveChannel: ${error.message}`);
  }
  return null;
}

/**
 * find or create a default channel
 * @param name name of channel
 */
export function getDefaultChannel(name) {
  return Channel.findOrCreate({
    where: { name, type: CHANNEL_TYPES.PUBLIC },
    raw: true,
  });
}

export async function setUserChannelMute(channelId, userId, mute) {
  try {
    await sequelize.query(
      // eslint-disable-next-line max-len
      'UPDATE UserChannels SET muted = ? WHERE cid = ? AND uid = ?', {
        replacements: [(mute) ? 1 : 0, channelId, userId],
        raw: true,
        type: QueryTypes.UPDATE,
      },
    );
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * mark channels as read
 * @param channelIds one or more channelIds
 * @param userIds one or more userIds
 * @return boolean success
 */
export async function markChannelsRead(channelIds, userIds) {
  if (!channelIds || !userIds) {
    return false;
  }

  let replacements = [];
  let channelWhere;
  if (Array.isArray(channelIds)) {
    if (channelIds.length) {
      channelWhere = `cid in ( ${channelIds.map(() => '?').join(', ')} )`;
      replacements = replacements.concat(channelIds);
    } else {
      return false;
    }
  } else {
    channelWhere = 'cid = ?';
    replacements.push(channelIds);
  }

  let userWhere;
  if (Array.isArray(userIds)) {
    if (userIds.length) {
      userWhere = `uid in ( ${userIds.map(() => '?').join(', ')} )`;
      replacements = replacements.concat(userIds);
    } else {
      return false;
    }
  } else {
    userWhere = 'uid = ?';
    replacements.push(userIds);
  }

  try {
    await sequelize.query(
      // eslint-disable-next-line max-len
      `UPDATE UserChannels SET lastRead = NOW() WHERE ${channelWhere} AND ${userWhere}`, {
        replacements,
        raw: true,
        type: QueryTypes.UPDATE,
      },
    );
    return true;
  } catch (error) {
    console.error(`SQL Error on markChannelsRead: ${error.message}`);
  }
  return false;
}

export default Channel;
