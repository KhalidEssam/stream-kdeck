import WebSocket from 'ws';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';
import { AppModule } from '../src/app.module';
import { ConnectedMessage, ActionResultMessage } from '@control-surface/shared';

describe('WsGateway', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useWebSocketAdapter(new WsAdapter(app));
    await app.listen(3099); // separate test port to avoid clashing with running agent
  });

  afterAll(async () => {
    await app.close();
  });

  it('sends CONNECTED message immediately on connect', (done) => {
    const ws = new WebSocket('ws://localhost:3099');
    ws.on('message', (data) => {
      const msg: ConnectedMessage = JSON.parse(data.toString());
      expect(msg.type).toBe('CONNECTED');
      expect(msg.agentVersion).toBe('0.1.0');
      expect(['darwin', 'win32', 'linux']).toContain(msg.platform);
      ws.close();
      done();
    });
  });

  it('responds with ACTION_RESULT when BUTTON_TAP is received', (done) => {
    const ws = new WebSocket('ws://localhost:3099');
    const messages: string[] = [];

    ws.on('message', (data) => {
      messages.push(data.toString());

      // First message is CONNECTED; send our tap after that
      if (messages.length === 1) {
        ws.send(
          JSON.stringify({
            type: 'BUTTON_TAP',
            buttonId: 'btn-test',
            action: { kind: 'CLIPBOARD_WRITE', text: 'gateway test' },
          })
        );
      }

      // Second message is ACTION_RESULT
      if (messages.length === 2) {
        const result: ActionResultMessage = JSON.parse(messages[1]);
        expect(result.type).toBe('ACTION_RESULT');
        expect(result.buttonId).toBe('btn-test');
        expect(result.success).toBe(true);
        ws.close();
        done();
      }
    });
  });
});
