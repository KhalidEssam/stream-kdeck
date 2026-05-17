# App Launcher & Unified Icon Grid — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded AI text-button grid with a dynamic icon grid; add app/URL launch capability from mobile.

**Architecture:** Schema changes in shared package add TileConfig/DeckConfigMessage/AddTileMessage. Agent gains AppRegistryService (built-in ~19-app registry + apps.config.json) and AppLaunchService (shell.openExternal). Mobile gets AppTile component, dynamic DeckScreen, and AddTileScreen.

**Tech Stack:** NestJS + Electron shell API (agent), React Native Expo bare (mobile), TypeScript project references (shared)

---

### Task 1: Schema Changes (packages/shared)

**Files:**
- Modify: `packages/shared/src/schema.ts`

- [ ] Update ButtonAction union — rename APP_LAUNCH.bundleId → appId, add URL_OPEN, add TileConfig, DeckConfigMessage, AddTileMessage, update AgentMessage and MobileMessage unions.

### Task 2: AppRegistryService (agent)

**Files:**
- Create: `apps/agent/src/app-launch/app-registry.service.ts`
- Create: `apps/agent/apps.config.json`
- Create: `apps/agent/tests/app-registry.service.test.ts`

- [ ] Implement service with built-in registry (19 apps), getTiles(), addTile(), resolveTarget()
- [ ] Write unit tests

### Task 3: AppLaunchService (agent)

**Files:**
- Create: `apps/agent/src/app-launch/app-launch.service.ts`
- Create: `apps/agent/tests/app-launch.service.test.ts`

- [ ] Implement launch(appId) and openUrl(url) via shell.openExternal()
- [ ] Write unit tests

### Task 4: Update CommandService (agent)

**Files:**
- Modify: `apps/agent/src/command/command.service.ts`
- Modify: `apps/agent/tests/command.service.test.ts`

- [ ] Add APP_LAUNCH and URL_OPEN cases
- [ ] Update tests

### Task 5: Update WsGateway (agent)

**Files:**
- Modify: `apps/agent/src/websocket/ws.gateway.ts`
- Modify: `apps/agent/tests/ws.gateway.test.ts`

- [ ] Send DECK_CONFIG after CONNECTED on connect
- [ ] Handle ADD_TILE message
- [ ] Update integration tests

### Task 6: Update AppModule (agent)

**Files:**
- Modify: `apps/agent/src/app.module.ts`

- [ ] Add AppRegistryService and AppLaunchService to providers

### Task 7: Update Electron mock (agent)

**Files:**
- Modify: `apps/agent/__mocks__/electron.js`

- [ ] Add shell.openExternal mock

### Task 8: Update Mobile Types

**Files:**
- Modify: `apps/mobile/src/types/schema.ts`

- [ ] Mirror schema changes from shared package

### Task 9: AppTile Component (mobile)

**Files:**
- Create: `apps/mobile/src/components/AppTile.tsx`

- [ ] Square tile with icon (PNG or colored-letter fallback), label, AI badge, loading state

### Task 10: Update WebSocketService (mobile)

**Files:**
- Modify: `apps/mobile/src/services/websocket.service.ts`

- [ ] Add onDeckConfig callback, handle DECK_CONFIG message, send ADD_TILE

### Task 11: Update DeckScreen (mobile)

**Files:**
- Modify: `apps/mobile/src/screens/DeckScreen.tsx`

- [ ] Replace hardcoded DEMO_BUTTONS with dynamic tiles from DECK_CONFIG
- [ ] Add skeleton state, FAB "+" button

### Task 12: AddTileScreen (mobile)

**Files:**
- Create: `apps/mobile/src/screens/AddTileScreen.tsx`

- [ ] Search bar, curated 3-col grid, custom URL row

### Task 13: Navigation wiring (mobile)

**Files:**
- Modify: `apps/mobile/App.tsx` (or navigation entry point)

- [ ] Add AddTileScreen to navigation stack
