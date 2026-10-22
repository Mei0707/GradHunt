class ServiceUnavailableError extends Error {
  constructor(message = 'An upstream service is temporarily unavailable.') {
    super(message);
    this.statusCode = 503;
  }
}
// State is per gateway task. Permit one half-open probe after the cooldown.
const createCircuitBreaker = ({ threshold = 3, resetMs = 30000, now = Date.now } = {}) => {
  let failures = 0;
  let openedAt = null;
  let probing = false;
  return async (task) => {
    if (openedAt !== null && (now() - openedAt < resetMs || probing)) {
      throw new ServiceUnavailableError('Service is recovering. Please retry shortly.');
    }
    const probe = openedAt !== null;
    if (probe) probing = true;
    try {
      const result = await task();
      failures = 0;
      openedAt = null;
      return result;
    } catch (error) {
      if (!error.statusCode || error.statusCode >= 500 || error.statusCode === 429) {
        failures += 1;
        if (probe || failures >= threshold) openedAt = now();
      } else {
        failures = 0;
        openedAt = null;
      }
      throw error;
    } finally { if (probe) probing = false; }
  };
};
const createBulkhead = (limit = 2) => {
  let active = 0;
  return async task => {
    if (active >= limit) throw new ServiceUnavailableError('Job search is busy. Please retry shortly.');
    active += 1;
    try { return await task(); } finally { active -= 1; }
  };
};
module.exports = { createCircuitBreaker, createBulkhead, ServiceUnavailableError };
