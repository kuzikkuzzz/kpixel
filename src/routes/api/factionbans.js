/*
 * print all informations about faction bans
 *
 */
import {
  getFactionLvlOfUser, getFactionBanInfo,
} from '../../data/sql/Faction.js';
import { FACTION_PERMISSIONS } from '../../core/constants.js';

export default async function factionrolechange(req, res) {
  req.tickRateLimiter(5000);
  /* user can be undefined when not logged in */
  const { ttag: { t }, user, body: { fidOrName } } = req;

  if (!fidOrName || typeof fidOrName !== 'string') {
    throw new Error('No faction given');
  }

  const { sqlFid, powerlvl } = await getFactionLvlOfUser(user.id, fidOrName);

  if (!sqlFid) {
    throw new Error(t`This faction does not exist`);
  }
  if (!powerlvl || powerlvl < FACTION_PERMISSIONS.UNBAN) {
    throw new Error('Insufficient permissions on this faction');
  }

  const bans = await getFactionBanInfo(sqlFid);
  if (!bans) {
    throw new Error(t`Server Error`);
  }

  res.json({
    /*
     * [{
     *   fbid,
     *   affects,
     *   createdBy,
     *   createdAt,
     *   reason,
     * },...]
     */
    bans,
  });
}
