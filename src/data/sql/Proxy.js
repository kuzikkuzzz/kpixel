
import { DataTypes, QueryTypes } from 'sequelize';

import sequelize from './sequelize.js';

const ProxyData = sequelize.define('Proxy', {
  /*
   * store when an ip is a proxy, primary key is ip,
   * which is also the foreign key, defined in ./index.js
   */
  ip: {
    type: 'VARBINARY(8)',
    primaryKey: true,
  },

  isProxy: {
    type: DataTypes.TINYINT.UNSIGNED,
    allowNull: false,
  },

  /*
   * type of proxy: VPN, SOCKS, etc.
   * or it not proxy: Residential, Wireless, Business
   */
  type: {
    type: 'VARCHAR(20) CHARACTER SET latin1 COLLATE latin1_swedish_ci',
    set(value) {
      if (value) this.setDataValue('type', value.slice(0, 20));
    },
  },

  /*
   * operator of vpn if available
   */
  operator: {
    type: 'VARCHAR(60) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci',
  },

  /*
   * city of ip
   */
  city: {
    type: 'VARCHAR(60) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci',
  },

  /*
   * how many times we got the same result in a row,
   * used to decide for expiration time
   */
  repetition: {
    type: DataTypes.INTEGER.UNSIGNED,
    defaultValue: 0,
    allowNull: false,
  },

  risk: {
    type: DataTypes.TINYINT.UNSIGNED,
  },

  confidence: {
    type: DataTypes.TINYINT.UNSIGNED,
  },

  /*
   * how many devices were seen using this ip, approximated by proxycheck.io
   */
  devices: {
    type: DataTypes.INTEGER.UNSIGNED,
    defaultValue: 1,
    allowNull: false,
  },

  /*
   * how many devices were seen using this subnet, approximated by proxycheck.io
   */
  subnetDevices: {
    type: DataTypes.INTEGER.UNSIGNED,
    defaultValue: 1,
    allowNull: false,
  },

  /*
   * time of last proxycheck
   */
  expires: {
    type: DataTypes.DATE,
    allowNull: false,
  },
});

export async function getProxCheckHistory(ipString) {
  try {
    const result = await sequelize.query(
      // eslint-disable-next-line max-len
      'SELECT isProxy, repetition FROM Proxies WHERE ip = IP_TO_BIN(?)', {
        replacements: [ipString],
        plain: true,
        type: QueryTypes.SELECT,
      },
    );
    return result;
  } catch (error) {
    console.error(`SQL Error on getProxCheckHistory: ${error.message}`);
  }
  return null;
}

export default ProxyData;
