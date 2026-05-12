'use strict';

const path = require('path');
const fs   = require('fs');

// On Render, set DATA_DIR=/var/data (persistent disk mount).
// Locally it defaults to the project root so nothing changes.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname);

const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const DB_PATH     = path.join(DATA_DIR, 'registry.db');

// Ensure uploads directory exists on every startup
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

module.exports = { DATA_DIR, UPLOADS_DIR, DB_PATH };
