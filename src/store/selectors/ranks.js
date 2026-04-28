/*
 * selectors for ranks
 */

/* eslint-disable import-x/prefer-default-export */

export const selectStats = (state) => [
  state.ranks.totalRanking,
  state.ranks.totalDailyRanking,
  state.ranks.factionRanking,
  state.ranks.dailyFactionRanking,
  state.ranks.dailyCRanking,
  state.ranks.prevTop,
  state.ranks.onlineStats,
  state.ranks.cHistStats,
  state.ranks.cHourlyStats,
  state.ranks.histStats,
  state.ranks.pDailyStats,
  state.ranks.pHourlyStats,
];
