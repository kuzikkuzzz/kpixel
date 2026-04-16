/*
 * table for shared states and config, that are not updated frequently, but
 * needed often (so cached in memory)
 */
import { QueryTypes } from 'sequelize';

import sequelize from './sequelize.js';

const Config = sequelize.define('Config', {
  key: {
    type: 'VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin',
    primaryKey: true,
  },

  // JSON string
  value: {
    type: 'VARCHAR(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin',
  },
});

/*
 * schema_version to track for future manual database migrations, when we
 * eventually drop sequelizejs
 */
Config.afterSync(() => sequelize.query(
  'INSERT IGNORE INTO Configs (`key`, value) VALUES (?,?)', {
    replacements: ['schema_version', JSON.stringify(1)],
    plain: true,
    type: QueryTypes.INSERT,
  },
));

/**
 * get config
 * @param key
 * @return object or null
 */
export async function getState(key) {
  if (!key) {
    return null;
  }
  try {
    const model = await sequelize.query(
      'SELECT value FROM Configs WHERE `key` = ?', {
        replacements: [key],
        plain: true,
        type: QueryTypes.SELECT,
      },
    );
    const value = model?.value;
    if (value) {
      return JSON.parse(value);
    }
  } catch (error) {
    console.error(`SQL Error on getState: ${error.message}`);
  }
  return null;
}

/**
 * update config
 * @param key
 * @param [value] serializable object to store
 * @return success boolean
 */
export async function setState(key, value) {
  if (!key) {
    return false;
  }
  try {
    if (value) {
      value = JSON.stringify(value);
      await sequelize.query(
        // eslint-disable-next-line
        'INSERT INTO Configs (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)', {
          replacements: [key, value],
          plain: true,
          type: QueryTypes.INSERT,
        },
      );
    } else {
      await sequelize.query(
        'DELETE FROM Configs WHERE `key` = ?', {
          replacements: [key],
          plain: true,
          type: QueryTypes.DELETE,
        },
      );
    }
    return true;
  } catch (error) {
    console.error(`SQL Error on setState: ${error.message}`);
  }
  return false;
}

export default Config;
