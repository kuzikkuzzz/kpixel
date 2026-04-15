/*
 *
 * starts a DM session
 *
 */
import logger from '../../core/logger.js';
import socketEvents from '../../socket/socketEvents.js';
import {
  isUserBlockedBy,
} from '../../data/sql/association_models/UserBlock.js';
import { findUserByIdOrName } from '../../data/sql/User.js';
import { createDMChannel } from '../../data/sql/Channel.js';
import { getAvatarById } from '../../data/sql/Profile.js';
import { USER_FLAGS } from '../../core/constants.js';

async function startDm(req, res) {
  req.tickRateLimiter(5000);
  let userId = parseInt(req.body.userId, 10);
  let { userName } = req.body;
  const { user } = req;

  const errors = [];
  if (userId) {
    if (userId && Number.isNaN(userId)) {
      errors.push('Invalid userId');
    }
  }
  if (!userName && !userId) {
    errors.push('No userId or userName defined');
  }
  if (userId && user.id === userId) {
    errors.push('You can not  DM yourself.');
  }
  if (errors.length) {
    res.status(400);
    res.json({
      errors,
    });
    return;
  }

  const targetUser = await findUserByIdOrName(userId, userName);
  if (!targetUser) {
    res.status(401);
    res.json({
      errors: ['Target user does not exist'],
    });
    return;
  }
  userId = targetUser.id;
  userName = targetUser.name;

  if (targetUser.flags & (0x01 << USER_FLAGS.BLOCK_DM)) {
    res.status(401);
    res.json({
      errors: [`${userName} doesn't allow DMs`],
    });
    return;
  }

  if (await isUserBlockedBy(userId, user.id)) {
    res.status(401);
    res.json({
      errors: [`${userName} has blocked you.`],
    });
    return;
  }

  logger.info(
    `Creating DM Channel between ${user.name} and ${userName}`,
  );

  const [channelId] = await createDMChannel(user.id, userId);

  if (channelId) {
    socketEvents.reloadUser(user.id);
    socketEvents.reloadUser(userId);
  } else {
    throw new Error(`Couldn't create a DM with ${userName}, try again later.`);
  }

  const avatarId = await getAvatarById(userId);

  const ts = Date.now();

  res.json({
    status: 'ok',
    channel: [
      channelId,
      userName,
      ts,
      ts,
      false,
      avatarId,
    ],
  });
}

export default startDm;
