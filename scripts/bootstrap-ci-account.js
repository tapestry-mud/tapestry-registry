#!/usr/bin/env node
// One-time setup: creates the ci@tapestryengine.com admin account and prints a 1-year JWT.
// Safe to re-run -- if the account already exists it skips creation and just prints a fresh token.
// Use this to rotate REGISTRY_CI_TOKEN in tapestry-public GitHub Actions secrets.
//
// On the droplet:
//   docker exec tapestry-registry sh -c \
//     'JWT_SECRET=<secret> DB_PATH=/data/registry.db node /app/scripts/bootstrap-ci-account.js'
'use strict';

const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR || '/var/tapestry-registry/data';
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'registry.db');
const JWT_SECRET = process.env.JWT_SECRET;

const CI_HANDLE = 'ci';
const CI_EMAIL = 'ci@tapestryengine.com';

if (!JWT_SECRET) {
  console.error('Error: JWT_SECRET environment variable is required');
  process.exit(1);
}

const db = new Database(DB_PATH);

const existing = db.prepare('SELECT id FROM accounts WHERE email = ?').get(CI_EMAIL);
if (existing) {
  console.log(`CI account already exists (id=${existing.id}, handle=${CI_HANDLE})`);
} else {
  const password = crypto.randomBytes(32).toString('hex');
  const password_hash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO accounts (handle, email, password_hash, is_admin) VALUES (?, ?, ?, 1)')
    .run(CI_HANDLE, CI_EMAIL, password_hash);
  console.log(`Created CI account: ${CI_EMAIL} (handle: ${CI_HANDLE}, is_admin: 1)`);
}

const token = jwt.sign({ handle: CI_HANDLE, email: CI_EMAIL }, JWT_SECRET, { expiresIn: '1y' });

console.log('\nCI JWT token (1-year TTL):');
console.log('Store this as REGISTRY_CI_TOKEN in GitHub Actions secrets for tapestry-public.\n');
console.log(token);

db.close();
