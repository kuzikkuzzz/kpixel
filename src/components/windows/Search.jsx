/*
 * Search for users and factions
 */
import React, {
  useState, useContext, useCallback,
} from 'react';
import { t } from 'ttag';

import WindowContext from '../context/window.js';
import { cdn } from '../../utils/utag.js';
import { getUrlsFromMediaIdAndName } from '../../utils/media/utils.js';
import useLink from '../hooks/link.js';
import { requestSearch } from '../../store/actions/fetch.js';

const Search = () => {
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState([]);
  const [results, setResults] = useState(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [sortBy, setSortBy] = useState(0);

  const link = useLink();

  const {
    args,
    setArgs,
    setTitle,
  } = useContext(WindowContext);
  const { activeTab = 'users' } = args;

  const tabNames = {
    users: t`Users`,
    factions: t`Factions`,
  };

  const setActiveTab = useCallback((tab) => {
    setArgs({
      activeTab: tab,
    });
    setTitle(tabNames[tab]);
    setResults(null);
    setSubmitting(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setArgs, setTitle]);

  const submitSearch = useCallback(async (evt) => {
    evt.preventDefault();
    const term = evt.target.term.value;
    if (!term || term.trim() === '') {
      return;
    }
    setSubmitting(true);
    const reqSearchResults = await requestSearch(activeTab, term);
    setSubmitting(false);
    if (reqSearchResults.errors) {
      setErrors(reqSearchResults.errors);
      return;
    }
    setResults(reqSearchResults);
    setSortBy(1);
    setSortAsc(true);
  }, [activeTab]);

  const availableTabs = Object.keys(tabNames);

  return (
    <div className="content">
      <h2>{t`Search`}</h2>
      <div className="tab-container">
        {availableTabs.map((tab, ind) => (
          <React.Fragment key={tab}>
            <span
              role="button"
              tabIndex={-1}
              className={
              (activeTab === tab) ? 'modallink selected' : 'modallink'
            }
              onClick={() => setActiveTab(tab)}
            >{tabNames[tab]}</span>
            {(ind !== availableTabs.length - 1)
            && <span className="hdivider" />}
          </React.Fragment>
        ))}
        <div className="modaldivider" />
        {errors.map((error) => (
          <p key={error} className="errormessage">
            <span>{t`Error`}</span>:&nbsp;{error}</p>
        ))}
      </div>
      <form onSubmit={submitSearch} className="tab-container">
        <input
          type="text"
          name="term"
          placeholder={t`Search Term`}
          required
        />
        <button
          type="submit"
          disabled={submitting}
        >
          {t`Search`}
        </button>
      </form>
      {(results?.rows.length) ? (
        <table>
          <thead>
            <tr>
              {results.columns.map((col, ind) => (
                <th
                  key={col}
                  style={
                    (sortBy === ind) ? {
                      cursor: 'pointer',
                      fontWeight: 'normal',
                    } : {
                      cursor: 'pointer',
                    }
                  }
                  onClick={() => {
                    if (sortBy === ind) {
                      setSortAsc(!sortAsc);
                    } else {
                      setSortBy(ind);
                    }
                  }}
                >{col}</th>
              ))}
            </tr>
          </thead>
          <tbody style={{ userSelect: 'text' }}>
            {results.rows.sort((a, b) => {
              a = a[sortBy];
              b = b[sortBy];
              if (typeof a === 'string' && typeof b === 'string') {
                let ret = a.localeCompare(b);
                if (sortAsc) ret *= -1;
                return ret;
              }
              if (!a) a = 0;
              if (!b) b = 0;
              if (a < b) return (sortAsc) ? -1 : 1;
              if (a > b) return (sortAsc) ? 1 : -1;
              return 0;
            }).map((row) => (
              /* eslint-disable react/no-array-index-key */
              <tr key={row[1]}>
                {row.map((val, ind) => {
                  const type = results.types[ind];
                  switch (type) {
                    case 'bool':
                      return (<td key={ind}>{val && 'X'}</td>);
                    case 'faction': {
                      const seperator = val.lastIndexOf(',');
                      if (seperator === -1) {
                        return (<td key={ind}>{val}</td>);
                      }
                      const name = val.substring(seperator + 1);
                      return (
                        <td key={ind}>
                          <span
                            role="button"
                            tabIndex={-1}
                            className="modallink"
                            onClick={(evt) => {
                              evt.stopPropagation();
                              link('FACTION', {
                                target: 'blank',
                                args: { name },
                              });
                            }}
                          >
                            {`${val.substring(0, seperator)} [${name}]`}
                          </span>
                        </td>
                      );
                    }
                    case 'user': {
                      const seperator = val.lastIndexOf(',');
                      if (seperator === -1) {
                        return (<td key={ind}>{val}</td>);
                      }
                      const username = val.substring(seperator + 1);
                      return (
                        <td key={ind}>
                          <span
                            role="button"
                            tabIndex={-1}
                            className="modallink"
                            onClick={(evt) => {
                              evt.stopPropagation();
                              link('USER', {
                                target: 'parent',
                                args: { username },
                              });
                            }}
                          >
                            {`${val.substring(0, seperator)} [${username}]`}
                          </span>
                        </td>
                      );
                    }
                    case 'mediaId': {
                      // eslint-disable-next-line prefer-const
                      let [url,, thumb] = getUrlsFromMediaIdAndName(val);
                      if (thumb) {
                        thumb = `url(${cdn`${url}`})`;
                      }
                      return (
                        <td key={ind}>
                          <div
                            className="search-media"
                            style={{
                              backgroundImage: thumb || undefined,
                            }}
                            onClick={(url) ? (evt) => {
                              evt.stopPropagation();
                              link('PLAYER', {
                                reuse: true,
                                target: 'blank',
                                args: { uri: url },
                              });
                            } : undefined}
                          />
                        </td>
                      );
                    }
                    case 'flagId': {
                      const url = getUrlsFromMediaIdAndName(val)[0];
                      if (url) {
                        return (
                          <td key={ind}>
                            <img
                              src={cdn`${url}`}
                              className="chatflag"
                              title={val}
                              alt=""
                            />
                          </td>
                        );
                      }
                      return (<td key={ind} />);
                    }
                    case 'ts':
                      return (
                        <td key={ind}>{
                      (new Date(val)).toLocaleDateString()
                    }</td>
                      );
                    default:
                      return (<td key={ind}>{val}</td>);
                  }
                  /* eslint-enable react/no-array-index-key */
                })}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p>{
          (results) ? t`No results.` : t`Enter search term and press Search.`
        }</p>
      )}
    </div>
  );
};

export default Search;
