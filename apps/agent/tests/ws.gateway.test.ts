import WebSocket from 'ws';
import * as fs from 'fs';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';
import { AppModule } from '../src/app.module';
import { LicenseService } from '../src/license/license.service';
import { ActivationDialogService } from '../src/license/activation-dialog.service';
import { PackRegistryService } from '../src/packs/pack-registry.service';
import { ConnectedMessage, ActionResultMessage, DeckConfigMessage, LicenseStatusMessage } from '@control-surface/shared';
import { mouse } from '@nut-tree-fork/nut-js';
const mockedMouse = mouse as jest.Mocked<typeof mouse>;

jest.mock('active-win', () => jest.fn().mockResolvedValue(undefined));
jest.mock('@nut-tree-fork/nut-js', () => ({
  mouse: {
    getPosition:   jest.fn().mockResolvedValue({ x: 0, y: 0 }),
    setPosition:   jest.fn().mockResolvedValue(undefined),
    click:         jest.fn().mockResolvedValue(undefined),
    pressButton:   jest.fn().mockResolvedValue(undefined),
    releaseButton: jest.fn().mockResolvedValue(undefined),
    scrollUp:    jest.fn().mockResolvedValue(undefined),
    scrollDown:  jest.fn().mockResolvedValue(undefined),
    scrollLeft:  jest.fn().mockResolvedValue(undefined),
    scrollRight: jest.fn().mockResolvedValue(undefined),
  },
  keyboard: {
    pressKey:   jest.fn().mockResolvedValue(undefined),
    releaseKey: jest.fn().mockResolvedValue(undefined),
  },
  Key:    new Proxy({}, { get: (_t, prop) => prop }),
  Button: { LEFT: 'LEFT', RIGHT: 'RIGHT', MIDDLE: 'MIDDLE' },
  Point:  jest.fn().mockImplementation((x: number, y: number) => ({ x, y })),
}));
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

const mockPackRegistry = {
  load:     jest.fn().mockResolvedValue(undefined),
  getPacks: jest.fn().mockReturnValue([]),
  getById:  jest.fn().mockReturnValue(undefined),
};

type GatewayMessage = { type: string; [key: string]: unknown };

const INITIAL_MESSAGE_TYPES = [
  'CONNECTED',
  'DECK_CONFIG',
  'LICENSE_STATUS',
  'CONTEXT_SHORTCUTS',
  'PACK_REGISTRY',
  'MEDIA_STATE',
];

let tileCounter = 0;

function parseMessages(messages: string[]): GatewayMessage[] {
  return messages.map((message) => JSON.parse(message) as GatewayMessage);
}

function messagesOfType<T extends { type: string }>(messages: string[], type: string): T[] {
  return parseMessages(messages)
    .filter((message) => message.type === type)
    .map((message) => message as unknown as T);
}

function latestMessage<T extends { type: string }>(messages: string[], type: string): T | undefined {
  const matching = messagesOfType<T>(messages, type);
  return matching[matching.length - 1];
}

function hasInitialMessages(messages: string[]): boolean {
  const types = new Set(parseMessages(messages).map((message) => message.type));
  return INITIAL_MESSAGE_TYPES.every((type) => types.has(type));
}

