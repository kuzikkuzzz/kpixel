import React from 'react';
import { t } from 'ttag';

import Help from './Help.jsx';
import Settings from './Settings.jsx';
import UserArea from './UserArea.jsx';
import CanvasSelect from './CanvasSelect.jsx';
import Archive from './Archive.jsx';
import Chat from './Chat.jsx';
import Player from './Player.jsx';
import FishDisplay from './FishDisplay.jsx';
import BadgeDisplay from './BadgeDisplay.jsx';
import Templates from './Templates.jsx';
import MyFactions from './MyFactions.jsx';
import Faction from './Faction.jsx';
import User from './User.jsx';
import Search from './Search.jsx';

// eslint-disable-next-line max-len
const Modtools = React.lazy(() => import(/* webpackChunkName: "modtools" */ './Modtools.jsx'));
// eslint-disable-next-line max-len
const Statistics = React.lazy(() => import(/* webpackChunkName: "stats" */ './Statistics.jsx'));
// eslint-disable-next-line max-len
const Converter = React.lazy(() => import(/* webpackChunkName: "stats" */ './Converter.jsx'));
// eslint-disable-next-line max-len
const Invite = React.lazy(() => import(/* webpackChunkName: "invite" */ './Invite.jsx'));
// eslint-disable-next-line max-len
const OIDCConsent = React.lazy(() => import(/* webpackChunkName: "oidc" */ './OIDCConsent.jsx'));

export default {
  /*
   * third argument is whether or not the window should be minimized content,
   * like a modal within the browser window
   */
  HELP: [Help, t`Help`, true],
  SETTINGS: [Settings, t`Settings`, true],
  USERAREA: [UserArea, t`User Area`, false],
  CONVERTER: [Converter, t`Converter`, false],
  CHAT: [Chat, t`Chat`, false],
  CANVAS_SELECTION: [CanvasSelect, t`Canvas Selection`, true],
  ARCHIVE: [Archive, t`Canvas Archive`, true],
  PLAYER: [Player, t`Player`, false],
  FISH_DISPLAY: [FishDisplay, t`Fish Display`, true],
  BADGE_DISPLAY: [BadgeDisplay, t`Badge Display`, true],
  TEMPLATES: [Templates, t`Templates`, false],
  /* t: This if for moderation tools, it's not important to translate this */
  MODTOOLS: [Modtools, t`Modtools`, false],
  STATISTICS: [Statistics, t`Statistics`, false],
  MYFACTIONS: [MyFactions, t`My Factions`, false],
  FACTION: [Faction, t`Faction`, true],
  USER: [User, t`User`, true],
  SEARCH: [Search, t`Search`, true],
  I: [Invite, t`Invite`, true],
  /*
   * OIDC Consent is a very special case, because it is only available as
   * seperate popup, hoever, this is a single-page-applications, so we include
   * it everywhere.
   * OIDC requests should not be slow, so it would be great to include its chunk
   * at the html already.
   * It's also not in AVAILABLE_POPUPS, but rather gets served sepeartely by
   * the /oidc route and it can not work without window.ssv.params.
   *
   * Maybe every single window should be lazy loaded and we additional set the
   * current script in popupHtml?
   */
  OIDC: [OIDCConsent, t`OIDC LogIn`, true],
  /* other windows */
};

/*
 * NOTE:
 * set windows that should be accessible via popup / url
 * also in ../../core/constants.js
 */
