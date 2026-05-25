# Plugin Expansion Roadmap

**Date:** 2026-05-25
**Status:** Approved

## Goal

Make the Plugin Library mature enough to support more first-party tool integrations, starting from the current OBS-only implementation and moving one plugin family at a time.

The main product direction is still correct: plugins are catalog-gated capabilities, while execution code ships inside the agent or trusted backend. The change here is priority. The next work should favor integrations that fit the current local-agent architecture before adding OAuth-heavy cloud services.

## Existing State Reviewed

- Spec: `docs/superpowers/specs/2026-05-21-plugin-library-design.md`
- Existing phase plan: `docs/superpowers/plans/2026-05-21-plugin-library.md`
- Agent integration services:
  - `apps/agent/src/integrations/integration-router.service.ts`
  - `apps/agent/src/integrations/connector.service.ts`
  - `apps/agent/src/integrations/integration-state.service.ts`
  - `apps/agent/src/integrations/plugin-catalog.service.ts`
  - `apps/agent/src/integrations/plugin-install.service.ts`
  - `apps/agent/src/integrations/integration.adapter.ts` — base class all adapters extend; required reading before writing any new plugin adapter
  - `apps/agent/src/integrations/obs/obs.service.ts`
- Mobile plugin UI:
  - `apps/mobile/src/screens/PluginLibraryScreen.tsx`
  - `apps/mobile/src/screens/PluginDetailScreen.tsx`
  - `apps/mobile/src/screens/PluginConnectionScreen.tsx`
  - `apps/mobile/src/screens/AddTileScreen.tsx`
  - `apps/mobile/src/screens/WorkflowBuilderScreen.tsx`
  - `apps/mobile/src/utils/pluginTools.ts`
- Seed data: `supabase/migrations/20260521000014_plugins_seed.sql`

Current OBS tools are useful but narrow: stream start/stop, recording start/stop, scene switch, and source toggle. The mobile side also has OBS-specific presentation logic in `pluginTools.ts`, which is a sign that the catalog metadata is not expressive enough yet.

**Note (post-review):** `obs.service.ts` already implements all 15 new OBS action IDs listed in the First Slice — replay buffer, virtual camera, studio mode, input mute/volume, and the toggle variants of stream/record. It also already returns `replayBufferActive`, `virtualCameraActive`, and `studioModeEnabled` in `getState()`. `pluginTools.ts` already has all the toggle groupings for these actions. The catalog seed (`20260521000014_plugins_seed.sql`) only exposes 6 tools. First Slice work is therefore **a single catalog migration only** — no new agent code, no mobile UI changes.

## Priority Order

| Priority | Workstream | Why this order | Main dependency |
|---|---|---|---|
| 0 | Plugin platform maturity pass | Avoid hardcoding every new plugin into the mobile UI and agent. This is the small foundation that prevents messy growth. | Existing plugin shell |
| 1 | OBS Studio expansion | Highest user value, already has connector, adapter, state polling, and installed plugin UX. Fastest path to a better plugin section. | OBS WebSocket requests |
| 2 | KDeck Media / System Audio plugin | Uses capabilities already inside the agent: media sessions, per-app volume, mute, playback controls. No OAuth or external device setup. | Current media service |
| 3 | Soundboard plugin | Strong daily creator/gamer utility. Local execution, but needs asset/file management and reliable audio playback. | File picker/storage + playback engine |
| 4 | Elgato Key Light / local lighting | Good creator value and good "Go Live" recipe value. Elgato uses Bonjour/mDNS discovery and HTTP control after pairing. | Generic local device connector |
| 5 | Philips Hue lighting | Good smart-studio value, but bridge auth and HTTPS/mDNS discovery add more setup complexity than Elgato. | Generic local device connector + app key flow |
| 6 | Discord local/RPC | Local integration is possible through Discord RPC/IPC, but permissions, approved app setup, and feature limitations make it riskier. | Discord app config + IPC client |
| 7 | Twitch | Very valuable for streamers, but requires OAuth scopes, token storage/refresh, and cloud execution for many actions. | OAuth/cloud connector framework |
| 8 | Spotify | Familiar integration, but playback control needs OAuth, Premium for some playback APIs, and policy review. | OAuth/cloud connector framework |
| 9 | GitHub / Linear / Notion / Slack | Useful for developer/productivity workflows, but less core to the creator wedge and mostly cloud/API-key connectors. | API-key/OAuth connector framework |
| 10 | YouTube Live / Kick / TikTok Live | High creator value, but should come after Twitch proves the streamer OAuth/API pattern. YouTube Live has broad broadcast/chat APIs and more permissions complexity. | OAuth/cloud connector framework |

