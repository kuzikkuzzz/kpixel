/**
 * Sequelize SQL
 */

/* eslint-disable max-len */

import Sequelize from 'sequelize';

import {
  FACTION_FLAGS, CHANNEL_TYPES, FACTION_PERMISSIONS, FACTION_ROLE_FLAGS,
  MAX_ROLES_PER_FACTION, MAX_FACTIONS_PER_USER, MAX_OWNED_FACTIONS_PER_USER,
  INVITE_FLAGS, MAX_INVITES_PER_FACTION,
} from '../../core/constants.js';
import {
  MARIADB_HOST, MARIADB_DATABASE, MARIADB_USER, MARIADB_PW, LOG_MARIADB,
} from '../../core/config.js';

const sequelize = new Sequelize(MARIADB_DATABASE, MARIADB_USER, MARIADB_PW, {
  host: MARIADB_HOST,
  dialect: 'mysql',
  define: {
    timestamps: false,
  },
  pool: {
    min: 5,
    max: 25,
    idle: 10000,
    acquire: 10000,
  },
  // eslint-disable-next-line no-console
  logging: (LOG_MARIADB) ? (sql) => console.info(sql) : false,
  dialectOptions: {
    connectTimeout: 10000,
    multipleStatements: true,
    maxPreparedStatements: 100,
    supportBigNumbers: true,
    /*
     * enabling the following will return all BIGINT as string, leaving it
     * disabled will only return them as string if they are larger than what
     * Number() can represent
     * TODO: enable this temporary for testing
     */
    // bigNumberStrings: true,
  },
});

/**
 * nest raw queries
 * Sequelize raw: true queries return association as table.column names,
 * and if we make sure that we only do this form on M:N associations, we can
 * nest the results
 * @param query query return object, which is an array
 * @param primaryKey any key that is unique to nest for, if null, nest all and
 *   return only one object
 * @return nested query
 */
export function nestQuery(query, primaryKey) {
  if (!query?.length) {
    if (primaryKey) {
      return [];
    }
    return null;
  }
  const ret = [];

  const mainColumns = [];
  const nestedColumns = [];
  const columns = Object.keys(query[0]);
  let i = columns.length;
  while (i > 0) {
    i -= 1;
    const k = columns[i];
    const seperator = k.indexOf('.');
    if (seperator === -1) {
      mainColumns.push(k);
    } else {
      nestedColumns.push(
        [k.substring(0, seperator), k.substring(seperator + 1)],
      );
    }
  }

  i = query.length;
  while (i > 0) {
    i -= 1;
    const row = query[i];

    let target;
    if (primaryKey) {
      const primary = row[primaryKey];
      target = ret.find(
        (r) => r[primaryKey].toString() === primary.toString(),
      );
    } else {
      // eslint-disable-next-line prefer-destructuring
      target = ret[0];
    }

    if (!target) {
      target = {};
      mainColumns.forEach((k) => {
        target[k] = row[k];
      });
      nestedColumns.forEach(([k]) => {
        target[k] = [];
      });
      ret.push(target);
    }

    const nestedObj = {};
    const notNullObj = {};
    let u = nestedColumns.length;
    while (u > 0) {
      u -= 1;
      const [k, v] = nestedColumns[u];
      if (!nestedObj[k]) {
        nestedObj[k] = {};
      }
      const value = row[`${k}.${v}`];
      const obj = nestedObj[k];
      obj[v] = value;
      if (value !== null) {
        notNullObj[k] = obj;
      }
    }

    const notNullKeys = Object.keys(notNullObj);
    u = notNullKeys.length;
    while (u > 0) {
      u -= 1;
      const k = notNullKeys[u];
      target[k].push(nestedObj[k]);
    }
  }

  return (primaryKey) ? ret : ret[0];
}

/**
 * replacer for JSON.stringify
 * this is set by JSON.stringify to the current object we are in
 * @param key
 * @param value
 * @return parsed value
 */
function jsonReplacer(key, value) {
  if (key) {
    /* get this[k], because value is already stringified */
    const originalValue = this[key];
    let modifier;
    if (originalValue instanceof Date) {
      modifier = 'ts';
      value = originalValue.getTime();
    }
    /* if we need more than only Date, add here */
    if (modifier) {
      value = `ts(${value})`;
    }
  }
  return value;
}

/**
 * reviver for JSON.parse
 * @param key
 * @param value
 * @param context { source: original string before parsing }
 * @return parsed value
 */
function jsonReviver(key, value, context) {
  if (context && typeof value === 'string' && value.endsWith(')')) {
    const openingBreaket = value.indexOf('(');
    if (openingBreaket !== -1) {
      const parsedValue = value.substring(openingBreaket + 1, value.length - 1);
      const modifier = value.substring(0, openingBreaket);
      switch (modifier) {
        case 'ts':
          return new Date(Number(parsedValue));
        /* if we need more than only Date, add here */
        default:
          // nothing
      }
    }
  }
  return value;
}

/**
 * convert a raw sequelize object into a json string
 * @param rawObject the object resulting of a { raw: true, nested: true } call
 * @return json string
 */
export function sequelizeRawToJson(rawObject) {
  return JSON.stringify(rawObject, jsonReplacer);
}

/**
 * convert a json string to a sequlize raw object
 * @param json
 * @return raw sequelize object
 */
export function jsonToSequelizeRaw(json) {
  return JSON.parse(json, jsonReviver);
}

/*
 * estabish database connection
 */
