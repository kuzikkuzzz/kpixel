/*
 * Custom Roles of factions, those are like roles that the user can choose
 * from
 */

import { DataTypes } from 'sequelize';

import sequelize from './sequelize.js';

const FactionInvite = sequelize.define('FactionInvite', {
  id: {
    type: DataTypes.BIGINT.UNSIGNED,
    autoIncrement: true,
    primaryKey: true,
  },

  fid: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
  },

  /*
   * short identifier for invite, will be 12 chars usually
   */
  midId: {
    type: 'VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin',
    unique: 'midId',
    allowNull: false,
  },

  /*
   * from lowest to highest bit:
   * 0: one-time-invite
   */
  flags: {
    type: DataTypes.TINYINT.UNSIGNED,
    allowNull: false,
    defaultValue: 0,
  },

  /*
   * time to expire, NULL if infinite
   */
  expires: {
    type: DataTypes.DATE,
  },

  /*
   * how many times it got used
   */
  used: {
    type: DataTypes.INTEGER.UNSIGNED,
  },

  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    allowNull: false,
  },
});

export default FactionInvite;
