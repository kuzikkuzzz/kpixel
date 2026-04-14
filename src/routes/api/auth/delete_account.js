/*
 * request password change
 */

import logger from '../../../core/logger.js';
import socketEvents from '../../../socket/socketEvents.js';
import { validatePassword } from '../../../utils/validation.js';
import { comparePasswordToHash } from '../../../utils/hash.js';
import { deleteUser } from '../../../data/sql/User.js';
import { deleteUserFromRanks } from '../../../data/redis/cooldown.js';
import { clearCookie } from '../../../middleware/session.js';

function validate(password, gettext) {
  const errors = [];

  if (password) {
    const passworderror = gettext(validatePassword(password));
    if (passworderror) errors.push(passworderror);
  }

  return errors;
}

export default async (req, res) => {
  const { password } = req.body;
  const { t, gettext } = req.ttag;
  const errors = await validate(password, gettext);
  if (errors.length > 0) {
    res.status(400);
    res.json({
      errors,
    });
    return;
  }

  const { user } = req;

  const currentPassword = user.data.password;
  if (currentPassword) {
    const err = comparePasswordToHash(password, currentPassword, t);
    if (err !== null) {
      throw err;
    }
  }

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
