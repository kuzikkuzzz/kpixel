/*
 * bans for factions
 */
import { DataTypes, QueryTypes } from 'sequelize';

import sequelize from './sequelize.js';
import { generateUUID, bufferToUUID } from '../../utils/hash.js';

const FactionBan = sequelize.define('FactionBan', {
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

  muid: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: true,
  },

  reason: {
    type: 'VARCHAR(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci',
    allowNull: false,
    set(value) {
      this.setDataValue('reason', value.slice(0, 200));
    },
  },

  /*
   * NULL if infinite
   */
  expires: {
    type: DataTypes.DATE,
  },

  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    allowNull: false,
  },
}, {
  indexes: [{
    name: 'ban_fid',
    fields: ['fid'],
  }],
});

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
  try {
    const fbid = bufferToUUID(generateUUID());

    await sequelize.query(
      // eslint-disable-next-line max-len
      'INSERT INTO FactionBans (uuid, fid, reason, expires, muid, createdAt) VALUES (UUID_TO_BIN(?), ?, ?, ?, ?, NOW())', {
        replacements: [
          fbid, sqlFid, reason,
          (duration) ? new Date(Date.now() + duration * 1000) : null,
          muid,
        ],
        raw: true,
        type: QueryTypes.INSERT,
      },
    );
    const model = await sequelize.query(
      'SELECT id FROM FactionBans WHERE uuid = UUID_TO_BIN(?)', {
        replacements: [fbid],
        plain: true,
        type: QueryTypes.SELECT,
      },
    );
    if (!model) {
      return false;
    }
    const bid = model.id;

    await Promise.all([
      sequelize.query(
        'INSERT INTO UserFactionBans (bid, uid) VALUES (?, ?)', {
          replacements: [bid, uid],
          raw: true,
          type: QueryTypes.INSERT,
        },
      ),
      ipString && sequelize.query(
        'INSERT INTO IPFactionBans (bid, ip) VALUES (?, IP_TO_BIN(?))', {
          replacements: [bid, ipString],
          raw: true,
          type: QueryTypes.INSERT,
        },
      ),
    ]);
    return true;
  } catch (error) {
    console.error('SQL Error on banUserFromFaction:', error.message);
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
    await sequelize.query(
      /* eslint-disable max-len */
      `DELETE FROM FactionBans WHERE uuid = UUID_TO_BIN(?) AND EXISTS(
  SELECT id FROM Factions f WHERE f.id = FactionBans.fid AND f.name = ?)
)`, {
        /* eslint-enable max-len */
        replacements: [fbid, factionName],
        raw: true,
        type: QueryTypes.DELETE,
      },
    );
    return true;
  } catch (error) {
    console.error('SQL Error on unbanFromFaction:', error.message);
  }
  return false;
}

export default FactionBan;
