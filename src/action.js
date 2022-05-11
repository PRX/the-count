const AWS = require('aws-sdk');
const crypto = require('crypto');

const kinesis = new AWS.Kinesis({ apiVersion: '2013-12-02' });

// Base64 1x1 transparent GIF
const PIXEL = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

const SESSION_COOKIE_NAME = 'theCount.session_id';
const USER_ID_COOKIE_NAME = 'theCount.uuid';

// The max-age of the user cookie, in seconds
const MAX_USER_AGE = 3600 * 24 * 365 * 10; // 10 years
// The max-age of the session cookie, in seconds
const MAX_SESSION_LENGTH = 3600;

// Convert an array to comma-separated list
function formatToCSVLine(params) {
  return `"${params.map((x) => ('' + x).replace(/"/g, '""')).join('","')}"`;
}

function formatDate(date) {
  return date.toISOString().replace('T', ' ').replace(/\..*/, '');
}

function dataFromEvent(event, userId, sessionId) {
  return [
    formatDate(new Date()),
    userId,
    sessionId,
    event.headers['user-agent'],
    event?.queryStringParameters?.user_id || '',
    event.headers?.['x-forwarded-for'] || event.requestContext.http.sourceIp,
    event?.queryStringParameters?.referrer || '',
    event?.queryStringParameters?.url || '',
    event?.queryStringParameters?.embedder || '',
    event?.queryStringParameters?.action || '',
    event?.queryStringParameters?.action_value || '',
  ];
}

function getUserId(event) {
  // Re-use an existing user ID if one exists
  if (event?.cookies?.find((c) => c.startsWith(`${USER_ID_COOKIE_NAME}=`))) {
    const reqCookie = event.cookies.find((c) =>
      c.startsWith(`${USER_ID_COOKIE_NAME}=`),
    );
    const reqCookieValue = reqCookie.split('=', 2)[1];
    return reqCookieValue;
  }

  // Create a new user ID if there isn't one yet
  // The user ID is a hash of the IP and the current timestamp
  const msg = event.requestContext.http.sourceIp + new Date().getTime();
  return crypto
    .createHash('sha1')
    .update(msg)
    .digest('base64')
    .substring(0, 27);
}

function getSessionId(event, userId) {
  // Re-use an existing session ID if one exists
  if (event?.cookies?.find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`))) {
    const reqCookie = event.cookies.find((c) =>
      c.startsWith(`${SESSION_COOKIE_NAME}=`),
    );
    const reqCookieValue = reqCookie.split('=', 2)[1];
    return reqCookieValue;
  }

  // Create a new session ID if there isn't one yet
  // The session ID is a hash of the user ID, current timestamp, and IP
  const msg = [
    userId,
    new Date().getTime(),
    event.requestContext.http.sourceIp,
  ].join('');
  return crypto
    .createHash('sha1')
    .update(msg)
    .digest('base64')
    .substring(0, 27);
}

function bakeCookie(cookieName, cookieValue, maxAge) {
  const configuredValue = [
    cookieValue,
    `Domain=${process.env.COOKIE_DOMAIN}`,
    `Max-Age=${maxAge}`,
    'Path=/',
    'Secure',
    'HttpOnly',
  ].join('; ');

  return [cookieName, configuredValue].join('=');
}

exports.handler = async (event) => {
  console.log(JSON.stringify(event));

  if (event?.queryStringParameters?.persist === 'false') {
    return;
  }

  // Get or set long-term user ID
  const userId = getUserId(event);

  // Get or set short-term session ID for the user
  const sessionId = getSessionId(event, userId);

  const logData = dataFromEvent(event, userId, sessionId);
  const logCsv = formatToCSVLine(logData);

  await kinesis
    .putRecord({
      StreamName: process.env.ACTION_LOG_STREAM_NAME,
      PartitionKey: crypto.createHash('md5').update(logCsv).digest('hex'),
      Data: logCsv,
    })
    .promise();

  return {
    isBase64Encoded: true,
    statusCode: 200,
    body: PIXEL,
    cookies: [
      bakeCookie(USER_ID_COOKIE_NAME, userId, MAX_USER_AGE),
      bakeCookie(SESSION_COOKIE_NAME, sessionId, MAX_SESSION_LENGTH),
    ],
    headers: {
      'content-type': 'image/gif',
      'cache-control': 'private, no-cache, proxy-revalidate',
      'content-length': '43',
    },
  };
};
