import 'reflect-metadata';
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
}
