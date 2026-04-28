/*
 * Change Mail Form
 */
/* eslint-disable jsx-a11y/no-noninteractive-element-interactions */

import { memo, useRef, useState, useEffect } from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { RiSave3Line } from 'react-icons/ri';
import { IoTrashOutline } from 'react-icons/io5';
import { t } from 'ttag';

import { cdn } from '../utils/utag.js';
import DeleteList from './DeleteList.jsx';

import {
  setUserBlock, changeProfile, changeUser,
} from '../store/actions/thunks.js';
import useProfile from './hooks/useProfile.js';
import { selectIsDarkMode } from '../store/selectors/gui.js';
import SettingsItem from './SettingsItem.jsx';
import FileUpload from './FileUpload.jsx';
import Avatar from './Avatar.jsx';

const selectBlocks = (state) => [
  state.chat.blocked,
  state.user.blockDm,
  state.user.priv,
  state.user.id,
];

/* eslint-disable max-len */
const SocialSettings = ({ done }) => {
  const [
    blocked,
    blockDm,
    priv,
    userId,
  ] = useSelector(selectBlocks, shallowEqual);
  const [fetchChange, setFetchChange] = useState(false);

  const [avatarId, customFlag] = useProfile((profile) => [
    profile.avatarId, profile.customFlag,
  ]);

  const [selectedCustomFlag, setSelectedCustomFlag] = useState(null);
  const isDarkMode = useSelector(selectIsDarkMode);
  const uploadRef = useRef();
  const flagAtlasRef = useRef();
  const flagAtlasJsonRef = useRef();
  const dispatch = useDispatch();

  useEffect(() => {
    setSelectedCustomFlag(customFlag);
  }, [customFlag]);

  const onFlagAtlasClick = async (event) => {
    /*
     * get information of flag atlas, set ref to true while fetching those
     */
    if (flagAtlasJsonRef.current === true) {
      return;
    }
    if (!flagAtlasJsonRef.current) {
      flagAtlasJsonRef.current = true;
      try {
        const response = await fetch(cdn`/cf/atlas.json`);
        flagAtlasJsonRef.current = await response.json();
      } catch {
        flagAtlasJsonRef.current = null;
        return;
      }
    }
    const { codes, width, height, margin, columns } = flagAtlasJsonRef.current;
    const rect = flagAtlasRef.current.getBoundingClientRect();
    const xRel = Math.floor((event.clientX - rect.left) / (width + margin));
    const yRel = Math.floor((event.clientY - rect.top) / (height + margin));
    const flag = codes[yRel * columns + xRel];
    setSelectedCustomFlag(flag);
  };

  return (
    <div className="inarea">

      <div className="setitem">
        <div className="setrow">
          <h3 className="settitle">{t`Avatar`}</h3>
          <div className="little-fileupload-container">
            <Avatar uid={userId} isDarkMode={isDarkMode} avatarId={avatarId} />
            <FileUpload
              acceptedTypes="image/*"
              maxFiles={1}
              uploadRef={uploadRef}
            />
            <button
              type="button"
              onClick={async () => {
                if (!fetchChange) {
                  setFetchChange(true);
                  await dispatch(changeProfile({ avatarId: null }, true));
                  setFetchChange(false);
                }
              }}
              title={t`Clear`}
              disabled={fetchChange || avatarId === null}
            >
              <IoTrashOutline />
            </button>
            <button
              type="button"
              onClick={async () => {
                if (!fetchChange) {
                  const files = await uploadRef.current?.();
                  if (files.length) {
                    setFetchChange(true);
                    await dispatch(changeProfile({
                      avatarId: files[0].mediaId,
                    }, true));
                    setFetchChange(false);
                  }
                }
              }}
              title={t`Save`}
              disabled={fetchChange}
            >
              <RiSave3Line />
            </button>
          </div>
        </div>
        <div className="modaldesc">{
          t`Select your Avatar. Supported Formats: jpg, gif, png, webp`
        }</div>
        <div className="modaldivider" />
      </div>


      <h3
        style={{ textAlign: 'left' }}
      >{t`Custom Flag`}</h3>
      <p>
        {(selectedCustomFlag) ? (
          <span key="cfs">
            {t`Selected Flag:`}
            &nbsp;
            <img
              className="chatflag illegit"
              src={cdn`/cf/${selectedCustomFlag}.gif`}
              alt={selectedCustomFlag}
            />
          </span>
        ) : (
          <span key="ncf">{t`No flag selected`}</span>
        )}
        &nbsp;
        <button
          type="button"
          onClick={() => setSelectedCustomFlag(null)}
          title={t`Clear`}
          disabled={fetchChange || !selectedCustomFlag}
        >
          <IoTrashOutline />
        </button>
        <button
          type="button"
          onClick={async () => {
            if (!fetchChange) {
              setFetchChange(true);
              await dispatch(changeProfile({
                customFlag: selectedCustomFlag,
              }, true));
              setFetchChange(false);
            }
          }}
          title={t`Save`}
          disabled={fetchChange || customFlag === selectedCustomFlag}
        >
          <RiSave3Line />
        </button>
      </p>
      <div style={{ overflow: 'auto' }}>
        <img
          src={cdn`/cf/atlas.png`}
          alt={t`Select Flag`}
          ref={flagAtlasRef}
          onClick={onFlagAtlasClick}
          style={{ cursor: 'pointer' }}
          onDragStart={(e) => e.preventDefault()}
        />
      </div>
      <div className="modaldesc">{
        t`Note: Your active Faction may overwrite your flag settings.`
      }</div>
      <div className="modaldivider" />

      <SettingsItem
        title={t`Block DMs`}
        value={blockDm}
        onToggle={async () => {
          if (!fetchChange) {
            setFetchChange(true);
            await dispatch(changeUser({ blockDm: !blockDm }, true));
            setFetchChange(false);
          }
        }}
      >{t`Block all Private Messages. Enabling this will make it impossible for other users to start messaging you. You can still start new DMs with other users and already ongoing DMs will still be open.`}</SettingsItem>
      <SettingsItem
        title={t`Private`}
        value={priv}
        onToggle={async () => {
          if (!fetchChange) {
            setFetchChange(true);
            await dispatch(changeUser({ priv: !priv }, true));
            setFetchChange(false);
          }
        }}
      >{t`Don't show me in global stats`}</SettingsItem>
      <h3
        style={{
          textAlign: 'left',
          marginLeft: 10,
        }}
      >{t`Unblock Users`}</h3>
      {
        (blocked.length) ? (
          <DeleteList
            list={blocked}
            callback={async (id, name) => {
              if (!fetchChange) {
                setFetchChange(true);
                dispatch(setUserBlock(id, name, false));
                setFetchChange(false);
              }
            }}
            enabled={!fetchChange}
          />
        )
          : <p>{t`You have no users blocked`}</p>
      }
      <div className="modaldivider" />
      <button
        type="button"
        onClick={done}
        style={{ margin: 10 }}
      >
        Done
      </button>
    </div>
  );
};

export default memo(SocialSettings);
