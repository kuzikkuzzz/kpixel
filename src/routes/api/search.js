/*
 * search api
 */
import { searchFaction } from '../../data/sql/Faction.js';
import { searchUser } from '../../data/sql/User.js';

export default async function search(req, res) {
  req.tickRateLimiter(1000);
  const { ttag: { t }, body: { type, term } } = req;

  if (!term || typeof term !== 'string') {
    throw new Error('No search term given');
  }
  if (!type || typeof type !== 'string') {
    throw new Error('No search type given');
  }

  let columnIds;
  let columns;
  let types;
  const rows = [];
  switch (type) {
    case 'factions': {
      columnIds = ['avatar', 'title', 'description', 'ispublic', 'members'];
      columns = [t`Avatar`, t`Title`, t`Description`, t`Public`, t`Members`];
      types = ['mediaId', 'faction', 'string', 'bool', 'number'];
      const factionResults = await searchFaction(term);
      for (let i = 0; i < factionResults.length; i += 1) {
        const {
          name, title, description, isPublic, memberCount, avatarId,
        } = factionResults[i];
        rows.push([
          avatarId, `${title},${name}`, description, isPublic, memberCount,
        ]);
      }
      break;
    }
    case 'users': {
      columnIds = ['avatar', 'name', 'description', 'role', 'joined'];
      columns = [t`Avatar`, t`Name`, t`Role`, t`Joined`];
      types = ['mediaId', 'user', 'flagId', 'ts'];
      const userResults = await searchUser(term);
      for (let i = 0; i < userResults.length; i += 1) {
        const {
          name, username, customFlagId, ts, avatarId,
        } = userResults[i];
        rows.push([
          avatarId, `${name},${username}`, customFlagId, ts,
        ]);
      }
      break;
    }
    default:
      throw new Error('Unknown search type');
  }

  res.json({ columnIds, columns, types, rows });
}
