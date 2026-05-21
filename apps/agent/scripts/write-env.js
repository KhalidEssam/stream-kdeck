#!/usr/bin/env node
'use strict';

const fs   = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config({ path: path.join(__dirname, '../.env.local'), override: true });

const REQUIRED = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'];
const OPTIONAL = ['KDECK_AGENT_UPDATE_BASE_URL', 'KDECK_AGENT_UPDATE_CHANNEL'];
const missing  = REQUIRED.filter((k) => !process.env[k]);

if (missing.length > 0) {
  console.error(`[write-env] Missing required env vars: ${missing.join(', ')}`);
  console.error('[write-env] Set them in your environment or CI secrets before running dist.');
  process.exit(1);
}

const keys    = [...REQUIRED, ...OPTIONAL.filter((k) => process.env[k])];
const lines   = keys.map((k) => `${k}=${process.env[k]}`).join('\n') + '\n';
const outPath = path.join(__dirname, '../.env');

fs.writeFileSync(outPath, lines, 'utf8');
console.log(`[write-env] Wrote ${outPath}`);
