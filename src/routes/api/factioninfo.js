/*
 * print all informations about faction, except users
 *
 */
import {
  getFactionLvlOfUser, getFactionInfo,
} from '../../data/sql/Faction.js';

export default async function factionrolechange(req, res) {
  req.tickRateLimiter(1000);
  /* user can be undefined when not logged in */
  const { ttag: { t }, user, body: { fidOrName } } = req;

  if (!fidOrName || typeof fidOrName !== 'string') {
    throw new Error('No faction given');
  }

  const [{ powerlvl }, faction] = await Promise.all([
    (user) ? getFactionLvlOfUser(user.id, fidOrName) : { powerlvl: null },
    getFactionInfo(fidOrName),
  ]);

  if (!faction) {
    throw new Error(t`This faction does not exist`);
  }

  if (faction.isPrivate && powerlvl === null) {
    throw new Error(t`This faction is private`);
  }

  delete faction.sqlFid;
  delete faction.channelId;

  res.json({
    powerlvl,
    faction,
  });
}
