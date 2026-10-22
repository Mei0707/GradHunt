const { randomUUID } = require('node:crypto');
const { performance } = require('node:perf_hooks');
// Only pass allowlisted fields. Never log request bodies, tokens, or raw URLs.
const log = (level, event, fields = {}) => console.log(JSON.stringify({
  timestamp: new Date().toISOString(), level, event, ...fields,
}));
const metric = (values, units = {}, dimensions = {}) => {
  if (process.env.CLOUDWATCH_EMF !== 'true') return;
  const dims = { Service: 'gateway', Environment: process.env.ENVIRONMENT || 'development', ...dimensions };
  console.log(JSON.stringify({
    _aws: { Timestamp: Date.now(), CloudWatchMetrics: [{
      Namespace: 'GradHunt', Dimensions: [Object.keys(dims)],
      Metrics: Object.keys(values).map(Name => ({ Name, Unit: units[Name] || 'Count' })),
    }] }, ...dims, ...values,
  }));
};
const requestTelemetry = (req, res, next) => {
  const start = performance.now();
  // Capture before Express routers shorten req.url/req.path to their mounted path.
  const measureApi = req.path.startsWith('/api/') && !req.path.startsWith('/api/health');
  req.requestId = randomUUID();
  res.setHeader('X-Request-ID', req.requestId);
  let recorded = false;
  const record = (aborted) => {
    if (recorded) return;
    recorded = true;
    const durationMs = performance.now() - start;
    log('info', 'http_request', { requestId: req.requestId, method: req.method,
      route: req.route?.path || 'unmatched', status: aborted ? 499 : res.statusCode, durationMs, aborted });
    if (measureApi) {
      metric({ Requests: 1, ServerErrors: !aborted && res.statusCode >= 500 ? 1 : 0,
        AbortedRequests: aborted ? 1 : 0, Latency: durationMs }, { Latency: 'Milliseconds' });
    }
  };
  res.once('finish', () => record(false));
  res.once('close', () => record(!res.writableFinished));
  next();
};
module.exports = { log, metric, requestTelemetry };
