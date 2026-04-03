const crypto = require('crypto');

const HASH_ITERATIONS = 120000;
const HASH_KEYLEN = 64;
const HASH_DIGEST = 'sha512';
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const getAuthSecret = () => process.env.AUTH_SECRET || process.env.OPENAI_API_KEY || 'gradhunt-dev-secret';

const encodeBase64Url = (value) =>
  Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

const decodeBase64Url = (value) => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(normalized + padding, 'base64').toString('utf8');
};

const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto
    .pbkdf2Sync(password, salt, HASH_ITERATIONS, HASH_KEYLEN, HASH_DIGEST)
    .toString('hex');

  return `${salt}:${derivedKey}`;
};

const createOpaqueToken = () => crypto.randomBytes(32).toString('hex');

const hashOpaqueToken = (token) =>
  crypto.createHash('sha256').update(token).digest('hex');

const verifyPassword = (password, storedHash) => {
  const [salt, originalHash] = (storedHash || '').split(':');
  if (!salt || !originalHash) {
    return false;
  }

  const derivedKey = crypto
    .pbkdf2Sync(password, salt, HASH_ITERATIONS, HASH_KEYLEN, HASH_DIGEST)
    .toString('hex');

  return crypto.timingSafeEqual(Buffer.from(derivedKey), Buffer.from(originalHash));
};

const createToken = (payload) => {
  const now = Date.now();
  const tokenPayload = {
    ...payload,
    iat: now,
    exp: now + TOKEN_TTL_MS,
  };

  const encodedPayload = encodeBase64Url(JSON.stringify(tokenPayload));
  const signature = encodeBase64Url(
    crypto.createHmac('sha256', getAuthSecret()).update(encodedPayload).digest()
  );

  return `${encodedPayload}.${signature}`;
};

const verifyToken = (token) => {
  if (!token || !token.includes('.')) {
    throw new Error('Invalid token.');
  }

  const [encodedPayload, signature] = token.split('.');
  const expectedSignature = encodeBase64Url(
    crypto.createHmac('sha256', getAuthSecret()).update(encodedPayload).digest()
  );

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    throw new Error('Invalid token signature.');
  }

  const payload = JSON.parse(decodeBase64Url(encodedPayload));
  if (!payload.exp || payload.exp < Date.now()) {
    throw new Error('Token has expired.');
  }

  return payload;
};

module.exports = {
  hashPassword,
  verifyPassword,
  createToken,
  verifyToken,
  createOpaqueToken,
  hashOpaqueToken,
};
