# Vertical Slice — Week 1–2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mobile app button tap → LAN WebSocket → Desktop agent → Gemini Flash AI call → result sent back to mobile → clipboard updated. End-to-end working.

**Architecture:** npm workspaces monorepo with `apps/mobile` (Expo bare), `apps/agent` (Electron + NestJS), and `packages/shared` (WebSocket schema types). Hardcoded IP for the agent URL — mDNS auto-discovery is Week 3–4. Plain WS (no TLS) for development; WSS comes in the Core Expansion plan.

**Tech Stack:** React Native Expo bare workflow, Electron, NestJS `@nestjs/platform-ws`, `ws`, `clipboardy`, `@google/generative-ai`, TypeScript, Jest

---

## File Map

```
packages/
  shared/
    src/
      schema.ts          — WebSocket message types (shared contract)
      index.ts           — re-exports
    package.json
    tsconfig.json

apps/
  agent/
    src/
      main.ts            — Electron entry: tray icon, hidden window, boots NestJS
      nestjs.ts          — NestJS bootstrap
      app.module.ts      — NestJS AppModule wiring
      websocket/
        ws.gateway.ts    — @WebSocketGateway: handles BUTTON_TAP, sends ACTION_RESULT
      clipboard/
        clipboard.service.ts   — read/write clipboard via clipboardy
      ai/
        ai-router.service.ts   — Gemini Flash call (single provider for slice)
      command/
        command.service.ts     — routes ButtonAction to the right service
    tests/
      ws.gateway.test.ts
      command.service.test.ts
      ai-router.service.test.ts
    assets/
      icon.png           — 16×16 tray icon (white circle on transparent bg)
    .env.example
    package.json
    tsconfig.json
    jest.config.js

  mobile/
    src/
      types/
        schema.ts        — copy of shared schema (Metro bundler WS symlink workaround)
      services/
        websocket.service.ts   — WS connection, tap(), onResult, onStatusChange
        __tests__/
          websocket.service.test.ts
      components/
        DeckButton.tsx   — animated pressable button
      screens/
        DeckScreen.tsx   — 2-column grid, viewer card, connection status dot
    App.tsx              — entry: renders DeckScreen
    package.json
    tsconfig.json
    jest.config.js

package.json             — root workspace
.gitignore
tsconfig.base.json
```

---

## Task 1: Monorepo Bootstrap + Shared Schema

**Files:**
- Create: `package.json` (root)
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/schema.ts`
- Create: `packages/shared/src/index.ts`

- [ ] **Step 1.1: Initialize root workspace**

Run in `D:\BMC\stream-deck`:
```bash
npm init -y
```

Replace the generated `package.json` with:
```json
{
  "name": "control-surface-platform",
  "private": true,
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "scripts": {
    "agent": "npm run dev --workspace=apps/agent",
    "mobile": "npm run start --workspace=apps/mobile",
    "test": "npm run test --workspaces --if-present"
  }
}
```

- [ ] **Step 1.2: Create base TypeScript config**

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "strict": true,
    "esModuleInterop": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "resolveJsonModule": true,
    "skipLibCheck": true
  }
}
```

- [ ] **Step 1.3: Create .gitignore**

`.gitignore`:
```
node_modules/
dist/
out/
.env
*.env.local
apps/mobile/.expo/
apps/mobile/android/
apps/mobile/ios/
apps/agent/out/
.DS_Store
```

- [ ] **Step 1.4: Create shared schema package**

```bash
mkdir -p packages/shared/src
```

`packages/shared/package.json`:
```json
{
  "name": "@control-surface/shared",
  "version": "0.1.0",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "private": true
}
```

`packages/shared/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 1.5: Write the WebSocket message schema**

`packages/shared/src/schema.ts`:
```typescript
// Mobile → Agent
export interface ButtonTapMessage {
  type: 'BUTTON_TAP';
  buttonId: string;
  action: ButtonAction;
}

export type ButtonAction =
  | { kind: 'AI_CLIPBOARD'; prompt: string; outputMode: 'clipboard' | 'autopaste' | 'viewer' }
  | { kind: 'KEYSTROKE'; keys: string[] }
  | { kind: 'APP_LAUNCH'; bundleId: string }
  | { kind: 'CLIPBOARD_WRITE'; text: string };

// Agent → Mobile
export interface ActionResultMessage {
  type: 'ACTION_RESULT';
  buttonId: string;
  success: boolean;
  output?: string;
  error?: string;
}

export interface ConnectedMessage {
  type: 'CONNECTED';
  agentVersion: string;
  platform: 'darwin' | 'win32' | 'linux';
}

