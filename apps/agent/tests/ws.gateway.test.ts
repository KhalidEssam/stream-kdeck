import WebSocket from 'ws';
import * as fs from 'fs';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';
import { AppModule } from '../src/app.module';
import { ConnectedMessage, ActionResultMessage, DeckConfigMessage } from '@control-surface/shared';

jest.mock('fs');
const mockedFs = fs as jest.Mocked<typeof fs>;

describe('WsGateway', () => {
  let app: INestApplication;

  beforeAll(async () => {
    // Provide an empty config so AppRegistryService does not read a real file.
    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.readFileSync.mockReturnValue(JSON.stringify({ tiles: [], overrides: {} }));
    mockedFs.writeFileSync.mockImplementation(() => undefined);

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useWebSocketAdapter(new WsAdapter(app));
    await app.listen(3099);
  });

  afterAll(async () => {
    await app.close();
  });

  it('sends CONNECTED then DECK_CONFIG on connect', (done) => {
    const ws = new WebSocket('ws://localhost:3099');
    const messages: string[] = [];

    ws.on('message', (data) => {
      messages.push(data.toString());
      if (messages.length === 2) {
        const connected: ConnectedMessage = JSON.parse(messages[0]);
        expect(connected.type).toBe('CONNECTED');
        expect(connected.agentVersion).toBe('0.1.0');

        const deckConfig: DeckConfigMessage = JSON.parse(messages[1]);
        expect(deckConfig.type).toBe('DECK_CONFIG');
        expect(Array.isArray(deckConfig.tiles)).toBe(true);

        ws.close();
        done();
      }
    });
  });

  it('responds with ACTION_RESULT when BUTTON_TAP is received', (done) => {
    const ws = new WebSocket('ws://localhost:3099');
    const messages: string[] = [];

    ws.on('message', (data) => {
      messages.push(data.toString());

      // First two messages: CONNECTED + DECK_CONFIG
      if (messages.length === 2) {
        ws.send(
          JSON.stringify({
            type: 'BUTTON_TAP',
            buttonId: 'btn-test',
            action: { kind: 'CLIPBOARD_WRITE', text: 'gateway test' },
          })
        );
      }

      // Third message is ACTION_RESULT
      if (messages.length === 3) {
        const result: ActionResultMessage = JSON.parse(messages[2]);
        expect(result.type).toBe('ACTION_RESULT');
        expect(result.buttonId).toBe('btn-test');
        expect(result.success).toBe(true);
        ws.close();
        done();
      }
    });
  });

  it('handles ADD_TILE and responds with updated DECK_CONFIG', (done) => {
    const ws = new WebSocket('ws://localhost:3099');
    const messages: string[] = [];

    ws.on('message', (data) => {
      messages.push(data.toString());

      // After CONNECTED + DECK_CONFIG, send ADD_TILE
      if (messages.length === 2) {
        ws.send(
          JSON.stringify({
            type: 'ADD_TILE',
            tile: {
              kind: 'url',
              label: 'Test Site',
              iconId: 'globe',
              action: { kind: 'URL_OPEN', url: 'https://example.com' },
            },
          })
        );
      }

      // Third message should be a fresh DECK_CONFIG with the new tile
      if (messages.length === 3) {
        const updated: DeckConfigMessage = JSON.parse(messages[2]);
        expect(updated.type).toBe('DECK_CONFIG');
        expect(updated.tiles.some((t) => t.label === 'Test Site')).toBe(true);
        ws.close();
        done();
      }
    });
  });

  it('handles REMOVE_TILE and responds with updated DECK_CONFIG', (done) => {
    const ws = new WebSocket('ws://localhost:3099');
    const messages: string[] = [];

    ws.on('message', (data) => {
      messages.push(data.toString());

      // After CONNECTED + DECK_CONFIG, send ADD_TILE first
      if (messages.length === 2) {
        ws.send(
          JSON.stringify({
            type: 'ADD_TILE',
            tile: {
              kind: 'url',
              label: 'Remove Me',
              iconId: 'globe',
              action: { kind: 'URL_OPEN', url: 'https://remove-me.example.com' },
            },
          })
        );
      }

      // Third: DECK_CONFIG with the new tile — now send REMOVE_TILE
      if (messages.length === 3) {
        const withTile: DeckConfigMessage = JSON.parse(messages[2]);
        const tile = withTile.tiles.find((t) => t.label === 'Remove Me');
        expect(tile).toBeDefined();
        ws.send(JSON.stringify({ type: 'REMOVE_TILE', tileId: tile!.id }));
      }

      // Fourth: DECK_CONFIG without the removed tile
      if (messages.length === 4) {
        const updated: DeckConfigMessage = JSON.parse(messages[3]);
        expect(updated.type).toBe('DECK_CONFIG');
        expect(updated.tiles.some((t) => t.label === 'Remove Me')).toBe(false);
        ws.close();
        done();
      }
    });
  });

  it('handles SET_TILE_PINNED and responds with pinned tile first', (done) => {
    const ws = new WebSocket('ws://localhost:3099');
    const messages: string[] = [];

    ws.on('message', (data) => {
      messages.push(data.toString());

      if (messages.length === 2) {
        ws.send(
          JSON.stringify({
            type: 'ADD_TILE',
            tile: {
              kind: 'url',
              label: 'Pin Me',
              iconId: 'globe',
              action: { kind: 'URL_OPEN', url: 'https://pin-me.example.com' },
            },
          })
        );
      }

      if (messages.length === 3) {
        const withTile: DeckConfigMessage = JSON.parse(messages[2]);
        const tile = withTile.tiles.find((t) => t.label === 'Pin Me');
        expect(tile).toBeDefined();
        ws.send(JSON.stringify({ type: 'SET_TILE_PINNED', tileId: tile!.id, pinned: true }));
      }

      if (messages.length === 4) {
        const updated: DeckConfigMessage = JSON.parse(messages[3]);
        expect(updated.type).toBe('DECK_CONFIG');
        expect(updated.tiles[0]).toMatchObject({ label: 'Pin Me', pinned: true });
        ws.close();
        done();
      }
    });
  });
});
