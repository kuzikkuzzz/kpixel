/*
 * request password reset mail
 */

import { AuthLogger } from '../../../core/logger.js';
import mailProvider from '../../../core/MailProvider.js';
import { validateEMail } from '../../../utils/validation.js';

async function validate(email, gettext) {
  const errors = [];
  const emailerror = gettext(validateEMail(email));
  if (emailerror) errors.push(emailerror);

  return errors;
}

export default async (req, res) => {
  const { ip: { ipString }, body: { email }, ttag: { gettext } } = req;

  const errors = validate(email, gettext);
  if (errors.length > 0) {
    res.status(400);
    res.json({
      errors,
    });
    return;
  }

  const host = req.ip.getHost();
  const { lang } = req;
  const error = await mailProvider.sendPasswdResetMail(
    email, ipString, host, lang,
  );
  if (error) {
    AuthLogger.resetMailFailure(email, ipString);
    res.status(400);
    res.json({
      errors: [error],
    });
    return;
  }

  AuthLogger.sentResetMail(email, ipString);

  res.status(200);
  res.json({
    success: true,
  });
};
