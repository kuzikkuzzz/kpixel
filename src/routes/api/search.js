/*
 * search api
 */
import { searchFaction } from '../../data/sql/Faction.js';
import { searchUser } from '../../data/sql/User.js';

export default async function search(req, res) {
  req.tickRateLimiter(1000);
  const { body: { type, term } } = req;

  if (!term || typeof term !== 'string') {
    throw new Error('No search term given');
  }
  if (!type || typeof type !== 'string') {
    throw new Error('No search type given');
  }

  let columnIds;
  let types;
  let uniqueColumnKey;
  const rows = [];
  switch (type) {
    case 'factions': {
      columnIds = ['avatar', 'title', 'description', 'ispublic', 'members'];
      types = ['mediaId', 'faction', 'string', 'bool', 'number'];
      uniqueColumnKey = 1;
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
      columnIds = ['avatar', 'name', 'role', 'joined'];
      types = ['mediaId', 'user', 'flagId', 'ts'];
      uniqueColumnKey = 1;
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

  res.json({
    columnIds,
    types,
    rows,
    uniqueColumnKey,
  });
}
