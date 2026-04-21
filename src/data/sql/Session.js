import pool from './mariadb.js';
import { nestQuery } from './utils.js';
import { generateToken, generateTokenHash } from '../../utils/hash.js';
import { HOUR, CHANNEL_TYPES } from '../../core/constants.js';

/**
 * create session for a user
 * @param uid id of user
 * @param durationHours how long session is valid in hours or null for permanent
 * @param ip ip to store in the session
 * @return [
 *    null | token: session token,
 *   newLocation: boolean
 * ]
 */
export async function createSession(
  uid, durationHours, ip = null, device = null,
) {
  if (durationHours !== null && !durationHours) {
    /*
     * if we have a duration of 0, which would be a cookie that deletes on
     * browser close, we still store it for two days, cause we don't know when
     * a browser closes
     */
    durationHours = 48;
  }

  let conn;
  try {
    conn = await pool.getConnection();

    /*
     * make sure ip and device are parsed
     */
    const [deviceId] = await Promise.all([
      device?.getDeviceId(),
      ip?.getAllowance(),
    ]);
    /*
     * limit the amount of open sessions a user can have, and check if new
     * location
     */
    const openSessions = await conn.query(
      // eslint-disable-next-line max-len
      'SELECT country FROM Sessions WHERE uid = ? AND (expires > NOW() OR expires IS NULL)',
      [uid],
    );
    let newLocation = false;
    if (openSessions.length > 0) {
      if (openSessions.length > 50) {
        await conn.query(
          `DELETE t FROM Sessions t JOIN (
    SELECT id FROM Sessions WHERE uid = ? ORDER BY id ASC LIMIT 5
  ) AS oldest ON t.id = oldest.id`,
          [uid],
        );
      }
      newLocation = !openSessions.some(({ country }) => country === ip.country);
    }

    const token = generateToken();
    // eslint-disable-next-line max-len
    const expires = durationHours && new Date(Date.now() + durationHours * HOUR);

    await conn.query(
      // eslint-disable-next-line max-len
      'INSERT INTO Sessions (uid, token, expires, ip, country, did, createdAt) VALUES (?,?,?,IP_TO_BIN(?),?,?, NOW())', [
        uid, generateTokenHash(token), expires,
        ip?.ipString, ip?.country || 'xx', deviceId,
      ],
    );
    return [token, newLocation];
  } catch (error) {
    console.error(`SQL Error on createSession: ${error.message}`);
  } finally {
    if (conn) conn.release();
  }
  return [null, false];
}

/**
 * remove session
 * @param token
 * @return boolean success
 */
export async function removeSession(token) {
  if (!token) {
    return false;
  }
  try {
    const { affectedRows } = await pool.query(
      'DELETE FROM Sessions WHERE token = ?', [generateTokenHash(token)],
    );
    return affectedRows !== 0;
  } catch (error) {
    console.error(`SQL Error on removeSession: ${error.message}`);
  }
  return false;
}

/**
 * remove session by id
 * @param id session id
 * @param uid user id
 * @return boolean success
 */
export async function removeSessionById(id, uid) {
  if (!id) {
    return false;
  }
  try {
    const { affectedRows } = await pool.query(
      'DELETE FROM Sessions WHERE id = ? AND uid = ?', [id, uid],
    );
    return affectedRows !== 0;
  } catch (error) {
    console.error(`SQL Error on removeSessionById: ${error.message}`);
  }
  return false;
}

/**
 * resolve only uid of session of given token
 * @param token
 * @return uid: number | null
 */
export async function resolveSessionUid(token) {
  if (!token) {
    return null;
  }
  try {
    const [session] = await pool.query(
      // eslint-disable-next-line max-len
      'SELECT uid FROM Sessions WHERE token = ? AND (expires > NOW() OR expires IS NULL)',
      [generateTokenHash(token)],
    );
    if (session) {
      return session.uid;
    }
  } catch (error) {
    console.error(`SQL Error on resolveSessionUid: ${error.message}`);
  }
  return null;
}

/**
 * resolve uid and age of session of given token in seconds
 * Additionally return if a user is valid for oauth login, which currently
 * only means that a username must be set.
 * @param token
 * @return [uid: number | null, age: number | null, isValid: boolean]
 */
