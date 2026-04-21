/*
 * Custom Roles of factions, those are like roles that the user can choose
 * from
 */
import pool from './mariadb.js';
import { getRandomShortId } from '../../core/utils.js';
import { INVITE_FLAGS } from '../../core/constants.js';


/**
 * create a new invite
 * @param initiatorUid user id of initiator
 * @param factionName name of faction
 * @param isOneTimeInvite boolean
 * @return [number, inviteId]
 *   0 success
 *   1 no such faction
 *   2 user not in faction
 *   3 user not allowed
 *   4 no more invites possible
 *   5 no free inviteId found
 *   -1 failure
 */
export async function createInvite(initiatorUid, factionName, isOneTimeInvite) {
  let flags = 0;
  if (isOneTimeInvite) {
    flags |= 0x01 << INVITE_FLAGS.ONE_TIME;
  }

  try {
    let midId;
    let result = 5;
    let retries = 5;
    while (result === 5 && retries > 0) {
      midId = getRandomShortId(10);
      retries -= 1;
      // eslint-disable-next-line no-await-in-loop
      [[{ result }]] = await pool.query(
        'CALL CREATE_FACTION_INVITE(?, ?, ?, ?, ?)',
        [initiatorUid, factionName, midId, flags, null],
      );
    }
    if (result || result === 0) {
      return [result, midId];
    }
  } catch (error) {
    console.error('SQL Error on createInvite:', error.message);
  }
  return [-1, null];
}

/**
 * delete a invite
 * @param initiatorUid user id of initiator
 * @param inviteId midId of invite
 * @return number
 *   0 success
 *   1 no such invite
 *   2 user not in faction
 *   3 user not allowed
 *   -1 failure
 */
export async function deleteInvite(initiatorUid, inviteId) {
  try {
    const [[{ result }]] = await pool.query(
      'CALL DELETE_FACTION_INVITE(?, ?)', [initiatorUid, inviteId],
    );
    if (result || result === 0) {
      return result;
    }
  } catch (error) {
    console.error('SQL Error on deleteInvite:', error.message);
  }
  return -1;
}

/**
 * use invite
 * @param uid user id of initiator
 * @param ipString ip of initiator
 * @param inviteId midId of invite
 * @return [number, factionName]
 *   0 success
 *   1 no such invite
 *   2 max factions reached
 *   3 banned
 *   4 already joined
 *   5 faction full
 *   6 faction not public
 *   -1 failure
 */
export async function consumeInvite(uid, ipString, inviteId) {
  try {
    const [[{ result, factionName }]] = await pool.query(
      'CALL JOIN_FACTION_WITH_INVITE(?, ?, ?)', [uid, ipString, inviteId],
    );
    if (result || result === 0) {
      return [result, factionName];
    }
  } catch (error) {
    console.error('SQL Error on consumeInvite:', error.message);
  }
  return [-1, null];
}

/**
 * get data of invite
 * @param inviteId invite id
 * @return {
 *   factionName,
 *   factionTitle,
 *   factionDescription,
 *   avatarId,
 *   memberCount,
 * } | null
 */
export async function getInviteData(inviteId) {
  try {
    const [model] = await pool.query(
      `SELECT f.name AS factionName, f.title AS factionTitle,
f.description AS factionDescription, f.memberCount,
CONCAT(a.shortId, ':', a.extension) AS avatarId FROM FactionInvites i
  INNER JOIN Factions f ON i.fid = f.id
  LEFT JOIN Media a ON a.id = f.avatar
WHERE i.midId = ? AND (i.expires IS NULL OR i.expires > NOW())`,
      [inviteId],
    );
    return model;
  } catch (error) {
    console.error('SQL Error on getInviteData:', error.message);
  }
  return null;
}

/**
 * get all invites of faction
 * @param sqlFid sql id of faction
 * @return [{
 *   id,
 *   isOneTime,
 *   createdAt,
 *   amountUsed,
 * }, ...]
 */
export async function getInviteInfo(sqlFid) {
  try {
    const models = await pool.query(
      // eslint-disable-next-line max-len
      `SELECT midId AS id, flags, used AS amountUsed, createdAt FROM FactionInvites
WHERE fid = ? AND (expires IS NULL OR expires > NOW())`,
      [sqlFid],
    );
    if (models) {
      for (let i = 0; i < models.length; i += 1) {
        const invite = models[i];
        // eslint-disable-next-line max-len
        invite.isOneTime = (invite.flags & (0x01 << INVITE_FLAGS.ONE_TIME)) !== 0;
        delete invite.flags;

        if (invite.createdAt) {
          invite.createdAt = invite.createdAt.toLocaleString();
        }
      }
      return models;
    }
  } catch (error) {
    console.error('SQL Error on getInvites:', error.message);
  }
  return [];
}
