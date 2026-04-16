/*
 *
 * starts a DM session
 *
 */

import logger from '../../core/logger.js';
import socketEvents from '../../socket/socketEvents.js';
import {
  leaveChannel,
} from '../../data/sql/Channel.js';

async function leaveChan(req, res) {
  req.tickRateLimiter(4000);
  const channelId = parseInt(req.body.channelId, 10);
  const { user, ttag: { t } } = req;

  if (Number.isNaN(channelId)) {
    res.status(400).json({
      errors: ['Invalid channelId'],
    });
    return;
  }

  const affectedUsers = await leaveChannel(user.id, channelId);

  if (!affectedUsers) {
    res.status(401).json({
      errors: [t`Could not leave this channel`],
    });
    return;
  }

  logger.info(
    `Removed user ${user.name} from channel ${channelId}`,
  );

  for (let i = 0; i < affectedUsers.length; i += 1) {
    socketEvents.reloadUser(affectedUsers[i]);
  }

  res.json({
    status: 'ok',
  });
}

export default leaveChan;
