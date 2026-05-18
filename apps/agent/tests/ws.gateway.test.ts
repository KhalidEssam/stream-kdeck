import WebSocket from 'ws';
import * as fs from 'fs';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';
import { AppModule } from '../src/app.module';
import { LicenseService } from '../src/license/license.service';
import { ActivationDialogService } from '../src/license/activation-dialog.service';
import { ConnectedMessage, ActionResultMessage, DeckConfigMessage, LicenseStatusMessage } from '@control-surface/shared';

jest.mock('fs');
const mockedFs = fs as jest.Mocked<typeof fs>;

const mockLicenseService = {
  isLicensed:             () => true,
  isAiPro:                () => false,
  creditsRemaining:       () => 50,
  getClaims:              () => ({ licensed: true, ai_pro: false, credits_remaining: 50 }),
  hasRefreshToken:        () => true,
  onApplicationBootstrap: async () => {},
  refreshSession:         async () => {},
  decrementCredit:        async () => {},
};

const mockActivationDialog = { open: jest.fn() };

describe('WsGateway', () => {
  let app: INestApplication;

  beforeAll(async () => {
    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.readFileSync.mockReturnValue(JSON.stringify({ tiles: [], overrides: {} }));
    mockedFs.writeFileSync.mockImplementation(() => undefined);

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(LicenseService).useValue(mockLicenseService)
      .overrideProvider(ActivationDialogService).useValue(mockActivationDialog)
      .compile();

    app = moduleRef.createNestApplication();
    app.useWebSocketAdapter(new WsAdapter(app));
    await app.listen(3099);
  });

  afterAll(async () => {
    await app.close();
  });

  it('sends CONNECTED, DECK_CONFIG, then LICENSE_STATUS on connect', (done) => {
    const ws = new WebSocket('ws://localhost:3099');
    const messages: string[] = [];

    ws.on('message', (data) => {
      messages.push(data.toString());
      if (messages.length === 3) {
        const connected: ConnectedMessage = JSON.parse(messages[0]);
        expect(connected.type).toBe('CONNECTED');

        const deckConfig: DeckConfigMessage = JSON.parse(messages[1]);
        expect(deckConfig.type).toBe('DECK_CONFIG');

        const licStatus: LicenseStatusMessage = JSON.parse(messages[2]);
        expect(licStatus.type).toBe('LICENSE_STATUS');
        expect(licStatus.licensed).toBe(true);
        expect(licStatus.creditsRemaining).toBe(50);

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

      if (messages.length === 3) {
        ws.send(JSON.stringify({
          type: 'BUTTON_TAP',
          buttonId: 'btn-test',
          action: { kind: 'CLIPBOARD_WRITE', text: 'gateway test' },
        }));
      }

      if (messages.length === 4) {
        const result: ActionResultMessage = JSON.parse(messages[3]);
        expect(result.type).toBe('ACTION_RESULT');
        expect(result.buttonId).toBe('btn-test');
        expect(result.success).toBe(true);
        ws.close();
        done();
      }
    });
  });

  it('opens activation dialog when OPEN_ACTIVATION_DIALOG is received', (done) => {
    const ws = new WebSocket('ws://localhost:3099');
    const messages: string[] = [];

    ws.on('message', (data) => {
      messages.push(data.toString());
      if (messages.length === 3) {
        mockActivationDialog.open.mockClear();
        ws.send(JSON.stringify({ type: 'OPEN_ACTIVATION_DIALOG' }));
        setTimeout(() => {
          expect(mockActivationDialog.open).toHaveBeenCalledTimes(1);
          ws.close();
          done();
        }, 50);
      }
    });
  });

  it('handles ADD_TILE and responds with updated DECK_CONFIG', (done) => {
    const ws = new WebSocket('ws://localhost:3099');
    const messages: string[] = [];

    ws.on('message', (data) => {
      messages.push(data.toString());

      if (messages.length === 3) {
        ws.send(JSON.stringify({
          type: 'ADD_TILE',
          tile: { kind: 'url', label: 'Test Site', iconId: 'globe', action: { kind: 'URL_OPEN', url: 'https://example.com' } },
        }));
      }

      if (messages.length === 4) {
        const updated: DeckConfigMessage = JSON.parse(messages[3]);
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

      if (messages.length === 3) {
        ws.send(JSON.stringify({
          type: 'ADD_TILE',
          tile: { kind: 'url', label: 'Remove Me', iconId: 'globe', action: { kind: 'URL_OPEN', url: 'https://remove-me.example.com' } },
        }));
      }

      if (messages.length === 4) {
        const withTile: DeckConfigMessage = JSON.parse(messages[3]);
        const tile = withTile.tiles.find((t) => t.label === 'Remove Me');
        expect(tile).toBeDefined();
        ws.send(JSON.stringify({ type: 'REMOVE_TILE', tileId: tile!.id }));
      }

      if (messages.length === 5) {
        const updated: DeckConfigMessage = JSON.parse(messages[4]);
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

      if (messages.length === 3) {
        ws.send(JSON.stringify({
          type: 'ADD_TILE',
          tile: { kind: 'url', label: 'Pin Me', iconId: 'globe', action: { kind: 'URL_OPEN', url: 'https://pin-me.example.com' } },
        }));
      }

      if (messages.length === 4) {
        const withTile: DeckConfigMessage = JSON.parse(messages[3]);
        const tile = withTile.tiles.find((t) => t.label === 'Pin Me');
        expect(tile).toBeDefined();
        ws.send(JSON.stringify({ type: 'SET_TILE_PINNED', tileId: tile!.id, pinned: true }));
      }

      if (messages.length === 5) {
        const updated: DeckConfigMessage = JSON.parse(messages[4]);
        expect(updated.tiles[0]).toMatchObject({ label: 'Pin Me', pinned: true });
        ws.close();
        done();
      }
    });
  });
});
