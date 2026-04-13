import { QueryTypes } from 'sequelize';
import sequelize, { sync as syncSql } from './sequelize.js';
import User, { USERLVL, ensureAdminPowers } from './User.js';
import Channel, { CHANNEL_TYPES } from './Channel.js';
import Profile from './Profile.js';
import Message from './Message.js';
import Session from './Session.js';
import Device from './Device.js';
import IP from './IP.js';
import ProxyData from './Proxy.js';
import RangeData from './Range.js';
import Ban, { cleanBans } from './Ban.js';
import BanHistory from './BanHistory.js';
import WhoisReferral from './WhoisReferral.js';
import RangeBan, { cleanRangeBans } from './RangeBan.js';
import RangeBanHistory from './RangeBanHistory.js';
import ProxyWhitelist from './ProxyWhitelist.js';
import ThreePID, { THREEPID_PROVIDERS } from './ThreePID.js';
import ThreePIDHistory from './ThreePIDHistory.js';
import Fish from './Fish.js';
import Badge from './Badge.js';
import UserIP from './association_models/UserIP.js';
import UserBlock from './association_models/UserBlock.js';
import UserChannel from './association_models/UserChannel.js';
import UserBadge from './association_models/UserBadge.js';
import IPBan from './association_models/IPBan.js';
import UserBan from './association_models/UserBan.js';
import ThreePIDBan from './association_models/ThreePIDBan.js';
import IPBanHistory from './association_models/IPBanHistory.js';
import UserBanHistory from './association_models/UserBanHistory.js';
import ThreePIDBanHistory from './association_models/ThreePIDBanHistory.js';
import OIDCClient from './OIDCClient.js';
import OIDCAuthCode from './OIDCAuthCode.js';
import OIDCAccessToken from './OIDCAccessToken.js';
import OIDCRefreshToken from './OIDCRefreshToken.js';
import OIDCConsent from './OIDCConsent.js';
import Media, { cleanMedia } from './Media.js';
import ImageHash from './ImageHash.js';
import UserMedia from './association_models/UserMedia.js';
import MessageMedia from './association_models/MessageMedia.js';
import IPMedia from './association_models/IPMedia.js';
import MediaBan from './MediaBan.js';
import Config from './Config.js';
import Faction from './Faction.js';
import FactionRole from './FactionRole.js';
import FactionBan from './FactionBan.js';
import FactionInvite from './FactionInvite.js';
import UserFactionBan from './association_models/UserFactionBan.js';
import IPFactionBan from './association_models/IPFactionBan.js';
import UserFaction from './association_models/UserFaction.js';
import UserFactionRole from './association_models/UserFactionRole.js';
import { HourlyCron } from '../../utils/cron.js';

/*
 * initial sync
 */
export async function sync() {
  await syncSql();
  await ensureAdminPowers();
}

/*
 * clean the database of crap
 */