export type AgentMessage = ActionResultMessage | ConnectedMessage;
export type MobileMessage = ButtonTapMessage;
```

`packages/shared/src/index.ts`:
```typescript
export * from './schema';
```

- [ ] **Step 1.6: Commit**

```bash
git init
git add packages/ package.json .gitignore tsconfig.base.json
git commit -m "feat: monorepo bootstrap with shared WebSocket schema"
```

---

## Task 2: Desktop Agent — Scaffold (Electron + NestJS)

**Files:**
- Create: `apps/agent/package.json`
- Create: `apps/agent/tsconfig.json`
- Create: `apps/agent/jest.config.js`
- Create: `apps/agent/.env.example`
- Create: `apps/agent/assets/icon.png` (placeholder — see step 2.3)
- Create: `apps/agent/src/main.ts`
- Create: `apps/agent/src/nestjs.ts`
- Create: `apps/agent/src/app.module.ts`

- [ ] **Step 2.1: Initialize agent package**

```bash
mkdir -p apps/agent/src apps/agent/assets apps/agent/tests
```

`apps/agent/package.json`:
```json
{
  "name": "@control-surface/agent",
  "version": "0.1.0",
  "private": true,
  "main": "dist/main.js",
  "scripts": {
    "dev": "electron .",
    "build": "tsc",
    "test": "jest"
  },
  "dependencies": {
    "@nestjs/common": "^10.0.0",
    "@nestjs/core": "^10.0.0",
    "@nestjs/platform-ws": "^10.0.0",
    "@nestjs/websockets": "^10.0.0",
    "@google/generative-ai": "^0.21.0",
    "clipboardy": "^4.0.0",
    "reflect-metadata": "^0.2.0",
    "rxjs": "^7.8.0",
    "ws": "^8.18.0",
    "electron": "^31.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/ws": "^8.5.0",
    "@types/jest": "^29.0.0",
    "typescript": "^5.4.0",
    "ts-node": "^10.9.0",
    "jest": "^29.0.0",
    "ts-jest": "^29.0.0"
  }
}
```

- [ ] **Step 2.2: TypeScript config for agent**

`apps/agent/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "paths": {
      "@control-surface/shared": ["../../packages/shared/src/index.ts"]
    }
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 2.3: Create a minimal tray icon**

Create a 16×16 white circle PNG at `apps/agent/assets/icon.png`. The quickest way during development is to use any 16×16 PNG file. On Windows, you can download any small icon and rename it. On macOS/Linux:

```bash
# If you have ImageMagick installed:
convert -size 16x16 xc:transparent -fill white -draw "circle 7,7 7,1" apps/agent/assets/icon.png

# Or just copy any 16x16 PNG to apps/agent/assets/icon.png
# The app will start with a blank tray area if the file is missing — that's acceptable for the vertical slice
```

If you can't create the PNG right now, the agent still runs — just remove the `new Tray(...)` lines from main.ts and add them back once you have an icon file.

- [ ] **Step 2.4: Jest config for agent**

`apps/agent/jest.config.js`:
```js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: {
    '@control-surface/shared': '<rootDir>/../../packages/shared/src/index.ts',
  },
  testMatch: ['**/tests/**/*.test.ts'],
};
```

- [ ] **Step 2.5: Write Electron main process**

`apps/agent/src/main.ts`:
```typescript
import { app, Tray, Menu } from 'electron';
import path from 'path';
import { bootstrapNestJS } from './nestjs';

let tray: Tray | null = null;

app.whenReady().then(async () => {
  app.dock?.hide(); // macOS: hide from dock

  const iconPath = path.join(__dirname, '../assets/icon.png');
  try {
    tray = new Tray(iconPath);
    tray.setToolTip('Control Surface Agent');
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Control Surface Agent v0.1.0', enabled: false },
        { type: 'separator' },
        { label: 'Quit', click: () => app.quit() },
      ])
    );
  } catch {
    console.warn('[Agent] Could not load tray icon — continuing without tray');
  }

  await bootstrapNestJS();
});

app.on('window-all-closed', (e: Event) => e.preventDefault());
```

- [ ] **Step 2.6: Write NestJS bootstrap**

`apps/agent/src/nestjs.ts`:
```typescript
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
```

- [ ] **Step 2.7: Write AppModule (wires all providers)**

`apps/agent/src/app.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { WsGateway } from './websocket/ws.gateway';
import { ClipboardService } from './clipboard/clipboard.service';
import { AiRouterService } from './ai/ai-router.service';
import { CommandService } from './command/command.service';

@Module({
  providers: [WsGateway, ClipboardService, AiRouterService, CommandService],
})
export class AppModule {}
```

- [ ] **Step 2.8: Create .env.example**

`apps/agent/.env.example`:
```
# Gemini Flash — free tier: 1M tokens/day
# Get key at https://aistudio.google.com/app/apikey (no credit card required)
GEMINI_API_KEY=

# Development only — in production, keys are stored in OS keychain via keytar
```

- [ ] **Step 2.9: Install dependencies**

```bash
cd apps/agent
npm install
```

- [ ] **Step 2.10: Commit scaffold**

```bash
git add apps/agent/
git commit -m "feat: electron + nestjs agent scaffold"
```

---

## Task 3: Desktop Agent — Clipboard Service

**Files:**
- Create: `apps/agent/src/clipboard/clipboard.service.ts`

