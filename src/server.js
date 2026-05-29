const express = require('express');
const pinoHttp = require('pino-http');
const rateLimit = require('express-rate-limit');
const { createAuthRoutes } = require('./routes/authRoutes');
const { createPackageRoutes } = require('./routes/packageRoutes');
const { createPublishRoutes } = require('./routes/publishRoutes');
const { createUnpublishRoutes } = require('./routes/unpublishRoutes');
const { createEngineChannelRoutes } = require('./routes/engineChannelRoutes');
const { createPackTagRoutes } = require('./routes/packTagRoutes');
const { createPresetRoutes } = require('./routes/presetRoutes');
const { createTokenRoutes } = require('./routes/tokenRoutes');
const { createTrustedPublisherRoutes } = require('./routes/trustedPublisherRoutes');

const isTest = () => process.env.NODE_ENV === 'test';
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false, skip: isTest });
const registerLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 3, standardHeaders: true, legacyHeaders: false, skip: isTest });
const changePasswordLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false, skip: isTest });
const refreshLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false, skip: isTest });
const tokenLimiter = rateLimit({ windowMs: 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false, skip: isTest });
const trustLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false, skip: isTest });
const publishLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false, skip: isTest });
const globalLimiter = rateLimit({ windowMs: 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false, skip: isTest });

const CORS_ORIGIN = 'https://tapestryengine.com';

function createApp({ db, dataDir, config, metrics }) {
  const app = express();
  app.use(express.json());

  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

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
        console.error('metrics error:', err);
        res.status(500).end('internal server error');
      }
    });
  }

  if (db) {
    app.use('/v1/auth/login', loginLimiter);
    app.use('/v1/auth/register', registerLimiter);
    app.use('/v1/auth/change-password', changePasswordLimiter);
    app.use('/v1/auth/refresh', refreshLimiter);
    app.use('/v1/auth', createAuthRoutes(db));
    app.use('/v1/token', tokenLimiter);
    app.use('/v1', createTokenRoutes(db));
    app.use('/v1/trusted-publishers', trustLimiter);
    app.use('/v1', createTrustedPublisherRoutes(db));
    app.use('/v1', createPackTagRoutes(db));
    app.use('/v1', createPackageRoutes(db, dataDir, metrics));
    app.use('/v1/publish', publishLimiter);
    app.use('/v1', createPublishRoutes(db, dataDir, config || {}, metrics));
    app.use('/v1', createUnpublishRoutes(db, dataDir));
    app.use('/v1', createEngineChannelRoutes(db));
    app.use('/v1', createPresetRoutes(db));
  }

  return app;
}

module.exports = { createApp };
