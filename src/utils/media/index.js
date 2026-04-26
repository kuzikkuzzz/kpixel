/*
 * media processing and storing
 */
import path from 'path';
import fs from 'fs';

import { getRandomString } from '../../core/utils.js';
import {
  registerMedia, deregisterMedia, hasMedia, hasSimilarMedia,
} from '../../data/sql/Media.js';
import { MEDIA_FOLDER, MAX_FILE_SIZE_MB } from '../../core/config.js';

import calculateHash from './hash.js';
import calculatePHash from './phash.js';
import stripExif, { destruct } from './stripExif.js';
import createVideoThumbnails from './videoThumbnails.js';
import createImageThumbnails from './imageThumbnails.js';
import resizeImage from './resizeImage.js';
import { checkIfMediaBanned } from '../../core/ban.js';
import { splitFilename } from './utils.js';
import { checkTotalQuotaReached, checkUserQuotaReached } from './quotas.js';
import {
  mimeTypeFitsToExt, isMimeTypeAllowed, getThumbnailPaths,
} from './serverUtils.js';

export {
  createImageThumbnails, createVideoThumbnails,
  calculateHash, calculatePHash, stripExif, destruct,
  mimeTypeFitsToExt, isMimeTypeAllowed,
};


/**
 * store stream into file, check for size limits and stalling
 * @param fileStream input stream
 * @param filePath output file
 * @return Promise<size>
 */
function storeFileStream(fileStream, filePath) {
  return new Promise((resolve, reject) => {
    let ended = false;
    let totalSize = 0;
    const startTime = Date.now();
    let timeoutStartTime;
    let timeout;

    const writeStream = fs.createWriteStream(filePath);

    const cancel = (error) => {
      if (ended) {
        return;
      }
      ended = true;
      clearTimeout(timeout);
      writeStream.destroy();
      if (typeof error === 'string') {
        error = new Error(error);
      }
      reject(error);
    };

    /*
     * have to deel with drip-feeding data to hog up resources
     */
    const resetTimeout = () => {
      if (timeout) {
        clearTimeout(timeout);
      }
      timeoutStartTime = Date.now();
      timeout = setTimeout(() => cancel('stalled'), 30000);
    };

    resetTimeout();

    fileStream.on('data', (chunk) => {
      if (ended) {
        return;
      }
      totalSize += chunk.length;
      if (MAX_FILE_SIZE_MB && totalSize > MAX_FILE_SIZE_MB * 1024 * 1024) {
        cancel('too_long');
        return;
      }
      const now = Date.now();
      if (now - timeoutStartTime > 15000) {
        if (totalSize / (now - startTime) < 8) {
          cancel('stalled');
          return;
        }
        resetTimeout();
      }
    });

    fileStream.on('error', cancel);
    fileStream.on('limit', cancel);
    writeStream.on('error', cancel);

    writeStream.on('close', () => {
      if (ended) {
        return;
      }
      ended = true;
      clearTimeout(timeout);
      resolve(totalSize);
    });

    fileStream.pipe(writeStream);
  });
}

/**
 * store media file from filestream
 * @param fileStream
 * @param info { mimeType, filename }
 * @param [userId]
 * @param [ipString]
 * @param [hashCheck] sha256 hash in hex that we check against
 * @param [restrictType] exclusive type to allow 'audio', 'video', 'image', ...
 * @param [resize] resize to target dimension [width, height]
 * @return {
 *   hash,
 *   extension,
 *   mimeType,
 *   shortId,
 *   name,
 *   originalFilename,
 *   [existed],
 * }
 */
