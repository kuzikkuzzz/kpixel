/*
 * get profile information of user
 */
import { getFishesOfUser } from '../../data/sql/Fish.js';
import { getBadgesOfUser } from '../../data/sql/Badge.js';
import { getFactionsOfUser } from '../../data/sql/Faction.js';

export default async (req, res) => {
  req.tickRateLimiter(1000);
  const { user: { id: uid, nameData: { customFlag, avatarId } } } = req;
  const [
    fishes,
    badges,
    factionObject,
  ] = await Promise.all([
    getFishesOfUser(uid),
    getBadgesOfUser(uid),
    getFactionsOfUser(uid, true),
  ]);
  res.status(200).json({
    fishes,
    badges,
    ...factionObject,
    customFlag,
    avatarId,
  });
};
