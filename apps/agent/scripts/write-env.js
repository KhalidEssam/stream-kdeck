#!/usr/bin/env node
'use strict';

const fs   = require('fs');
const path = require('path');

const REQUIRED = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'];
const missing  = REQUIRED.filter((k) => !process.env[k]);

if (missing.length > 0) {
  console.error(`[write-env] Missing required env vars: ${missing.join(', ')}`);
  console.error('[write-env] Set them in your environment or CI secrets before running dist.');
  process.exit(1);
}

const lines   = REQUIRED.map((k) => `${k}=${process.env[k]}`).join('\n') + '\n';
const outPath = path.join(__dirname, '../.env');

fs.writeFileSync(outPath, lines, 'utf8');
console.log(`[write-env] Wrote ${outPath}`);
