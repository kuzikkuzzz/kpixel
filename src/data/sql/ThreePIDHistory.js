/**
 *
 * Storing third party IDs for oauth login
 */

import { DataTypes } from 'sequelize';

import sequelize from './sequelize.js';

const ThreePIDHistory = sequelize.define('ThreePIDHistory', {
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    autoIncrement: true,
    primaryKey: true,
  },

  uid: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
  },

  provider: {
    type: DataTypes.TINYINT.UNSIGNED,
    allowNull: false,
  },

  tpid: {
    type: 'VARCHAR(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci',
    allowNull: false,
  },

  normalizedTpid: {
    type: 'VARCHAR(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci',
  },

  verified: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
  },

  lastSeen: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    allowNull: false,
  },

  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    allowNull: false,
  },
});

export default ThreePIDHistory;