The ClipboardService is tested indirectly through CommandService (Task 5). No dedicated unit test needed — clipboard.read() and clipboard.write() are thin wrappers around the `clipboardy` library, which has its own tests.

- [ ] **Step 3.1: Implement ClipboardService**

```bash
mkdir -p apps/agent/src/clipboard
```

`apps/agent/src/clipboard/clipboard.service.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import clipboard from 'clipboardy';

@Injectable()
export class ClipboardService {
  async read(): Promise<string> {
    return clipboard.read();
  }

  async write(text: string): Promise<void> {
    return clipboard.write(text);
  }
}
```

- [ ] **Step 3.2: Commit**

```bash
git add apps/agent/src/clipboard/
git commit -m "feat: clipboard service (read/write via clipboardy)"
```

---

## Task 4: Desktop Agent — AI Router (Gemini Flash)

**Files:**
- Create: `apps/agent/src/ai/ai-router.service.ts`
- Create: `apps/agent/tests/ai-router.service.test.ts`

- [ ] **Step 4.1: Write the failing test**

```bash
mkdir -p apps/agent/src/ai apps/agent/tests
```

`apps/agent/tests/ai-router.service.test.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { AiRouterService } from '../src/ai/ai-router.service';

describe('AiRouterService', () => {
  let service: AiRouterService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [AiRouterService],
    }).compile();
    service = moduleRef.get(AiRouterService);
  });

  afterEach(() => {
    delete process.env.GEMINI_API_KEY;
  });

  it('throws a descriptive error when no API key is configured', async () => {
    await expect(service.call('hello', '')).rejects.toThrow(
      'No AI provider configured'
    );
  });

  // Integration test — runs only when GEMINI_API_KEY is set in the environment.
  // Run: GEMINI_API_KEY=your_key npx jest tests/ai-router.service.test.ts
  it('returns a non-empty string from Gemini Flash (integration)', async () => {
    if (!process.env.GEMINI_API_KEY) {
      console.warn('Skipping integration test: GEMINI_API_KEY not set');
      return;
    }
    const result = await service.call('Say only the word "hello".', '');
    expect(typeof result).toBe('string');
    expect(result.trim().length).toBeGreaterThan(0);
  }, 15_000);
});
```

- [ ] **Step 4.2: Run the test — expect FAIL**

```bash
cd apps/agent
npx jest tests/ai-router.service.test.ts --no-coverage
```
Expected: FAIL — `Cannot find module '../src/ai/ai-router.service'`

- [ ] **Step 4.3: Implement AiRouterService**

`apps/agent/src/ai/ai-router.service.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';

@Injectable()
export class AiRouterService {
  async call(prompt: string, context: string): Promise<string> {
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      throw new Error(
        'No AI provider configured. Set GEMINI_API_KEY in environment or .env file.'
      );
    }

    const genAI = new GoogleGenerativeAI(geminiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const fullPrompt = context
      ? `Clipboard content:\n${context}\n\nInstruction:\n${prompt}`
      : prompt;

    const result = await model.generateContent(fullPrompt);
    return result.response.text();
  }
}
```

- [ ] **Step 4.4: Run tests — expect PASS**

```bash
npx jest tests/ai-router.service.test.ts --no-coverage
```
Expected: First test PASS. Second test SKIP (no key) or PASS (key set).

- [ ] **Step 4.5: Commit**

```bash
git add apps/agent/src/ai/ apps/agent/tests/ai-router.service.test.ts
git commit -m "feat: ai router with gemini flash, throws on missing key"
```

---

## Task 5: Desktop Agent — Command Service

**Files:**
- Create: `apps/agent/src/command/command.service.ts`
- Create: `apps/agent/tests/command.service.test.ts`

- [ ] **Step 5.1: Write failing tests**

```bash
mkdir -p apps/agent/src/command
```

