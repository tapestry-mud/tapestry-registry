'use strict';

const express = require('express');
const { requireAuth } = require('../auth');

function createPackTagRoutes(db) {
  const router = express.Router();

  router.get('/packages/@:scope/:name/dist-tags', (req, res) => {
    const { scope, name } = req.params;
    const pkg = db.prepare(`SELECT id FROM packages WHERE scope = ? AND name = ?`).get(scope, name);
    if (!pkg) {
      return res.status(404).json({ error: `Package @${scope}/${name} not found` });
    }
    const rows = db.prepare(`SELECT tag, version FROM pack_tags WHERE scope = ? AND name = ?`).all(scope, name);
    const tags = {};
    for (const row of rows) {
      tags[row.tag] = row.version;
    }
    return res.json(tags);
  });

  router.patch('/packages/@:scope/:name/dist-tags/:tag', requireAuth, (req, res) => {
    const { scope, name, tag } = req.params;
    const { version } = req.body;
    if (!version) {
      return res.status(400).json({ error: 'version is required' });
    }
    const pkg = db.prepare(`SELECT id, owner_handle FROM packages WHERE scope = ? AND name = ?`).get(scope, name);
    if (!pkg) {
      return res.status(404).json({ error: `Package @${scope}/${name} not found` });
    }
    const user = db.prepare(`SELECT is_admin FROM accounts WHERE handle = ?`).get(req.user.handle);
    if (pkg.owner_handle !== req.user.handle && !user?.is_admin) {
      return res.status(403).json({ error: 'not authorized to set tags on this package' });
    }
    const versionExists = db.prepare(`SELECT id FROM versions WHERE package_id = ? AND version = ?`).get(pkg.id, version);
    if (!versionExists) {
      return res.status(422).json({ error: `version ${version} not found for @${scope}/${name}` });
    }
    db.prepare(
      `INSERT OR REPLACE INTO pack_tags (scope, name, tag, version, updated_at) VALUES (?, ?, ?, ?, datetime('now'))`
    ).run(scope, name, tag, version);
    return res.json({ scope, name, tag, version });
  });

  return router;
}

module.exports = { createPackTagRoutes };