function nextTileLabel(base: string): string {
  tileCounter += 1;
  return `${base} ${tileCounter}`;
}

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
      .overrideProvider(PackRegistryService).useValue(mockPackRegistry)
      .compile();

    app = moduleRef.createNestApplication();
    app.useWebSocketAdapter(new WsAdapter(app));
    await app.listen(3099);
  });

  afterAll(async () => {
    await app.close();
  });

  it('sends initial connection state on connect', (done) => {
    const ws = new WebSocket('ws://localhost:3099');
    const messages: string[] = [];
    let completed = false;

    ws.on('message', (data) => {
      messages.push(data.toString());
      if (!completed && hasInitialMessages(messages)) {
        completed = true;

        try {
          const connected = latestMessage<ConnectedMessage>(messages, 'CONNECTED');
          expect(connected?.type).toBe('CONNECTED');

          const deckConfig = latestMessage<DeckConfigMessage>(messages, 'DECK_CONFIG');
          expect(deckConfig?.type).toBe('DECK_CONFIG');

          const licStatus = latestMessage<LicenseStatusMessage>(messages, 'LICENSE_STATUS');
          expect(licStatus?.type).toBe('LICENSE_STATUS');

          const packRegistry = latestMessage<GatewayMessage>(messages, 'PACK_REGISTRY');
          expect(packRegistry?.type).toBe('PACK_REGISTRY');
          expect(Array.isArray(packRegistry?.packs)).toBe(true);

          ws.close();
          done();
        } catch (error) {
          ws.close();
          done(error);
        }
      }
    });
  });

  it('responds with ACTION_RESULT when BUTTON_TAP is received', (done) => {
    const ws = new WebSocket('ws://localhost:3099');
    const messages: string[] = [];
    let sentTap = false;
    let completed = false;

    ws.on('message', (data) => {
      messages.push(data.toString());

      if (!sentTap && hasInitialMessages(messages)) {
        sentTap = true;
        ws.send(JSON.stringify({
          type: 'BUTTON_TAP',
          buttonId: 'btn-test',
          action: { kind: 'CLIPBOARD_WRITE', text: 'gateway test' },
        }));
      }

      const result = latestMessage<ActionResultMessage>(messages, 'ACTION_RESULT');
      if (!completed && sentTap && result) {
        completed = true;
        try {
          expect(result.type).toBe('ACTION_RESULT');
          expect(result.buttonId).toBe('btn-test');
          expect(result.success).toBe(true);
          ws.close();
          done();
        } catch (error) {
          ws.close();
          done(error);
        }
      }
    });
  });

  it('opens activation dialog when OPEN_ACTIVATION_DIALOG is received', (done) => {
    const ws = new WebSocket('ws://localhost:3099');
    const messages: string[] = [];
    let sentOpen = false;

    ws.on('message', (data) => {
      messages.push(data.toString());
      if (!sentOpen && hasInitialMessages(messages)) {
        sentOpen = true;
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
    const label = nextTileLabel('Test Site');
    let sentAdd = false;
    let completed = false;

    ws.on('message', (data) => {
      messages.push(data.toString());

      if (!sentAdd && hasInitialMessages(messages)) {
        sentAdd = true;
        ws.send(JSON.stringify({
          type: 'ADD_TILE',
          tile: { kind: 'url', label, iconId: 'globe', action: { kind: 'URL_OPEN', url: 'https://example.com' } },
        }));
      }

      const updated = messagesOfType<DeckConfigMessage>(messages, 'DECK_CONFIG')
        .find((message) => message.tiles.some((tile) => tile.label === label));
      if (!completed && sentAdd && updated) {
        completed = true;
        try {
          expect(updated.type).toBe('DECK_CONFIG');
          expect(updated.tiles.some((t) => t.label === label)).toBe(true);
          ws.close();
          done();
        } catch (error) {
          ws.close();
          done(error);
        }
      }
    });
  });

  it('handles REMOVE_TILE and responds with updated DECK_CONFIG', (done) => {
    const ws = new WebSocket('ws://localhost:3099');
    const messages: string[] = [];
    const label = nextTileLabel('Remove Me');
    let sentAdd = false;
    let sentRemove = false;
    let completed = false;

    ws.on('message', (data) => {
      messages.push(data.toString());

      if (!sentAdd && hasInitialMessages(messages)) {
        sentAdd = true;
        ws.send(JSON.stringify({
          type: 'ADD_TILE',
          tile: { kind: 'url', label, iconId: 'globe', action: { kind: 'URL_OPEN', url: 'https://remove-me.example.com' } },
        }));
      }

      const withTile = messagesOfType<DeckConfigMessage>(messages, 'DECK_CONFIG')
        .find((message) => message.tiles.some((tile) => tile.label === label));
      if (sentAdd && !sentRemove && withTile) {
        const tile = withTile.tiles.find((t) => t.label === label);
        expect(tile).toBeDefined();
        sentRemove = true;
        ws.send(JSON.stringify({ type: 'REMOVE_TILE', tileId: tile!.id }));
      }

      const updated = latestMessage<DeckConfigMessage>(messages, 'DECK_CONFIG');
      if (!completed && sentRemove && updated && !updated.tiles.some((t) => t.label === label)) {
        completed = true;
        try {
          expect(updated.tiles.some((t) => t.label === label)).toBe(false);
          ws.close();
          done();
        } catch (error) {
          ws.close();
          done(error);
        }
      }
    });
  });

  it('handles SET_TILE_PINNED and responds with pinned tile first', (done) => {
    const ws = new WebSocket('ws://localhost:3099');
    const messages: string[] = [];
    const label = nextTileLabel('Pin Me');
    let sentAdd = false;
    let sentPinned = false;
    let completed = false;

    ws.on('message', (data) => {
      messages.push(data.toString());

      if (!sentAdd && hasInitialMessages(messages)) {
        sentAdd = true;
        ws.send(JSON.stringify({
          type: 'ADD_TILE',
          tile: { kind: 'url', label, iconId: 'globe', action: { kind: 'URL_OPEN', url: 'https://pin-me.example.com' } },
        }));
      }

      const withTile = messagesOfType<DeckConfigMessage>(messages, 'DECK_CONFIG')
        .find((message) => message.tiles.some((tile) => tile.label === label));
      if (sentAdd && !sentPinned && withTile) {
        const tile = withTile.tiles.find((t) => t.label === label);
        expect(tile).toBeDefined();
        sentPinned = true;
        ws.send(JSON.stringify({ type: 'SET_TILE_PINNED', tileId: tile!.id, pinned: true }));
      }

      const updated = latestMessage<DeckConfigMessage>(messages, 'DECK_CONFIG');
      if (!completed && sentPinned && updated?.tiles[0]?.label === label && updated.tiles[0].pinned === true) {
        completed = true;
        try {
          expect(updated.tiles[0]).toMatchObject({ label, pinned: true });
          ws.close();
          done();
        } catch (error) {
          ws.close();
          done(error);
        }
      }
    });
  });

  it('moves mouse when MOUSE_MOVE is received', (done) => {
    const ws = new WebSocket('ws://localhost:3099');

    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'MOUSE_MOVE', dx: 5, dy: -3 }));
      setTimeout(() => {
        expect(mockedMouse.setPosition).toHaveBeenCalled();
        ws.close();
        done();
      }, 100);
    });

    // drain handshake messages
    ws.on('message', () => {});
  });

  it('clicks mouse when MOUSE_CLICK is received', (done) => {
    const ws = new WebSocket('ws://localhost:3099');

    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'MOUSE_CLICK', button: 'left', action: 'click' }));
      setTimeout(() => {
        expect(mockedMouse.click).toHaveBeenCalled();
        ws.close();
        done();
      }, 100);
    });

    ws.on('message', () => {});
  });

  it('scrolls mouse when MOUSE_SCROLL is received', (done) => {
    const ws = new WebSocket('ws://localhost:3099');

    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'MOUSE_SCROLL', dx: 0, dy: 2 }));
      setTimeout(() => {
        expect(mockedMouse.scrollDown).toHaveBeenCalledWith(2);
        ws.close();
        done();
      }, 100);
    });

    ws.on('message', () => {});
  });
});
