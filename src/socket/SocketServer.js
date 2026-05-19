/*
 * main websocket server
 */
import WebSocket from 'ws';

import canvases from '../core/canvases.js';
import MassRateLimiter from '../utils/MassRateLimiter.js';
import Counter from '../utils/Counter.js';
import {
  REG_CANVAS_OP,
  PIXEL_UPDATE_OP,
  REG_CHUNK_OP,
  REG_MCHUNKS_OP,
  DEREG_CHUNK_OP,
  DEREG_MCHUNKS_OP,
  FISH_CATCHED_OP,
} from './packets/op.js';
import {
  hydrateRegCanvas,
  hydrateRegChunk,
  hydrateDeRegChunk,
  hydrateRegMChunks,
  hydrateDeRegMChunks,
  hydratePixelUpdate,
  dehydrateChangeMe,
  dehydrateRefresh,
  dehydrateOnlineCounter,
  dehydrateCoolDown,
  dehydratePixelReturn,
  dehydrateCaptchaReturn,
  dehydrateFishAppears,
  dehydrateFishCatched,
} from './packets/server.js';
import socketEvents from './socketEvents.js';
import chatProvider from '../core/ChatProvider.js';
import authenticateClient from './authenticateClient.js';
import drawByOffsets from '../core/draw.js';
import { HOUR } from '../core/constants.js';
import { getCoolDown } from '../data/redis/cooldown.js';
import { markChannelsRead } from '../data/sql/Channel.js';
import { checkVerificationSolutions } from '../data/sql/Captcha.js';
import { isCORSAllowed } from '../middleware/cors.js';
import evaluateMalware from '../core/malwareEvaluation.js';


const ipCounter = new Counter();
const rateLimiter = new MassRateLimiter(HOUR);

class SocketServer {
  // WebSocket.Server
  wss;
  // Map<number, Array>
  CHUNK_CLIENTS;

  constructor() {
    this.CHUNK_CLIENTS = new Map();

    this.broadcastPixelBuffer = this.broadcastPixelBuffer.bind(this);
    this.reloadUser = this.reloadUser.bind(this);
    this.reloadIP = this.reloadIP.bind(this);
    this.patchUserState = this.patchUserState.bind(this);
    this.getOnlineUsers = this.getOnlineUsers.bind(this);
    this.checkHealth = this.checkHealth.bind(this);
  }

