#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const isDesktopPlatform = process.platform === 'win32' || process.platform === 'darwin';
const isEasBuild = process.env.EAS_BUILD === 'true' || !!process.env.EAS_BUILD_PLATFORM;

if (!isDesktopPlatform || isEasBuild) {
  console.log(`[agent postinstall] Skipping Electron native rebuild on ${process.platform}.`);
  process.exit(0);
}

const result = spawnSync(process.execPath, [
  path.join(path.dirname(require.resolve('@electron/rebuild')), 'cli.js'),
  '-f',
  '-o',
  'node-audio-volume-mixer',
], {
  stdio: 'inherit',
});

if (result.error) {
  console.error('[agent postinstall] Electron native rebuild failed:', result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