`apps/agent/tests/command.service.test.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { CommandService } from '../src/command/command.service';
import { ClipboardService } from '../src/clipboard/clipboard.service';
import { AiRouterService } from '../src/ai/ai-router.service';

describe('CommandService', () => {
  let commandService: CommandService;
  let clipboardService: ClipboardService;
  let mockAiRouter: { call: jest.Mock };

  beforeEach(async () => {
    mockAiRouter = { call: jest.fn().mockResolvedValue('AI result text') };

    const moduleRef = await Test.createTestingModule({
      providers: [
        CommandService,
        ClipboardService,
        { provide: AiRouterService, useValue: mockAiRouter },
      ],
    }).compile();

    commandService = moduleRef.get(CommandService);
    clipboardService = moduleRef.get(ClipboardService);
  });

  it('executes CLIPBOARD_WRITE and updates the clipboard', async () => {
    const result = await commandService.execute({
      kind: 'CLIPBOARD_WRITE',
      text: 'hello world',
    });
    expect(result.success).toBe(true);
    expect(await clipboardService.read()).toBe('hello world');
  });

  it('executes AI_CLIPBOARD in clipboard mode — writes AI result to clipboard', async () => {
    await clipboardService.write('original text');
    const result = await commandService.execute({
      kind: 'AI_CLIPBOARD',
      prompt: 'Summarize this',
      outputMode: 'clipboard',
    });
    expect(result.success).toBe(true);
    expect(mockAiRouter.call).toHaveBeenCalledWith('Summarize this', 'original text');
    expect(await clipboardService.read()).toBe('AI result text');
  });

  it('executes AI_CLIPBOARD in autopaste mode — writes result to clipboard', async () => {
    await clipboardService.write('some text');
    const result = await commandService.execute({
      kind: 'AI_CLIPBOARD',
      prompt: 'Fix grammar',
      outputMode: 'autopaste',
    });
    expect(result.success).toBe(true);
    expect(await clipboardService.read()).toBe('AI result text');
  });

  it('executes AI_CLIPBOARD in viewer mode — returns output without touching clipboard', async () => {
    await clipboardService.write('my text');
    const result = await commandService.execute({
      kind: 'AI_CLIPBOARD',
      prompt: 'Explain this',
      outputMode: 'viewer',
    });
    expect(result.success).toBe(true);
    expect(result.output).toBe('AI result text');
    // Clipboard should be unchanged in viewer mode
    expect(await clipboardService.read()).toBe('my text');
  });

  it('returns success: false for unimplemented KEYSTROKE (deferred to Week 3-4)', async () => {
    const result = await commandService.execute({ kind: 'KEYSTROKE', keys: ['cmd', 'c'] });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not yet implemented/i);
  });

  it('returns success: false for unimplemented APP_LAUNCH (deferred to Week 3-4)', async () => {
    const result = await commandService.execute({ kind: 'APP_LAUNCH', bundleId: 'com.apple.xcode' });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not yet implemented/i);
  });
});
```

- [ ] **Step 5.2: Run tests — expect FAIL**

```bash
npx jest tests/command.service.test.ts --no-coverage
```
Expected: FAIL — `Cannot find module '../src/command/command.service'`

- [ ] **Step 5.3: Implement CommandService**

`apps/agent/src/command/command.service.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { ButtonAction } from '@control-surface/shared';
import { ClipboardService } from '../clipboard/clipboard.service';
import { AiRouterService } from '../ai/ai-router.service';

export interface CommandResult {
  success: boolean;
  output?: string;
  error?: string;
}

@Injectable()
export class CommandService {
  constructor(
    private readonly clipboard: ClipboardService,
    private readonly aiRouter: AiRouterService,
  ) {}

  async execute(action: ButtonAction): Promise<CommandResult> {
    try {
      switch (action.kind) {
        case 'CLIPBOARD_WRITE':
          await this.clipboard.write(action.text);
          return { success: true };

        case 'AI_CLIPBOARD': {
          const context = await this.clipboard.read();
          const result = await this.aiRouter.call(action.prompt, context);
          if (action.outputMode === 'viewer') {
            return { success: true, output: result };
          }
          await this.clipboard.write(result);
          return { success: true };
        }

        case 'KEYSTROKE':
          return { success: false, error: 'KEYSTROKE not yet implemented (Week 3-4)' };

        case 'APP_LAUNCH':
          return { success: false, error: 'APP_LAUNCH not yet implemented (Week 3-4)' };

        default: {
          const exhaustive: never = action;
          return { success: false, error: `Unknown action kind: ${(exhaustive as ButtonAction).kind}` };
        }
      }
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
```

- [ ] **Step 5.4: Run tests — expect all PASS**

```bash
npx jest tests/command.service.test.ts --no-coverage
```
Expected: All 6 tests PASS.

- [ ] **Step 5.5: Commit**

```bash
git add apps/agent/src/command/ apps/agent/tests/command.service.test.ts
git commit -m "feat: command service — AI clipboard, clipboard write, stubs for keystroke/app launch"
```

---

## Task 6: Desktop Agent — WebSocket Gateway

**Files:**
- Create: `apps/agent/src/websocket/ws.gateway.ts`
- Create: `apps/agent/tests/ws.gateway.test.ts`

- [ ] **Step 6.1: Write failing test**

`apps/agent/tests/ws.gateway.test.ts`:
```typescript
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
```

- [ ] **Step 6.2: Run test — expect FAIL**

```bash
npx jest tests/ws.gateway.test.ts --no-coverage
```
Expected: FAIL — `Cannot find module '../src/websocket/ws.gateway'`

- [ ] **Step 6.3: Implement WsGateway**

```bash
mkdir -p apps/agent/src/websocket
```

