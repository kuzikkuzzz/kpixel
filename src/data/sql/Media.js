import fs from 'fs';
import { QueryTypes, DataTypes } from 'sequelize';

import sequelize from './sequelize.js';
import { addImageHash } from './ImageHash.js';
import { getRandomShortId } from '../../core/utils.js';
import {
  constructMediaPath, getThumbnailPaths,
} from '../../utils/media/serverUtils.js';

const Media = sequelize.define('Media', {
  id: {
    type: DataTypes.BIGINT.UNSIGNED,
    autoIncrement: true,
    primaryKey: true,
  },

  hash: {
    type: 'BINARY(32)',
    unique: 'hash',
    allowNull: false,
  },

  /*
   * short identifier for file, will be 6 chars usually, but can be more
   */
  shortId: {
    type: 'VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin',
    allowNull: false,
  },

  extension: {
    type: 'VARCHAR(12) CHARACTER SET ascii COLLATE ascii_bin',
    allowNull: false,
  },

  mimeType: {
    type: 'VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin',
    allowNull: false,
  },

  /*
   * 'image', 'audio', 'video', etc.
   */
  type: {
    // eslint-disable-next-line max-len
    type: 'VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin GENERATED ALWAYS AS (SUBSTR(mimeType, 1, INSTR(mimeType, \'/\') - 1)) VIRTUAL',
  },

  /*
   * file size in bytes
   */
  size: {
    type: DataTypes.INTEGER.UNSIGNED,
  },

  /*
   * dimensions
   */
  width: {
    type: DataTypes.INTEGER.UNSIGNED,
  },

  height: {
    type: DataTypes.INTEGER.UNSIGNED,
  },

  /*
   * average color as a 32bit RGB
   */
  avgColor: {
    type: DataTypes.INTEGER.UNSIGNED,
  },

  /*
   * from lowest to highest bit:
   * 0: registeredUsersOnly (if only registered users can view it)
   * 1: allowCORS (if allowing cors)
   * 2: needsApproval
   */
  flags: {
    type: DataTypes.TINYINT.UNSIGNED,
    allowNull: false,
    defaultValue: 0,
  },

  /*
   * count active references, may or may not be used
   */
  refCounter: {
    type: DataTypes.INTEGER.UNSIGNED,
    defaultValue: 0,
    allowNull: false,
  },

  /*
   * time to expire, NULL if infinite
   */
  expires: {
    type: DataTypes.DATE,
  },

  /*
   * time a file has been uploaded, may be updated on reupload or check
   */
  lastUpload: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    allowNull: false,
  },
}, {
  indexes: [{
    unique: true,
    name: 'filename',
    fields: ['shortId', 'extension'],
  }],
});

/**
 * deregister media either by shortId and extension
 * @param shortId
 * @param extension
 */
export async function deregisterMedia(shortId, extension) {
  try {
    await sequelize.query(
      'DELETE FROM Media WHERE shortId = ? AND extension = ?', {
        replacements: [shortId, extension],
        type: QueryTypes.DELETE,
        raw: true,
      });
    const filePath = constructMediaPath(shortId, extension);
    if (fs.existsSync(filePath)) {
      fs.rmSync(filePath);
    }
    const {
      thumbFilePath, iconFilePath, screencapFilePath,
    } = getThumbnailPaths(filePath);
    if (fs.existsSync(thumbFilePath)) {
      fs.rmSync(thumbFilePath);
    }
    if (fs.existsSync(iconFilePath)) {
      fs.rmSync(iconFilePath);
    }
    if (fs.existsSync(screencapFilePath)) {
      fs.rmSync(screencapFilePath);
    }
  } catch (error) {
    console.error(`SQL Error on deregisterMedia: ${error.message}`);
  }
}

/**
 * get filename of media if exists, adds 'shortId', 'existed' and
 *   'extension', 'type', 'width', 'height', 'avgColor'
 * to hashes objects where a corresponding hash exists
 * @param hashes [{
 *   hash,
 *   name,
 *   mimeType,
 *   extension,
 *   originalFilename,
 * }, ...]
 * @return success boolean
 */
