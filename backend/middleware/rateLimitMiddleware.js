const buildKey = (req, scope) => {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';

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
    for (const [key, value] of requests) if (value.resetAt <= now) requests.delete(key);
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
