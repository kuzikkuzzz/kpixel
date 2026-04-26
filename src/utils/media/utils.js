/**
 * get extension and name from filename
 * @param filename
 * @return [ name, extension ]
 */
export function splitFilename(filename) {
  const seperator = filename.lastIndexOf('.');
  return [
    filename.substring(0, seperator),
    filename.substring(seperator + 1),
  ];
}

/**
 * add id to filename, used to distinguish between multiple files of the same
 * name
 * @param filename
 * @param id integer
 */
export function addIdToFilename(filename, id) {
  id = String(id);
  const extSeperator = filename.lastIndexOf('.');
  if (extSeperator === -1) {
    return `${filename}:${id}`;
  }
  return `${filename.substring(0, extSeperator)}:${id
  }${filename.substring(extSeperator)}`;
}

/**
 * extract id from filename in the form of name:id.png or name:id
 * @param filename
 * @return [filename, id]
 */
export function extractIdFromFilename(filename) {
  const idSeperator = filename.lastIndexOf(':');
  if (idSeperator === -1) {
    return [filename, null];
  }
  let extSeperator = filename.indexOf('.', idSeperator + 1);
  if (extSeperator === -1) {
    extSeperator = filename.length;
  }
  return [
    filename.substring(0, idSeperator) + filename.substring(extSeperator),
    parseInt(filename.substring(idSeperator + 1, extSeperator), 10),
  ];
}

/**
 * get mediaId from url
 * @param url
 */
export function getMediaDetailsFromUrl(url) {
  if (url) {
    if (url.startsWith('/') && url[4] !== '/' && url[9] === '/') {
      const shortId = url.substring(3, 9);
      let extEnd = url.indexOf('&', 10);
      if (extEnd === -1) {
        extEnd = url.length;
      }
      const extStart = url.lastIndexOf('.', extEnd) + 1;
      const extension = url.substring(extStart, extEnd);
      const name = decodeURIComponent(url.substring(10, extStart - 1));
      return [`${shortId}:${extension}`, name];
    }
  }
  return [null, null];
}

/**
 * generate url from media id and name
 * @param mediaId
 * @return url or null
 */
export function getUrlFromMediaIdAndName(mediaId, name) {
  if (!mediaId) {
    return null;
  }
  const [shortId, extension] = mediaId.split(':');
  if (!shortId || !extension) {
    return null;
  }
  return `/m/${shortId}/${encodeURIComponent(name || 'm')}.${extension}`;
}

/**
 * generate urls with tumbnail and icons from media id
 * @param mediaId
 * @return [ url, thumbnail, icon ] or null
 */
export function getUrlsFromMediaIdAndName(mediaId, name) {
  if (!mediaId) {
    return [null, null, null];
  }
  const [shortId, extension] = mediaId.split(':');
  if (!shortId || !extension) {
    return [null, null, null];
  }
  name = encodeURIComponent(name || 'm');
  return [
    `/m/${shortId}/${name}.${extension}`,
    `/m/t/${shortId}/${name}.${extension}.webp`,
    `/m/i/${shortId}/${name}.${extension}.webp`,
  ];
}