export async function cleanDB() {
  const queries = [
    'DELETE FROM Ranges WHERE expires < NOW()',
    'DELETE FROM Proxies WHERE expires < NOW() - INTERVAL 14 DAY',
    'DELETE FROM Sessions WHERE expires < NOW()',
    'DELETE FROM WhoisReferrals WHERE expires < NOW()',
    'DELETE FROM FactionBans WHERE expires IS NOT NULL AND expires < NOW()',
    'DELETE FROM OIDCConsents WHERE expires < NOW()',
    'DELETE FROM OIDCAccessTokens WHERE expires < NOW()',
    'DELETE FROM OIDCAuthCodes WHERE expires < NOW()',
    'DELETE FROM OIDCRefreshTokens WHERE expires < NOW()',
    /* eslint-disable max-len */
    'DELETE c FROM Channels c WHERE c.type = 1 AND (SELECT COUNT(*) FROM UserChannels uc WHERE uc.cid =c.id) <= 1',
    /* eslint-enable max-len */
  ];
  const functions = [
    cleanBans,
    cleanRangeBans,
    cleanMedia,
  ];
  for (let i = 0; i < queries.length; i += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await sequelize.query(queries[i], {
        raw: true,
        type: QueryTypes.DELETE,
      });
    } catch (error) {
      console.error(
        `SQL Error on clean-up query ${queries[i]}: ${error.message}`,
      );
    }
  }
  if (Math.random() < 0.1) {
    /*
     * delete all messages except the most recent 1000 per channel,
     * this is highly database specific, that query is for MySQL 8+ and
     * seems to work on MariaDB as well
     */
    try {
      await sequelize.query(`DELETE m FROM Messages m
LEFT JOIN (
  SELECT id FROM (
    SELECT id,
    ROW_NUMBER() OVER (PARTITION BY cid ORDER BY id DESC) as rn
    FROM Messages
  ) ranked WHERE rn <= 1000
) keep ON m.id = keep.id
WHERE keep.id IS NULL`, {
        raw: true,
        type: QueryTypes.DELETE,
      });
    } catch (error) {
      console.error(
        `SQL Error on clean-up messages : ${error.message}`,
      );
    }
  }
  for (let i = 0; i < functions.length; i += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await functions[i]();
    } catch (error) {
      console.error(
        `SQL Error on clean-up job ${functions[i].name}: ${error.message}`,
      );
    }
  }
}
HourlyCron.hook(cleanDB);

/*
 * Channels
 */
User.belongsToMany(Channel, {
  as: 'channels',
  through: UserChannel,
  foreignKey: 'uid',
});
Channel.belongsToMany(User, {
  as: 'users',
  through: UserChannel,
  foreignKey: 'cid',
});

/*
 * Fish
 */
Fish.belongsTo(User, {
  as: 'user',
  foreignKey: 'uid',
  onDelete: 'CASCADE',
});

/*
 * Badges
 */
Badge.belongsToMany(User, {
  as: 'users',
  through: UserBadge,
  foreignKey: 'bid',
});
User.belongsToMany(Badge, {
  as: 'badges',
  through: UserBadge,
  foreignKey: 'uid',
});

/*
 * Profile
 */
Profile.belongsTo(User, {
  as: 'userid',
  foreignKey: 'uid',
  onDelete: 'CASCADE',
});
User.hasOne(Profile, {
  as: 'proile',
  foreignKey: 'uid',
});
Profile.belongsTo(Media, {
  as: 'avatarMedia',
  foreignKey: 'avatar',
});
Media.hasMany(Profile, {
  as: 'proiles',
  foreignKey: 'avatar',
});
Profile.belongsTo(FactionRole, {
  as: 'factionRole',
  foreignKey: 'activeRole',
});
FactionRole.hasMany(Profile, {
  as: 'activeProfiles',
  foreignKey: 'activeRole',
});

/*
 * Factions
 */
