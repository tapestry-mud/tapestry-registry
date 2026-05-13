const express = require('express');
const path = require('path');
const fs = require('fs');
const { requireAuth, verifyToken } = require('../auth');

function resolveOptionalUser(req, db) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) { return null; }
  try {
    const payload = verifyToken(auth.slice(7));
    return db.prepare(`SELECT handle, is_admin FROM accounts WHERE handle = ?`).get(payload.handle);
  } catch {
    return null;
  }
}

function canAccessPack(pkg, user) {
  if (!pkg.is_private) { return true; }
  if (!user) { return false; }
  if (pkg.owner_handle === user.handle) { return true; }
  return !!user.is_admin;
}

function createPackageRoutes(db, dataDir, metrics) {
  const router = express.Router();

  router.get('/index.json', (req, res) => {
    const rows = db.prepare(`
      SELECT p.scope, p.name, p.owner_handle,
             v.version, v.manifest, v.integrity, v.tarball_size, v.published_at
      FROM packages p
      JOIN versions v ON v.package_id = p.id
      WHERE p.is_private = 0
      ORDER BY p.scope, p.name, v.published_at DESC
    `).all();

    const packages = {};
    for (const row of rows) {
      const key = `@${row.scope}/${row.name}`;
      let manifest;
      try {
        manifest = JSON.parse(row.manifest);
      } catch (_) {
        manifest = {};
      }
      if (!packages[key]) {
        packages[key] = {
          latest: row.version,
          versions: [],
          description: manifest.description || '',
          keywords: manifest.meta?.keywords || [],
          integrity: {},
        };
      }
      packages[key].versions.push(row.version);
      packages[key].integrity[row.version] = row.integrity;
    }

    res.json({ updated: new Date().toISOString(), packages });
  });

  router.get('/packages/@:scope/:name', (req, res) => {
    const { scope, name } = req.params;
    const pkg = db.prepare(`SELECT * FROM packages WHERE scope = ? AND name = ?`).get(scope, name);
    if (!pkg) {
      return res.status(404).json({ error: 'package not found' });
    }
    const user = resolveOptionalUser(req, db);
    if (!canAccessPack(pkg, user)) {
      return res.status(404).json({ error: 'not found' });
    }
    const versions = db.prepare(`
      SELECT version, manifest, integrity, tarball_size, downloads, published_at
      FROM versions WHERE package_id = ?
      ORDER BY published_at DESC
    `).all(pkg.id);

    const tagRows = db.prepare(
      `SELECT tag, version FROM pack_tags WHERE scope = ? AND name = ?`
    ).all(scope, name);
    const dist_tags = {};
    for (const row of tagRows) {
      dist_tags[row.tag] = row.version;
    }

    res.json({
      name: `@${scope}/${name}`,
      owner: pkg.owner_handle,
      dist_tags,
      versions: versions.map(v => {
        let manifest;
        try {
          manifest = JSON.parse(v.manifest);
        } catch (_) {
          manifest = null;
        }
        return { ...v, manifest };
      }),
    });
  });

  router.get('/search', (req, res) => {
    const q = ((req.query.q) || '').trim().toLowerCase();
    if (!q) {
      return res.json({ results: [] });
    }
    const like = `%${q}%`;
    const rows = db.prepare(`
      SELECT p.scope, p.name, v.version, v.manifest
      FROM packages p
      JOIN versions v ON v.package_id = p.id
      WHERE (v.package_id, v.published_at) IN (
        SELECT package_id, MAX(published_at) FROM versions GROUP BY package_id
      )
      AND p.is_private = 0
      AND (
        lower(p.name) LIKE ?
        OR lower(v.manifest) LIKE ?
      )
      ORDER BY p.scope, p.name
    `).all(like, like);

    const results = rows.map(row => {
      let manifest;
      try {
        manifest = JSON.parse(row.manifest);
      } catch (_) {
        manifest = {};
      }
      return {
        name: `@${row.scope}/${row.name}`,
        version: row.version,
        description: manifest.description || '',
        keywords: manifest.meta?.keywords || [],
      };
    });

    res.json({ results });
  });

  router.get('/packages/@:scope/:name/:file', (req, res) => {
    const { scope, name, file } = req.params;
    if (!file.endsWith('.tgz')) {
      return res.status(400).json({ error: 'expected .tgz file' });
    }
    const version = file.slice(0, -4);

    const pkg = db.prepare(`SELECT * FROM packages WHERE scope = ? AND name = ?`).get(scope, name);
    if (!pkg) {
      return res.status(404).json({ error: 'package not found' });
    }
    const tgzUser = resolveOptionalUser(req, db);
    if (!canAccessPack(pkg, tgzUser)) {
      return res.status(404).json({ error: 'not found' });
    }
    const ver = db.prepare(`SELECT * FROM versions WHERE package_id = ? AND version = ?`).get(pkg.id, version);
    if (!ver) {
      return res.status(404).json({ error: 'version not found' });
    }

    const tgzPath = path.join(dataDir, 'packages', `@${scope}`, name, `${version}.tgz`);
    if (!fs.existsSync(tgzPath)) {
      return res.status(404).json({ error: 'tarball not found on disk' });
    }

    db.prepare(`UPDATE versions SET downloads = downloads + 1 WHERE id = ?`).run(ver.id);

    if (metrics) {
      metrics.downloads.inc({ scope: `@${scope}`, name, version });
    }

    res.setHeader('Content-Type', 'application/x-gzip');
    res.sendFile(tgzPath);
  });

  return router;
}

module.exports = { createPackageRoutes };