export async function hasMedia(hashes) {
  if (!hashes) {
    return true;
  }
  if (!Array.isArray(hashes)) {
    hashes = [hashes];
  }
  if (!hashes.length) {
    return true;
  }

  try {
    const replacements = [];
    for (let i = 0; i < hashes.length; i += 1) {
      const { hash } = hashes[i];
      if (hash) {
        replacements.push(hashes[i].hash);
      }
    }

    const mediaModels = await sequelize.query(
      // eslint-disable-next-line max-len
      `SELECT id, LOWER(HEX(hash)) AS hash, extension, shortId, type, width, height, avgColor FROM Media WHERE ${
        replacements.map(() => 'hash = UNHEX(?)').join(' OR ')
      }`, {
        replacements,
        type: QueryTypes.SELECT,
        raw: true,
      },
    );

    if (mediaModels.length) {
      /*
       * upldate lastUpload timestamp, if we would be on MariaDB only, we could
       * use RETURNING and merge it together with the SELECT query
       */
      sequelize.query(
        `UPDATE Media SET lastUpload = NOW() WHERE id IN (${
          mediaModels.map(() => '?').join(', ')
        })`, {
          replacements: mediaModels.map((model) => model.id),
          type: QueryTypes.UPDATE,
        },
      ).catch((error) => {
        console.error(`SQL Error on hasMedia: ${error.message}`);
      });

      for (let i = 0; i < mediaModels.length; i += 1) {
        const model = mediaModels[i];
        const hash = hashes.find((h) => h.hash === model.hash);
        if (hash) {
          /*
           * make sure that file actually exists
           */
          const filePath = constructMediaPath(model.shortId, model.extension);
          if (fs.existsSync(filePath)) {
            hash.extension = model.extension;
            hash.shortId = model.shortId;
            hash.type = model.type;
            hash.width = model.width;
            hash.height = model.height;
            hash.avgColor = model.avgColor;
            hash.mediaId = `${model.shortId}:${model.extension}`;
            hash.existed = true;
          } else {
            deregisterMedia(model.shortId, model.extension);
          }
        }
      }
    }
  } catch (error) {
    console.error(`SQL Error on hasMedia: ${error.message}`);
    return false;
  }
  return true;
}

/**
 * get filename of media if a perceptive similar on exist,
 * adds 'shortId', 'existed' and 'extension', 'type', 'width', 'height' to model
 * @param model {
 *   hash,
 *   name,
 *   mimeType,
 *   extension,
 *   originalFilename,
 * }
 * @param pHash perceptive hash in a 16 width hex string
 * @return success boolean
 */
export async function hasSimilarMedia(model, pHash) {
  if (!pHash || !model) {
    return true;
  }

  try {
    const models = await sequelize.query(
      'CALL GET_CLOSE_IMAGE(?)', {
        replacements: [pHash],
        raw: true,
        types: QueryTypes.SELECT,
      },
    );
    if (models?.length) {
      const similarModel = models[0];
      /*
      * make sure that file actually exists
      */
      const filePath = constructMediaPath(
        similarModel.shortId, similarModel.extension,
      );
      if (fs.existsSync(filePath)) {
        model.extension = similarModel.extension;
        model.shortId = similarModel.shortId;
        model.type = similarModel.type;
        model.width = similarModel.width;
        model.height = similarModel.height;
        model.avgColor = similarModel.avgColor;
        model.mediaId = `${similarModel.shortId}:${similarModel.extension}`;
        model.existed = true;
      } else {
        deregisterMedia(model.shortId, model.extension);
      }
    }
  } catch (error) {
    console.error(`SQL Error on hasSimilarMedia: ${error.message}`);
    return false;
  }
  return true;
}

/**
 * lnk media to user and / or ip
 * @param shortId
 * @param extension
 * @param [userId]
 * @param [ip]
 */
export async function linkMedia(models, userId, ip) {
  if (!models) {
    return;
  }
  if (!Array.isArray(models)) {
    models = [models];
  }
  const flattenedModels = [];
  let where = '';
  for (let i = 0; i < models.length; i += 1) {
    const { shortId, extension } = models[i];
    if (shortId && extension) {
      flattenedModels.push(shortId, extension);
      if (where) {
        where += ' OR ';
      }
      where += '( m.shortId = ? AND m.extension = ? )';
    }
  }
  if (!flattenedModels.length) {
    return;
  }

  try {
    const promises = [];
    if (userId) {
      promises.push(sequelize.query(
      // eslint-disable-next-line max-len
        `INSERT IGNORE INTO UserMedia (uid, mid) SELECT ?, m.id FROM Media m WHERE ${where}`, {
          replacements: [userId, ...flattenedModels],
          raw: true,
          type: QueryTypes.INSERT,
        }));
    }
    if (ip) {
      promises.push(sequelize.query(
      // eslint-disable-next-line max-len
        `INSERT IGNORE INTO IPMedia (ip, mid) SELECT IP_TO_BIN(?), m.id FROM Media m WHERE ${where}`, {
          replacements: [ip, ...flattenedModels],
          raw: true,
          type: QueryTypes.INSERT,
        }));
    }
    await Promise.all(promises);
  } catch (error) {
    console.error(`SQL Error on linkMedia: ${error.message}`);
  }
}

/**
 * register new media, adds 'shortId' and 'existed' to given model object
 * @param model { hash, mimeType, extension }
 * @return success boolean
 */