export async function storeMediaStream(
  fileStream, info, userId, ipString, hashCheck, restrictType, resize,
) {
  const { mimeType } = info;

  /*
   * ensure sane type
   */
  const filename = info.filename?.trim();
  if (!filename || !mimeType) {
    throw new Error('no_info');
  }
  const [name, extension] = splitFilename(filename);

  if (!mimeTypeFitsToExt(mimeType, filename)) {
    throw new Error('unknown_type');
  }

  const type = mimeType.substring(0, mimeType.indexOf('/'));
  if (restrictType && type !== restrictType) {
    throw new Error('invalid_type');
  }

  const model = {
    name, mimeType, type, extension,
    originalFilename: filename,
  };

  if (hashCheck) {
    model.hash = hashCheck;
    /*
     * if hash got given already, check if file already exists
     */
    await hasMedia(model);
    if (model.shortId) {
      if (resize && (resize[0] !== model.width || resize[1] !== model.height)) {
        delete model.shortId;
      } else {
        return model;
      }
    }
  }

  if (await checkTotalQuotaReached()) {
    throw new Error('total_quota_reached');
  }

  if (await checkUserQuotaReached(userId, ipString)) {
    throw new Error('user_quota_reached');
  }

  /*
   * store file temporary until we got hash
   */
  const tmpFolder = path.resolve(MEDIA_FOLDER, 'tmp');
  const temporaryFile = path.join(
    tmpFolder, `${getRandomString() + getRandomString()}.${extension}`,
  );
  const tempFileList = [temporaryFile];
  let targetFile;

  /*
   * make sure temporary folder exists
   */
  if (!fs.existsSync(tmpFolder)) {
    fs.mkdirSync(tmpFolder, { recursive: true });
  }

  try {
    /*
     * store stream into temporary file
     */
    const size = await storeFileStream(fileStream, temporaryFile);

    /*
     * if it is an image, calculate perceptive hash
     */
    let pHash = null;
    if (type === 'image') {
      try {
        pHash = await calculatePHash(temporaryFile);
      } catch {
        throw new Error('broken_file');
      }
    }

    /*
     * calculate hash
     */
    model.hash = await calculateHash(temporaryFile);

    /*
     * check if file already exists
     */
    await hasMedia(model);
    if (model.shortId) {
      if (resize && (resize[0] !== model.width || resize[1] !== model.height)) {
        delete model.shortId;
      } else {
        return model;
      }
    }

    if (pHash) {
      await hasSimilarMedia(model, pHash);
      if (model.shortId) {
        if (resize && (
          resize[0] !== model.width || resize[1] !== model.height
        )) {
          delete model.shortId;
        } else {
          return model;
        }
      }
    }

    /*
     * check if media is banned
     */
    const bans = await checkIfMediaBanned(model.hash, pHash, userId, ipString);
    if (bans.length) {
      const { reason, mbid } = bans[0];
      throw new Error(`media_banned_reason_${String(reason)}_${mbid}`);
    }

    /*
     * strip exif data
     */
    await stripExif(temporaryFile);

    /*
     * create thumbnails and get dimensions
     */
    const tempScreencapFilePath = `${temporaryFile}_full`;
    const tempThumbFilePath = `${temporaryFile}_thumb`;
    const tempIconFilePath = `${temporaryFile}_icon`;
    let width = null;
    let height = null;
    let avgColor = null;
    if (type === 'image' || type === 'video') {
      tempFileList.push(tempThumbFilePath, tempIconFilePath);
      if (type === 'image') {
        ({ width, height, avgColor } = await createImageThumbnails(
          temporaryFile, tempThumbFilePath, tempIconFilePath,
        ));
      } else if (type === 'video') {
        tempFileList.push(tempScreencapFilePath);
        ({ width, height, avgColor } = await createVideoThumbnails(
          temporaryFile,
          tempScreencapFilePath, tempThumbFilePath, tempIconFilePath,
        ));
      }
    }

    /*
     * resize image if wanted
     */
    if (type === 'image' && resize) {
      const [targetWidth, targetHeight] = resize;
      if (targetWidth !== width || targetHeight !== height) {
        await resizeImage(temporaryFile, targetWidth, targetHeight);
        width = targetWidth;
        height = targetHeight;
      }

      /*
       * need to recalculate hash and recheck for duplicates
       */
      model.hash = await calculateHash(temporaryFile);
      await hasMedia(model);
      if (model.shortId) {
        return model;
      }
    }

    /*
     * register media, this gives us the shortId for storage
     */
    await registerMedia(model, size, width, height, avgColor, pHash);
    if (!model.shortId) {
      throw new Error('server_error');
    }

    try {
      /*
      * move files to target folder by hash
      */
      targetFile = `${model.shortId}.${extension}`;
      const targetFolder = path.resolve(
        MEDIA_FOLDER,
        targetFile.substring(0, 2),
        targetFile.substring(2, 4),
      );
      if (!fs.existsSync(targetFolder)) {
        fs.mkdirSync(targetFolder, { recursive: true });
      }
      targetFile = path.resolve(targetFolder, targetFile.substring(4));
      fs.renameSync(temporaryFile, targetFile);

      if (type === 'image' || type === 'video') {
        const {
          thumbFilePath, iconFilePath, screencapFilePath,
        } = getThumbnailPaths(targetFile);
        fs.renameSync(tempThumbFilePath, thumbFilePath);
        fs.renameSync(tempIconFilePath, iconFilePath);
        if (type === 'video') {
          fs.renameSync(tempScreencapFilePath, screencapFilePath);
        }
      }
      return model;
    } catch (error) {
      await deregisterMedia(model.shortId, model.mimeType, model.extension);
      throw error;
    }
  } finally {
    for (let i = 0; i < tempFileList.length; i += 1) {
      const file = tempFileList[i];
      if (fs.existsSync(file)) {
        fs.rmSync(file);
      }
    }
  }
}
