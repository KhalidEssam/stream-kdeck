import 'reflect-metadata';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config({ path: path.join(__dirname, '../.env.local'), override: true });

import { NestFactory } from '@nestjs/core';
import { WsAdapter } from '@nestjs/platform-ws';
import { AppModule } from './app.module';
import { INestApplication } from '@nestjs/common';
import { AGENT_PORT } from './constants';
import { networkInterfaces, platform } from 'os';
import { exec } from 'child_process';

function getLanWebSocketUrls(): string[] {
  const urls = new Set<string>();
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal) {
        urls.add(`ws://${address.address}:${AGENT_PORT}`);
      }
    }
  }
  return [...urls];
}

// Attempt to add a Windows Firewall inbound rule so the phone can reach the agent.
// Runs silently — fails gracefully if the process lacks admin rights or the rule exists.
function ensureWindowsFirewallRule(port: number): void {
  if (platform() !== 'win32') return;
  const rule = `KDeck Agent port ${port}`;
  const cmd = [
    `netsh advfirewall firewall add rule`,
    `name="${rule}"`,
    `dir=in action=allow protocol=TCP`,
    `localport=${port}`,
    `profile=private,domain`,
  ].join(' ');
  exec(cmd, { timeout: 5000 }, (err) => {
    if (err) {
      console.warn(
        `[Agent] Could not auto-add firewall rule (needs admin or already exists). ` +
        `If your phone cannot connect, run this in PowerShell as Administrator:\n` +
        `  New-NetFirewallRule -DisplayName "${rule}" -Direction Inbound -Protocol TCP -LocalPort ${port} -Action Allow`,
      );
    } else {
      console.log(`[Agent] Windows Firewall: inbound rule added for TCP port ${port}`);
    }
  });
}

export async function bootstrapNestJS(): Promise<{ nestApp: INestApplication }> {
  const nestApp = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  nestApp.useWebSocketAdapter(new WsAdapter(nestApp));
  await nestApp.listen(AGENT_PORT, '0.0.0.0');
  ensureWindowsFirewallRule(AGENT_PORT);
  console.log(`[Agent] WebSocket server ready on ws://localhost:${AGENT_PORT}`);
  for (const url of getLanWebSocketUrls()) {
    console.log(`[Agent] Phone connection URL: ${url}`);
  }
  return { nestApp };
}