export const sync = async (alter = false) => {
  await sequelize.sync({ alter: { drop: alter } });

  /*
   * custom functions (for IP_BIN explenation, look into IP_Info comments)
   */
  const functions = {
    IP_TO_BIN: `CREATE FUNCTION IF NOT EXISTS IP_TO_BIN(ip VARCHAR(39)) RETURNS VARBINARY(8) DETERMINISTIC CONTAINS SQL
BEGIN
  DECLARE longBin VARBINARY(16);
  SET longBin = INET6_ATON(ip);
  IF LENGTH(longBin) > 4
    THEN
      RETURN SUBSTRING(longBin, 1, 8);
    ELSE
      RETURN (longBin);
  END IF;
END`,
    BIN_TO_IP: `CREATE FUNCTION IF NOT EXISTS BIN_TO_IP(bin VARBINARY(8)) RETURNS VARCHAR(21) DETERMINISTIC CONTAINS SQL
BEGIN
  RETURN (INET6_NTOA(IF(LENGTH(bin) > 4, CAST(bin as BINARY(16)), bin)));
END`,
    NORMALIZE_TPID: `CREATE FUNCTION IF NOT EXISTS NORMALIZE_TPID(provider TINYINT(4) UNSIGNED, tip VARCHAR(80)) RETURNS VARCHAR(80) DETERMINISTIC CONTAINS SQL
BEGIN
  DECLARE atPos TINYINT UNSIGNED;
  IF provider != 1 THEN
    RETURN NULL;
  END IF;
  SET atPos = LOCATE('@', tip);
  IF atPos = 0 THEN
    RETURN NULL;
  END IF;
  RETURN (LOWER(CONCAT(REPLACE(SUBSTRING_INDEX(SUBSTRING_INDEX(tip, '@', 1), '+', 1), '.', ''),'@',(SUBSTRING_INDEX(tip, '@', -1)))));
END`,
    UUID_TO_BIN: `CREATE FUNCTION IF NOT EXISTS UUID_TO_BIN(uuid CHAR(36)) RETURNS BINARY(16) DETERMINISTIC
BEGIN
  RETURN UNHEX(REPLACE(uuid, '-', ''));
END`,
    BIN_TO_UUID: `CREATE FUNCTION IF NOT EXISTS BIN_TO_UUID(bin_uuid BINARY(16)) RETURNS CHAR(36) DETERMINISTIC
BEGIN
    DECLARE hex_uuid CHAR(32);
    SET hex_uuid = HEX(bin_uuid);
    RETURN LOWER(CONCAT(
        SUBSTR(hex_uuid, 1, 8), '-',
        SUBSTR(hex_uuid, 9, 4), '-',
        SUBSTR(hex_uuid, 13, 4), '-',
        SUBSTR(hex_uuid, 17, 4), '-',
        SUBSTR(hex_uuid, 21, 12)
    ));
END`,
    /**
     * store chat message,
     * return the inserted message id or 0 if the channel doesn't exist
     * @param p_cid channel id
     * @param p_uid user id
     * @param p_message message
     */
    STORE_CHAT_MESSAGE: `CREATE PROCEDURE IF NOT EXISTS STORE_CHAT_MESSAGE(IN p_cid INT UNSIGNED, IN p_uid INT UNSIGNED, IN p_message VARCHAR(200) CHARACTER SET utf8mb4) NOT DETERMINISTIC MODIFIES SQL DATA
BEGIN
  UPDATE Channels SET lastMessage = NOW() WHERE id = p_cid;

  IF ROW_COUNT() = 0 THEN
    SELECT 0 AS id;
  ELSE
    INSERT INTO Messages (message, uid, cid, createdAt) VALUES (p_message, p_uid, p_cid, NOW());
    SELECT LAST_INSERT_ID() AS id;
  END IF;
END`,
    STORE_FISH: `CREATE PROCEDURE IF NOT EXISTS STORE_FISH(IN p_uid INT UNSIGNED, IN p_type TINYINT UNSIGNED, IN p_size FLOAT) NOT DETERMINISTIC MODIFIES SQL DATA
BEGIN
  INSERT INTO Fishes (uid, type, size, createdAt) VALUES (p_uid, p_type, p_size, NOW());
  SELECT LAST_INSERT_ID() AS id;
END`,
    CREATE_FACTION: `CREATE PROCEDURE IF NOT EXISTS CREATE_FACTION(
  IN p_uid INT UNSIGNED,
  IN p_name VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin,
  IN p_title VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  IN p_description VARCHAR(1000) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  IN p_flags TINYINT UNSIGNED,
  IN p_avatar_id VARCHAR(29),
  IN p_sovereign_uuid CHAR(36),
  IN p_peasant_uuid CHAR(36)
) NOT DETERMINISTIC MODIFIES SQL DATA
BEGIN
  DECLARE v_mid BIGINT UNSIGNED;
  DECLARE v_cid INT UNSIGNED;
  DECLARE v_fid BIGINT UNSIGNED;
  DECLARE v_joined_count INT UNSIGNED;
  DECLARE v_owned_count INT UNSIGNED;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;
  START TRANSACTION;

  SELECT MAX(id) INTO v_mid  FROM Media m
    WHERE LOCATE(':', p_avatar_id) > 0
      AND m.type = 'image'
      AND m.shortId = SUBSTRING_INDEX(p_avatar_id, ':', 1)
      AND m.extension = SUBSTRING_INDEX(p_avatar_id, ':', -1);

  SELECT COUNT(*), SUM(isOwner) INTO v_joined_count, v_owned_count
  FROM (
    SELECT EXISTS(
      SELECT 1 FROM UserFactionRoles ufr
        INNER JOIN FactionRoles fr ON ufr.frid = fr.id
      WHERE ufr.uid = uf.uid AND fr.fid = uf.fid AND fr.factionlvl >= ${FACTION_PERMISSIONS.SOVEREIGN}
    ) AS isOwner
    FROM UserFactions uf WHERE uf.uid = p_uid
  ) AS ufc;

  IF v_joined_count >= ${MAX_FACTIONS_PER_USER} THEN
    ROLLBACK;
    SELECT 1 AS result;
  ELSEIF v_owned_count >= ${MAX_OWNED_FACTIONS_PER_USER} THEN
    ROLLBACK;
    SELECT 2 AS result;
  ELSEIF NOT EXISTS(
    SELECT 1 FROM Users WHERE id = p_uid AND createdAt < NOW() - INTERVAL 14 DAY
  ) THEN
    ROLLBACK;
    SELECT 3 AS result;
  ELSEIF v_mid IS NULL THEN
    ROLLBACK;
    SELECT 4 AS result;
  ELSEIF EXISTS(
    SELECT 1 FROM Factions WHERE name = p_name
  ) THEN
    ROLLBACK;
    SELECT 5 AS result;
  ELSE
    INSERT INTO Channels (
      name, type, lastMessage, createdAt
    ) VALUES (
      p_name, ${CHANNEL_TYPES.FACTION}, NOW(), NOW()
    );
    SELECT LAST_INSERT_ID() INTO v_cid;
    INSERT INTO Factions (
      name, title, description, avatar, flags, memberCount, createdAt, cid
    ) VALUES (
      p_name, p_title, p_description, v_mid, p_flags, 1, NOW(), v_cid
    );
    SELECT LAST_INSERT_ID() INTO v_fid;
    INSERT INTO FactionRoles (
      uuid, fid, name, memberCount, factionlvl, flags
    ) VALUES (
      UUID_TO_BIN(p_sovereign_uuid), v_fid, 'Sovereign', 1, ${FACTION_PERMISSIONS.SOVEREIGN}, ${0x01 << FACTION_ROLE_FLAGS.PROTECTED}
    ), (
      UUID_TO_BIN(p_peasant_uuid), v_fid, 'Peasant', 1, ${FACTION_PERMISSIONS.PEASANT}, ${(0x01 << FACTION_ROLE_FLAGS.DEFAULT) | (0x01 << FACTION_ROLE_FLAGS.PROTECTED)}
    );
    INSERT INTO UserFactions (uid, fid, joined) VALUES (p_uid, v_fid, NOW());
    INSERT INTO UserFactionRoles (uid, frid)
      SELECT p_uid, fr.id FROM FactionRoles fr WHERE fr.fid = v_fid;
    INSERT INTO UserChannels (uid, cid, lastRead) VALUES (p_uid, v_cid, NOW());
    COMMIT;
    SELECT 0 AS result;
  END IF;
END`,
    /**
     * delete a faction
     * @param p_initiator_uid uid of initiator
     * @param p_faction_name faction name
     * If success, then second result set is users with [uid, hadFactionActive]
     */
    DELETE_FACTION: `CREATE PROCEDURE IF NOT EXISTS DELETE_FACTION(IN p_initiator_uid INT UNSIGNED, IN p_faction_name VARCHAR(32) CHARACTER SET ascii) NOT DETERMINISTIC MODIFIES SQL DATA
BEGIN
  DECLARE v_fid BIGINT UNSIGNED;
  DECLARE v_initiator_powerlvl TINYINT;
  DECLARE v_faction_channel_id INT UNSIGNED;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;
  START TRANSACTION;

  SELECT MAX(id), MAX(cid) INTO v_fid, v_faction_channel_id FROM Factions WHERE name = p_faction_name;

  IF v_fid IS NULL THEN
    ROLLBACK;
    SELECT 1 AS result;
  ELSEIF NOT EXISTS(
    SELECT 1 FROM UserFactions WHERE uid = p_initiator_uid AND fid = v_fid LIMIT 1
  ) THEN
    ROLLBACK;
    SELECT 2 AS result;
  ELSE
    SELECT IFNULL(MAX(factionlvl), 0) INTO v_initiator_powerlvl FROM FactionRoles fr
      INNER JOIN UserFactionRoles ufr ON ufr.frid = fr.id
    WHERE fr.fid = v_fid AND ufr.uid = p_initiator_uid;

    IF v_initiator_powerlvl < ${FACTION_PERMISSIONS.DELETE_FACTION} THEN
      ROLLBACK;
      SELECT 3 AS result;
    ELSE
      SELECT 0 AS result, v_faction_channel_id AS factionChannelId;
      SELECT uf.uid, fr.id IS NOT NULL AS hadFactionActive FROM UserFactions uf
        LEFT JOIN Profiles p ON uf.uid = p.uid
        LEFT JOIN FactionRoles fr ON p.activeRole = fr.id AND fr.fid = uf.fid
      WHERE uf.fid = v_fid;
      DELETE FROM Channels WHERE id = v_faction_channel_id;
      COMMIT;
    END IF;
  END IF;
END`,
    CREATE_FACTION_ROLE: `CREATE PROCEDURE IF NOT EXISTS CREATE_FACTION_ROLE(
  IN p_faction_name VARCHAR(32) CHARACTER SET ascii,
  IN p_factionrole_uuid CHAR(36),
  IN p_name VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin,
  IN p_factionlvl TINYINT SIGNED,
  IN p_custom_flag_id VARCHAR(29),
  IN p_flags TINYINT UNSIGNED
) NOT DETERMINISTIC MODIFIES SQL DATA
BEGIN
  DECLARE v_fid BIGINT UNSIGNED;
  DECLARE v_mid BIGINT UNSIGNED;
  DECLARE v_role_count INT UNSIGNED;

  SELECT MAX(id) INTO v_fid FROM Factions WHERE name = p_faction_name;
  IF v_fid IS NULL THEN
    SELECT 1 AS result;
  ELSE
    SELECT COUNT(*) INTO v_role_count FROM FactionRoles WHERE fid = v_fid;
    SELECT MAX(id) INTO v_mid  FROM Media m
      WHERE LOCATE(':', p_custom_flag_id) > 0
        AND m.type = 'image'
        AND m.shortId = SUBSTRING_INDEX(p_custom_flag_id, ':', 1)
        AND m.extension = SUBSTRING_INDEX(p_custom_flag_id, ':', -1);

    IF p_custom_flag_id IS NOT NULL AND v_mid IS NULL THEN
      SELECT 2 AS result;
    ELSEIF v_role_count >= ${MAX_ROLES_PER_FACTION} THEN
      SELECT 3 AS result;
    ELSE
      INSERT INTO FactionRoles (
        uuid, fid, customFlag, name, factionlvl, flags
      ) VALUES (
        UUID_TO_BIN(p_factionrole_uuid), v_fid, v_mid, p_name, p_factionlvl, p_flags
      );
      SELECT 0 AS result;
    END IF;
  END IF;
END`,
    DELETE_FACTION_ROLE: `CREATE PROCEDURE IF NOT EXISTS DELETE_FACTION_ROLE(IN p_initiator_uid INT UNSIGNED, IN p_faction_role_uuid CHAR(36)) NOT DETERMINISTIC MODIFIES SQL DATA
BEGIN
  DECLARE v_frid BIGINT UNSIGNED;
  DECLARE v_fid BIGINT UNSIGNED;
  DECLARE v_faction_name VARCHAR(32) CHARACTER SET ascii;
  DECLARE v_role_powerlvl TINYINT;
  DECLARE v_initiator_powerlvl TINYINT;
  DECLARE v_flags TINYINT UNSIGNED;

  SELECT MAX(fr.id), MAX(fr.fid), MAX(fr.factionlvl), MAX(fr.flags), MAX(f.name)
    INTO v_frid, v_fid, v_role_powerlvl, v_flags, v_faction_name
  FROM FactionRoles fr INNER JOIN Factions f ON fr.fid = f.id
  WHERE fr.uuid = UUID_TO_BIN(p_faction_role_uuid);

  IF v_fid IS NULL THEN
    SELECT 1 AS result;
  ELSEIF v_role_powerlvl >= ${FACTION_PERMISSIONS.SOVEREIGN} THEN
    SELECT 2 AS result;
  ELSEIF (v_flags & ${0x01 << FACTION_ROLE_FLAGS.PROTECTED}) != 0 THEN
    SELECT 3 AS result;
  ELSEIF NOT EXISTS(
    SELECT 1 FROM UserFactions WHERE uid = p_initiator_uid AND fid = v_fid LIMIT 1
  ) THEN
    SELECT 4 AS result;
  ELSE
    SELECT IFNULL(MAX(factionlvl), 0) INTO v_initiator_powerlvl FROM FactionRoles fr
      INNER JOIN UserFactionRoles ufr ON ufr.frid = fr.id
    WHERE fr.fid = v_fid AND ufr.uid = p_initiator_uid;

    IF v_initiator_powerlvl < ${FACTION_PERMISSIONS.CREATE_ROLES} THEN
      SELECT 5 AS result;
    ELSEIF v_role_powerlvl > v_initiator_powerlvl THEN
      SELECT 6 AS result;
    ELSEIF v_role_powerlvl = v_initiator_powerlvl AND v_initiator_powerlvl < ${FACTION_PERMISSIONS.MANAGE_YOURSELF} THEN
      SELECT 7 AS result;
    ELSE
      SELECT 0 AS result, v_faction_name AS factionName;
      SELECT uf.uid, p.activeRole = v_frid AS hadRoleActive FROM UserFactions uf
        LEFT JOIN Profiles p ON uf.uid = p.uid
      WHERE fid = v_fid;

      DELETE FROM FactionRoles WHERE id = v_frid;
    END IF;
  END IF;
END`,
    LEAVE_FACTION_ROLE: `CREATE PROCEDURE IF NOT EXISTS LEAVE_FACTION_ROLE(IN p_initiator_uid INT UNSIGNED, IN p_subject_uid INT UNSIGNED, IN p_faction_role_uuid CHAR(36)) NOT DETERMINISTIC MODIFIES SQL DATA
BEGIN
  DECLARE v_frid BIGINT UNSIGNED;
  DECLARE v_fid BIGINT UNSIGNED;
  DECLARE v_role_powerlvl TINYINT;
  DECLARE v_faction_name VARCHAR(32) CHARACTER SET ascii;
  DECLARE v_initiator_powerlvl TINYINT;
  DECLARE v_subject_powerlvl TINYINT;
  DECLARE v_is_active_role TINYINT;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;
  START TRANSACTION;

  SELECT MAX(fr.id), MAX(fr.fid), MAX(fr.factionlvl), MAX(f.name)
    INTO v_frid, v_fid, v_role_powerlvl, v_faction_name
  FROM FactionRoles fr INNER JOIN Factions f ON fr.fid = f.id
  WHERE fr.uuid = UUID_TO_BIN(p_faction_role_uuid);

  IF v_fid IS NULL THEN
    ROLLBACK;
    SELECT 1 AS result;
  ELSEIF NOT EXISTS(
    SELECT 1 FROM UserFactions WHERE uid = p_initiator_uid AND fid = v_fid LIMIT 1
  ) THEN
    ROLLBACK;
    SELECT 2 AS result;
  ELSE
    SELECT IFNULL(MAX(factionlvl), 0) INTO v_initiator_powerlvl FROM FactionRoles fr
      INNER JOIN UserFactionRoles ufr ON ufr.frid = fr.id
    WHERE fr.fid = v_fid AND ufr.uid = p_initiator_uid;

    IF v_initiator_powerlvl < ${FACTION_PERMISSIONS.ASSIGN_ROLES} THEN
      ROLLBACK;
      SELECT 3 AS result;
    ELSEIF NOT EXISTS(
      SELECT 1 FROM UserFactions uf
        INNER JOIN UserFactionRoles ufr ON ufr.uid = uf.uid
      WHERE uf.uid = p_subject_uid AND uf.fid = v_fid AND ufr.frid = v_frid LIMIT 1
    ) THEN
      ROLLBACK;
      SELECT 4 AS result;
    ELSE
      SELECT IFNULL(MAX(factionlvl), 0) INTO v_subject_powerlvl FROM FactionRoles fr
        INNER JOIN UserFactionRoles ufr ON ufr.frid = fr.id
      WHERE fr.fid = v_fid AND ufr.uid = p_subject_uid;

      IF v_subject_powerlvl >= v_initiator_powerlvl AND p_initiator_uid != p_subject_uid THEN
        ROLLBACK;
        SELECT 5 AS result;
      ELSEIF v_role_powerlvl >= ${FACTION_PERMISSIONS.SOVEREIGN} AND NOT EXISTS(
        SELECT 1 FROM UserFactionRoles WHERE uid != p_subject_uid AND frid = v_frid
      ) THEN
        ROLLBACK;
        SELECT 6 AS result;
      ELSE
        DELETE FROM UserFactionRoles WHERE uid = p_subject_uid AND frid = v_frid;

        UPDATE Profiles SET activeRole = NULL WHERE uid = p_subject_uid AND activeRole = v_frid;
        SET v_is_active_role = (ROW_COUNT() > 0);

        UPDATE FactionRoles SET memberCount = memberCount - 1 WHERE id = v_frid;

        COMMIT;
        SELECT 0 AS result, v_is_active_role AS hadRoleActive, v_faction_name AS factionName;
      END IF;
    END IF;
  END IF;
END`,
    CREATE_FACTION_INVITE: `CREATE PROCEDURE IF NOT EXISTS CREATE_FACTION_INVITE(IN p_initiator_uid INT UNSIGNED, IN p_faction_name VARCHAR(32) CHARACTER SET ascii, IN p_midId VARCHAR(16) CHARACTER SET ascii, IN p_flags TINYINT UNSIGNED, IN p_expires DATETIME) NOT DETERMINISTIC MODIFIES SQL DATA
BEGIN
  DECLARE v_fid BIGINT UNSIGNED;
  DECLARE v_initiator_powerlvl TINYINT;
  DECLARE v_invite_count INT UNSIGNED;

  SELECT MAX(id) INTO v_fid FROM Factions WHERE name = p_faction_name;

  IF v_fid IS NULL THEN
    SELECT 1 AS result;
  ELSEIF NOT EXISTS(
    SELECT 1 FROM UserFactions WHERE uid = p_initiator_uid AND fid = v_fid LIMIT 1
  ) THEN
    SELECT 2 AS result;
  ELSE
    SELECT IFNULL(MAX(factionlvl), 0) INTO v_initiator_powerlvl FROM FactionRoles fr
      INNER JOIN UserFactionRoles ufr ON ufr.frid = fr.id
    WHERE fr.fid = v_fid AND ufr.uid = p_initiator_uid;

    SELECT COUNT(*) INTO v_invite_count FROM FactionRoles WHERE fid = v_fid;

    IF v_initiator_powerlvl < ${FACTION_PERMISSIONS.MANAGE_INVITES} THEN
      SELECT 3 AS result;
    ELSEIF v_invite_count >= ${MAX_INVITES_PER_FACTION} THEN
      SELECT 4 AS result;
    ELSEIF EXISTS(
      SELECT 1 FROM FactionInvites WHERE midId = p_midId
    ) THEN
      SELECT 5 AS result;
    ELSE
      INSERT INTO FactionInvites (
        fid, midId, flags, expires, used, createdAt
      ) VALUES (
        v_fid, p_midId, p_flags, p_expires, 0, NOW()
      );
      SELECT 0 AS result;
    END IF;
  END IF;
END`,
    DELETE_FACTION_INVITE: `CREATE PROCEDURE IF NOT EXISTS DELETE_FACTION_INVITE(IN p_initiator_uid INT UNSIGNED, IN p_midId VARCHAR(16) CHARACTER SET ascii) NOT DETERMINISTIC MODIFIES SQL DATA
BEGIN
  DECLARE v_fid BIGINT UNSIGNED;
  DECLARE v_initiator_powerlvl TINYINT;

  SELECT MAX(fid) INTO v_fid FROM FactionInvites WHERE midId = p_midId;

  IF v_fid IS NULL THEN
    SELECT 1 AS result;
  ELSEIF NOT EXISTS(
    SELECT 1 FROM UserFactions WHERE uid = p_initiator_uid AND fid = v_fid LIMIT 1
  ) THEN
    SELECT 2 AS result;
  ELSE
    SELECT IFNULL(MAX(factionlvl), 0) INTO v_initiator_powerlvl FROM FactionRoles fr
      INNER JOIN UserFactionRoles ufr ON ufr.frid = fr.id
    WHERE fr.fid = v_fid AND ufr.uid = p_initiator_uid;

    IF v_initiator_powerlvl < ${FACTION_PERMISSIONS.MANAGE_INVITES} THEN
      SELECT 3 AS result;
    ELSE
      DELETE FROM FactionInvites WHERE midId = p_midId;
      SELECT 0 AS result;
    END IF;
  END IF;
END`,
    JOIN_FACTION: `CREATE PROCEDURE IF NOT EXISTS JOIN_FACTION(
  IN p_uid INT UNSIGNED,
  IN p_ipString VARCHAR(39),
  IN p_fid BIGINT UNSIGNED,
  IN p_faction_name VARCHAR(32) CHARACTER SET ascii,
  IN p_invite_id BIGINT UNSIGNED,
  IN p_is_on_time_invite TINYINT UNSIGNED
) NOT DETERMINISTIC MODIFIES SQL DATA
BEGIN
  DECLARE v_ip VARBINARY(8);
  DECLARE v_joined_count INT UNSIGNED;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;
  SET v_ip = IP_TO_BIN(p_ipString);

  START TRANSACTION;

  SELECT COUNT(*) INTO v_joined_count FROM UserFactions WHERE uid = p_uid;
  IF v_joined_count >= ${MAX_FACTIONS_PER_USER} THEN
    SELECT 2 AS result;
    ROLLBACK;
  ELSEIF EXISTS(
    SELECT 1 FROM FactionBans fb
      LEFT JOIN UserFactionBans ufb ON ufb.bid = fb.id AND ufb.uid = p_uid
      LEFT JOIN IPFactionBans ifb ON ifb.bid = fb.id AND ifb.ip = v_ip
    WHERE fb.fid = p_fid AND (fb.expires > NOW() OR fb.expires IS NULL) AND (ufb.uid IS NOT NULL OR ifb.ip IS NOT NULL)
    LIMIT 1
  ) THEN
    SELECT 3 AS result;
    ROLLBACK;
  ELSEIF EXISTS(
    SELECT 1 FROM UserFactions WHERE uid = p_uid AND fid = p_fid
  ) THEN
    SELECT 4 AS result;
    ROLLBACK;
  ELSEIF EXISTS(
    SELECT 1 FROM Factions WHERE id = p_fid AND memberCount >= 10000
  ) THEN
    SELECT 5 AS result;
    ROLLBACK;
  ELSE
    INSERT INTO UserFactions (uid, fid, joined) VALUES (p_uid, p_fid, NOW());
    INSERT INTO UserFactionRoles (uid, frid)
      SELECT p_uid, fr.id FROM FactionRoles fr WHERE fr.fid = p_fid AND (fr.flags & ${0x01 << FACTION_ROLE_FLAGS.DEFAULT}) != 0;
    INSERT INTO UserChannels (uid, cid, lastRead)
      SELECT p_uid, f.cid, NOW() FROM Factions f WHERE f.id = p_fid AND f.cid IS NOT NULL;

    UPDATE FactionRoles SET memberCount = memberCount + 1
    WHERE EXISTS (
      SELECT 1 FROM UserFactionRoles ufr WHERE ufr.frid = FactionRoles.id AND ufr.uid = p_uid
    ) AND fid = p_fid;
    UPDATE Factions SET memberCount = memberCount + 1 WHERE id = p_fid;

    IF p_invite_id IS NOT NULL THEN
      IF p_is_on_time_invite != 0 THEN
        DELETE FROM FactionInvites WHERE id = p_invite_id;
      ELSE
        UPDATE FactionInvites SET used = used + 1 WHERE id = p_invite_id;
      END IF;
    END IF;

    COMMIT;
    SELECT 0 AS result, p_faction_name AS factionName;
  END IF;
END`,
    JOIN_FACTION_PUBLIC: `CREATE PROCEDURE IF NOT EXISTS JOIN_FACTION_PUBLIC(IN p_uid INT UNSIGNED, IN p_ipString VARCHAR(39), IN p_faction_name VARCHAR(32) CHARACTER SET ascii) NOT DETERMINISTIC MODIFIES SQL DATA
BEGIN
  DECLARE v_fid BIGINT UNSIGNED;

  SELECT MAX(id) INTO v_fid FROM Factions WHERE name = p_faction_name;
  IF v_fid IS NULL THEN
    SELECT 1 AS result;
  ELSEIF EXISTS(
    SELECT 1 FROM Factions WHERE id = v_fid AND (flags & ${0x01 << FACTION_FLAGS.PUBLIC}) = 0
  ) THEN
    SELECT 6 AS result;
  ELSE
    CALL JOIN_FACTION(p_uid, p_ipString, v_fid, p_faction_name, NULL, NULL);
  END IF;
END`,
    JOIN_FACTION_WITH_INVITE: `CREATE PROCEDURE IF NOT EXISTS JOIN_FACTION_WITH_INVITE(IN p_uid INT UNSIGNED, IN p_ipString VARCHAR(39), IN p_invite_midId VARCHAR(16) CHARACTER SET ascii) NOT DETERMINISTIC MODIFIES SQL DATA
BEGIN
  DECLARE v_fid BIGINT UNSIGNED;
  DECLARE v_iid BIGINT UNSIGNED;
  DECLARE v_faction_name VARCHAR(32) CHARACTER SET ascii;
  DECLARE v_is_on_time_invite TINYINT UNSIGNED;

  SELECT MAX(i.fid), MAX(f.name), MAX(i.id), (MAX(i.flags) & ${0x01 << INVITE_FLAGS.ONE_TIME}) != 0
    INTO v_fid, v_faction_name, v_iid, v_is_on_time_invite
  FROM FactionInvites i
    INNER JOIN Factions f ON f.id = i.fid
  WHERE midId = p_invite_midId;

  IF v_fid IS NULL THEN
    SELECT 1 AS result;
  ELSE
    CALL JOIN_FACTION(p_uid, p_ipString, v_fid, v_faction_name, v_iid, v_is_on_time_invite);
  END IF;
END`,
    LEAVE_FACTION: `CREATE PROCEDURE IF NOT EXISTS LEAVE_FACTION(IN p_uid INT UNSIGNED, IN p_faction_name VARCHAR(32) CHARACTER SET ascii) NOT DETERMINISTIC MODIFIES SQL DATA
BEGIN
  DECLARE v_fid BIGINT UNSIGNED;
  DECLARE v_is_active_role TINYINT;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;
  START TRANSACTION;

  SELECT MAX(id) INTO v_fid FROM Factions WHERE name = p_faction_name;
  IF v_fid IS NULL THEN
    SELECT 1 AS result;
    ROLLBACK;
  ELSEIF NOT EXISTS(
    SELECT 1 FROM UserFactionRoles ufr
      INNER JOIN FactionRoles fr ON ufr.frid = fr.id
    WHERE fr.fid = v_fid AND ufr.uid != p_uid AND fr.factionlvl >= ${FACTION_PERMISSIONS.SOVEREIGN} LIMIT 1
  ) THEN
    SELECT 2 AS result;
    ROLLBACK;
  ELSE
    DELETE FROM UserFactions WHERE uid = p_uid AND fid = v_fid;
    IF ROW_COUNT() > 0 THEN
      UPDATE FactionRoles SET memberCount = memberCount - 1
      WHERE EXISTS (
        SELECT 1 FROM UserFactionRoles ufr WHERE ufr.frid = FactionRoles.id AND ufr.uid = p_uid LIMIT 1
      ) AND fid = v_fid;
      UPDATE Factions SET memberCount = memberCount - 1 WHERE id = v_fid;

      UPDATE Profiles SET activeRole = NULL WHERE uid = p_uid AND EXISTS(
        SELECT 1 FROM FactionRoles fr WHERE fr.id = Profiles.activeRole AND fr.fid = v_fid LIMIT 1
      );
      SET v_is_active_role = (ROW_COUNT() > 0);

      DELETE uc FROM UserChannels uc
        INNER JOIN Factions f ON f.cid = uc.cid
      WHERE uc.uid = p_uid AND f.id = v_fid;
      DELETE ufr FROM UserFactionRoles ufr
        INNER JOIN FactionRoles fr ON fr.id = ufr.frid
      WHERE ufr.uid = p_uid  AND fr.fid = v_fid;
    END IF;
    COMMIT;
    SELECT 0 AS result, v_is_active_role as hadRoleActive;
  END IF;
END`,
    /**
     * Delete all DMs of user
     * first result set is dmuid, cid of other affected users
     * @param p_uid user id
     */
    DELETE_USER_DMS: `CREATE PROCEDURE IF NOT EXISTS DELETE_USER_DMS(IN p_uid INT UNSIGNED) NOT DETERMINISTIC MODIFIES SQL DATA
BEGIN
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    DROP TEMPORARY TABLE IF EXISTS temp_dm_channels;
    RESIGNAL;
  END;

  DROP TEMPORARY TABLE IF EXISTS temp_dm_channels;
  CREATE TEMPORARY TABLE temp_dm_channels (
    cid INT UNSIGNED PRIMARY KEY,
    dmuid INT UNSIGNED
  );

  INSERT INTO temp_dm_channels (dmuid, cid)
    SELECT uc.uid AS dmuid, uc.cid FROM UserChannels uc
    WHERE uc.cid IN (
      SELECT DISTINCT c.id FROM Channels c
        INNER JOIN UserChannels uci ON uci.cid = c.id
      WHERE c.type = ${CHANNEL_TYPES.DM} AND uci.uid = p_uid
    ) AND uc.uid != p_uid;

  DELETE FROM Channels WHERE id IN (SELECT cid FROM temp_dm_channels);

  SELECT cid, dmuid FROM temp_dm_channels;
  DROP TEMPORARY TABLE IF EXISTS temp_dm_channels;
END`,
    /**
     * Deleting User
     * - delete DM channels and return affected dmuid, cid in first result set
     * - delete factions that only have this user and nobody else
     * - elevate best other user if deleted user is last sovereign
     * - correct member count of factions the user was a member in
     * - delete user
     * @param p_uid user id
     */
    DELETE_USER: `CREATE PROCEDURE IF NOT EXISTS DELETE_USER(IN p_uid INT UNSIGNED) NOT DETERMINISTIC MODIFIES SQL DATA
BEGIN
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;
  START TRANSACTION;

  CALL DELETE_USER_DMS(p_uid);

  DELETE FROM Channels WHERE id IN (
    SELECT f.cid FROM Factions f
      INNER JOIN UserFactions uf ON uf.fid = f.id
    WHERE uf.uid = p_uid AND NOT EXISTS(
      SELECT 1 FROM UserFactions uff WHERE uff.uid != p_uid AND uff.fid = f.id
    )
  );

  INSERT INTO UserFactionRoles (uid, frid)
    SELECT (
      SELECT ufr.uid FROM UserFactionRoles ufr
        INNER JOIN FactionRoles fr ON ufr.frid = fr.id
        INNER JOIN UserFactions uf ON uf.uid = ufr.uid AND uf.fid = fr.fid
      WHERE fr.fid = t.fid AND ufr.uid != p_uid AND uf.joined IS NOT NULL
      ORDER BY fr.factionlvl DESC, uf.joined ASC LIMIT 1
    ), (
      SELECT frs.id FROM FactionRoles frs WHERE frs.fid = t.fid AND frs.factionlvl >= ${FACTION_PERMISSIONS.SOVEREIGN} LIMIT 1
    ) FROM (
      SELECT DISTINCT fr.fid FROM FactionRoles fr
        INNER JOIN UserFactionRoles ufr ON ufr.frid = fr.id
      WHERE ufr.uid = p_uid AND fr.factionlvl >= ${FACTION_PERMISSIONS.SOVEREIGN} AND NOT EXISTS(
        SELECT 1 FROM UserFactionRoles uffr
          INNER JOIN FactionRoles ffr ON uffr.frid = ffr.id
        WHERE ffr.fid = fr.fid AND uffr.uid != p_uid AND ffr.factionlvl >= ${FACTION_PERMISSIONS.SOVEREIGN} LIMIT 1
      )
    ) AS t;

  UPDATE FactionRoles SET memberCount = memberCount - 1
  WHERE EXISTS (
    SELECT 1 FROM UserFactionRoles ufr WHERE ufr.frid = FactionRoles.id AND ufr.uid = p_uid
  );

  UPDATE Factions SET memberCount = memberCount - 1
  WHERE EXISTS (
    SELECT 1 FROM UserFactions uf WHERE uf.fid = Factions.id AND uf.uid = p_uid
  );

  DELETE FROM Users WHERE id = p_uid;

  COMMIT;
END`,
    TRANSFER_FACTION: `CREATE PROCEDURE IF NOT EXISTS TRANSFER_FACTION(
  p_faction_name VARCHAR(32) CHARACTER SET ascii,
  IN p_uid INT UNSIGNED
) NOT DETERMINISTIC MODIFIES SQL DATA
BEGIN
  DECLARE v_fid BIGINT UNSIGNED;
  DECLARE v_sovereign_frid BIGINT UNSIGNED;
  DECLARE v_old_uid INT UNSIGNED;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;
  START TRANSACTION;

  SELECT MAX(fr.fid), MAX(fr.id), MAX(ufr.uid)
  INTO v_fid, v_sovereign_frid, v_old_uid FROM FactionRoles fr
    INNER JOIN Factions f ON f.id = fr.fid
    LEFT JOIN UserFactionRoles ufr ON ufr.frid = fr.id
  WHERE f.name = p_faction_name AND fr.factionlvl >= ${FACTION_PERMISSIONS.SOVEREIGN};

  IF v_sovereign_frid IS NOT NULL THEN
    UPDATE Profiles SET activeRole = NULL WHERE activeRole = v_sovereign_frid;
    DELETE FROM UserFactions WHERE fid = v_fid AND EXISTS(
      SELECT 1 FROM UserFactionRoles WHERE frid = v_sovereign_frid AND uid = UserFactions.uid
    );
    DELETE FROM UserFactionRoles WHERE frid = v_sovereign_frid;
    INSERT INTO UserFactionRoles (uid, frid) VALUES (p_uid, v_sovereign_frid);
    INSERT IGNORE INTO UserFactions (uid, fid, joined, flags) VALUES (p_uid, v_fid, NOW(), 0);
  END IF;
  COMMIT;
END`,
    GET_CLOSE_IMAGE: `CREATE PROCEDURE IF NOT EXISTS GET_CLOSE_IMAGE(IN p_pHash CHAR(16)) READS SQL DATA
BEGIN
  DECLARE i_pHash BIGINT UNSIGNED;
  SET i_pHash = CONV(p_pHash, 16, 10);
  SELECT extension, shortId, type, width, height, avgColor FROM ImageHashes ih
    INNER JOIN Media m ON m.id = ih.mid
  WHERE BIT_COUNT(pHash ^ i_pHash) < 2 LIMIT 1;
END`,
    GET_CLOSE_BANNED_IMAGE: `CREATE PROCEDURE IF NOT EXISTS GET_CLOSE_BANNED_IMAGE(IN p_pHash CHAR(16)) READS SQL DATA
BEGIN
  DECLARE i_pHash BIGINT UNSIGNED;
  SET i_pHash = CONV(p_pHash, 16, 10);
  SELECT BIN_TO_UUID(uuid) AS mbid, LOWER(HEX(hash)) AS hash, reason FROM MediaBans WHERE BIT_COUNT(pHash ^ i_pHash) < 9 LIMIT 1;
END`,
  };

  const funcVersion = 25;
  const curVersion = Number((await sequelize.query('SELECT value FROM Configs WHERE `key`=\'functions_version\''))[0]?.[0]?.value);
  const doUpgrade = funcVersion !== curVersion;
  if (doUpgrade) {
    console.log('Upgrading Procedures');
  }

  const isMariaDB = (await sequelize.query('SELECT VERSION() AS version'))[0][0].version.includes('MariaDB');
  if (!isMariaDB) {
    /* those functions are native to MySQL 8+ */
    delete functions.UUID_TO_BIN;
    delete functions.BIN_TO_UUID;
  }

  try {
    if (alter || doUpgrade) {
      console.log('Dropping old SQL functions and procedures');
      await Promise.all(Object.entries(functions).map(([name, func]) => {
        if (func.includes('PROCEDURE')) {
          return sequelize.query(`DROP PROCEDURE IF EXISTS ${name}`, { raw: true });
        } if (func.includes('FUNCTION')) {
          return sequelize.query(`DROP FUNCTION IF EXISTS ${name}`, { raw: true });
        }
        return null;
      }));
      await sequelize.query(`INSERT INTO Configs (\`key\`, value) VALUES ('functions_version', ${funcVersion}) ON DUPLICATE KEY UPDATE value = VALUES(value)`);
    }
  } catch (err) {
    throw new Error(`Error on cleaning SQL Functions: ${err.message}`);
  }

  for (const [name, func] of Object.entries(functions)) {
    console.log(`Loading ${name}...`);
    try {
      // eslint-disable-next-line no-await-in-loop
      await sequelize.query(func);
    } catch (error) {
      throw new Error(`Error on creating SQL Function ${name}: ${error.message}\n${func}`);
    }
  }
};

export default sequelize;
