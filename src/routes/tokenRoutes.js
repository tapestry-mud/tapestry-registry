const express = require('express');
const { verifyOIDC } = require('../ciAuth');
const { signAccessToken } = require('../auth');

function createTokenRoutes(db) {
  const router = express.Router();

  router.post('/token', async (req, res) => {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'OIDC id-token required' });
    }
    const { scope } = req.body || {};
    if (!scope) {
      return res.status(400).json({ error: 'scope is required' });
    }

    let payload;
    try {
      payload = await verifyOIDC(authHeader.slice(7));
    } catch {
      return res.status(401).json({ error: 'id-token verification failed' });
    }

    const binding = db.prepare(`SELECT * FROM trusted_publishers WHERE scope = ? AND repo = ?`)
      .get(scope, payload.repository);
    if (!binding) {
      return res.status(403).json({ error: `no trusted publisher for scope @${scope} from ${payload.repository}` });
    }
    if (binding.ref && binding.ref !== payload.ref) {
      return res.status(403).json({ error: 'ref not authorized' });
    }
    if (binding.environment && binding.environment !== payload.environment) {
      return res.status(403).json({ error: 'environment not authorized' });
    }

    // CI tokens are always admin:false and scoped to exactly the bound scope. No refresh.
    const access_token = signAccessToken({ sub: scope, kind: 'ci', scopes: [scope], admin: false });
    res.json({ access_token });
  });

  return router;
}

module.exports = { createTokenRoutes };
