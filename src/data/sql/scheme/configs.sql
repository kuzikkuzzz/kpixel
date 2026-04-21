-- Config table for states and variables

CREATE TABLE IF NOT EXISTS Configs (
  `key` varchar(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  value varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,

  PRIMARY KEY (`key`)
);
