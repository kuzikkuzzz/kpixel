/*
 * display an avatar
 */
import { memo } from 'react';

import { getColorFromId, getCharFromId } from '../core/utils.js';
import { cdn } from '../utils/utag.js';
import useLink from './hooks/link.js';
import { getUrlsFromMediaIdAndName } from '../utils/media/utils.js';

const Avatar = ({ uid, isDarkMode, avatarId }) => {
  const link = useLink();

  const avatarStyle = {
    backgroundColor: getColorFromId(uid, isDarkMode),
    color: (isDarkMode) ? '#636363' : '#a7a5a5',
  };
  const [image, thumb] = getUrlsFromMediaIdAndName(avatarId, 'avatar');
  if (thumb) {
    avatarStyle.backgroundImage = `url(${cdn`${thumb}`})`;
  }

  return (
    <div
      className="avatar"
      style={avatarStyle}
      onClick={(image) ? (evt) => {
        evt.stopPropagation();
        if (image) {
          link('PLAYER', {
            reuse: true,
            target: 'blank',
            args: { uri: image },
          });
        }
      } : undefined}
    >
      {!avatarId && getCharFromId(uid)}
    </div>
  );
};

export default memo(Avatar);
