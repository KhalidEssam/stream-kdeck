# Settings Sheet & License Management

**Date:** 2026-05-21
**Status:** Approved

## Goal

Repurpose the existing gear icon in `DeckScreen` from a direct link to `ContextShortcutsScreen` into a general-purpose settings entry point. The gear opens a bottom sheet (`SettingsSheet`) with two sections: **License** and **Shortcuts**. The License section lets the user revalidate their existing desktop license or trigger re-entry of a new key via the existing Electron activation dialog.

---

## Architecture

The feature spans three layers:

1. **Shared schema** — two new client→agent WebSocket message types
2. **Agent** — two new message handlers in `ws.gateway.ts`
3. **Mobile** — new `SettingsSheet` component + gear icon wired to it in `DeckScreen`

No new agent service is needed; the two new handlers call methods that already exist (`licenseService.refreshSession()` and `activationDialogService.open()`).

---

## Shared Schema Changes

**File:** `packages/shared/src/schema.ts`

Add two new client→agent message types to the `ClientMessage` union:

```ts
{ type: 'REVALIDATE_LICENSE' }
{ type: 'OPEN_ACTIVATION_DIALOG' }
```

---

## Agent Changes

**File:** `apps/agent/src/websocket/ws.gateway.ts`

Add two new cases inside the existing `handleMessage` switch:

- `REVALIDATE_LICENSE` → call `await this.licenseService.refreshSession()` → call `this.broadcastLicenseStatus()`. The existing `LICENSE_STATUS` broadcast already updates all connected clients.
- `OPEN_ACTIVATION_DIALOG` → call `this.activationDialogService.open()`. No response needed; successful activation already triggers `broadcastLicenseStatus()` via the existing activation flow.

---

## Mobile Changes

### `websocket.service.ts`

Add two methods:

```ts
revalidateLicense(): void  // sends { type: 'REVALIDATE_LICENSE' }
openActivationDialog(): void  // sends { type: 'OPEN_ACTIVATION_DIALOG' }
```

### `SettingsSheet.tsx` (new component)

A `Modal` with `animationType="slide"` and `presentationStyle="pageSheet"`. Two sections:

**License section:**
- Status badge row: shows "Licensed" and "AI Pro" pills from current license state; credits remaining shown as `X / Y credits`
- "Revalidate License" button: calls `wsService.revalidateLicense()`, shows inline spinner while waiting, shows success or error toast when `LICENSE_STATUS` arrives
- "Enter New License Key" button: calls `wsService.openActivationDialog()`, shows a brief confirmation toast ("Opening activation dialog on desktop…")

**Shortcuts section:**
- Single "Context Shortcuts →" row that navigates to `ContextShortcutsScreen` (same behavior as today's gear icon)

Sheet header: "Settings" title + close (✕) button.

Props:
```ts
interface SettingsSheetProps {
  visible: boolean;
  onDismiss: () => void;
  licensed: boolean | null;
  aiPro: boolean;
  creditsRemaining: number;
  creditQuota: number;
}
```

### `DeckScreen.tsx`

- Add `showSettings: boolean` state (default `false`)
- Gear icon `onPress` → `setShowSettings(true)` (replaces current `navigation.navigate('ContextShortcuts')`)
- Render `<SettingsSheet>` with license state props passed down from existing state
- `ContextShortcutsScreen` navigation remains intact; it's just accessed through the sheet now

---

## Data Flow

```
User taps gear
  → SettingsSheet opens (shows current LICENSE_STATUS from DeckScreen state)

User taps "Revalidate License"
  → mobile sends REVALIDATE_LICENSE
  → agent: refreshSession() → broadcastLicenseStatus()
  → mobile: onLicenseStatus() fires → DeckScreen state updates → sheet reflects new status

User taps "Enter New License Key"
  → mobile sends OPEN_ACTIVATION_DIALOG
  → agent: activationDialogService.open() → Electron dialog appears on desktop
  → user enters key on desktop → activation flow runs → broadcastLicenseStatus()
  → mobile: onLicenseStatus() fires → DeckScreen state updates → sheet reflects new status
```

---

## Error Handling

- **Agent not connected:** both buttons are disabled with a "Not connected" label when `wsService` has no active connection
- **Revalidate fails:** agent's `refreshSession()` already handles network/auth errors and returns the current cached claims; the broadcast will still fire. Mobile shows a toast with the error message if `licensed` comes back `false`.
- **Activation dialog already open:** `activationDialogService.open()` is idempotent (existing behavior)

---

## Files Touched

| File | Change |
|---|---|
| `packages/shared/src/schema.ts` | Add `REVALIDATE_LICENSE`, `OPEN_ACTIVATION_DIALOG` to `ClientMessage` union |
| `apps/mobile/src/services/websocket.service.ts` | Add `revalidateLicense()`, `openActivationDialog()` |
| `apps/mobile/src/components/SettingsSheet.tsx` | **New** — bottom sheet, License + Shortcuts sections |
| `apps/mobile/src/screens/DeckScreen.tsx` | Gear → sheet; add `showSettings` state; pass license props to sheet |
| `apps/agent/src/websocket/ws.gateway.ts` | Handle `REVALIDATE_LICENSE` and `OPEN_ACTIVATION_DIALOG` |

`ContextShortcutsScreen` is not modified.

---

## Out of Scope

- Sign out button (deferred)
- Editing AI provider keys from mobile (deferred)
- License status polling (push via existing `broadcastLicenseStatus` is sufficient)
