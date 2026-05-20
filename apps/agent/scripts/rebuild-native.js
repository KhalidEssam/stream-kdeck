#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');

const isDesktopPlatform = process.platform === 'win32' || process.platform === 'darwin';
const isEasBuild = process.env.EAS_BUILD === 'true' || !!process.env.EAS_BUILD_PLATFORM;

if (!isDesktopPlatform || isEasBuild) {
  console.log(`[agent postinstall] Skipping Electron native rebuild on ${process.platform}.`);
  process.exit(0);
}

const command = process.platform === 'win32' ? 'electron-rebuild.cmd' : 'electron-rebuild';
const result = spawnSync(command, ['-f', '-w', 'node-audio-volume-mixer'], {
  stdio: 'inherit',
});

if (result.error) {
  console.error('[agent postinstall] Electron native rebuild failed:', result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