  initialize() {
    console.info('Starting websocket server');

    const wss = new WebSocket.Server({
      perMessageDeflate: false,
      clientTracking: true,
      maxPayload: 65536,
      noServer: true,
    });
    this.wss = wss;

    wss.on('error', (e) => {
      console.error(`WebSocket Server Error ${e.message}`);
    });

    wss.on('connection', (ws, req) => {
      ws.timeLastMsg = Date.now();
      ws.connectedTs = ws.timeLastMsg;
      ws.canvasId = null;
      ws.chunkCnt = 0;
      ws.openChatChannels = new Set();
      /* populate data from request */
      const { user, ip, lang, device, ttag } = req;
      ws.user = user;
      ws.ip = ip;
      ws.browserHash = device.browserHash;
      ws.lang = lang;
      ws.ttag = ttag;
      ipCounter.add(ip.ipString);

      ws.send(dehydrateOnlineCounter(socketEvents.onlineCounter));

      ws.on('error', (e) => {
        // eslint-disable-next-line max-len
        console.error(`WebSocket Client Error for ${ws.user?.data.name}: ${e.message}`);
      });

      ws.on('close', () => {
        ipCounter.delete(ip.ipString);
        this.deleteAllChunks(ws);
      });

      ws.on('message', (data, isBinary) => {
        ws.timeLastMsg = Date.now();
        if (isBinary) {
          this.onBinaryMessage(data, ws);
        } else {
          const message = data.toString();
          SocketServer.onTextMessage(message, ws);
        }
      });
    });

    socketEvents.on('pixelUpdate', this.broadcastPixelBuffer);
    socketEvents.on('reloadUser', this.reloadUser);
    socketEvents.on('reloadIP', this.reloadIP);
    socketEvents.on('patchState', this.patchUserState);

    socketEvents.on('resetAllCaptchas', () => {
      this.wss.clients.forEach((ws) => {
        ws.ip.verificationRecheckTs = 0;
      });
    });

    socketEvents.on('onlineCounter', (online) => {
      this.broadcast(dehydrateOnlineCounter(online));
    });

    socketEvents.on('announcement', (text) => {
      this.broadcast(`an,${JSON.stringify(text)}`);
    });

    socketEvents.on('suChatMessage', (
      userId,
      name,
      message,
      channelId,
      id,
      country,
    ) => {
      const ts = Math.floor(Date.now() / 1000);
      const text = `ck,${JSON.stringify(
        [channelId, false, name, message, country, id, ts,
          ts, false, null, []],
      )}`;
      this.findAllWsByUerId(userId).forEach((ws) => {
        ws.send(text);
      });
    });

    socketEvents.on('chatMessage', (
      name,
      message,
      channelId,
      userId,
      flag,
      ts,
      msgId,
      flagLegit,
      avatarId,
      attachments,
    ) => {
      const isPublicChannel = chatProvider.isPublicChannel(channelId);
      // ws objects
      const viewingClientArray = [];
      const viewingClientArrayNotify = [];
      // user ids
      const readMarkingArray = [];

      this.wss.clients.forEach((ws) => {
        const hasChannelOpen = ws.openChatChannels.has(channelId);

        if (isPublicChannel) {
          if (hasChannelOpen) {
            viewingClientArray.push(ws);
          }
          return;
        }
        if (ws.user?.hasChannel(channelId)) {
          if (ws.user?.hasChannelMuted(channelId) || hasChannelOpen) {
            viewingClientArray.push(ws);
          } else {
            viewingClientArrayNotify.push(ws);
          }
          if (hasChannelOpen) {
            readMarkingArray.push(ws.user.id);
          }
        }
      });

      if (viewingClientArray.length) {
        const text = `ck,${JSON.stringify(
          [channelId, false, name, message, flag, userId, ts,
            msgId, flagLegit, avatarId, attachments],
        )}`;
        SocketServer.broadcastSelected(viewingClientArray, text);
      }

      if (viewingClientArrayNotify.length) {
        const text = `ck,${JSON.stringify(
          [channelId, true, name, message, flag, userId, ts,
            msgId, flagLegit, avatarId, attachments],
        )}`;
        SocketServer.broadcastSelected(viewingClientArrayNotify, text);
      }

      if (readMarkingArray.length) {
        markChannelsRead(channelId, readMarkingArray);
      }
    });

    socketEvents.on('deletePublicUserMessages', (userId) => {
      this.broadcast(`dpum,${JSON.stringify(userId)}`);
    });

    socketEvents.on('deleteUserChannelMessages', (userId, channelId) => {
      const text = `dmc,${JSON.stringify([userId, channelId])}`;
      const clientArray = [];
      const isPublicChannel = chatProvider.isPublicChannel(channelId);
      this.wss.clients.forEach((ws) => {
        const hasChannelOpen = ws.openChatChannels.has(channelId);
        if (hasChannelOpen && (
          isPublicChannel || ws.user?.hasChannel(channelId)
        )) {
          clientArray.push(ws);
        }
      });
      SocketServer.broadcastSelected(clientArray, text);
    });

    socketEvents.on('deleteMessages', (channelId, messageIds) => {
      const text = `dmm,${JSON.stringify([channelId, messageIds])}`;
      const clientArray = [];
      const isPublicChannel = chatProvider.isPublicChannel(channelId);
      this.wss.clients.forEach((ws) => {
        const hasChannelOpen = ws.openChatChannels.has(channelId);
        if (hasChannelOpen && (
          isPublicChannel || ws.user?.hasChannel(channelId)
        )) {
          clientArray.push(ws);
        }
      });
      SocketServer.broadcastSelected(clientArray, text);
    });

    socketEvents.on('rateLimitTrigger', (ip, blockTime) => {
      rateLimiter.forceTrigger(ip, blockTime);
      const amount = this.killAllWsByUerIp(ip);
      if (amount) {
        console.warn(`Killed ${amount} connections for RateLimit`);
      }
    });

    /*
     * chose a random connection of ip to send a fish to
     */
    socketEvents.on('sendFish', (ip, type, size) => {
      let connectionIndex = Math.floor(Math.random() * ipCounter.get(ip));
      let chosenWs;
      const it = this.wss.clients.keys();
      let client = it.next();
      while (!client.done) {
        const ws = client.value;
        if (ws.readyState === WebSocket.OPEN
          && ws.ip.ipString === ip && ws.chunkCnt > 1
        ) {
          chosenWs = ws;
          if (connectionIndex <= 0) {
            break;
          }
          connectionIndex -= 1;
        }
        client = it.next();
      }
      if (chosenWs) {
        chosenWs.sentFish = [Date.now(), type, size];
        chosenWs.send(dehydrateFishAppears(type, size));
      }
    });

    // when changing interval, remember that online counter gets used as ping
    // for binary sharded channels in MessageBroker.js
    setInterval(this.getOnlineUsers, 20 * 1000);
    setInterval(this.checkHealth, 15 * 1000);
  }