## Platform Gaps Before Adding Many Plugins

These are not huge rewrites, but they should be handled early.

1. **Catalog-driven tool presentation**
   - Move OBS-specific toggle behavior out of `apps/mobile/src/utils/pluginTools.ts` and into catalog metadata.
   - Add metadata for grouped actions, preferred deck action, hidden raw actions, state badge key, and parameter UI hints.

2. **Generic connector UI**
   - `PluginConnectionScreen.tsx` is currently an OBS WebSocket form.
   - It should render from `connectorType` and plugin metadata:
     - `none`: no setup.
     - `local-websocket`: host, port, password.
     - `local-http`: host, port, optional token/app key.
     - `mdns-discovery`: scan/select device, then save non-secret metadata.
     - `api-key`: key input, store securely.
     - `oauth2`: open auth flow and show connected account.

3. **Connector service split**
   - `ConnectorService` currently handles only `user_device_connections`.
   - Cloud connectors need `user_cloud_connections`, token refresh, and secret storage rules before Twitch/Spotify/YouTube.

4. **Param schema validation**
   - `IntegrationRouterService` only checks required fields.
   - Add type/enumeration validation for strings, numbers, booleans, and known option lists.

5. **Dynamic options for params**
   - Scene/source names, audio input names, devices, and playlists should not be typed manually forever.
   - Add a lightweight action such as `GET_PLUGIN_PARAM_OPTIONS` or an adapter method like `getOptions(toolActionId, paramKey)`.

6. **State and installed-plugin filtering**
   - `IntegrationStateService` polls every registered adapter.
   - It should poll only installed/enabled plugins and broadcast readable offline/error states when configured services disappear.

7. **Seed update strategy**
   - Existing seed uses `ON CONFLICT DO NOTHING`.
   - Future plugin metadata changes need idempotent upserts that update names, descriptions, schemas, and statuses.

## One-By-One Implementation Protocol

Every plugin should follow the same narrow loop:

1. Add or update catalog seed/migration.
2. Add the agent adapter or mobile/cloud executor. (For OBS First Slice, this step is already done — skip to step 3.)
3. Register the adapter in `IntegrationsModule` or the relevant executor registry.
4. Add connector UI only if the plugin needs setup.
5. Add parameter UI hints and dynamic options where typing raw strings would feel bad.
6. Add state badge support when the plugin has meaningful live state.
7. Add unit tests for action dispatch, param validation, connection failure, and state reads.
8. Run TypeScript and focused tests.
9. Bump `min_agent_capability` only when new agent execution code is required.

## First Slice: OBS Expansion

Start here because it gives the plugin section more depth without introducing a new auth model.

Recommended tool additions:

| Tool | Action ID | Notes |
|---|---|---|
| Toggle Stream | `obs.stream.toggle` | Make this catalog-native instead of mobile-only mapping. |
| Toggle Recording | `obs.record.toggle` | Same as stream toggle. |
| Start Replay Buffer | `obs.replay.start` | Requires replay buffer enabled in OBS settings. |
| Stop Replay Buffer | `obs.replay.stop` | Agent should show a readable error if unavailable. |
| Save Replay Buffer | `obs.replay.save` | High-value streamer action. |
| Toggle Replay Buffer | `obs.replay.toggle` | Deck-friendly action. |
| Start Virtual Camera | `obs.virtual_camera.start` | Useful for meetings and creator workflows. |
| Stop Virtual Camera | `obs.virtual_camera.stop` | Pair with start/toggle. |
| Toggle Virtual Camera | `obs.virtual_camera.toggle` | Deck-friendly action. |
| Enable Studio Mode | `obs.studio_mode.enable` | More advanced production control. |
| Disable Studio Mode | `obs.studio_mode.disable` | Pair with enable/toggle. |
| Toggle Studio Mode | `obs.studio_mode.toggle` | Deck-friendly action. |
| Set Input Mute | `obs.input.mute.set` | Needs `inputName` and `muted`. |
| Toggle Input Mute | `obs.input.mute.toggle` | Needs `inputName`; should use dynamic input options later. |
| Set Input Volume | `obs.input.volume.set` | Needs `inputName` and volume value. |

