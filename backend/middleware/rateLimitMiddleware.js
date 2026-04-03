const buildKey = (req, scope) => {
  const forwardedFor = req.headers['x-forwarded-for'];
  const ip = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : typeof forwardedFor === 'string'
      ? forwardedFor.split(',')[0].trim()
      : req.ip || req.connection?.remoteAddress || 'unknown';

  return `${scope}:${ip}`;
};

const createRateLimit = ({
  windowMs,
  maxRequests,
  scope,
  message,
}) => {
  const requests = new Map();

  return (req, res, next) => {
    const now = Date.now();
    const key = buildKey(req, scope);
    const entry = requests.get(key);

    if (!entry || entry.resetAt <= now) {
      requests.set(key, {
        count: 1,
        resetAt: now + windowMs,
      });
      return next();
    }

    if (entry.count >= maxRequests) {
      const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
      res.setHeader('Retry-After', retryAfterSeconds);
      return res.status(429).json({
        error: 'Too many requests',
        message,
      });
    }

    entry.count += 1;
    requests.set(key, entry);
    return next();
  };
};

module.exports = {
  createRateLimit,
};