  static async onRateLimitTrigger(ip, blockTime, reason) {
    console.warn(
      `Client ${ip} triggered Socket-RateLimit by ${reason}.`,
    );
    socketEvents.broadcastRateLimitTrigger(ip, blockTime);
  }

  async handleUpgrade(request, socket, head) {
    await authenticateClient(request);
    const { ip: { ipString } } = request;
    /*
     * rate limit
     */
    const isLimited = rateLimiter.tick(
      ipString,
      3000,
      'connection attempts',
      SocketServer.onRateLimitTrigger,
    );
    if (isLimited) {
      socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n');
      socket.destroy();
      return;
    }
    /*
     * enforce CORS
     */
    if (!isCORSAllowed(request)) {
      // eslint-disable-next-line max-len
      console.info(`Rejected CORS request on websocket from ${ipString} via ${request.headers.origin}, expected ${request.ip.getHost(false, true)}`);
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }
    /*
     * Limiting socket connections per ip
     */
    if (ipCounter.get(ipString) > 50) {
      SocketServer.onRateLimitTrigger(ipString, HOUR, 'too many connections');
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }

    this.wss.handleUpgrade(request, socket, head, (ws) => {
      this.wss.emit('connection', ws, request);
    });
  }

  /**
   * https://github.com/websockets/ws/issues/617
   * @param data
   */
  static broadcastSelected(clients, data) {
    let frames;

    if (typeof data === 'string') {
      frames = WebSocket.Sender.frame(Buffer.from(data), {
        readOnly: false,
        mask: false,
        rsv1: false,
        opcode: 1,
        fin: true,
      });
    } else {
      frames = WebSocket.Sender.frame(data, {
        readOnly: false,
        mask: false,
        rsv1: false,
        opcode: 2,
        fin: true,
      });
    }

    return clients.map((ws) => new Promise((resolve) => {
      if (ws.readyState === WebSocket.OPEN) {
        // eslint-disable-next-line no-underscore-dangle
        ws._sender.sendFrame(frames, (err) => {
          if (err) {
            console.error(

              `WebSocket broadcast error on ${ws.ip.ipString} : ${err.message}`,
            );
          }
        });
      }
      resolve();
    }));
  }

