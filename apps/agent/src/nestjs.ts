import 'reflect-metadata';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config({ path: path.join(__dirname, '../.env.local'), override: true });

import { NestFactory } from '@nestjs/core';
import { WsAdapter } from '@nestjs/platform-ws';
import { AppModule } from './app.module';
import { INestApplication } from '@nestjs/common';

export async function bootstrapNestJS(): Promise<{ nestApp: INestApplication }> {
  const nestApp = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  nestApp.useWebSocketAdapter(new WsAdapter(nestApp));
  await nestApp.listen(3001);
  console.log('[Agent] WebSocket server ready on ws://localhost:3001');
  console.log('[Agent] GEMINI_API_KEY loaded:', !!process.env.GEMINI_API_KEY);
  return { nestApp };
}