Faction.belongsTo(Media, {
  as: 'avatarMedia',
  foreignKey: 'avatar',
});
Media.hasMany(Faction, {
  as: 'factionAvatars',
  foreignKey: 'avatar',
});
FactionBan.belongsTo(Faction, {
  as: 'faction',
  foreignKey: 'fid',
  onDelete: 'CASCADE',
});
Faction.hasMany(FactionBan, {
  as: 'bans',
  foreignKey: 'fid',
});
Faction.belongsTo(Channel, {
  as: 'channel',
  foreignKey: 'cid',
  onDelete: 'CASCADE',
});
Channel.hasMany(Faction, {
  as: 'factionChannels',
  foreignKey: 'cid',
});
FactionRole.belongsTo(Faction, {
  as: 'faction',
  foreignKey: 'fid',
  onDelete: 'CASCADE',
});
Faction.hasMany(FactionRole, {
  as: 'roles',
  foreignKey: 'fid',
});
FactionInvite.belongsTo(Faction, {
  as: 'faction',
  foreignKey: 'fid',
  onDelete: 'CASCADE',
});
Faction.hasMany(FactionInvite, {
  as: 'invites',
  foreignKey: 'fid',
});
FactionRole.belongsTo(Media, {
  as: 'flagMedia',
  foreignKey: 'customFlag',
});
Media.hasMany(FactionRole, {
  as: 'factionFlags',
  foreignKey: 'customFlag',
});
Faction.belongsToMany(User, {
  as: 'members',
  through: UserFaction,
  foreignKey: 'fid',
});
User.belongsToMany(Faction, {
  as: 'factions',
  through: UserFaction,
  foreignKey: 'uid',
});
FactionRole.belongsToMany(User, {
  as: 'members',
  through: UserFactionRole,
  foreignKey: 'frid',
});
User.belongsToMany(FactionRole, {
  as: 'factionRoles',
  through: UserFactionRole,
  foreignKey: 'uid',
});
FactionBan.belongsToMany(IP, {
  as: 'ips',
  through: IPFactionBan,
  foreignKey: 'bid',
});
IP.belongsToMany(FactionBan, {
  as: 'factionBans',
  through: IPFactionBan,
  foreignKey: 'ip',
});
FactionBan.belongsToMany(User, {
  as: 'users',
  through: UserFactionBan,
  foreignKey: 'bid',
});
User.belongsToMany(FactionBan, {
  as: 'factionBans',
  through: UserFactionBan,
  foreignKey: 'uid',
});
FactionBan.belongsTo(User, {
  as: 'mod',
  foreignKey: 'muid',
});
User.hasMany(Ban, {
  as: 'factionBanActions',
  foreignKey: 'muid',
});

/*
 * ip informations of user
 */
IP.belongsToMany(User, {
  as: 'users',
  through: UserIP,
  foreignKey: 'ip',
});
User.belongsToMany(IP, {
  as: 'ips',
  through: UserIP,
  foreignKey: 'uid',
});

/*
 * user sessions
 */
Session.belongsTo(User, {
  as: 'user',
  foreignKey: 'uid',
  onDelete: 'CASCADE',
});
User.hasMany(Session, {
  as: 'sessions',
  foreignKey: 'uid',
});
Session.belongsTo(IP, {
  as: 'ipinfo',
  foreignKey: 'ip',
});
IP.hasMany(Session, {
  as: 'sessions',
  foreignKey: 'ip',
});
Session.belongsTo(Device, {
  as: 'device',
  foreignKey: 'did',
});
Device.hasMany(Session, {
  as: 'sessions',
  foreignKey: 'did',
});

/*
 * proxy information of ip
 */
ProxyData.belongsTo(IP, {
  as: 'ipinfo',
  foreignKey: 'ip',
  onDelete: 'CASCADE',
});
IP.hasOne(ProxyData, {
  as: 'proxy',
  foreignKey: 'ip',
});

/*
 * third party ids for oauth login
 */
ThreePID.belongsTo(User, {
  as: 'user',
  foreignKey: 'uid',
});
User.hasMany(ThreePID, {
  as: 'tpids',
  foreignKey: 'uid',
});


/*
 * third party ids history
 */
ThreePIDHistory.belongsTo(User, {
  as: 'user',
  foreignKey: 'uid',
  onDelete: 'CASCADE',
});
User.hasMany(ThreePIDHistory, {
  as: 'tpidsHistory',
  foreignKey: 'uid',
});

/*
 * ip range with whois info for ip
 */
IP.belongsTo(RangeData, {
  as: 'range',
  foreignKey: 'rid',
});

RangeData.hasMany(IP, {
  as: 'ips',
  foreignKey: 'rid',
});
/*
 * generic ban by threepid, userid and ip
 */
