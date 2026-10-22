const express = require('express');
const cors = require('cors');
const path = require('node:path');
const mongoose = require('mongoose');
const { log, requestTelemetry, metric } = require('./lib/telemetry');
const createApp = ({ database = mongoose.connection, isDraining = () => false,
  staticDir = path.join(__dirname, '../frontend/dist') } = {}) => {
  const app = express();
  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY === 'true') app.set('trust proxy', 1);
  app.use(requestTelemetry);
  app.use(cors({ origin: process.env.FRONTEND_URL || false }));
  app.use(express.json({ limit: '10mb' }));
  app.use((req, res, next) => {
    if (isDraining()) return res.status(503).json({ error: 'Service restarting' });
    res.setTimeout(135000, () => {
      if (!res.headersSent) res.status(504).json({ error: 'Request timed out', requestId: req.requestId });
      else res.destroy();
    });
    next();
  });
  app.get('/api/health/live', (req, res) => res.json({ status: 'ok' }));
  app.get('/api/health/ready', async (req, res) => {
    let ready = database.readyState === 1;
    if (ready) {
      try { await database.db.admin().command({ ping: 1 }, { timeoutMS: 2000 }); }
      catch { ready = false; }
    }
    if (!process.env.MONGODB_URI && process.env.NODE_ENV !== 'production') ready = true;
    metric({ DatabaseAvailable: ready ? 1 : 0 });
    res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'unavailable',
      database: database.readyState === 1 ? (ready ? 'connected' : 'unreachable') : 'disconnected' });
  });
  app.use('/api/auth', require('./routes/authRoutes'));
  app.use('/api/jobs', require('./routes/jobRoutes'));
  app.use('/api/resume', require('./routes/resumeRoutes'));
  app.use('/api', (req, res) => res.status(404).json({ error: 'API route not found' }));
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(staticDir));
    app.get('/{*path}', (req, res) => res.sendFile(path.join(staticDir, 'index.html')));
  } else app.get('/', (req, res) => res.send('GradHunt Backend is running'));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error.type === 'entity.too.large' ? 413
      : error.type === 'entity.parse.failed' ? 400 : error.statusCode || 500;
    log('error', 'request_failed', { requestId: req.requestId, status, type: error.name });
    if (status === 503) res.setHeader('Retry-After', '30');
    return res.status(status).json({ error: status < 500 ? 'Invalid request' : 'Service temporarily unavailable',
      requestId: req.requestId });
  });
  return app;
};
module.exports = { createApp };