`apps/agent/src/websocket/ws.gateway.ts`:
```typescript
import { WebSocketGateway, OnGatewayConnection, WebSocketServer } from '@nestjs/websockets';
import { Server, WebSocket } from 'ws';
import { platform } from 'os';
import { ConnectedMessage, MobileMessage, ActionResultMessage } from '@control-surface/shared';
import { CommandService } from '../command/command.service';

// NestJS WsAdapter expects { event, data } format for @SubscribeMessage routing.
// Our schema uses { type, buttonId, action } instead, so we handle messages via
// raw client.on('message') in handleConnection rather than @SubscribeMessage.
@WebSocketGateway(3001)
export class WsGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  constructor(private readonly commandService: CommandService) {}

  handleConnection(client: WebSocket): void {
    const connected: ConnectedMessage = {
      type: 'CONNECTED',
      agentVersion: '0.1.0',
      platform: platform() as 'darwin' | 'win32' | 'linux',
    };
    client.send(JSON.stringify(connected));
    console.log('[Agent] Mobile client connected');

    client.on('message', async (raw) => {
      let data: MobileMessage;
      try {
        data = JSON.parse(raw.toString()) as MobileMessage;
      } catch {
        return;
      }

      if (data.type !== 'BUTTON_TAP') return;

      console.log(`[Agent] BUTTON_TAP ${data.buttonId} (${data.action.kind})`);
      const result = await this.commandService.execute(data.action);

      const response: ActionResultMessage = {
        type: 'ACTION_RESULT',
        buttonId: data.buttonId,
        success: result.success,
        output: result.output,
        error: result.error,
      };
      client.send(JSON.stringify(response));
    });
  }
}
```

- [ ] **Step 6.4: Run tests — expect all PASS**

```bash
npx jest tests/ws.gateway.test.ts --no-coverage
```
Expected: Both tests PASS.

- [ ] **Step 6.5: Run the full agent test suite**

```bash
npx jest --no-coverage
```
Expected: All tests PASS (gateway + command service + ai router).

- [ ] **Step 6.6: Commit**

```bash
git add apps/agent/src/websocket/ apps/agent/tests/ws.gateway.test.ts
git commit -m "feat: websocket gateway — CONNECTED handshake + BUTTON_TAP handler"
```

---

## Task 7: Mobile App — Scaffold (Expo Bare)

**Files:**
- Create: `apps/mobile/` (Expo bare project via CLI)
- Create: `apps/mobile/src/types/schema.ts`
- Create: `apps/mobile/jest.config.js`

- [ ] **Step 7.1: Bootstrap Expo bare project**

```bash
cd apps
npx create-expo-app@latest mobile --template bare-minimum
cd mobile
```

- [ ] **Step 7.2: Add TypeScript dependencies**

```bash
npm install --save-dev @types/react @types/react-native jest ts-jest @types/jest jest-environment-jsdom
npm install zustand
```

- [ ] **Step 7.3: Copy schema types (Metro bundler workaround)**

Metro bundler in Expo bare has issues resolving npm workspace symlinks. Copy the types manually — they're a stable contract and small enough that duplication is acceptable until the Core Expansion plan.

```bash
mkdir -p src/types
```

`apps/mobile/src/types/schema.ts`:
```typescript
// Mirror of packages/shared/src/schema.ts
// Keep these in sync with the agent schema when either side changes.

export interface ButtonTapMessage {
  type: 'BUTTON_TAP';
  buttonId: string;
  action: ButtonAction;
}

export type ButtonAction =
  | { kind: 'AI_CLIPBOARD'; prompt: string; outputMode: 'clipboard' | 'autopaste' | 'viewer' }
  | { kind: 'KEYSTROKE'; keys: string[] }
  | { kind: 'APP_LAUNCH'; bundleId: string }
  | { kind: 'CLIPBOARD_WRITE'; text: string };

export interface ActionResultMessage {
  type: 'ACTION_RESULT';
  buttonId: string;
  success: boolean;
  output?: string;
  error?: string;
}

export interface ConnectedMessage {
  type: 'CONNECTED';
  agentVersion: string;
  platform: 'darwin' | 'win32' | 'linux';
}

export type AgentMessage = ActionResultMessage | ConnectedMessage;
export type MobileMessage = ButtonTapMessage;
```

- [ ] **Step 7.4: Jest config for mobile**

`apps/mobile/jest.config.js`:
```js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  transformIgnorePatterns: [
    'node_modules/(?!(jest-websocket-mock|mock-socket)/)',
  ],
};
```

- [ ] **Step 7.5: Commit**

```bash
git add apps/mobile/
git commit -m "feat: expo bare mobile app scaffold with shared schema types"
```

---

## Task 8: Mobile App — WebSocket Service

**Files:**
- Create: `apps/mobile/src/services/websocket.service.ts`
- Create: `apps/mobile/src/services/__tests__/websocket.service.test.ts`

- [ ] **Step 8.1: Install test dependencies**

```bash
cd apps/mobile
npm install --save-dev jest-websocket-mock mock-socket
```

- [ ] **Step 8.2: Write failing tests**

```bash
mkdir -p src/services/__tests__
```