State additions (needed in `obs.service.ts` `getState()`; the current implementation only returns `streaming`, `recording`, and `scene`):

- `replayBufferActive`
- `virtualCameraActive`
- `studioModeEnabled`
- Optional later: selected input mute states for configured tiles.

Acceptance criteria:

- Existing OBS stream/recording/scene/source tools keep working.
- New OBS actions return readable errors when OBS is not connected or a feature is not enabled.
- Mobile Add Tile and Workflow Builder show the new tools from the catalog.
- OBS toggles are catalog-driven, not special-cased in mobile code.
- Focused tests cover new OBS actions and state reads.

## Second Slice: KDeck Media / System Audio Plugin

This should wrap the already-working media tab into reusable deck/workflow tools.

Recommended tools:

- Play/pause active media session.
- Next track.
- Previous track.
- Toggle mute for selected app.
- Set selected app volume.
- Volume up/down selected app.
- Bring selected media app to front.

This plugin likely uses `connector_type = 'none'` and `execution_mode = 'agent'`.

## Third Slice: Soundboard Plugin

Recommended tools:

- Play sound.
- Stop all sounds.
- Toggle sound loop.
- Set soundboard volume.

This should wait until there is a simple file asset model. A sound tile needs to reference a stable local file or synced asset, not an unstable mobile-only URI.

## Fourth Slice: Local Lighting

Elgato should come before Hue if the goal is fastest creator-studio value.

Elgato context:

- Elgato documents Bonjour/multicast discovery and HTTP requests after the device is paired.
- This maps well to a `mdns-discovery` plus `local-http` connector.

Philips Hue context:

- Hue API v2 uses HTTPS, recommends mDNS/discovery.meethue.com, and local REST should not be used for continuous fast light updates.
- This is fine for buttons such as on/off, brightness, color temperature, and scene activation.

Recommended lighting tools:

- Toggle selected light.
- Set brightness.
- Set color temperature.
- Set color.
- Activate scene.

## Cloud Connector Phase

Do this before Twitch, Spotify, YouTube Live, Slack, GitHub, Linear, or Notion.

Required pieces:

- OAuth callback route in the web app or backend.
- Token refresh worker/service.
- Encrypted token storage.
- Connection status sync to mobile and agent.
- Per-tool scopes/permission copy.
- Cloud execution path for `execution_mode = 'cloud'`.
- Confirmation UX for public-facing actions like posting chat messages.

Twitch is the first cloud plugin after this because it is most aligned with the streaming wedge. Twitch Create Clip requires user OAuth scope, and chat/title/moderation actions add more scopes. Spotify should follow later because playback control has Premium and policy constraints. YouTube Live should follow Twitch because its broadcast and live chat APIs are broader and more complex.

## Source Notes

- OBS WebSocket protocol: https://github.com/obsproject/obs-websocket/blob/master/docs/generated/protocol.md
- Twitch clips/scopes: https://dev.twitch.tv/docs/api/clips/ and https://dev.twitch.tv/docs/authentication/scopes/
- Spotify playback/scopes: https://developer.spotify.com/documentation/web-api/reference/start-a-users-playback and https://developer.spotify.com/documentation/web-api/concepts/scopes
- Elgato local discovery/control model: https://help.elgato.com/hc/en-us/articles/360060048331-What-Communication-Protocol-Is-Used-by-Elgato-Wi-Fi-Products
- Philips Hue API v2 notes: https://developers.meethue.com/new-hue-api/
- Discord RPC: https://docs.discord.com/developers/topics/rpc
- YouTube Live Streaming API: https://developers.google.com/youtube/v3/live/docs
