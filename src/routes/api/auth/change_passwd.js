/*
 * request password change
 */

import logger from '../../../core/logger.js';
import socketEvents from '../../../socket/socketEvents.js';
import { validatePassword } from '../../../utils/validation.js';
import { setPassword } from '../../../data/sql/User.js';

export default async (req, res) => {
  const { body: { newPassword }, ttag: { gettext } } = req;

  const validationError = validatePassword(newPassword);
  if (validationError) {
    res.status(400).json({ errors: [gettext(validationError)] });
    return;
  }

  const { user } = req;
  await setPassword(user.id, newPassword);

  // eslint-disable-next-line max-len
  logger.info(`AUTH: Changed password for user ${user.name}(${user.id}) by ${req.ip.ipString}`);

  socketEvents.reloadUser(user.id);

  res.json({
    success: true,
  });
};