  broadcast(data) {
    const clientArray = [];
    this.wss.clients.forEach((ws) => {
      clientArray.push(ws);
    });
    SocketServer.broadcastSelected(clientArray, data);
  }

  findAllWsByUerId(userId) {
    const clients = [];
    const it = this.wss.clients.keys();
    let client = it.next();
    while (!client.done) {
      const ws = client.value;
      if (ws.readyState === WebSocket.OPEN
        && ws.user?.id === userId
      ) {
        clients.push(ws);
      }
      client = it.next();
    }
    return clients;
  }

  killAllWsByUerIp(ip) {
    let amount = ipCounter.get(ip);
    if (!amount) {
      return 0;
    }
    for (const [chunkid, clients] of this.CHUNK_CLIENTS.entries()) {
      const newClients = clients.filter((ws) => ws.ip.ipString !== ip);
      if (clients.length !== newClients.length) {
        this.CHUNK_CLIENTS.set(chunkid, newClients);
      }
    }

    const it = this.wss.clients.keys();
    amount = 0;
    let client = it.next();
    while (!client.done) {
      const ws = client.value;
      if (ws.readyState === WebSocket.OPEN
        && ws.ip.ipString === ip
      ) {
        /*
         * we deleted all registered chunks above
         * have to reset it to avoid onClose to
         * do it again.
         */
        ws.chunkCnt = 0;
        ws.terminate();
        amount += 1;
      }
      client = it.next();
    }
    return amount;
  }

  broadcastPixelBuffer(canvasId, chunkid, data) {
    if (this.CHUNK_CLIENTS.has(chunkid)) {
      const clients = this.CHUNK_CLIENTS.get(chunkid)
        .filter((ws) => ws.canvasId === canvasId);
      SocketServer.broadcastSelected(clients, data);
    }
  }

  reloadUser(userId, local) {
    const buffer = dehydrateChangeMe();
    this.wss.clients.forEach(async (ws) => {
      if (ws.readyState === WebSocket.OPEN
        && ws.user?.id === userId
      ) {
        const { loggedOut } = await ws.user.refresh();
        if (loggedOut) {
          delete ws.user;
        }
        if (!local) {
          ws.send(buffer);
        }
      }
    });
  }

  reloadIP(ipString, local) {
    const buffer = dehydrateChangeMe();
    this.wss.clients.forEach(async (ws) => {
      if (ws.readyState === WebSocket.OPEN
        && ws.ip.ipString === ipString
      ) {
        await ws.ip.refresh();
        if (!local) {
          ws.send(buffer);
        }
      }
    });
  }

