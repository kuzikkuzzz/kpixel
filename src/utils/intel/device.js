import crypto from 'crypto';

/**
 * analyse device of request
 * @param req expressjs request
 * @return {
 *   hash,
 *   browser,
 *   device,
 *   os,
 *   headerSignature,
 * }
 */
export default function getDeviceInfo(req) {
  const { headers, rawHeaders } = req;
  let browser = 'Unknown';
  let os = 'Unknown';
  let device = 'Desktop';

  const uaPlatformCH = req.headers['sec-ch-ua-platform'];
  if (uaPlatformCH) {
    os = uaPlatformCH;
    if (os.startsWith('"')) {
      os = os.substring(1, os.length - 1);
    }
  }

  const uaMobileCH = req.headers['sec-ch-ua-mobile'];
  if (uaMobileCH === '?1') {
    device = 'Mobile';
  }

  let userAgent = req.headers['user-agent'];
  if (!userAgent) {
    userAgent = req.headers['sec-ch-ua'];
  }
  if (userAgent) {
    userAgent = userAgent.toLowerCase();

    if (userAgent.includes('opera')) {
      browser = 'Opera';
    } else if (userAgent.includes('brave')) {
      browser = 'Brave';
    } else if (userAgent.includes('edge') || userAgent.includes('edg/')) {
      browser = 'Edge';
    } else if (userAgent.includes('firefox')) {
      browser = 'Firefox';
    } else if (userAgent.includes('chrome') || userAgent.includes('chromium')) {
      browser = 'Chrome';
    } else if (userAgent.includes('safari')) {
      browser = 'Safari';
    }

    if (!uaMobileCH || !uaPlatformCH) {
      if (userAgent.includes('android')) {
        os = 'Android';
        device = 'Mobile';
      } else if (userAgent.includes('linux')) {
        os = 'Linux';
      } else if (userAgent.includes('Windows')) {
        os = 'Windows';
      } else if (userAgent.includes('macintosh')) {
        os = 'macOS';
        // eslint-disable-next-line max-len
      } else if (userAgent.includes('iphone') || userAgent.includes('ios') || userAgent.includes('ipad')) {
        os = 'iOS';
        device = 'Mobile';
      }
    }
  }

  let headerSignature = '';
  for (let i = 0; i < rawHeaders.length; i += 2) {
    const header = rawHeaders[i].toLowerCase();
    if (header.startsWith('sec')
      || header === 'connection' || header === 'accept'
    ) {
      headerSignature += rawHeaders[i].charAt(0);
    } else if (header === 'accept-language') {
      headerSignature += rawHeaders[i].charAt(7);
    }
  }

  if (headerSignature.length > 12) {
    headerSignature = headerSignature.substring(0, 12);
  }
  if (browser.length > 20) {
    browser = browser.substring(0, 20);
  }
  if (device.length > 20) {
    device = device.substring(0, 20);
  }
  if (os.length > 20) {
    os = os.substring(0, 20);
  }

  const hash = crypto.createHash('sha224')
    // eslint-disable-next-line max-len
    .update(headerSignature + browser + os + device + headers.accept + headers['accept-language'])
    .digest('base64url')
    .substring(0, 15);

  /*
    * hash for a specific browser that only fits temporary and isn't stored,
    * supposed to ensure session consistency
    */
  let browserHash = crypto.createHash('sha224')
    .update(headers['user-agent'] + headers.host);
  if (browser === 'Safari') {
    browserHash.update(os + device);
  } else {
    browserHash.update(headers['accept-encoding'] || '');
  }
  if (headers['accept-language']) {
    let language = headers['accept-language'].split(',').map((l) => {
      const separator = l.indexOf(';');
      return separator !== -1 ? l.substring(0, separator) : l;
    }).sort().join(',');
    browserHash.update(language);
  }
  browserHash = browserHash.digest('base64url').substring(0, 15);

  /*
  console.log('HASH', browserHash, headers['user-agent'], headers.host,
    headers['accept-language'], headers['accept-encoding'], browser, os,
    device,
  );
  */
  return { hash, device, browser, os, headerSignature, browserHash };
}
