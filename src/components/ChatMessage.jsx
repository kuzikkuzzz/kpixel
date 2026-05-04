import { memo } from 'react';
import { useSelector } from '../store/react-redux/index.js';

import MdParagraph from './markdown/MdParagraph.jsx';
import Avatar from './Avatar.jsx';
import {
  colorFromText, setBrightness, getDateTimeString,
} from '../core/utils.js';
import { selectIsDarkMode } from '../store/selectors/gui.js';
import { getUrlFromMediaIdAndName } from '../utils/media/utils.js';
import { cdn } from '../utils/utag.js';


function ChatMessage({
  name,
  uid,
  flag,
  msg,
  ts,
  flagLegit,
  avatarId,
  attachments,
  openCm,
  scrollRef,
  compact,
}) {
  const isDarkMode = useSelector(selectIsDarkMode);

  const isInfo = (name === 'info');
  const isEvent = (name === 'event');

  let className = 'msg';
  if (isInfo) {
    className += ' info';
  } else if (isEvent) {
    className += ' event';
  } else if (msg.charAt(0) === '>') {
    className += ' greentext';
  } else if (msg.charAt(0) === '<') {
    className += ' redtext';
  }

  let flagClass = 'chatflag';
  if (!flagLegit) {
    flagClass += ' illegit';
  }

  if (isInfo || isEvent) {
    return (
      <li className="chatmsg">
        <div className="msgcontent">
          <MdParagraph text={msg} className={className} />
        </div>
      </li>
    );
  }

  const msgUser = (
    <span
      key="name"
      role="button"
      tabIndex={-1}
      className="msguser"
      style={{
        cursor: 'pointer',
      }}
      onClick={(event) => {
        openCm(event.clientX, event.clientY, name, uid);
      }}
    >
      <img
        className={flagClass}
        alt=""
        title={flag}
        src={(flag.length === 2)
          ? cdn`/cf/${flag}.gif`
          : cdn`${getUrlFromMediaIdAndName(flag, 'flag')}`}
      />
      <span
        className="chatname"
        style={{
          color: setBrightness(colorFromText(name), isDarkMode),
        }}
        title={name}
      >
        {name}
      </span>
      {': '}
    </span>
  );

  if (compact) {
    return (
      <li className="chatmsg compact">
        {msgUser}
        <MdParagraph
          text={msg}
          className={className}
          attachmentInfo={attachments}
          scrollRef={scrollRef}
          compact
        />
      </li>
    );
  }

  return (
    <li className="chatmsg full">
      <Avatar uid={uid} isDarkMode={isDarkMode} avatarId={avatarId} />
      <div className="msgcontent">
        <div className="msgheader">
          {msgUser}
          <span className="chatts">
            {getDateTimeString(ts)}
          </span>
        </div>
        <MdParagraph
          text={msg}
          className={className}
          attachmentInfo={attachments}
          scrollRef={scrollRef}
        />
      </div>
    </li>
  );
}

export default memo(ChatMessage);
