/**
 *
 */

import React, {
  useRef, useLayoutEffect, useState, useEffect, useCallback, useContext,
  useMemo,
} from 'react';
import useStayScrolled from 'react-stay-scrolled';
import { useSelector, useDispatch } from 'react-redux';
import { t } from 'ttag';

import WindowContext from '../context/window.js';
import MenuContext from '../context/menu.js';
import useLink from '../hooks/link.js';
import ChatMessage from '../ChatMessage.jsx';
import FileUpload from '../FileUpload.jsx';
import ChannelDropDown from '../ChannelDropDown.jsx';
import { CHANNEL_TYPES } from '../../core/constants.js';
import { escapeMd } from '../../core/utils.js';

import {
  markChannelAsRead, sendChatMessage, refCountChatChannel,
} from '../../store/actions/index.js';
import { receiveChatMessage } from '../../store/actions/socket.js';
import { receiveChatHistory } from '../../store/actions/thunks.js';
import { requestChatMessages } from '../../store/actions/fetch.js';


const Chat = () => {
  const listRef = useRef();
  const targetRef = useRef();
  const inputRef = useRef();
  const uploadRef = useRef();
  const scrollRef = useRef();
  const waitingForUpload = useRef();
  const historyFetchRef = useRef();

  const [blockedIds, setBlockedIds] = useState([]);
  const [btnSize, setBtnSize] = useState(20);

  const dispatch = useDispatch();

  const ownName = useSelector((state) => state.user.name);
  const chatCompact = useSelector((state) => state.gui.chatCompact);
  const {
    channels, messages, blocked, channelViews,
  } = useSelector((state) => state.chat);

  const { args, setArgs, setTitle } = useContext(WindowContext);
  const { openMenu } = useContext(MenuContext);

  const chatChannel = args.chatChannel || 0;
  const previousChatChannelRef = useRef();

  const setChannel = useCallback((cid) => {
    setArgs({ chatChannel: Number(cid) });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const previousChatChannel = previousChatChannelRef.current;
    if (!previousChatChannel && !chatChannel) {
      return;
    }
    previousChatChannelRef.current = chatChannel;
    const cidRefCountAdditions = {};
    if (previousChatChannel) {
      cidRefCountAdditions[previousChatChannel] = -1;
    }
    if (chatChannel) {
      cidRefCountAdditions[chatChannel] = 1;
      dispatch(markChannelAsRead(chatChannel));
    }
    dispatch(refCountChatChannel(cidRefCountAdditions));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatChannel]);

  useEffect(() => () => {
    if (previousChatChannelRef.current) {
      dispatch(refCountChatChannel({
        [previousChatChannelRef.current]: -1,
      }));
    }
  },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  []);

  const [
    channelName, channelType, channelMuted, channelAvatarId,
  ] = useMemo(() => {
    const types = Object.keys(channels);
    for (let i = 0; i < types.length; i += 1) {
      const typeChannels = channels[types[i]];
      for (let u = 0; u < typeChannels.length; u += 1) {
        const typeChannel = typeChannels[u];
        if (typeChannel[0] === chatChannel) {
          return [
            typeChannel[1], Number(types[i]), typeChannel[4], typeChannel[5],
          ];
        }
      }
    }
    return ['', CHANNEL_TYPES.PUBLIC, true, null];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatChannel, channels]);

  useEffect(() => {
    if (channelName) {
      setTitle(`${t`Channel`}: ${channelName}`);
    } else {
      /*
       * set channel if not exists
       */
      let replacementChannel = channels[CHANNEL_TYPES.PUBLIC]?.[0];
      if (!replacementChannel) {
        replacementChannel = channels[CHANNEL_TYPES.FACTION]?.[0];
      }
      if (replacementChannel) {
        setChannel(replacementChannel[0]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelName, channels[CHANNEL_TYPES.PUBLIC]?.length]);

  const link = useLink();

  const printWarnings = useCallback((warnings) => {
    warnings.forEach((warning) => {
      dispatch(receiveChatMessage(
        // eslint-disable-next-line max-len
        chatChannel, false, 'info', warning, 'xx', 0, Math.floor(Date.now() / 1000), 0, false, null, [],
      ));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatChannel]);

  const addToInput = useCallback((msg) => {
    const inputElem = inputRef.current;
    if (!inputElem) {
      return;
    }
    let newInputMessage = inputElem.value;
    if (newInputMessage.slice(-1) !== ' ') {
      newInputMessage += ' ';
    }
    newInputMessage += `${msg} `;
    inputElem.value = newInputMessage;
    inputRef.current.focus();
  }, []);

  const openUserCm = useCallback((x, y, userName, uid) => {
    openMenu(
      'USER', x, y, { name: userName, uid, setChannel, addToInput },
    );
  }, [setChannel, addToInput, openMenu]);

  const { stayScrolled } = useStayScrolled(listRef, {
    initialScroll: Infinity,
    inaccuracy: 20,
  });

  const channelMessages = messages[chatChannel];

  useEffect(() => {
    if (messages[chatChannel] || !channelViews[chatChannel] || !channelName) {
      return;
    }

    if (historyFetchRef.current) {
      const { controller, cid } = historyFetchRef.current;
      if (cid === chatChannel) {
        return;
      }
      if (!controller.signal.aborted) {
        controller.abort();
      }
    }

    const fetchHistory = async () => {
      const controller = new AbortController();
      historyFetchRef.current = { controller, cid: chatChannel };
      const history = await requestChatMessages(chatChannel, controller);
      if (history) {
        dispatch(receiveChatHistory(chatChannel, history));
        historyFetchRef.current = null;
      } else if (!controller.signal.aborted) {
        setTimeout(fetchHistory, 5000);
      }
    };
    fetchHistory();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatChannel, messages, channelName, channelViews]);

  useEffect(() => () => {
    // cancel history fetches
    if (historyFetchRef.current) {
      const { controller } = historyFetchRef.current;
      if (!controller.signal.aborted) {
        controller.abort();
      }
    }
  }, []);

  useLayoutEffect(() => {
    stayScrolled();
  }, [channelMessages, stayScrolled]);

  useEffect(() => {
    scrollRef.current = stayScrolled;
  }, [stayScrolled]);

  useEffect(() => {
    setTimeout(() => {
      const fontSize = Math.round(targetRef.current.offsetHeight / 10);
      setBtnSize(Math.min(28, fontSize));
    }, 330);
  }, [targetRef]);

  useEffect(() => {
    const bl = [];
    for (let i = 0; i < blocked.length; i += 1) {
      bl.push(blocked[i][0]);
    }
    setBlockedIds(bl);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocked.length]);

  async function handleSubmit(evt) {
    evt.preventDefault();
    if (waitingForUpload.current) {
      return;
    }
    waitingForUpload.current = true;

    try {
      let inptMsg = inputRef.current.value.trim();
      // if there are files to upload, do that and add links to them
      const files = await uploadRef.current?.();
      if (files.length) {
        const attachments = files.map(
          // eslint-disable-next-line max-len
          (i) => `$[${escapeMd(i.name)}](${i.shortId}:${i.extension})`,
        ).join(' ');
        if (attachments) {
          inptMsg = `${inptMsg} ${attachments}`;
        }
      }
      if (!inptMsg) {
        return;
      }
      // send message via websocket
      dispatch(sendChatMessage(inptMsg, chatChannel));
      inputRef.current.value = '';
    } finally {
      waitingForUpload.current = false;
    }
  }

  return (
    <div
      ref={targetRef}
      className="chat-container"
    >
      <ul
        className="chatarea"
        ref={listRef}
        style={{ flexGrow: 1 }}
        role="presentation"
      >
        {(channelMessages?.length === 0) && (
          <ChatMessage
            key="initm"
            uid={0}
            name="info"
            flag="xx"
            msg={t`Start chatting here`}
          />
        )}
        {
          channelMessages?.map((message) => (
            (!blockedIds.includes(message[3])) && (
              <ChatMessage
                name={message[0]}
                msg={message[1]}
                flag={message[2]}
                uid={message[3]}
                ts={message[4]}
                msgId={message[5]}
                flagLegit={message[6]}
                avatarId={message[7]}
                attachments={message[8]}
                key={message[5]}
                openCm={openUserCm}
                scrollRef={scrollRef}
                compact={chatCompact}
              />
            )))
        }
      </ul>
      <div
        className="chatinput"
        key="iptfl"
        style={{
          display: 'flex',
        }}
      >
        {(ownName) ? (
          <React.Fragment key="iptfr">
            <input
              key="iptre"
              style={{
                flexGrow: 1,
                minWidth: 40,
              }}
              ref={inputRef}
              onKeyDown={(evt) => {
                if (evt.key === 'Enter') {
                  handleSubmit(evt);
                }
              }}
              autoComplete="off"
              maxLength="200"
              type="text"
              className="chtipt"
              placeholder={t`Chat here`}
            />
            <FileUpload
              key="fui"
              maxFiles={3}
              uploadRef={uploadRef}
              printErrors={printWarnings}
            />
            <button
              className="sendbtn"
              style={{ flexGrow: 0, width: 32 }}
              type="button"
              onClick={handleSubmit}
            >
              ‣
            </button>
          </React.Fragment>
        ) : (
          <div
            className="modallink"
            key="nlipt"
            onClick={(evt) => {
              evt.stopPropagation();
              link('USERAREA', { target: 'parent' });
            }}
            style={{
              textAlign: 'center',
              fontSize: 13,
              flexGrow: 1,
            }}
            role="button"
            tabIndex={0}
          >
            {t`You must be logged in to chat`}
          </div>
        )}
        <ChannelDropDown
          key="cdd"
          setChatChannel={setChannel}
          chatChannel={chatChannel}
          channelName={channelName}
          channelType={channelType}
          channelAvatarId={channelAvatarId}
        />
      </div>
      <div
        className="chatlink"
        style={{
          fontSize: btnSize,
        }}
      >
        <span
          onClick={(evt) => {
            openMenu(
              'CHANNEL', evt.clientX, evt.clientY, {
                cid: chatChannel, type: channelType, muted: channelMuted,
              }, 'tr',
            );
          }}
          role="button"
          title={t`Channel settings`}
          tabIndex={-1}
        >⚙</span>
      </div>
    </div>
  );
};

export default Chat;
