/*
 * request password change
 */

import logger from '../../../core/logger.js';
import socketEvents from '../../../socket/socketEvents.js';
import { deleteUser } from '../../../data/sql/User.js';
import { deleteUserFromRanks } from '../../../data/redis/cooldown.js';
import { clearCookie } from '../../../middleware/session.js';

export default async (req, res) => {
  const { t } = req.ttag;

  const { user } = req;
  const dmChannels = await deleteUser(user.id);

  // eslint-disable-next-line max-len
  logger.info(`AUTH: Deleted user ${user.name}(${user.id}) by ${req.ip.ipString}`);
  if (!dmChannels) {
    res.status(500);
    res.json({
      errors: [t`Server error while deleting user.`],
    });
    return;
  }
  if (dmChannels.length) {
    dmChannels.forEach(({ dmuid }) => {
      socketEvents.reloadUser(dmuid);
    });
  }
  clearCookie(req, res);

  socketEvents.reloadUser(user.id);

  deleteUserFromRanks(user.id);

  res.json({
    success: true,
  });
};
