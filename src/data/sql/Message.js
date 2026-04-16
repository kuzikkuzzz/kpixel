/*
 *
 * Database layout for Chat Messages
 *
 */

import { DataTypes, QueryTypes } from 'sequelize';
import sequelize from './sequelize.js';
import { CHANNEL_TYPES } from '../../core/constants.js';
import mapFlag from '../../utils/flagMapping.js';
import parseAttachmentsFromMd from '../../utils/markdown/attachmentParser.js';
import { getMediaFromLinks } from '../../utils/media/serverUtils.js';

const Message = sequelize.define('Message', {
  id: {
    type: DataTypes.BIGINT.UNSIGNED,
    autoIncrement: true,
    primaryKey: true,
  },

  cid: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
  },

  uid: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
  },

  message: {
    type: 'VARCHAR(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci',
    allowNull: false,
    set(value) {
      this.setDataValue('message', value.slice(0, 200));
    },
  },

  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    allowNull: false,
  },
}, {
  indexes: [
    {
      name: 'messages_cid_id_desc',
      fields: ['cid', 'id'],
      order: { id: 'DESC' },
    },
  ],
});

/**
 * store message, may throw an Error
 * @param message
 * @param cid channel id
 * @param uid user id
 * @return message id or null
 */
export async function storeMessage(message, cid, uid) {
  if (message.length > 200) {
    throw new Error('too_long');
  }
  const media = getMediaFromLinks(parseAttachmentsFromMd(message));
  if (media.length > 3) {
    throw new Error('too_many_files');
  }

  try {
    const transaction = await sequelize.transaction();

    try {
      const model = await sequelize.query(
        'CALL STORE_CHAT_MESSAGE(?, ?, ?)', {
          replacements: [cid, uid, message],
          plain: true,
          type: QueryTypes.SELECT,
          transaction,
        },
      );
      const id = model[0]?.id;
      if (!id) {
        throw new Error('no_such_channel');
      }

      const attachments = [];
      if (media.length) {
        const [, insertedRows] = await sequelize.query(
          // eslint-disable-next-line max-len
          `INSERT INTO MessageMedia (sid, mid) SELECT ?, m.id FROM Media m WHERE ${
            media.map(
              () => '( m.shortId = ? AND m.extension = ? )',
            ).join(' OR ')
          }`, {
            replacements: [id, ...media.flat()],
            raw: true,
            type: QueryTypes.INSERT,
            transaction,
          },
        );
        if (insertedRows > 0) {
          const models = await sequelize.query(
            // eslint-disable-next-line max-len
            `SELECT CONCAT(shortId, ':', b.extension) AS mediaId, b.type AS mediaType, b.size AS mediaSize, b.width AS mediaWidth, b.height AS mediaHeight, b.avgColor AS mediaAvgColor FROM Media b
  INNER JOIN MessageMedia mm ON mm.mid = b.id
WHERE mm.sid = ?`, {
              replacements: [id],
              raw: true,
              type: QueryTypes.SELECT,
              transaction,
            },
          );
          for (let i = 0; i < models.length; i += 1) {
            const {
              mediaId, mediaType, mediaSize, mediaWidth, mediaHeight,
              mediaAvgColor,
            } = models[i];
            attachments.push([
              mediaId, mediaType, mediaSize, mediaWidth, mediaHeight,
              mediaAvgColor,
            ]);
          }
        }
      }

      await transaction.commit();
      return [id, attachments];
    } catch (error) {
      if (transaction && !transaction.finished) {
        await transaction.rollback();
      }
      throw error;
    }
  } catch (error) {
    if (error.message === 'no_such_channel') {
      throw error;
    }
    console.error(`SQL Error on storeMessage: ${error.message}`);
    throw new Error('store_error');
  }
}

/**
 * delete all messages of a user written in public channels
 * @param uid user id
 * @return success
 */
export async function deletePublicUserMessages(uid) {
  if (!uid) {
    return false;
  }
  try {
    await sequelize.query(
      `DELETE m FROM Messages m
  INNER JOIN Channels c ON m.cid = c.id
WHERE m.uid = ? AND c.type = ?`, {
        replacements: [uid, CHANNEL_TYPES.PUBLIC],
        raw: true,
        type: QueryTypes.DELETE,
      },
    );
    return true;
  } catch (error) {
    console.error(`SQL Error on deleteUserMessages: ${error.message}`);
  }
  return false;
}

/**
 * delete all messages of a user written in public channels
 * @param uid user id
 * @return success
 */
