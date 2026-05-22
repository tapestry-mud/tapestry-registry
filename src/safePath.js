'use strict';

const path = require('path');

function safePath(base, ...segments) {
  const resolvedBase = path.resolve(base);
  const resolved = path.resolve(base, ...segments);
  if (resolved !== resolvedBase && !resolved.startsWith(resolvedBase + path.sep)) {
    return null;
  }
  return resolved;
}

module.exports = { safePath };
