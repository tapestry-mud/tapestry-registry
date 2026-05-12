const express = require('express');
const { requireAuth } = require('../auth');

function createEngineChannelRoutes(db) {
  const router = express.Router();

  router.get('/engine-channels', (req, res) => {
    const rows = db.prepare('SELECT * FROM engine_channels ORDER BY channel').all();
    res.json(rows);
  });

  router.get('/engine-channels/:channel', (req, res) => {
    const row = db.prepare('SELECT * FROM engine_channels WHERE channel = ?').get(req.params.channel);
    if (!row) {
      return res.status(404).json({ error: `channel '${req.params.channel}' not found` });
    }
    res.json(row);
  });

  router.patch('/admin/engine-channels/:channel', requireAuth, (req, res) => {
    const { channel } = req.params;
    const { docker_tag, version } = req.body;

    const account = db.prepare('SELECT is_admin FROM accounts WHERE handle = ?').get(req.user.handle);
    if (!account?.is_admin) {
      return res.status(403).json({ error: 'admin access required' });
    }

    if (!docker_tag) {
      return res.status(400).json({ error: 'docker_tag is required' });
    }
    if (!version) {
      return res.status(400).json({ error: 'version is required' });
    }

    db.prepare(`
      INSERT INTO engine_channels (channel, docker_tag, version)
      VALUES (?, ?, ?)
      ON CONFLICT(channel) DO UPDATE SET
        docker_tag = excluded.docker_tag,
        version    = excluded.version,
        updated_at = datetime('now')
    `).run(channel, docker_tag, version);

    const row = db.prepare('SELECT * FROM engine_channels WHERE channel = ?').get(channel);
    res.json(row);
  });

  return router;
}

module.exports = { createEngineChannelRoutes };