export async function registerMedia(
  model, size, width = null, height = null, avgColor = null, pHash = null,
) {
  const { hash, mimeType, extension } = model;
  try {
    /*
     * shortId is a random 6 character string of a-z
     */
    let shortId;
    let exists;
    do {
      shortId = getRandomShortId();
      // eslint-disable-next-line no-await-in-loop
      exists = await sequelize.query(
        'SELECT 1 FROM Media WHERE shortId = ? AND extension = ?', {
          replacements: [shortId, extension],
          plain: true,
          type: QueryTypes.SELECT,
        },
      );
    } while (exists);
    await sequelize.query(
      // eslint-disable-next-line max-len
      'INSERT INTO Media (hash, shortId, extension, mimeType, size, width, height, avgColor, lastUpload) VALUES (UNHEX(?), ?, ?, ?, ?, ?, ?, ?, NOW())', {
        replacements: [
          hash, shortId, extension, mimeType, size, width, height, avgColor,
        ],
        raw: true,
        type: QueryTypes.INSERT,
      },
    );
    if (pHash) {
      await addImageHash(shortId, extension, pHash);
    }
    model.shortId = shortId;
    model.existed = false;
    model.mediaId = `${shortId}:${extension}`;
    return true;
  } catch (error) {
    console.error(`SQL Error on registerMedia: ${error.message}`);
  }
  return false;
}

/**
 * get type of media by mediaId
 * @param mediaId
 * @return 'image' | 'video' | ... or null if not exists
 */
export async function getMediaType(mediaId) {
  try {
    const [shortId, extension] = mediaId.split(':');
    if (!shortId || !extension) {
      return null;
    }
    const model = await sequelize.query(
      'SELECT type FROM Media WHERE shortId = ? AND extension = ?', {
        replacements: [shortId, extension],
        type: QueryTypes.SELECT,
        plain: true,
      },
    );
    return model?.type;
  } catch (error) {
    console.error('SQL Error on getMediaType:', error.message);
    return null;
  }
}

/**
 * get dimensions of media by mediaId
 * @param mediaId
 * @return { type, width, height } | null
 */
export async function getMediaDimensions(mediaId) {
  try {
    const [shortId, extension] = mediaId.split(':');
    if (!shortId || !extension) {
      return null;
    }
    const model = await sequelize.query(
      // eslint-disable-next-line max-len
      'SELECT type, width, height FROM Media WHERE shortId = ? AND extension = ?', {
        replacements: [shortId, extension],
        type: QueryTypes.SELECT,
        plain: true,
      },
    );
    return model;
  } catch (error) {
    console.error('SQL Error on getMediaType:', error.message);
    return null;
  }
}

/**
 * get users associated with media
 * @param mediaSqlId
 * @return [userId, ...]
 */
export async function getUsersOfMedia(mediaSqlId) {
  const userIds = [];
  try {
    const models = await sequelize.query(
      `SELECT DISTINCT u.id AS uid FROM Users u
  LEFT JOIN Profiles p ON p.uid = u.id
  LEFT JOIN UserMedia um ON um.uid = u.id
WHERE p.avatar = ? OR um.mid = ?`, {
        replacements: [mediaSqlId, mediaSqlId],
        raw: true,
        type: QueryTypes.SELECT,
      },
    );
    for (let i = 0; i < models.length; i += 1) {
      userIds.push(models[i].uid);
    }
  } catch (error) {
    console.error('SQL Error on getUsersOfMedia:', error.message);
  }
  return userIds;
}

/**
 * get messages associated with media
 * @param mediaSqlId
 * @return Map<cid, [messageId, ...]>
 */
export async function getMessagesOfMedia(mediaSqlId) {
  const messagesByChannel = new Map();
  try {
    const models = await sequelize.query(
      `SELECT s.cid, s.id AS sid FROM Messages s
  LEFT JOIN MessageMedia mm ON mm.sid = s.id
WHERE mm.mid = ?`, {
        replacements: [mediaSqlId],
        raw: true,
        type: QueryTypes.SELECT,
      },
    );
    for (let i = 0; i < models.length; i += 1) {
      const { cid, sid } = models[i];
      let cidMessages = messagesByChannel.get(cid);
      if (!cidMessages) {
        cidMessages = [];
        messagesByChannel.set(cid, cidMessages);
      }
      cidMessages.push(sid);
    }
  } catch (error) {
    console.error('SQL Error on getMessagesOfMedia:', error.message);
  }
  return messagesByChannel;
}

/**
 * get ips associated with media
 * @param mediaSqlId
 * @return [ipString, ...]
 */