export async function resolveSessionUidAndAge(token) {
  if (!token) {
    return [null, null];
  }
  try {
    const [session] = await pool.query(
      // eslint-disable-next-line max-len
      `SELECT s.uid, s.createdAt, u.username NOT LIKE 'pp\\_%' AS isValid FROM Sessions s
  INNER JOIN Users u ON u.id = s.uid
WHERE token = ? AND (expires > NOW() OR expires IS NULL)`,
      [generateTokenHash(token)],
    );
    if (session) {
      return [
        session.uid,
        Math.floor(session.createdAt.getTime() / 1000),
        !!session.isValid,
      ];
    }
  } catch (error) {
    console.error(`SQL Error on resolveSessionUidAndAge: ${error.message}`);
  }
  return [null, null];
}

/**
 * resolve a session for a given token
 * @param token
 * @return null | {
 *   id,
 *   name,
 *   password,
 *   userlvl,
 *   flags,
 *   lastSeen,
 *   createdAt,
 *   customFlag,
 *   customRoleFlagId,
 *   activeFactionId,
 *   blocked: [ { id, name }, ...],
 *   bans: [ { expires, flags }, ... ],
 *   channels: {
 *     cid: [ name, type, lastTs, [dmuid] ],
 *     ...
 *   },
 * }
 */