Ban.belongsToMany(IP, {
  as: 'ips',
  through: IPBan,
  foreignKey: 'bid',
});
IP.belongsToMany(Ban, {
  as: 'bans',
  through: IPBan,
  foreignKey: 'ip',
});
// tpid
Ban.belongsToMany(ThreePID, {
  as: 'tpids',
  through: ThreePIDBan,
  foreignKey: 'bid',
});
ThreePID.belongsToMany(Ban, {
  as: 'bans',
  through: ThreePIDBan,
  foreignKey: 'tid',
});
// user
Ban.belongsToMany(User, {
  as: 'users',
  through: UserBan,
  foreignKey: 'bid',
});
User.belongsToMany(Ban, {
  as: 'bans',
  through: UserBan,
  foreignKey: 'uid',
});
// mods
Ban.belongsTo(User, {
  as: 'mod',
  foreignKey: 'muid',
});
User.hasMany(Ban, {
  as: 'banActions',
  foreignKey: 'muid',
});
/*
 * history of past bans
 */
BanHistory.belongsToMany(IP, {
  as: 'ips',
  through: IPBanHistory,
  foreignKey: 'bid',
});
IP.belongsToMany(BanHistory, {
  as: 'banHistory',
  through: IPBanHistory,
  foreignKey: 'ip',
});
// tpid
BanHistory.belongsToMany(ThreePID, {
  as: 'tpids',
  through: ThreePIDBanHistory,
  foreignKey: 'bid',
});
ThreePID.belongsToMany(BanHistory, {
  as: 'banHistory',
  through: ThreePIDBanHistory,
  foreignKey: 'tid',
});
// user
BanHistory.belongsToMany(User, {
  as: 'users',
  through: UserBanHistory,
  foreignKey: 'bid',
});
User.belongsToMany(BanHistory, {
  as: 'banHistory',
  through: UserBanHistory,
  foreignKey: 'uid',
});
// mods
BanHistory.belongsTo(User, {
  as: 'mod',
  foreignKey: 'muid',
});
User.hasMany(BanHistory, {
  as: 'banActionHistory',
  foreignKey: 'muid',
});
BanHistory.belongsTo(User, {
  as: 'lmod',
  foreignKey: 'lmuid',
});
User.hasMany(BanHistory, {
  as: 'banLiftingHistory',
  foreignKey: 'lmuid',
});

/*
 * ip whitelist
 */
ProxyWhitelist.belongsTo(User, {
  as: 'mod',
  foreignKey: 'muid',
});
User.hasMany(ProxyWhitelist, {
  as: 'ipWhitelistActions',
  foreignKey: 'muid',
});
ProxyWhitelist.belongsTo(IP, {
  as: 'ipinfo',
  foreignKey: 'ip',
  onDelete: 'CASCADE',
});
IP.hasOne(ProxyWhitelist, {
  as: 'whitelist',
  foreignKey: 'ip',
});

/*
 * range ban
 */
RangeBan.belongsTo(RangeData, {
  as: 'iprange',
  foreignKey: 'rid',
  onDelete: 'CASCADE',
});
RangeData.hasOne(RangeBan, {
  as: 'bans',
  foreignKey: 'rid',
});
RangeBan.belongsTo(User, {
  as: 'mod',
  foreignKey: 'muid',
});
User.hasMany(RangeBan, {
  as: 'rangeBanActions',
  foreignKey: 'muid',
});

/*
 * ip range ban history
 */
RangeBanHistory.belongsTo(RangeData, {
  as: 'iprange',
  foreignKey: 'rid',
  onDelete: 'CASCADE',
});
RangeData.hasMany(RangeBanHistory, {
  as: 'banHistory',
  foreignKey: 'rid',
});
RangeBanHistory.belongsTo(User, {
  as: 'mod',
  foreignKey: 'muid',
});
User.hasMany(RangeBanHistory, {
  as: 'rangeBanActionHistory',
  foreignKey: 'muid',
});
RangeBanHistory.belongsTo(User, {
  as: 'lmod',
  foreignKey: 'lmuid',
});
User.hasMany(RangeBanHistory, {
  as: 'rangeBanLiftingHistory',
  foreignKey: 'lmuid',
});

/*
 * chat messages
 */