`apps/mobile/src/services/__tests__/websocket.service.test.ts`:
```typescript
import WS from 'jest-websocket-mock';
import { WebSocketService } from '../websocket.service';
import { ConnectedMessage, ActionResultMessage } from '../../types/schema';

describe('WebSocketService', () => {
  let server: WS;
  let service: WebSocketService;

  beforeEach(async () => {
    server = new WS('ws://localhost:3001');
    service = new WebSocketService('ws://localhost:3001');
    await server.connected;
  });

  afterEach(() => {
    service.disconnect();
    WS.clean();
  });

  it('emits "connected" status when server sends CONNECTED message', async () => {
    const statuses: string[] = [];
    service.onStatusChange((s) => statuses.push(s));

    const msg: ConnectedMessage = { type: 'CONNECTED', agentVersion: '0.1.0', platform: 'darwin' };
    server.send(JSON.stringify(msg));

    await new Promise((r) => setTimeout(r, 50));
    expect(statuses).toContain('connected');
  });

  it('sends a valid BUTTON_TAP message when tap() is called', async () => {
    service.tap('btn-1', { kind: 'AI_CLIPBOARD', prompt: 'test', outputMode: 'clipboard' });
    const received = await server.nextMessage;
    const parsed = JSON.parse(received as string);
    expect(parsed.type).toBe('BUTTON_TAP');
    expect(parsed.buttonId).toBe('btn-1');
    expect(parsed.action.kind).toBe('AI_CLIPBOARD');
    expect(parsed.action.prompt).toBe('test');
  });

  it('calls onResult callback when server sends ACTION_RESULT', async () => {
    const results: ActionResultMessage[] = [];
    service.onResult((r) => results.push(r));

    const msg: ActionResultMessage = {
      type: 'ACTION_RESULT',
      buttonId: 'btn-1',
      success: true,
      output: 'summarized text',
    };
    server.send(JSON.stringify(msg));

    await new Promise((r) => setTimeout(r, 50));
    expect(results).toHaveLength(1);
    expect(results[0].output).toBe('summarized text');
    expect(results[0].buttonId).toBe('btn-1');
  });

  it('emits "disconnected" status when server closes', async () => {
    const statuses: string[] = [];
    service.onStatusChange((s) => statuses.push(s));

    server.close();
    await new Promise((r) => setTimeout(r, 100));
    expect(statuses).toContain('disconnected');
  });
});
```

- [ ] **Step 8.3: Run tests — expect FAIL**

```bash
cd apps/mobile
npx jest src/services/__tests__/websocket.service.test.ts
```
Expected: FAIL — `Cannot find module '../websocket.service'`

- [ ] **Step 8.4: Implement WebSocketService**

`apps/mobile/src/services/websocket.service.ts`:
```typescript
import { AgentMessage, ButtonAction, ButtonTapMessage, ActionResultMessage } from '../types/schema';

type StatusCallback = (status: 'connecting' | 'connected' | 'disconnected') => void;
type ResultCallback = (msg: ActionResultMessage) => void;

export class WebSocketService {
  private ws: WebSocket | null = null;
  private statusCallbacks: StatusCallback[] = [];
  private resultCallbacks: ResultCallback[] = [];

  constructor(private readonly url: string) {
    this.connect();
  }

  private connect(): void {
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this.notifyStatus('connecting');
    };

    this.ws.onmessage = (event: MessageEvent) => {
      const msg: AgentMessage = JSON.parse(event.data as string);
      if (msg.type === 'CONNECTED') {
        this.notifyStatus('connected');
      } else if (msg.type === 'ACTION_RESULT') {
        this.resultCallbacks.forEach((cb) => cb(msg));
      }
    };

    this.ws.onclose = () => {
      this.notifyStatus('disconnected');
    };
  }

  tap(buttonId: string, action: ButtonAction): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const msg: ButtonTapMessage = { type: 'BUTTON_TAP', buttonId, action };
    this.ws.send(JSON.stringify(msg));
  }

  onStatusChange(cb: StatusCallback): void {
    this.statusCallbacks.push(cb);
  }

  onResult(cb: ResultCallback): void {
    this.resultCallbacks.push(cb);
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }

  private notifyStatus(status: 'connecting' | 'connected' | 'disconnected'): void {
    this.statusCallbacks.forEach((cb) => cb(status));
  }
}
```

- [ ] **Step 8.5: Run tests — expect all PASS**

```bash
npx jest src/services/__tests__/websocket.service.test.ts
```
Expected: All 4 tests PASS.

- [ ] **Step 8.6: Commit**

```bash
git add apps/mobile/src/services/
git commit -m "feat: mobile websocket service with tap/result/status callbacks"
```

---

## Task 9: Mobile App — Button Grid UI

**Files:**
- Create: `apps/mobile/src/components/DeckButton.tsx`
- Create: `apps/mobile/src/screens/DeckScreen.tsx`
- Modify: `apps/mobile/App.tsx`

- [ ] **Step 9.1: Create DeckButton component**

```bash
mkdir -p apps/mobile/src/components apps/mobile/src/screens
```