export async function resolveSession(token) {
  if (!token) {
    return null;
  }

  let conn;
  try {
    conn = await pool.getConnection();
    /*
     * CURRENT STATUS:
     * Resolving a session takes two round-trip-times of:
     *  1 + 3 queries if User has any DM chat channels associated
     *  1 + 2 queries otherwise
     * Consider that in api/me we also get redis ranks after resolving session,
     * making a api/me call have three round-trips.
     * Resolving IP intel (whois, proxycheck) is in parallel to resolving the
     * session and takes longer than two sql round-trips if it has to be
     * fetched. Therefore session resolving isn't the largest issue in case of
     * a DDoS with unique IPs.
     */

    /* eslint-disable max-len */

    let user = await conn.query(
      `SELECT u.id, u.name, u.username, u.password, u.userlvl, u.flags, u.lastSeen, u.createdAt,
p.customFlag,
CONCAT(a.shortId, ':', a.extension) AS avatarId,
CONCAT(frm.shortId, ':', frm.extension) AS customRoleFlagId,
fr.fid AS activeFactionId,
c.id AS 'channels.cid', c.name AS 'channels.name', c.\`type\` AS 'channels.type', c.lastMessage AS 'channels.lastDate', ucm.lastRead AS 'channels.lastReadDate', ucm.muted AS 'channels.muted' FROM Users u
  INNER JOIN Sessions s ON s.uid = u.id
  LEFT JOIN Profiles p ON p.uid = u.id
  LEFT JOIN Media a ON a.id = p.avatar
  LEFT JOIN FactionRoles fr ON fr.id = p.activeRole
  LEFT JOIN Media frm ON frm.id = fr.customFlag
  LEFT JOIN UserChannels ucm ON ucm.uid = u.id
  LEFT JOIN Channels c ON c.id = ucm.cid
WHERE s.token = ? AND (s.expires > NOW() OR s.expires IS NULL)`,
      [generateTokenHash(token)],
    );
    /*
     * {
     *   id, name, password, userlvl, flags, lastSeen, createdAt, customFlag,
     *   channels: [{
     *     cid, name, type, lastDate,
     *   }, ...]
     * }
     */
    user = nestQuery(user);

    if (!user) {
      return null;
    }
    const promises = [];
    const userId = user.id;

    /* get info to DM channels */
    const dmChannelIds = user.channels.filter(
      ({ type }) => type === CHANNEL_TYPES.DM,
    ).map(({ cid }) => cid);
    if (dmChannelIds.length) {
      promises.push(conn.query(
        // eslint-disable-next-line max-len
        `SELECT uc.cid, dmu.name AS 'dmname', CONCAT(a.shortId, ':', a.extension) AS avatarId FROM UserChannels uc
    INNER JOIN Users dmu ON dmu.id = uc.uid
    LEFT JOIN Profiles p ON p.uid = dmu.id
    LEFT JOIN Media a ON a.id = p.avatar
  WHERE dmu.id != ? AND uc.cid IN (?)`,
        [userId, dmChannelIds],
      ));
    } else {
      promises.push([]);
    }

    /* get info to factions */
    if (user.channels.some(({ type }) => type === CHANNEL_TYPES.FACTION)) {
      promises.push(conn.query(
        // eslint-disable-next-line max-len
        `SELECT CONCAT(a.shortId, ':', a.extension) AS avatarId, f.cid FROM UserFactions uf
    INNER JOIN Factions f ON f.id = uf.fid
    INNER JOIN Media a ON a.id = f.avatar
  WHERE uf.uid = ?`,
        [userId],
      ));
    } else {
      promises.push([]);
    }

    /* get blocked users */
    promises.push(conn.query(
      `SELECT bu.id, bu.name FROM UserBlocks ub
  INNER JOIN Users bu ON bu.id = ub.buid
WHERE ub.uid = ?`,
      [userId],
    ));

    /* get bans applying on user id or tpid */
    promises.push(conn.query(
      `SELECT b.expires, b.flags FROM Bans b WHERE b.id IN (
  SELECT DISTINCT b.id FROM (
    SELECT ub.bid AS id FROM UserBans ub WHERE ub.uid = ?
    UNION ALL
    SELECT tb.bid AS id FROM ThreePIDBans tb INNER JOIN ThreePIDs t ON tb.tid = t.id WHERE t.uid = ?
  ) AS b
) AND (b.expires > NOW() OR b.expires IS NULL)`,
      [userId, userId],
    ));

    /* eslint-enable max-len */

    const [
      dmChannels, factionAvatars, blocked, bans,
    ] = await Promise.all(promises);

    /*
     * dmChannels:
     *   [{ cid, dmname, muted, avatarId }, ...]
     * user.channels:
     *   [{ cid, name, type, lastDate, lastReadDate }, ...]
     * target user.channels:
     *   { PUBLIC: [[cid, name, lastTs, lastReadTs, muted, avatarIdOrCc], ...], ... }
     */
    if (user.channels.length) {
      const { channels } = user;
      user.channels = {};
      let i = channels.length;
      while (i > 0) {
        i -= 1;
        const { cid, name, type, lastDate, lastReadDate, muted } = channels[i];
        const channel = [
          // eslint-disable-next-line max-len
          cid, name, lastDate.getTime(), lastReadDate.getTime(), muted === 1, null,
        ];
        if (type === CHANNEL_TYPES.DM) {
          /*
           * if it is a dm channel, set the name to the name of the other user
           */
          const dmChannel = dmChannels.find(({ cid: dmcid }) => dmcid === cid);
          if (!dmChannel) {
            console.error(
              // eslint-disable-next-line max-len
              `Session Error: User ${userId} has DM channel ${cid} but no other use associated`,
            );
            continue;
          }
          channel[1] = dmChannel.dmname;
          channel[5] = dmChannel.avatarId;
        }
        if (type === CHANNEL_TYPES.FACTION) {
          /*
           * populate avatar of faction channels
           */
          const factionAvatar = factionAvatars
            .find((f) => f.cid === cid)?.avatarId;
          if (factionAvatar) {
            channel[5] = factionAvatar;
          }
        }
        if (user.channels[type]) {
          user.channels[type].push(channel);
        } else {
          user.channels[type] = [channel];
        }
      }
    } else {
      user.channels = {};
    }

    /*
     * [{ id, name }]
     */
    user.blocked = blocked;

    /*
     * [{ expires, flags }]
     */
    user.bans = bans;

    return user;
  } catch (error) {
    console.error(`SQL Error on resolveSession: ${error.message}`);
  } finally {
    if (conn) conn.release();
  }
  return null;
}

/**
 * get all Sessions for a User
 * @param userId
 * @return [{
 *   id: session id,
 *   token: session token,
 *   country,
 *   os,
 *   browser,
 * }, ...]
 */
export async function getAllSessionsOfUser(userId) {
  if (userId) {
    try {
      return await pool.query(
        `SELECT s.id, s.token, s.country, d.os, d.browser FROM Sessions s
    LEFT JOIN Devices d ON d.id = s.did
  WHERE s.uid = ? AND (s.expires > NOW() OR s.expires IS NULL)`,
        [userId],
      );
    } catch (error) {
      console.error(`SQL Error on getAllSessionsOfUser: ${error.message}`);
    }
  }
  return [];
}