  patchUserState(userIds, state, patch) {
    const text = `ps,${JSON.stringify([
      state, patch.op, patch.path, patch.value,
    ])}`;

    const clientArray = [];
    if (Array.isArray(userIds)) {
      this.wss.clients.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN
          && ws.user && userIds.includes(ws.user.id)
        ) {
          ws.user.patchUserState(state, patch);
          clientArray.push(ws);
        }
      });
    } else {
      this.wss.clients.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN
          && ws.user?.id === userIds
        ) {
          ws.user.patchUserState(state, patch);
          clientArray.push(ws);
        }
      });
    }

    SocketServer.broadcastSelected(clientArray, text);
  }

  checkHealth() {
    const ts = Date.now() - 120 * 1000;
    const promises = [];
    this.wss.clients.forEach((ws) => {
      promises.push(new Promise((resolve) => {
        if (
          ws.readyState === WebSocket.OPEN
          && ts > ws.timeLastMsg
        ) {
          console.info(`Killing dead websocket from ${ws.ip.ipString}`);
          ws.terminate();
          resolve();
        }
      }),
      );
    });
    return promises;
  }

  /*
   * Create object with informations of online users and give it
   * to socketEvents.
   * Is run periodically to update online counters. We have to send lists of
   * IPs around to filter out duplicates.
   */
  getOnlineUsers() {
    try {
      /*
       * {
       *   canvasId: [127.0.0.1, 127.0.0.2, ...],
       *   ...
       * }
       */
      const online = {};
      const ipUsers = {};
      const it = this.wss.clients.keys();
      let client = it.next();
      while (!client.done) {
        const ws = client.value;
        if (ws.readyState === WebSocket.OPEN && ws.canvasId !== null) {
          const { canvasId, ip: { ipString }, user } = ws;
          // ip to user mapping, not logged in = 0
          const uid = user?.id || 0;
          if (!ipUsers[ipString]) {
            ipUsers[ipString] = [uid];
          } else if (!ipUsers[ipString].includes(uid)) {
            ipUsers[ipString].push(uid);
          }
          // only count unique IPs per canvas
          if (!online[canvasId]) {
            online[canvasId] = [ipString];
          } else if (!online[canvasId].includes(ipString)) {
            online[canvasId].push(ipString);
          }
        }
        client = it.next();
      }
      socketEvents.setOnlineUsers(online, ipUsers);
    } catch (err) {
      console.error(`WebSocket online broadcast error: ${err.message}`);
    }
  }

  static async onTextMessage(text, ws) {
    const { ipString } = ws.ip;
    // rate limit
    const isLimited = rateLimiter.tick(
      ipString,
      1000,
      'text message spam',
      SocketServer.onRateLimitTrigger,
    );
    if (isLimited) {
      return;
    }
    // ---
    try {
      const comma = text.indexOf(',');
      if (comma === -1) {
        throw new Error('No comma');
      }
      const key = text.slice(0, comma);
      const val = JSON.parse(text.slice(comma + 1));
      const { user } = ws;
      switch (key) {
        case 'ck': {
          // chat message
          const message = val[0].trim();
          if (!user || !message) {
            return;
          }
          socketEvents.recvChatMessage(
            user, ws.ip, message, val[1], ws.lang, ws.ttag,
          );
          break;
        }
        case 'cv': {
          ws.openChatChannels = new Set(val[1].slice(0, 50));
          markChannelsRead(
            chatProvider.filterPublicChannels([...ws.openChatChannels]),
            ws.user?.id,
          );
          break;
        }
        case 'cs': {
          // captcha solution
          const [solution, captchaid, challengeSolution] = val;
          const ret = await checkVerificationSolutions(
            captchaid, solution, challengeSolution,
            ws.browserHash, ipString, user?.id, false,
          );
          ws.send(dehydrateCaptchaReturn(ret));
          break;
        }
        case 'mr': {
          // malware evaluation
          await evaluateMalware(user, ws.ip, ...val);
          break;
        }
        case 'cm': {
          /*
           * TODO only temporary for update notifications
           */
          ws.send(dehydrateRefresh());
          break;
        }
        default:
          throw new Error('Unknown key');
      }
    } catch (err) {
      // eslint-disable-next-line max-len
      console.error(`Got invalid ws text message ${text} from ${ipString}, with error: ${err.message}`);
    }
  }

  async onBinaryMessage(buffer, ws) {
    try {
      const { ipString } = ws.ip;
      const opcode = buffer[0];

      // rate limit
      let limiterDeltaTime = 200;
      let reason = 'socket spam';
      if (opcode === REG_CHUNK_OP) {
        limiterDeltaTime = 40;
        reason = 'register chunk spam';
      } else if (opcode === DEREG_CHUNK_OP) {
        limiterDeltaTime = 10;
        reason = 'deregister chunk spam';
      }
      const isLimited = rateLimiter.tick(
        ipString,
        limiterDeltaTime,
        reason,
        SocketServer.onRateLimitTrigger,
      );
      if (isLimited) {
        return;
      }
      // ----

      switch (opcode) {
        case PIXEL_UPDATE_OP: {
          const { canvasId, connectedTs } = ws;

          if (canvasId === null) {
            console.info(`Closing websocket without canvas from ${ipString}`);
            ws.close();
            return;
          }

          const {
            i, j, pixels,
          } = hydratePixelUpdate(buffer);
          const {
            wait,
            coolDown,
            pxlCnt,
            rankedPxlCnt,
            retCode,
          } = await drawByOffsets(
            ws.user,
            ws.ip,
            canvasId,
            i, j,
            pixels,
            connectedTs,
          );

          if ((retCode > 9 && retCode !== 13) || pixels.length > 20) {
            rateLimiter.add(ipString, 800);
          }

          ws.send(dehydratePixelReturn(
            retCode,
            wait,
            coolDown,
            pxlCnt,
            rankedPxlCnt,
          ));
          break;
        }
        case REG_CANVAS_OP: {
          const canvasId = hydrateRegCanvas(buffer);
          if (!canvases[canvasId]) return;
          if (ws.canvasId !== canvasId) {
            this.deleteAllChunks(ws);
          }
          ws.canvasId = canvasId;
          if (canvases[canvasId].ed) return;
          const wait = await getCoolDown(ipString, ws.user?.id, canvasId);
          ws.send(dehydrateCoolDown(wait));
          break;
        }
        case REG_CHUNK_OP: {
          const chunkid = hydrateRegChunk(buffer);
          this.pushChunk(chunkid, ws);
          break;
        }
        case REG_MCHUNKS_OP: {
          this.deleteAllChunks(ws);
          hydrateRegMChunks(buffer, (chunkid) => {
            this.pushChunk(chunkid, ws);
          });
          break;
        }
        case DEREG_CHUNK_OP: {
          const chunkid = hydrateDeRegChunk(buffer);
          this.deleteChunk(chunkid, ws);
          break;
        }
        case DEREG_MCHUNKS_OP: {
          hydrateDeRegMChunks(buffer, (chunkid) => {
            this.deleteChunk(chunkid, ws);
          });
          break;
        }
        case FISH_CATCHED_OP: {
          const { sentFish } = ws;
          if (sentFish) {
            delete ws.sentFish;
            const [timeSent, type, size] = sentFish;
            if (timeSent > Date.now() - 18000) {
              ws.send(dehydrateFishCatched(true, type, size));
              // register ourselves to store it in database
              socketEvents.registerCatchedFish(ws.user, ipString, type, size);
              break;
            }
          }
          ws.send(dehydrateFishCatched(false, 0, 0));
          break;
        }
        default:
          break;
      }
    } catch (e) {
      console.error(`WebSocket Client Binary Message Error: ${e.message}`);
    }
  }

  pushChunk(chunkid, ws) {
    if (ws.chunkCnt === 20000) {
      const { ipString } = ws.ip;
      SocketServer.onRateLimitTrigger(ipString, HOUR, 'too much subscribed');
      return;
    }
    ws.chunkCnt += 1;
    let clients = this.CHUNK_CLIENTS.get(chunkid);
    if (!clients) {
      clients = [];
      this.CHUNK_CLIENTS.set(chunkid, clients);
    } else if (clients.includes(ws)) {
      return;
    }
    clients.push(ws);
  }

  deleteChunk(chunkid, ws) {
    const clients = this.CHUNK_CLIENTS.get(chunkid);
    if (!clients) {
      return;
    }
    const pos = clients.indexOf(ws);
    if (pos === -1) {
      return;
    }
    ws.chunkCnt -= 1;
    clients.splice(pos, 1);
  }

  deleteAllChunks(ws) {
    if (!ws.chunkCnt) {
      return;
    }
    for (const client of this.CHUNK_CLIENTS.values()) {
      const pos = client.indexOf(ws);
      if (pos !== -1) {
        client.splice(pos, 1);
        ws.chunkCnt -= 1;
        if (!ws.chunkCnt) {
          return;
        }
      }
    }
  }
}

export default SocketServer;
