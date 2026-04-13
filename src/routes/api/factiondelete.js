/*
 * delete a faction
 */
import logger from '../../core/logger.js';
import socketEvents from '../../socket/socketEvents.js';
import { deleteFaction, getFactionLvlOfUser } from '../../data/sql/Faction.js';
import { FACTION_PERMISSIONS } from '../../core/constants.js';

export default async function factiondelete(req, res) {
  req.tickRateLimiter(10000);
  const { user, body: { fid } } = req;

  if (!fid || typeof fid !== 'string') {
    throw new Error('No faction given');
  }
  const { sqlFid, powerlvl } = await getFactionLvlOfUser(user.id, fid);
  if (!sqlFid) {
    throw new Error('This faction does not exist or you are not a member');
  }
  if (!powerlvl || powerlvl < FACTION_PERMISSIONS.DELETE_FACTION) {
    throw new Error('Insufficient permissions on this faction');
  }

  const affectedUsers = await deleteFaction(sqlFid);
  if (!affectedUsers.length) {
    throw new Error('Could not delete faction');
  }

  const profilePatch = {
    op: 'del',
    path: `factions[fid:${fid}]`,
  };
  socketEvents.patchUserState(affectedUsers, 'profile', profilePatch);

  logger.info(`User ${user.id} deleted faction ${fid}`);
  res.json({
    status: 'ok',
    profilePatch,
  });
}
