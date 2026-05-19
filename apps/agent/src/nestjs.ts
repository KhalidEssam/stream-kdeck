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
import { networkInterfaces } from 'os';

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

export async function bootstrapNestJS(): Promise<{ nestApp: INestApplication }> {
  const nestApp = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  nestApp.useWebSocketAdapter(new WsAdapter(nestApp));
  await nestApp.listen(AGENT_PORT, '0.0.0.0');
  console.log(`[Agent] WebSocket server ready on ws://localhost:${AGENT_PORT}`);
  for (const url of getLanWebSocketUrls()) {
    console.log(`[Agent] Phone connection URL: ${url}`);
  }
  return { nestApp };
}
