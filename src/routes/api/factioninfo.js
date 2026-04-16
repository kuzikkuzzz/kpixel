/*
 * print all informations about faction, except users
 *
 */
import {
  getFactionLvlOfUser, getFactionInfo,
} from '../../data/sql/Faction.js';

export default async function factioninfo(req, res) {
  req.tickRateLimiter(1000);
  /* user can be undefined when not logged in */
  const { ttag: { t }, user, body: { name } } = req;

  if (!name || typeof name !== 'string') {
    throw new Error('No faction given');
  }

  const [{ powerlvl }, faction] = await Promise.all([
    (user) ? getFactionLvlOfUser(user.id, name) : { powerlvl: null },
    getFactionInfo(name),
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
