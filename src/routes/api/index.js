import express from 'express';

import { verifySession, ensureLoggedIn } from '../../middleware/session.js';
import { parseDevice } from '../../middleware/device.js';
import errorJson from '../../middleware/errorJson.js';

import me from './me.js';
import auth from './auth/index.js';
import chatHistory from './chathistory.js';
import startDm from './startdm.js';
import leaveChan from './leavechan.js';
import mute from './mute.js';
import block from './block.js';
import userchange from './userchange.js';
import profilechange from './profilechange.js';
import factionchange from './factionchange.js';
import userfactionchange from './userfactionchange.js';
import factionrolechange from './factionrolechange.js';
import factioninfo from './factioninfo.js';
import userinfo from './userinfo.js';
import factioncreate from './factioncreate.js';
import factiondelete from './factiondelete.js';
import factionjoin from './factionjoin.js';
import factionleave from './factionleave.js';
import factionrolecreate from './factionrolecreate.js';
import factionroledelete from './factionroledelete.js';
import factionrolejoin from './factionrolejoin.js';
import factionroleleave from './factionroleleave.js';
import factionkickban from './factionkickban.js';
import factionunban from './factionunban.js';
import factionmembers from './factionmembers.js';
import factionbans from './factionbans.js';
import factioninvites from './factioninvites.js';
import factioninvitecreate from './factioninvitecreate.js';
import factioninvitedelete from './factioninvitedelete.js';
import factioninviteuse from './factioninviteuse.js';
import factioninvitedata from './factioninvitedata.js';
import search from './search.js';
import modtools from './modtools.js';
import baninfo from './baninfo.js';
import getiid from './getiid.js';
import shards from './shards.js';
import pubchannels from './pubchannels.js';
import profile from './profile.js';
import canvases from './canvases.js';
import fish from './fish.js';
import badge from './badge.js';
import banme from './banme.js';
import media from './media.js';

const router = express.Router();

router.use('/canvases', canvases);

router.use(express.json());

router.post('/fish', fish);

router.post('/badge', badge);

/*
 * set cache control and reject disallowed cors
 */
router.use((req, res, next) => {
  res.set({
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    Expires: '0',
  });

  if (req.csrfPossible) {
    const error = new Error('Request from this origin denied.');
    error.status = 403;
    throw error;
  }

  next();
});

// routes that don't need a user
router.get('/shards', shards);

router.get('/pubchannels', pubchannels);

router.get('/getiid', getiid);

router.post('/search', search);

/*
 * get user session if available
 */
router.use(verifySession);

router.get('/chathistory', chatHistory);

router.get('/baninfo', baninfo);

router.post('/lanme', banme);

router.get('/me', me);

router.post('/factioninfo', factioninfo);
router.post('/userinfo', userinfo);
router.post('/factionmembers', factionmembers);
router.post('/factioninvitedata', factioninvitedata);

router.use(parseDevice);

router.use('/auth', auth);

router.use('/modtools', modtools);

/*
 * only with session
 */
router.use(ensureLoggedIn);

router.use('/media', media);

router.get('/profile', profile);

router.post('/startdm', startDm);

router.post('/leavechan', leaveChan);

router.post('/block', block);

router.post('/mute', mute);

router.post('/userchange', userchange);

router.post('/profilechange', profilechange);
router.post('/factionchange', factionchange);
router.post('/userfactionchange', userfactionchange);
router.post('/factionrolechange', factionrolechange);

router.post('/factionbans', factionbans);
router.post('/factioninvites', factioninvites);

router.post('/factioncreate', factioncreate);
router.post('/factiondelete', factiondelete);
router.post('/factionjoin', factionjoin);
router.post('/factionleave', factionleave);
router.post('/factionkickban', factionkickban);
router.post('/factionunban', factionunban);

router.post('/factioninviteuse', factioninviteuse);
router.post('/factioninvitecreate', factioninvitecreate);
router.post('/factioninvitedelete', factioninvitedelete);

router.post('/factionrolecreate', factionrolecreate);
router.post('/factionroledelete', factionroledelete);
router.post('/factionrolejoin', factionrolejoin);
router.post('/factionroleleave', factionroleleave);

router.use(errorJson);

export default router;
