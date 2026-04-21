import pool from './mariadb.js';

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
    const [model] = await pool.query(
      'SELECT value FROM Configs WHERE `key` = ?', [key],
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
      await pool.query(
        // eslint-disable-next-line
        'INSERT INTO Configs (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)',
        [key, value],
      );
    } else {
      await pool.query('DELETE FROM Configs WHERE `key` = ?', [key]);
    }
    return true;
  } catch (error) {
    console.error(`SQL Error on setState: ${error.message}`);
  }
  return false;
}
