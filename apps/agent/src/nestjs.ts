import 'reflect-metadata';
import dotenv from 'dotenv';
import path from 'path';

// Load .env then .env.local (local overrides) from the agent package root.
// __dirname is dist/ at runtime, so ../ is apps/agent/.
dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config({ path: path.join(__dirname, '../.env.local'), override: true });

import { NestFactory } from '@nestjs/core';
import { WsAdapter } from '@nestjs/platform-ws';
import { AppModule } from './app.module';

export async function bootstrapNestJS(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  app.useWebSocketAdapter(new WsAdapter(app));
  await app.listen(3001);
  console.log('[Agent] WebSocket server ready on ws://localhost:3001');
  console.log('[Agent] GEMINI_API_KEY loaded:', !!process.env.GEMINI_API_KEY);
}
