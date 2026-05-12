'use strict';

const express = require('express');
const fs = require('fs');
const { requireAuth } = require('../auth');

function createUnpublishRoutes(db, dataDir) {
  const router = express.Router();

  router.delete('/packages/@:scope/:name/:version', requireAuth, (req, res) => {
    const { scope, name, version } = req.params;
    const force = req.query.force === 'true';

    const pkg = db.prepare(`SELECT * FROM packages WHERE scope = ? AND name = ?`).get(scope, name);
    if (!pkg) {
      return res.status(404).json({ error: `Package @${scope}/${name} not found` });
    }

    if (pkg.owner_handle !== req.user.handle) {
      if (!force) {
        return res.status(403).json({ error: 'not the package owner' });
      }
      const account = db.prepare(`SELECT is_admin FROM accounts WHERE handle = ?`).get(req.user.handle);
      if (!account?.is_admin) {
        return res.status(403).json({ error: 'not the package owner' });
      }
    }

    const ver = db.prepare(`SELECT * FROM versions WHERE package_id = ? AND version = ?`).get(pkg.id, version);
    if (!ver) {
      return res.status(404).json({ error: `Version ${version} not found` });
    }

    db.prepare(`DELETE FROM versions WHERE id = ?`).run(ver.id);

    const remaining = db.prepare(`SELECT COUNT(*) as c FROM versions WHERE package_id = ?`).get(pkg.id).c;
    if (remaining === 0) {
      db.prepare(`DELETE FROM packages WHERE id = ?`).run(pkg.id);
    }

    try {
      fs.unlinkSync(ver.tarball_path);
    } catch (err) {
      console.warn(`Warning: could not delete tarball ${ver.tarball_path}: ${err.message}`);
    }

    res.json({ message: `Unpublished @${scope}/${name}@${version}` });
  });

  return router;
}

module.exports = { createUnpublishRoutes };
