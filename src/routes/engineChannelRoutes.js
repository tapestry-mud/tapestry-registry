const express = require('express');

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

  return router;
}

module.exports = { createEngineChannelRoutes };