Message.belongsTo(Channel, {
  as: 'channel',
  foreignKey: 'cid',
  onDelete: 'CASCADE',
});
Message.belongsTo(User, {
  as: 'user',
  foreignKey: 'uid',
  onDelete: 'CASCADE',
});

/*
 * User blocks of other user
 *
 * uid: User that blocks
 * buid: User that is blocked
 */
User.belongsToMany(User, {
  as: 'blocked',
  through: UserBlock,
  foreignKey: 'uid',
});
User.belongsToMany(User, {
  as: 'blockedBy',
  through: UserBlock,
  foreignKey: 'buid',
});

/*
 * OpenID Connect
 */
OIDCConsent.belongsTo(User, {
  as: 'user',
  foreignKey: 'uid',
  onDelete: 'CASCADE',
});
User.hasMany(OIDCConsent, {
  as: 'oicdRefreshTokens',
  foreignKey: 'uid',
});
OIDCClient.belongsTo(User, {
  as: 'user',
  foreignKey: 'uid',
  onDelete: 'CASCADE',
});
User.hasMany(OIDCClient, {
  as: 'oicdClients',
  foreignKey: 'uid',
});
OIDCConsent.belongsTo(OIDCClient, {
  as: 'client',
  foreignKey: 'cid',
  onDelete: 'CASCADE',
});
OIDCClient.hasMany(OIDCConsent, {
  as: 'refreshTokens',
  foreignKey: 'cid',
});

OIDCAuthCode.belongsTo(OIDCConsent, {
  as: 'consent',
  foreignKey: 'cid',
  onDelete: 'CASCADE',
});
OIDCConsent.hasMany(OIDCAuthCode, {
  as: 'authCodes',
  foreignKey: 'cid',
});

OIDCAccessToken.belongsTo(OIDCConsent, {
  as: 'consent',
  foreignKey: 'cid',
  onDelete: 'CASCADE',
});
OIDCConsent.hasMany(OIDCAccessToken, {
  as: 'accessTokens',
  foreignKey: 'cid',
});

OIDCRefreshToken.belongsTo(OIDCConsent, {
  as: 'consent',
  foreignKey: 'cid',
  onDelete: 'CASCADE',
});
OIDCConsent.hasMany(OIDCRefreshToken, {
  as: 'refreshTokens',
  foreignKey: 'cid',
});

/*
 * Media repository
 */
ImageHash.belongsTo(Media, {
  as: 'imagedata',
  foreignKey: 'mid',
  onDelete: 'CASCADE',
});
Media.hasOne(ImageHash, {
  as: 'media',
  foreignKey: 'mid',
});
Media.belongsToMany(User, {
  as: 'users',
  through: UserMedia,
  foreignKey: 'mid',
});
User.belongsToMany(Media, {
  as: 'medias',
  through: UserMedia,
  foreignKey: 'uid',
});
Media.belongsToMany(Message, {
  as: 'messages',
  through: MessageMedia,
  foreignKey: 'mid',
});
Message.belongsToMany(Media, {
  as: 'medias',
  through: MessageMedia,
  foreignKey: 'sid',
});
Media.belongsToMany(IP, {
  as: 'ips',
  through: IPMedia,
  foreignKey: 'mid',
});
IP.belongsToMany(Media, {
  as: 'medias',
  through: IPMedia,
  foreignKey: 'ip',
});
MediaBan.belongsTo(User, {
  as: 'mod',
  foreignKey: 'muid',
});
User.hasMany(MediaBan, {
  as: 'mediaBanActions',
  foreignKey: 'muid',
});

export {
  sequelize,
  // Models
  ProxyWhitelist,
  User,
  Channel,
  UserChannel,
  Message,
  UserBlock,
  RangeData,
  IP,
  Ban,
  WhoisReferral,
  ThreePID,
  Fish,
  Config,
  Faction,
  FactionBan,
  // constants
  USERLVL,
  THREEPID_PROVIDERS,
  CHANNEL_TYPES,
};
