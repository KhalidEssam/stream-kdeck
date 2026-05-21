#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const DEFAULT_UPDATE_BASE_URL = 'https://updates.kdeck.app/agent';
const DEFAULT_UPDATE_CHANNEL = 'preview';

const args = process.argv.slice(2);
const forwarded = [];
let publishMode = process.env.KDECK_AGENT_PUBLISH_MODE || 'never';

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === '--channel') {
    process.env.KDECK_AGENT_UPDATE_CHANNEL = args[index + 1] || '';
    index += 1;
  } else if (arg === '--publish') {
    publishMode = args[index + 1] || publishMode;
    index += 1;
  } else {
    forwarded.push(arg);
  }
}

process.env.KDECK_AGENT_UPDATE_BASE_URL =
  process.env.KDECK_AGENT_UPDATE_BASE_URL || DEFAULT_UPDATE_BASE_URL;
process.env.KDECK_AGENT_UPDATE_CHANNEL =
  process.env.KDECK_AGENT_UPDATE_CHANNEL || DEFAULT_UPDATE_CHANNEL;

run(process.execPath, [path.join(__dirname, 'write-env.js')]);
run(process.execPath, [path.join(__dirname, 'rebuild-native.js')]);
run(process.execPath, [require.resolve('electron-builder/cli.js'), ...forwarded, '--publish', publishMode]);

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    cwd: path.join(__dirname, '..'),
    env: process.env,
    stdio: 'inherit',
  });

  if (result.error) {
    console.error(`[build-release] ${command} failed: ${result.error.message}`);
    process.exit(1);
  }

  process.exitCode = result.status ?? 1;
  if (process.exitCode !== 0) process.exit(process.exitCode);
}
