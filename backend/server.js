require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const { createApp } = require('./app');
const { log } = require('./lib/telemetry');
const start = async () => {
  if (process.env.NODE_ENV === 'production') {
    for (const key of ['MONGODB_URI', 'AUTH_SECRET', 'FRONTEND_URL', 'RESUME_BUCKET']) {
      if (!process.env[key]) throw new Error(`Missing required production setting: ${key}`);
    }
    if (process.env.AUTH_SECRET.length < 32) throw new Error('AUTH_SECRET must have at least 32 characters');
  }
  await connectDB();
  let draining = false;
  const app = createApp({ isDraining: () => draining });
  const server = app.listen(process.env.PORT || 3000, () => log('info', 'server_started'));
  server.requestTimeout = 140000;
  server.headersTimeout = 15000;
  const shutdown = (signal, exitCode = 0) => {
    if (draining) return;
    draining = true;
    log('info', 'shutdown_started', { signal });
    const deadline = setTimeout(() => process.exit(1), 25000);
    deadline.unref();
    server.close(async () => {
      try { await mongoose.disconnect(); } finally { process.exit(exitCode); }
    });
    server.closeIdleConnections();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', () => shutdown('unhandledRejection', 1));
  process.on('uncaughtException', () => shutdown('uncaughtException', 1));
  return server;
};
if (require.main === module) start().catch(error => {
  log('error', 'startup_failed', { type: error.name });
  process.exitCode = 1;
});
module.exports = { start };
