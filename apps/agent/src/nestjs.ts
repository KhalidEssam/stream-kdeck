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
import { platform } from 'os';
import { exec } from 'child_process';
import { getLanWebSocketUrls } from './network/agent-addresses';
import { getListeningPort, resolveAgentListenPort } from './network/agent-port';
import { MdnsService } from './network/mdns.service';

// Attempt to add a Windows Firewall inbound rule so the phone can reach the agent.
// Runs silently — fails gracefully if the process lacks admin rights or the rule exists.
function ensureWindowsFirewallRule(ruleName: string, protocol: 'TCP' | 'UDP', port: number): void {
  if (platform() !== 'win32') return;
  const cmd = [
    `netsh advfirewall firewall add rule`,
    `name="${ruleName}"`,
    `dir=in action=allow protocol=${protocol}`,
    `localport=${port}`,
    `profile=private,domain`,
  ].join(' ');
  exec(cmd, { timeout: 5000 }, (err) => {
    if (err) {
      console.warn(
        `[Agent] Could not auto-add firewall rule "${ruleName}" (needs admin or already exists). ` +
        `If your phone cannot connect, run this in PowerShell as Administrator:\n` +
        `  New-NetFirewallRule -DisplayName "${ruleName}" -Direction Inbound -Protocol ${protocol} -LocalPort ${port} -Action Allow`,
      );
    } else {
      console.log(`[Agent] Windows Firewall: inbound rule added for ${protocol} port ${port}`);
    }
  });
}

export async function bootstrapNestJS(): Promise<{ nestApp: INestApplication; port: number }> {
  const nestApp = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  nestApp.useWebSocketAdapter(new WsAdapter(nestApp));
  const listenPort = await resolveAgentListenPort(AGENT_PORT);
  if (listenPort.usingFallback) {
    console.warn(
      `[Agent] Port ${listenPort.preferredPort} is busy; using an available fallback port instead.`,
    );
  }

  try {
    await nestApp.listen(listenPort.port, '0.0.0.0');
  } catch (error) {
    if (listenPort.port === 0 || !isPortUnavailableError(error)) {
      throw error;
    }

    console.warn(
      `[Agent] Port ${listenPort.preferredPort} became unavailable during startup; retrying on a fallback port.`,
    );
    await nestApp.listen(0, '0.0.0.0');
  }

  const port = getListeningPort(nestApp.getHttpServer()) ?? listenPort.port;
  nestApp.get(MdnsService).startAdvertising(port);

  ensureWindowsFirewallRule(`KDeck Agent port ${port}`, 'TCP', port);
  ensureWindowsFirewallRule('KDeck Agent mDNS', 'UDP', 5353);
  console.log(`[Agent] WebSocket server ready on ws://localhost:${port}`);
  for (const url of getLanWebSocketUrls(port)) {
    console.log(`[Agent] Phone connection URL: ${url}`);
  }
  return { nestApp, port };
}

function isPortUnavailableError(error: unknown): boolean {
  const code = (error as { code?: unknown })?.code;
  return code === 'EADDRINUSE' || code === 'EACCES';
}