`apps/mobile/src/components/DeckButton.tsx`:
```tsx
import React, { useRef } from 'react';
import { Pressable, Text, StyleSheet, Animated } from 'react-native';

export interface ButtonConfig {
  id: string;
  label: string;
  color?: string;
  isLoading?: boolean;
}

interface Props {
  config: ButtonConfig;
  onTap: (id: string) => void;
}

export function DeckButton({ config, onTap }: Props) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scale, { toValue: 0.92, useNativeDriver: true, speed: 50 }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20 }).start();
  };

  return (
    <Animated.View style={[styles.wrapper, { transform: [{ scale }] }]}>
      <Pressable
        style={[styles.button, { backgroundColor: config.color ?? '#1E1E2E' }]}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={() => onTap(config.id)}
        disabled={config.isLoading}
      >
        <Text style={styles.label} numberOfLines={2}>
          {config.isLoading ? '⏳' : config.label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, margin: 5, aspectRatio: 1 },
  button: {
    flex: 1,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  label: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: 8,
  },
});
```

- [ ] **Step 9.2: Create DeckScreen**

`apps/mobile/src/screens/DeckScreen.tsx`:
```tsx
import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  FlatList,
  Text,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  TouchableOpacity,
} from 'react-native';
import { DeckButton, ButtonConfig } from '../components/DeckButton';
import { WebSocketService } from '../services/websocket.service';
import { ButtonAction } from '../types/schema';

interface ButtonDefinition extends ButtonConfig {
  action: ButtonAction;
}

const DEMO_BUTTONS: ButtonDefinition[] = [
  {
    id: 'btn-explain',
    label: 'Explain Error',
    color: '#2D1B69',
    action: {
      kind: 'AI_CLIPBOARD',
      prompt: 'Explain this error clearly and concisely. What is the root cause and how do I fix it?',
      outputMode: 'viewer',
    },
  },
  {
    id: 'btn-grammar',
    label: 'Fix Grammar',
    color: '#0D3B2E',
    action: {
      kind: 'AI_CLIPBOARD',
      prompt: 'Fix all grammar and spelling errors. Return only the corrected text, no commentary.',
      outputMode: 'autopaste',
    },
  },
  {
    id: 'btn-tweet',
    label: 'Write Tweet',
    color: '#1A237E',
    action: {
      kind: 'AI_CLIPBOARD',
      prompt: 'Write a compelling tweet based on this content. Max 280 characters. No hashtags unless relevant.',
      outputMode: 'clipboard',
    },
  },
  {
    id: 'btn-shorten',
    label: 'Make Shorter',
    color: '#2C1654',
    action: {
      kind: 'AI_CLIPBOARD',
      prompt: 'Rewrite this to be shorter and more concise. Cut filler. Keep the core message intact.',
      outputMode: 'autopaste',
    },
  },
  {
    id: 'btn-tests',
    label: 'Write Tests',
    color: '#1B2631',
    action: {
      kind: 'AI_CLIPBOARD',
      prompt: 'Write comprehensive unit tests for this code. Use the same language and testing framework visible in the code.',
      outputMode: 'viewer',
    },
  },
  {
    id: 'btn-translate',
    label: 'Translate ES',
    color: '#1A3C34',
    action: {
      kind: 'AI_CLIPBOARD',
      prompt: 'Translate this text to Spanish. Return only the translation.',
      outputMode: 'clipboard',
    },
  },
];

// Replace with your desktop machine's local IP address during development.
// Find it with: ipconfig (Windows) or ifconfig | grep inet (macOS)
// mDNS auto-discovery replaces this hardcoded IP in the Week 3-4 Core Expansion plan.
const AGENT_URL = 'ws://192.168.1.100:3001';

export function DeckScreen() {
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [viewerText, setViewerText] = useState<string | null>(null);
  const wsRef = useRef<WebSocketService | null>(null);

  useEffect(() => {
    const ws = new WebSocketService(AGENT_URL);
    wsRef.current = ws;
    ws.onStatusChange(setStatus);
    ws.onResult((result) => {
      setLoadingId(null);
      if (result.output) setViewerText(result.output);
    });
    return () => ws.disconnect();
  }, []);

  const handleTap = (buttonId: string) => {
    if (status !== 'connected') return;
    const def = DEMO_BUTTONS.find((b) => b.id === buttonId);
    if (!def) return;
    setLoadingId(buttonId);
    wsRef.current?.tap(buttonId, def.action);
  };

  const buttons: ButtonConfig[] = DEMO_BUTTONS.map((b) => ({
    ...b,
    isLoading: b.id === loadingId,
  }));

  const statusColor = status === 'connected' ? '#44FF88' : status === 'connecting' ? '#FFB800' : '#FF4444';
  const statusLabel = { connecting: 'Connecting…', connected: 'Connected', disconnected: 'Disconnected' }[status];

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F0F14" />

      <View style={styles.header}>
        <Text style={styles.title}>Control Surface</Text>
        <View style={styles.statusBadge}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
      </View>

      {viewerText !== null && (
        <View style={styles.viewer}>
          <ScrollView style={styles.viewerScroll} showsVerticalScrollIndicator={false}>
            <Text style={styles.viewerText} selectable>{viewerText}</Text>
          </ScrollView>
          <TouchableOpacity style={styles.viewerDismiss} onPress={() => setViewerText(null)}>
            <Text style={styles.viewerDismissText}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={buttons}
        keyExtractor={(item) => item.id}
        numColumns={2}
        renderItem={({ item }) => <DeckButton config={item} onTap={handleTap} />}
        contentContainerStyle={styles.grid}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F14' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', flex: 1 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 12, fontWeight: '600' },
  grid: { padding: 8 },
  viewer: {
    margin: 12,
    maxHeight: 200,
    backgroundColor: '#1A1A2E',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  viewerScroll: { padding: 14 },
  viewerText: { color: '#E0E0E0', fontSize: 14, lineHeight: 22 },
  viewerDismiss: {
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
  },
  viewerDismissText: { color: '#6B6B8A', fontSize: 13, fontWeight: '600' },
});
```