export async function getIpsOfMedia(mediaSqlId) {
  const ipStrings = [];
  try {
    const models = await sequelize.query(
      'SELECT BIN_TO_IP(ip) AS ip FROM IPMedia WHERE mid = ?', {
        replacements: [mediaSqlId],
        raw: true,
        type: QueryTypes.SELECT,
      },
    );
    for (let i = 0; i < models.length; i += 1) {
      ipStrings.push(models[i].ip);
    }
  } catch (error) {
    console.error('SQL Error on getMessagesOfMedia:', error.message);
  }
  return ipStrings;
}

/**
 * get total used space
 * @return size in MB or null if failure
 */
export async function getTotalUsedSpace() {
  try {
    const model = await sequelize.query(
      // eslint-disable-next-line max-len
      'SELECT COALESCE(CAST(SUM(size) / (1024 * 1024) AS UNSIGNED), 0) AS sizeMb FROM Media', {
        plain: true,
        type: QueryTypes.SELECT,
      },
    );
    if (model) {
      return Number(model.sizeMb);
    }
  } catch (error) {
    console.error('SQL Error on getTotalUsedSpace:', error.message);
  }
  return null;
}

/**
 * get total user used space
 * @param [userId]
 * @param [ipString]
 * @return size in MB or null if failure
 */
export async function getUserUsedSpace(userId, ipString) {
  const unions = [];
  const replacements = [];

  if (userId) {
    unions.push('SELECT um.mid AS id FROM UserMedia um WHERE um.uid = ?');
    replacements.push(userId);
  }
  if (ipString) {
    unions.push(
      'SELECT im.mid AS id FROM IPMedia im WHERE im.ip = IP_TO_BIN(?)',
    );
    replacements.push(ipString);
  }

  if (!unions.length) {
    return null;
  }

  try {
    const model = await sequelize.query(
      // eslint-disable-next-line max-len
      `SELECT COALESCE(CAST(SUM(m.size) / (1024 * 1024) AS UNSIGNED), 0) AS sizeMb FROM Media m WHERE m.id IN (SELECT l.id FROM (\n ${
        unions.join('\n  UNION\n  ')
      }\n) AS l)`, {
        replacements,
        plain: true,
        type: QueryTypes.SELECT,
      },
    );
    if (model) {
      return Number(model.sizeMb);
    }
  } catch (error) {
    console.error('SQL Error on getUserUsedSpace:', error.message);
  }
  return null;
}

/**
 * clean up unused and expired files
 */
export async function cleanMedia() {
  try {
    const expiredModels = await sequelize.query(
      // eslint-disable-next-line max-len
      'SELECT Media.id, shortId, extension FROM Media WHERE (expires IS NOT NULL AND expires < NOW()) OR (lastUpload < NOW() - INTERVAL 1 HOUR AND refCounter = 0 AND NOT EXISTS (SELECT 1 FROM Profiles WHERE avatar = Media.id) AND NOT EXISTS (SELECT 1 FROM Factions WHERE avatar = Media.id) AND NOT EXISTS (SELECT 1 FROM FactionRoles WHERE customFlag = Media.id) AND NOT EXISTS (SELECT 1 FROM MessageMedia WHERE mid = Media.id))', {
        raw: true,
        type: QueryTypes.SELECT,
      },
    );
    if (expiredModels?.length) {
      for (let i = 0; i < expiredModels.length; i += 1) {
        const { shortId, extension } = expiredModels[i];
        if (!shortId || !extension) {
          console.error(
            // eslint-disable-next-line max-len
            `Error on cleanMedia: Got invalide shortId: ${shortId} or extension: ${extension}`,
          );
          continue;
        }
        const filePath = constructMediaPath(shortId, extension);
        try {
          if (fs.existsSync(filePath)) {
            fs.rmSync(filePath);
          }
          const {
            thumbFilePath, iconFilePath, screencapFilePath,
          } = getThumbnailPaths(filePath);
          if (fs.existsSync(thumbFilePath)) {
            fs.rmSync(thumbFilePath);
          }
          if (fs.existsSync(iconFilePath)) {
            fs.rmSync(iconFilePath);
          }
          if (fs.existsSync(screencapFilePath)) {
            fs.rmSync(screencapFilePath);
          }
        } catch (error) {
          if (error.code !== 'ENOENT') {
            console.error(
              `Error on cleanMedia for ${filePath}: ${error.message}`,
            );
          }
        }
      }
      await sequelize.query(
        `DELETE FROM Media where id IN (${
          expiredModels.map(() => '?').join(', ')
        })`, {
          replacements: expiredModels.map(({ id }) => id),
          raw: true,
          type: QueryTypes.DELETE,
        },
      );
    }
  } catch (error) {
    console.error(`SQL Error on cleanMedia: ${error.message}`);
  }
}

export default Media;
