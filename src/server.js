const express = require('express');
const pinoHttp = require('pino-http');
const rateLimit = require('express-rate-limit');
const { createAuthRoutes } = require('./routes/authRoutes');
const { createPackageRoutes } = require('./routes/packageRoutes');
const { createPublishRoutes } = require('./routes/publishRoutes');
const { createUnpublishRoutes } = require('./routes/unpublishRoutes');
const { createEngineChannelRoutes } = require('./routes/engineChannelRoutes');

const isTest = () => process.env.NODE_ENV === 'test';
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false, skip: isTest });
const registerLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 3, standardHeaders: true, legacyHeaders: false, skip: isTest });
const changePasswordLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false, skip: isTest });
const publishLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false, skip: isTest });
const globalLimiter = rateLimit({ windowMs: 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false, skip: isTest });

function createApp({ db, dataDir, config, metrics }) {
  const app = express();
  app.use(express.json());

  if (process.env.NODE_ENV !== 'test') {
    app.use(pinoHttp());
  }
  app.use(globalLimiter);

  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  if (metrics) {
    app.get('/metrics', async (req, res) => {
      try {
        res.set('Content-Type', metrics.registry.contentType);
        res.end(await metrics.registry.metrics());
      } catch (err) {
        res.status(500).end(String(err));
      }
    });
  }

  if (db) {
    app.use('/v1/auth/login', loginLimiter);
    app.use('/v1/auth/register', registerLimiter);
    app.use('/v1/auth/change-password', changePasswordLimiter);
    app.use('/v1/auth', createAuthRoutes(db));
    app.use('/v1', createPackageRoutes(db, dataDir, metrics));
    app.use('/v1', publishLimiter, createPublishRoutes(db, dataDir, config || {}, metrics));
    app.use('/v1', createUnpublishRoutes(db, dataDir));
    app.use('/v1', createEngineChannelRoutes(db));
  }

  return app;
}

module.exports = { createApp };