- [ ] **Step 9.3: Update App.tsx**

`apps/mobile/App.tsx`:
```tsx
import React from 'react';
import { DeckScreen } from './src/screens/DeckScreen';

export default function App() {
  return <DeckScreen />;
}
```

- [ ] **Step 9.4: Verify the app compiles and starts**

```bash
cd apps/mobile
npx expo start
```
Expected: Metro bundler starts with no TypeScript errors. App renders on Expo Go / simulator with dark background, header "Control Surface", and 6 buttons in a 2-column grid.

- [ ] **Step 9.5: Commit**

```bash
git add apps/mobile/src/ apps/mobile/App.tsx
git commit -m "feat: deck screen — 6 demo AI clipboard buttons, viewer card, connection status"
```

---

## Task 10: Integration — End-to-End Vertical Slice Verification

**Goal:** Run the full flow: mobile tap → agent → Gemini Flash → result back → clipboard updated.

- [ ] **Step 10.1: Set your Gemini API key**

Get a free key at `https://aistudio.google.com/app/apikey` (no credit card required — 1M tokens/day free).

```bash
# In apps/agent/
cp .env.example .env
# Open .env and set: GEMINI_API_KEY=your_actual_key_here
```

Then load the env when starting the agent. The simplest way during development:

Windows (PowerShell):
```powershell
$env:GEMINI_API_KEY = "your_key_here"
npm run dev --workspace=apps/agent
```

macOS/Linux:
```bash
GEMINI_API_KEY=your_key_here npm run dev --workspace=apps/agent
```

- [ ] **Step 10.2: Start the desktop agent**

```bash
npm run agent  # from repo root
```
Expected console output:
```
[Agent] WebSocket server ready on ws://localhost:3001
```
And a tray icon appears (or a warning that icon couldn't load — both are fine).

- [ ] **Step 10.3: Find your desktop machine's local IP**

Windows (PowerShell):
```powershell
ipconfig | Select-String "IPv4"
```

macOS/Linux:
```bash
ifconfig | grep "inet " | grep -v 127
```

Note the IP (e.g., `192.168.1.42`).

- [ ] **Step 10.4: Update AGENT_URL in DeckScreen.tsx**

In `apps/mobile/src/screens/DeckScreen.tsx`, change line:
```typescript
const AGENT_URL = 'ws://192.168.1.100:3001';
```
to:
```typescript
const AGENT_URL = 'ws://YOUR_ACTUAL_IP:3001';  // e.g., ws://192.168.1.42:3001
```

- [ ] **Step 10.5: Run the mobile app on a device on the same Wi-Fi**

```bash
npm run mobile  # from repo root (runs npx expo start)
```

Scan the QR code with Expo Go on your phone (iOS or Android). Make sure the phone is on the same Wi-Fi as the desktop.

- [ ] **Step 10.6: Verify the complete flow**

**Test 1 — AI Clipboard (viewer mode):**
1. Copy any error message or code snippet to your desktop clipboard
2. On the mobile app, confirm the status dot is green ("Connected")
3. Tap "Explain Error"
4. The button shows ⏳ for 1–3 seconds
5. A viewer card slides in showing Gemini's explanation
6. Tap "Dismiss" to close the viewer

**Test 2 — AI Clipboard (autopaste / clipboard mode):**
1. Copy a sentence with typos to your desktop clipboard
2. Tap "Fix Grammar"
3. Verify your desktop clipboard now contains the corrected text (paste it somewhere to check)

Expected agent console output per tap:
```
[Agent] Mobile client connected
[Agent] BUTTON_TAP btn-explain (AI_CLIPBOARD)
[Agent] WebSocket server ready on ws://localhost:3001
```

- [ ] **Step 10.7: Commit final integration state**

```bash
git add .
git commit -m "chore: vertical slice end-to-end integration complete"
```

---

## What's Next (Plan 2 — Core Expansion, Weeks 3–4)

This vertical slice does not include:
- mDNS auto-discovery + QR code pairing (replace hardcoded IP)
- Button editor (currently hardcoded 6 buttons)
- Keystroke execution and app launch commands
- Active-win polling (active app detection)
- Auto-switching profiles
- WSS (TLS) on LAN connection
- Supabase auth + profile sync

Those are the subjects of the **Core Expansion plan** (`2026-05-15-core-expansion.md`), written after this vertical slice is verified working.
