'use strict';

const express = require('express');
const { requireAuth } = require('../auth');

function createPresetRoutes(db) {
  const router = express.Router();

  router.get('/presets', (req, res) => {
    const rows = db.prepare(
      `SELECT name, version, engine_channel, updated_at FROM presets ORDER BY name`
    ).all();
    res.json(rows);
  });

  router.get('/presets/:name', (req, res) => {
    const row = db.prepare(`SELECT * FROM presets WHERE name = ?`).get(req.params.name);
    if (!row) {
      return res.status(404).json({ error: `Preset '${req.params.name}' not found` });
    }
    return res.json({
      name: row.name,
      version: row.version,
      engine_channel: row.engine_channel,
      packs: JSON.parse(row.packs),
    });
  });

  router.patch('/admin/presets/:name', requireAuth, (req, res) => {
    const user = db.prepare(`SELECT is_admin FROM accounts WHERE handle = ?`).get(req.user.handle);
    if (!user?.is_admin) {
      return res.status(403).json({ error: 'admin access required' });
    }
    const { version, engine_channel, packs } = req.body;
    if (!version || !engine_channel || !packs) {
      return res.status(400).json({ error: 'version, engine_channel, and packs are required' });
    }
    db.prepare(
      `INSERT OR REPLACE INTO presets (name, version, engine_channel, packs, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))`
    ).run(req.params.name, version, engine_channel, JSON.stringify(packs));
    return res.json({ name: req.params.name, version, engine_channel, packs });
  });

  router.delete('/admin/presets/:name', requireAuth, (req, res) => {
    const user = db.prepare(`SELECT is_admin FROM accounts WHERE handle = ?`).get(req.user.handle);
    if (!user?.is_admin) {
      return res.status(403).json({ error: 'admin access required' });
    }
    const result = db.prepare(`DELETE FROM presets WHERE name = ?`).run(req.params.name);
    if (result.changes === 0) {
      return res.status(404).json({ error: `Preset '${req.params.name}' not found` });
    }
    return res.json({ deleted: req.params.name });
  });

  return router;
}

module.exports = { createPresetRoutes };
