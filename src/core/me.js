/**
 *
 * Userdata that gets sent to the client on various api endpoints.
 * This should be the most basic data in order to run the game.
 *
 */
import { USERLVL } from '../data/sql/index.js';
import { getUserRanks } from '../data/redis/ranks.js';
import { USE_MAILER, TIMEBLOCK_USERS, TIMEBLOCK_IPS } from './config.js';
import { USER_FLAGS, CHANNEL_TYPES } from './constants.js';
import chatProvider from './ChatProvider.js';

export default async function getMe(user, ip, lang) {
  let id;
  let name;
  let username;
  let userlvl;
  let havePassword;
  let blockDm;
  let priv;

  /* [[id, name], ...] */
  let blocked;
  /* { type: [cid, name, lastTs, lastReadTs, muted, avatarId] } */
  let channels = {
    [CHANNEL_TYPES.PUBLIC]: chatProvider.getAccessiblePublicChannels(lang),
  };

  if (user) {
    const { data } = user;
    ({ id, name, username, userlvl } = data);
    blockDm = !!(data.flags & (0x01 << USER_FLAGS.BLOCK_DM));
    priv = !!(data.flags & (0x01 << USER_FLAGS.PRIV));
    havePassword = data.password !== null;
    blocked = data.blocked.map(({ id: bid, name: bname }) => [bid, bname]);
    channels = {
      ...channels,
      ...data.channels,
    };
  } else {
    id = 0;
    name = null;
    username = null;
    userlvl = USERLVL.ANONYM;
    havePassword = false;
    blockDm = false;
    blockDm = false;
    priv = false;
    blocked = [];
  }

  /*
   * make sure ip.getAllowance() if fetched here to make a user.touch() possible
   * later
   */
  const [ranks] = await Promise.all([
    (user) ? getUserRanks(user.id) : null,
    user && ip.getAllowance(),
  ]);
  user?.touch(ip.ipString);
  ip.touch();

  const me = {
    id, name, username, userlvl, havePassword, blockDm, priv, channels, blocked,
  };

  if (ranks) {
    const [
      totalPixels,
      dailyTotalPixels,
      ranking,
      dailyRanking,
    ] = ranks;
    me.totalPixels = totalPixels;
    me.dailyTotalPixels = dailyTotalPixels;
    me.ranking = ranking;
    me.dailyRanking = dailyRanking;
  } else {
    me.totalPixels = 0;
    me.dailyTotalPixels = 0;
    me.ranking = 0;
    me.dailyRanking = 0;
  }

  if (user && TIMEBLOCK_USERS) {
    const timeBlockProps = TIMEBLOCK_USERS.get(user.id);
    if (timeBlockProps) {
      [me.replacementInterval, me.replacementMessage] = timeBlockProps;
    }
  }
  if (TIMEBLOCK_IPS && !me.replacementMessage) {
    const timeBlockProps = TIMEBLOCK_IPS.get(ip.ipString);
    if (timeBlockProps) {
      [me.replacementInterval, me.replacementMessage] = timeBlockProps;
    }
  }

  // eslint-disable-next-line max-len
  if (USE_MAILER && userlvl >= USERLVL.REGISTERED && userlvl < USERLVL.VERIFIED) {
    me.messages = ['not_verified'];
  }

  return me;
}