export async function deleteUserChannelMessages(uid, cid) {
  try {
    await sequelize.query(
      'DELETE FROM Messages WHERE uid = ? AND cid = ?', {
        replacements: [uid, cid],
        raw: true,
        type: QueryTypes.DELETE,
      },
    );
    return true;
  } catch (error) {
    console.error(`SQL Error on deleteUserChannelMessages: ${error.message}`);
  }
  return false;
}

/**
 * delete messages by ids
 * @param ids ids of messages
 * @return success
 */
export async function deleteMessagesByIds(ids) {
  if (!ids) {
    return false;
  }
  if (!Array.isArray(ids)) {
    ids = [ids];
  }
  if (!ids.length) {
    return false;
  }
  try {
    await sequelize.query(
      `DELETE m FROM Messages m WHERE id in (${
        ids.map(() => '?').join(', ')
      })`, {
        replacements: ids,
        raw: true,
        type: QueryTypes.DELETE,
      },
    );
    return true;
  } catch (error) {
    console.error(`SQL Error on deleteMessagesByIds: ${error.message}`);
  }
  return false;
}

/**
 * delete speciic message
 * @param mid message id
 * @return success
 */
export async function deleteMessage(mid) {
  if (!mid) {
    return false;
  }
  try {
    await sequelize.query(
      'DELETE FROM Messages WHERE id = ?', {
        replacements: [mid],
        raw: true,
        type: QueryTypes.DELETE,
      },
    );
    return true;
  } catch (error) {
    console.error(`SQL Error on deleteUserMessages: ${error.message}`);
  }
  return false;
}

/**
 * get recent history of channel
 * @param cid channel id
 * @param limit amount of last messages to get
 * @return [[name, message, flag, userId, ts, msgId, avatarId], ...]
 */
export async function getMessagesForChannel(cid, limit) {
  try {
    const models = await sequelize.query(
      /* eslint-disable max-len */
      `SELECT DISTINCT m.createdAt, m.id AS msgId, m.message, m.uid AS userId,
UNIX_TIMESTAMP(m.createdAt) AS 'ts',
u.name, u.userlvl, p.customFlag,
COALESCE((SELECT s.country FROM Sessions s WHERE s.uid = u.id ORDER BY s.id DESC LIMIT 1), 'xx') AS country,
CONCAT(b.shortId, ':', b.extension) AS mediaId, b.type AS mediaType, b.size AS mediaSize, b.width AS mediaWidth, b.height AS mediaHeight, b.avgColor AS mediaAvgColor,
CONCAT(a.shortId, ':', a.extension) AS avatarId,
CONCAT(frm.shortId, ':', frm.extension) AS customRoleFlagId FROM Messages m
  INNER JOIN Users u ON u.id = m.uid
  LEFT JOIN Profiles p ON p.uid = u.id
  LEFT JOIN Media a ON a.id = p.avatar
  LEFT JOIN FactionRoles fr ON fr.id = p.activeRole
  LEFT JOIN Media frm ON frm.id = fr.customFlag
  LEFT JOIN MessageMedia mm ON mm.sid = m.id
  LEFT JOIN Media b ON b.id = mm.mid
WHERE m.cid = ? ORDER BY m.createdAt DESC LIMIT ?`, {
      /* eslint-enable max-len */
        replacements: [cid, limit],
        raw: true,
        type: QueryTypes.SELECT,
      },
    );
    const rows = [];
    const mediaReferences = new Map();

    let i = models.length;
    while (i > 0) {
      i -= 1;
      const model = models[i];
      const { name, message, userId, ts, msgId, avatarId, mediaId } = model;
      const [flagLegit, flag] = mapFlag(
        model.customRoleFlagId, model.customFlag, model.userlvl, model.country,
      );
      if (mediaId) {
        let attachments = mediaReferences.get(msgId);
        if (!attachments) {
          attachments = [];
          rows.push(
            [
              name, message, flag, userId, ts, msgId, flagLegit, avatarId,
              attachments,
            ],
          );
          mediaReferences.set(msgId, attachments);
        }
        const {
          mediaType, mediaSize, mediaWidth, mediaHeight, mediaAvgColor,
        } = model;
        attachments.push([
          mediaId, mediaType, mediaSize, mediaWidth, mediaHeight, mediaAvgColor,
        ]);
      } else {
        rows.push(
          [name, message, flag, userId, ts, msgId, flagLegit, avatarId, []],
        );
      }
    }
    return rows;
  } catch (error) {
    console.error(`SQL Error on getMessagesForChannel: ${error.message}`);
  }
  return [];
}

export default Message;
