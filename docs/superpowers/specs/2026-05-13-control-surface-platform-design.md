# AI-Native Control Surface Platform — Architecture & Product Design
**Date:** 2026-05-13  
**Status:** Complete — discovery session finished 2026-05-13  
**Authors:** Founding team + Claude Code (co-architect session)

---

## 0. Context & Constraints

| Dimension | Decision |
|---|---|
| Team | Small founding team, 2–3 people |
| Runway | Some runway available |
| 12-month goal | Seed fundraising traction |
| Primary niche | AI/developer power users + content creators/streamers |
| Niche sequencing | Developers first (months 1–6), creators second (months 4–12) |
| Tech stack | React Native Expo, NestJS, Supabase, TypeScript, PostgreSQL, WebSockets |
| Platform | iOS + Android simultaneously via Expo (bare workflow) |
| Desktop OS | Windows + macOS at launch. Linux deferred to v2. |

---

## 1. Product Vision

> "A modern AI-native programmable control surface for creators, developers, power users, and automation workflows."

**NOT a Stream Deck clone.** The product evolves from a control surface tool into an AI workflow execution layer that happens to live on your phone.

### Core differentiation pillars
1. **AI-first workflows** — Claude, Gemini, DeepSeek, Qwen integration with smart routing
2. **Beautiful modern UX** — premium animations, mobile-native feeling, polished onboarding
3. **Frictionless setup** — QR pairing + mDNS auto-discovery, 10-second first connection
4. **Cross-platform sync** — profiles, layouts, and AI workflow libraries synced via Supabase

---

## 2. System Architecture

### 2.1 Architecture decision

**Chosen: Mobile App + Lightweight Desktop Agent (tray icon, no GUI)**

Rejected options:
- Mobile only — cannot control desktop without something running there
- Browser-based — too restricted on iOS/Android for system-level access
- Full Electron desktop app — too much scope for a 2–3 person team at MVP
- Third-party ecosystem (Stream Deck SDK, AutoHotkey) — permanent second-class citizen, no moat

### 2.2 Desktop agent design

The agent is an **Electron app with a hidden main window** — tray icon only, no desktop GUI. Users configure everything from the mobile app.

**Agent responsibilities:**
```
├── WebSocket server (mobile connects here)
├── mDNS broadcaster (_controlsurface._tcp.local)
├── active-win polling → emits "active app changed" events to mobile
├── App icon extraction → served to mobile on demand
├── OBS WebSocket client (obs-websocket-js) → stream state detection
├── Command execution engine (keystrokes, app launch, scripts, clipboard)
├── Global hotkey listener (headless, via iohook)
├── Clipboard bridge (clipboardy)
├── AI Router (see Section 4)
└── Tray icon — connection status only, no config UI
```

**Key principle:** The mobile app IS the configuration surface. Users never open a desktop window to configure buttons. Everything is done on the phone/tablet.

### 2.3 Communication architecture

**Two-path hybrid model:**

| Path | Protocol | Latency | When used | Cost |
|---|---|---|---|---|
| Primary | LAN WebSocket (WSS) | 1–5ms | Same Wi-Fi network | $0 |
| Fallback | Supabase Realtime cloud relay | 50–150ms | Different networks / remote | Low |

**Discovery + pairing flow (first connection):**
```
1. Agent starts → broadcasts mDNS on local network
2. Mobile app scans → finds agent automatically (most home networks)
   OR user taps "Scan QR Code" → scans QR from agent's tray menu
3. Encrypted handshake, pairing token exchanged
4. Token stored in iOS Keychain / Android Keystore
5. Future connections: fully automatic, zero user interaction
```

**Rejected transports:**
- Bluetooth — iOS CoreBluetooth kills background scanning; pairing UX is painful; every competitor who tried BT pivoted away
- WebRTC — STUN/TURN complexity with no benefit over LAN WS + cloud relay
- USB — iOS blocks it entirely; driver complexity on Windows

### 2.4 Command execution location

| Command type | Executes where |
|---|---|
| Keystrokes, app launch, clipboard, OBS | Desktop agent (local, always) |
| AI commands | Desktop agent (has system context: active app, clipboard state) |
| Webhooks / HTTP triggers | Mobile directly (skips agent, saves round-trip) |
| Profile / layout sync | Mobile ↔ Supabase directly |

### 2.5 Data storage model

**Hybrid: local-first with cloud sync**

- **SQLite on mobile** (via Expo SQLite or MMKV) — source of truth, instant reads, offline-capable
- **Agent local cache** — current active profile cached so agent can execute without querying mobile
- **Supabase** — cloud backup, cross-device sync, marketplace templates
- **Conflict resolution** — last-write-wins with per-button `updated_at` timestamps

### 2.6 Offline mode

- ✅ Fully offline for all local commands (LAN path works without internet)
- ❌ Graceful degradation for cloud-dependent features (AI via cloud, webhook triggers, marketplace sync)
- Pattern: show per-button "Cloud unavailable" indicator rather than breaking the whole deck

---

## 3. Monetization Architecture

### 3.1 Model summary

| Tier | Price | Channel | What it unlocks |
|---|---|---|---|
| Mobile App | Free | App Store / Play Store | Product showcase + purchase funnel only |
| Desktop License | $19 one-time | Your website (Stripe/Lemon Squeezy) | Full mobile app + desktop agent + LAN features |
| AI Pro Subscription | $8/month or $59/year | Your website | AI workflows, cloud relay, unlimited sync, advanced controls |

**No free functional tier at launch.** The free download is a purchase funnel, not a working product. App Store listings clearly state "Requires Desktop License."

### 3.2 Why this model

- **$19 one-time** sold on your own website = 0% App Store cut. You keep 100%.
- **$8/month AI Pro** is the recurring revenue metric for investors (MRR story).
- The funnel metric → attach rate → MRR is a clean three-part investor narrative.
- Desktop license sold off-platform means no 30% cut on your primary revenue.
- AI subscription sold off-platform = same benefit.

### 3.3 App Store compliance

The deliberately non-functional free app is only compliant if:
- App Store listing explicitly states "Requires Control Surface Desktop License"
- First screen in app is a rich product showcase + purchase CTA (not a broken empty app)
- App is functional as a purchase funnel — not presented as a free working tool

### 3.4 Revenue projections (conservative)

| Milestone | Core licenses | AI Pro subs | MRR |
|---|---|---|---|
| 3 months (launch) | 500 × $19 = $9,500 one-time | 100 × $8 = $800 | $800 |
| 6 months | 3,000 holders | 600 × $8 | $4,800 |
| 12 months (seed pitch) | 8,000+ holders | 1,500 × $8 | ~$12,000 |

### 3.5 Infrastructure cost risks

- **AI API costs** — most dangerous. 1,000 active Pro users × heavy AI use = $3k–8k/month. Mitigation: monthly quota per user, BYOK option.
- **Cloud relay** — manageable. Gate behind Pro tier. Supabase Pro ($25/mo) handles ~500 concurrent connections.
- **Storage** — negligible. ~50KB per user profile.

---

## 4. AI Router Architecture

### 4.1 Design principle

The **AI Router lives in the desktop agent**, not in the mobile app or cloud. This means:
- API keys never leave the desktop agent
- Keys are stored in the OS keychain (Windows Credential Manager / macOS Keychain)
- Mobile sends task descriptions: `{ task: "summarize", context: "clipboard", prompt: "..." }`
- Agent handles all provider API calls
- Mobile never has direct access to any AI provider

### 4.2 Provider priority stack

| Priority | Provider | Model | Cost | Best for |
|---|---|---|---|---|
| 1st | Google Gemini | 1.5 Flash | Free (1M tokens/day) | Simple tasks — summarize, translate, rewrite |
| 2nd | DeepSeek | V3 / R1 | ~$0.00027/1K tokens | Cost-efficient fallback |
| 3rd | Qwen | 2.5 / Turbo | Free + very cheap | Creative, multilingual |
| 4th | Anthropic | Claude Haiku 3.5 | ~$0.0008/1K | Code-related tasks |
| 5th | Anthropic / OpenAI | Sonnet / GPT-4o | ~$0.003/1K | Complex chains (sparingly) |

### 4.3 Task classification → routing

| Task class | Examples | Route to |
|---|---|---|
| Simple | Summarize clipboard, fix grammar, translate, rewrite shorter | Gemini Flash → DeepSeek fallback |
| Creative | Write tweet, draft reply, stream title ideas, caption | Qwen → DeepSeek → Gemini |
| Code | Explain error, write tests, refactor to TS, add types | Claude Haiku → DeepSeek |
| Complex / chain | Multi-step pipelines, structured JSON output, long context | Claude Sonnet (BYOK preferred) |

### 4.4 BYOK (Bring Your Own Key)

- Pro users can enter their own API key for any provider in the desktop agent tray settings
- Their key takes full priority — bypasses all platform quotas and routing
- Platform pays $0 for BYOK users' AI usage
- Developers who already have Anthropic/Google API keys (Claude Code users, etc.) will prefer this
- Positioned as a feature: "bring your own key for unlimited, model-specific AI"

### 4.5 Cost controls

- Monthly action quota per Pro user (e.g., 500 AI calls/month on platform-side keys)
- Hard cap with graceful in-app indicator ("You've used 480/500 AI actions this month")
- BYOK bypasses quota entirely
- Free tier: no platform-side AI. BYOK only, or upgrade to Pro.

---

## 5. Product Strategy

### 5.1 Initial niche sequencing

**Developers/AI power users first (months 1–6)**
- Strongest pain point: no existing tool has real AI integration
- Highest willingness to pay: already paying $20+/month for Cursor, Claude Pro, Raycast
- Viral in niche: developers share tools obsessively on Twitter/X and Discord
- Builds the moat: AI workflow features are genuinely hard to replicate

**Creators/streamers second (months 4–12)**
- Organic path: developer viral clips reach creator communities
- Creator-specific features shipped as second layer
- OBS integration is the creator wedge

### 5.2 First killer feature: AI clipboard processor

The first feature to build and demo is the **AI clipboard processor**:

```
User flow:
1. Copy anything to clipboard (error, code, tweet draft, article)
2. Tap one button on the mobile app
3. Claude/Gemini processes with a pre-configured prompt
4. Result pastes back to clipboard or opens in editor

Developer examples:
  "Explain this error" → paste stack trace → get explanation
  "Write tests for this" → paste function → get test file

Creator examples:
  "Write tweet about this" → paste rough idea → get polished tweet
  "Make it shorter" → paste script → get tighter version
```

Why this is the right first feature:
- Zero OBS integration required
- No complex desktop permissions (just clipboard access)
- Demonstrable in 15 seconds
- Works for both developer AND creator niches
- Technically simple to ship first
- Creates the "aha moment" that makes the rest of the product make sense

### 5.3 Intentionally delayed features (post-MVP)

| Feature | Reason to delay |
|---|---|
| Community marketplace | Needs critical mass (1k+ users) to be useful |
| Desktop GUI config app | Mobile is the config surface. Don't build both. |
| Linux desktop agent | Low market share; X11/Wayland fragmentation |
| Web/browser version | Dilutes mobile-first UX advantage |
| Custom plugin SDK | Requires docs, support, versioning. Post-seed work. |
| Twitch/YouTube API integrations | OBS covers 80% of streaming needs |
| Team/enterprise features | Wrong market stage |
| iPad split-view / Stage Manager | Edge case. Core first. |

### 5.4 Moats (ordered by defensibility)

1. **AI workflow engine** — system context (active app) + clipboard + AI + chained actions. No competitor has built this properly. User's custom prompt library has real switching costs.
2. **Community template marketplace** — once users publish "my full VS Code + Claude setup," discovery becomes a growth engine. Network effects compound.
3. **Profile portability + sync** — 5 hours spent perfecting a layout across 3 devices creates significant switching cost gravity.
4. **Desktop agent depth** — deep OS integrations (hotkeys, process injection, clipboard history, window management) compound over time and are hard to replicate quickly.

### 5.5 Competitor abandonment reasons

| Competitor | Why users leave |
|---|---|
| Stream Deck Mobile | Requires owning physical hardware first; iOS background kills connection; zero AI; dated UI |
| Touch Portal | Confusing setup (manual IP entry); functional but ugly; no cloud sync; fragmented plugins |
| Macro Deck | Windows only; no mobile-first UX; port forwarding required on some networks; maintenance gaps |
| Deckboard | Android-first (iOS second-class); limited action types; no AI; no sync |

**Pattern**: every competitor fails on at least one of: setup friction, UX quality, AI features, cross-platform sync. You target all four simultaneously.

### 5.6 Onboarding — biggest improvement over competitors

Zero-IP-entry setup is the #1 onboarding improvement:
```
Competitor experience: open settings → find IP address → type into phone → firewall blocks it → support ticket
Your experience: agent installed (5s) → open mobile app → "Found your computer!" (3s) → tap Connect → done (2s)
Total: 10 seconds, zero IP addresses, zero configuration
```
QR code fallback for corporate/hotel/university networks where mDNS is blocked.

---

## 6. Technical Challenges & Mitigations

### 6.1 iOS background execution (CRITICAL)

**Problem:** iOS suspends app and kills WebSocket within 30 seconds of backgrounding.

**Decision:** Design primarily for **iPad as primary control surface** (screen stays on, device on stand). iPhone experience is "foreground use" — documented limitation, not a bug. This is the same constraint Stream Deck Mobile has and still ships with a large user base.

**Do not attempt:** Silent audio session hack (Apple rejects this).

### 6.2 macOS Accessibility permission

**Problem:** Keystroke simulation requires Accessibility permission (System Settings > Privacy). Cannot be granted programmatically. Must be re-granted after binary changes (every update).

**Mitigation:** Dedicated animated onboarding screen walking users through System Settings. Make it the "welcome ritual." Model this after Raycast's permission onboarding flow.

### 6.3 Android Doze mode

**Problem:** Android kills background network connections on screen-off.

**Mitigation:** Run as foreground service with persistent (silent/minimal) notification. In-app manufacturer-specific battery whitelist guidance.

### 6.4 mDNS reliability

**Problem:** mDNS blocked on ~25–30% of networks (corporate, university, hotel).

**Mitigation:** QR code as first-class fallback (not afterthought). Cloud relay for the remainder. Never assume mDNS works.

### 6.5 Desktop agent auto-update

**Problem:** Binary updates on Windows trigger UAC; macOS re-requests Accessibility permission.

**Mitigation:** Separate lightweight auto-updater process. Sparkle framework (macOS), Squirrel or custom (Windows). Download in background, apply between sessions. Budget 2–3 weeks for this early.

### 6.6 Windows-specific

- Code sign with EV certificate to avoid SmartScreen warnings ($300–500/year)
- Installer adds Windows Firewall rule for WebSocket port automatically
- Most keystroke injection works without elevation; UAC required only for elevated windows

### 6.7 macOS-specific

- Gatekeeper requires notarization ($99/year Apple Developer account) — budget from day one
- Distribute desktop agent from your own website, not Mac App Store (no 30% cut + avoids App Sandbox restrictions)

### 6.8 Linux

Deferred to v2. X11 vs Wayland fragmentation for input injection adds significant complexity for a small user base.

---

## 7. Security Architecture

### 7.1 Threat model and mitigations

| Threat | Risk level | Mitigation |
|---|---|---|
| LAN attacker connects to agent | High | Pairing token required; agent maintains device allowlist; token in OS keychain |
| Man-in-the-middle on local network | Medium | WSS (TLS) with self-signed cert; mobile pins cert fingerprint after pairing; nonce + timestamp replay prevention |
| Malicious macro execution | Medium | Typed command allowlist (not arbitrary eval); shell scripts require explicit opt-in; marketplace templates reviewed; destructive commands show confirmation |
| AI API key theft | High | Keys in OS keychain only; never in mobile app; never in config files; per-user rate limits |
| Cloud relay interception | Low–Medium | E2E encrypt payload before entering Supabase; Supabase sees only encrypted blobs |
| Credential leakage in macros | Medium | OS keychain for sensitive macro values; macro contents never logged |

### 7.2 Security architecture summary

```
Transport:   WSS (TLS) everywhere, even on LAN
Auth:        Pairing token, stored in iOS Keychain / Android Keystore
Keys:        OS keychain only, never in mobile app or cloud
Commands:    Typed schema allowlist, not arbitrary code execution
Cloud:       E2E encrypted payloads through Supabase relay
Marketplace: Template sandboxing + human review before publishing
```

---

## 9. AI Integration Deep Dive

### 9.1 Prompt authoring UX

**Hybrid model:** template library as the entry point, full prompt editing for power users.

- New users pick from a curated template library ("Explain error", "Write tweet", "Summarize", "Fix grammar", "Translate")
- Templates are fully editable — tapping a template opens the prompt editor pre-filled
- Power users can write prompts from scratch with a blank editor
- Template library is a product differentiator: ship with 20–30 high-quality templates at launch, grouped by use case (Developer / Creator / Writing / Productivity)

### 9.2 Prompt input sources (MVP)

**Clipboard + active window title.**

- Clipboard content is the primary input — the AI clipboard processor is the core demo
- Active window title is injected as context automatically (e.g., "User is in VS Code 1.89")
- This enables app-aware prompts without requiring additional permissions
- Selected text (requires Accessibility permission already needed for keystrokes) deferred to v1.1
- Manual static text injection (fixed string in button config) deferred to v2

### 9.3 AI output destinations

Three modes, configured per button:

| Mode | Behavior | Best for |
|---|---|---|
| **Clipboard only** | Result copied, user pastes manually | Safe default, any context |
| **Auto-paste** | Result copied + agent simulates Cmd/Ctrl+V immediately | Short rewrites, grammar fixes, translations |
| **In-app viewer** | Result displayed in scrollable card in mobile app | Explanations, long outputs, code reviews |

### 9.4 Chained AI actions

Sequential chains supported, up to 3 steps. Each step's output feeds the next step's input.

```
Example chain:
Step 1: Summarize clipboard → [summary text]
Step 2: Translate [summary text] to Spanish → [translated text]
Step 3: Auto-paste [translated text]
```

- Chains are configured in the button editor as a step list
- Each step independently selects provider preference or uses auto-routing
- Chain fails gracefully: if step N fails after all fallbacks, the chain stops and notifies with which step failed

### 9.5 AI error handling

Automatic provider fallback with notification only on full failure.

- On any provider error, agent silently tries the next provider in the priority stack
- Priority stack: Gemini Flash → DeepSeek → Qwen → Claude Haiku → Claude Sonnet
- User is notified only if all providers fail
- BYOK users bypass platform quota; their own key is tried first before any fallback

---

## 10. UX Architecture

### 10.1 Layout model

**Flexible grid with pages.**

- Each profile can have multiple pages; user swipes horizontally to navigate
- Each page has an independently configurable grid size (e.g., 3×3, 4×4, 4×6)
- Grid size is set per page in page settings — not per button
- Buttons fill the grid cells; no freeform canvas drag (intentional: finger accuracy on mobile)

### 10.2 Button customization

Four layers of customization at MVP:

| Layer | Options |
|---|---|
| **Icon** | Built-in icon library (SF Symbols / Material Icons); app icons fetched from agent |
| **Label** | Text label below icon; optional (icon-only buttons supported) |
| **Color** | Background color per button; icon tint follows color or is set independently |
| **Badge** | Live status overlay: active app name, on/off toggle state, counter, streaming indicator |

Badges pull live data from the desktop agent (active app, OBS state). Badge display is configured per button.

### 10.3 Profile & page organization

**Manual profiles + optional auto-switch rules.**

- Users create named profiles (e.g., "VS Code", "OBS Live", "Writing", "Morning Routine")
- Each profile can optionally define an auto-switch rule: "activate when [app name] is focused"
- Agent polls active-win and emits app-changed events; mobile switches profile on match
- Manual switch always available — user can override auto-switch at any time
- Profile order in the sidebar is drag-reorderable

### 10.4 Onboarding flow

**Guided setup wizard + starter template deck.**

Steps:
```
1. Welcome screen — product showcase (not a broken empty state)
2. Install desktop agent — download link + instructions, deep link back to app when installed
3. Connect — mDNS auto-discovery attempts first; "Scan QR Code" shown immediately as fallback
4. Grant permissions — macOS Accessibility (animated System Settings walkthrough); Android foreground service
5. Starter deck — pre-built deck of 5–8 buttons loads automatically
6. First action — guided "tap this button to try AI clipboard" moment
```

Starter deck contents (launch defaults):
- "Explain this error" (AI, clipboard → in-app viewer)
- "Fix grammar" (AI, clipboard → auto-paste)
- "Write tweet about this" (AI, clipboard → clipboard)
- "Copy to clipboard" (macro)
- "Open terminal" (app launch)
- OBS "Start/Stop Stream" toggle (conditional on OBS detected)

### 10.5 Visual design language

**Dark + premium with selective glassmorphism.**

- Deep dark background shell (not pure black — dark gray like `#0F0F14`)
- Button cards: frosted glass / glassmorphism treatment — blur, translucent fill, subtle border glow
- Accent colors: electric blue / violet gradient for primary actions; per-button colors pop against dark background
- Typography: clean sans-serif (SF Pro on iOS, Inter on Android)
- Animations: spring physics on button press (scale down + haptic), smooth page swipe transitions, subtle glow pulse on active badges
- Reference aesthetic: Linear + Raycast meets pro audio UI (Native Instruments, Ableton)

---

## 11. Go-to-Market Strategy

### 11.1 Launch channel sequence

**Coordinated multi-channel launch:**

| Phase | Timeline | Action |
|---|---|---|
| Pre-launch | Weeks 1–6 | Build in public on Twitter/X — architecture decisions, demo clips, behind-the-scenes |
| Waitlist | Week 3+ | Landing page live, waitlist open, waitlist count shared publicly |
| Private beta | Week 4–6 | 20–50 hand-picked users; gather dense feedback |
| Launch day | Week 8–10 | Product Hunt launch + coordinated community posts (HN Show HN, r/programming, r/macapps, Discord servers) |
| Post-launch | Week 10+ | Follow-up blog post on HN with results; Twitter/X thread on build-in-public learnings |

### 11.2 Beta strategy

**Targeted private beta → public waitlist.**

- 20–50 hand-picked users: existing network + targeted cold DMs to developers/creators whose opinion matters
- Goal: signal-dense feedback, not scale. Find the 3–5 things that are broken or confusing.
- Waitlist runs concurrently — opens when landing page goes live (week 3)
- Waitlist number is public-facing social proof and an investor signal
- Beta users get lifetime deal pricing as loyalty reward

### 11.3 Pricing launch strategy

**Lifetime deal for first 500 early adopters.**

| Offer | Price | Availability |
|---|---|---|
| Lifetime AI Pro | $49–79 one-time | First 500 customers only |
| Standard Desktop License | $19 one-time | Always available post-lifetime-close |
| AI Pro Subscription | $8/month or $59/year | Always available post-lifetime-close |

- Lifetime deal creates urgency ("only 500 spots"), generates immediate cash ($25k–40k), and turns early adopters into evangelists
- Lifetime cohort closes publicly when 500 is reached — no extensions
- MRR story for investors starts after lifetime cohort closes

### 11.4 Content strategy

**Polished demo clips (Twitter/X) + written build-in-public posts (HN/dev communities/SEO).**

- Demo clips: 15–30 second edited videos showing product moments (AI clipboard, auto-switch, onboarding)
- Written posts: architecture decisions, technical challenges, progress updates — targets HN and dev community trust
- Each written post also drives SEO for "stream deck alternative", "AI macro tool", "programmable control surface"
- Cadence: 1 demo clip per week, 1 written post per 2 weeks during pre-launch

### 11.5 Partnership & distribution

**Raycast extension + Anthropic startup program** (sequenced):

1. **Anthropic startup program** — apply immediately. API credits reduce biggest cost risk. "Backed by Anthropic" is a credibility signal.
2. **Raycast extension** — ship in month 2. 2–3 day build. Puts the product in front of Mac-using developers who already pay for productivity tools. Exact target user overlap.

---

## 12. MVP Roadmap

### 12.1 MVP scope

**AI buttons + manual macro buttons + auto-switching profiles.**

Three demo moments that justify the $19 license:
1. Tap button → AI processes clipboard → result pastes back (AI clipboard processor)
2. Tap button → keystroke/app launch executes instantly (manual macro)
3. Open VS Code → deck reconfigures automatically (auto-switching profiles)

Explicitly out of MVP scope: advanced OBS scene/source controls, webhooks, community marketplace, desktop GUI, plugin SDK, Linux agent, web version.

**OBS scope clarification:** Basic OBS stream state detection (is streaming / not streaming) and start/stop stream toggle ARE in MVP — they are part of the starter deck and require obs-websocket-js. Advanced OBS controls (scene switching, source toggling, filter control) are deferred to v1.1.

### 12.2 Build sequence

**Vertical slice first**, then expand.

```
Weeks 1–2: Vertical slice
  - Shared WebSocket message schema agreed day 1
  - Mobile: minimal button grid UI + tap event emission
  - Agent: WebSocket server + clipboard read/write + one AI call (Gemini Flash)
  - Goal: mobile tap → agent → AI → result back to mobile → clipboard paste. End-to-end working.

Weeks 3–4: Core expansion
  - Mobile: button editor (icon, label, color, template picker)
  - Agent: keystroke execution, app launch, active-win polling
  - Connection: mDNS discovery + QR code pairing flow
  - Auto-switching profiles (basic)

Weeks 5–6: Polish + beta prep
  - Onboarding wizard + starter deck
  - Full AI router (all providers + fallback chain)
  - Sequential chains (up to 3 steps)
  - Live badges
  - Dark + premium visual design pass
  - Private beta distribution to 20–50 users
```

### 12.3 Team split

**Mobile/desktop split from day one**, shared schema as the contract.

| Person | Owns | Weeks 1–6 |
|---|---|---|
| Person A | Mobile app | React Native Expo — button grid, editor, onboarding, profiles, connection UI |
| Person B | Desktop agent | Electron (tray) — WebSocket server, command execution, AI router, mDNS, active-win |
| Both | WebSocket schema | Agree on message format day 1; integration test at end of week 2 |

### 12.4 Timeline

| Milestone | Target |
|---|---|
| Vertical slice working end-to-end | Week 2 |
| Core MVP feature-complete (rough) | Week 4 |
| Polished enough for private beta | Week 5–6 |
| Private beta (20–50 users) | Week 5–6 |
| Waitlist landing page live | Week 3 |
| Public launch (Product Hunt + communities) | Week 8–10 |

---

## 13. Tech Stack Decisions

### 13.1 Mobile app

| Component | Choice | Reason |
|---|---|---|
| Framework | React Native Expo (bare workflow) | Founder expertise; bare workflow required for mDNS, background services, native modules |
| Platform | iOS + Android simultaneously | Same codebase; no reason to defer Android |
| mDNS discovery | react-native-zeroconf | Best maintained RN mDNS library |
| Local storage | Expo SQLite or MMKV | SQLite for relational profile data; MMKV for fast key-value state |
| Secure storage | iOS Keychain / Android Keystore | Pairing token storage; native OS security |

### 13.2 Desktop agent

| Component | Choice | Reason |
|---|---|---|
| Packaging | **Electron (hidden main window, tray only)** | Reliable tray on Windows + macOS; Squirrel auto-updater built in; native module compatibility (iohook, keytar, active-win) |
| Framework | NestJS | Founder expertise; structured WebSocket server |
| Active app detection | active-win | Cross-platform, well-maintained |
| Clipboard | clipboardy | Cross-platform read/write |
| Global hotkeys | iohook | Headless global hotkey listener |
| OBS integration | obs-websocket-js | OBS WebSocket v5 protocol |
| Tray icon | electron-tray (built-in) | Native to Electron |
| OS keychain | keytar | Cross-platform keychain (Windows Credential Manager / macOS Keychain) |
| Auto-update | Sparkle (macOS), Squirrel (Windows) | Battle-tested; built into Electron ecosystem |

### 13.3 Backend / cloud

| Component | Choice |
|---|---|
| Auth | Supabase Auth |
| Database | Supabase PostgreSQL (with Row Level Security) |
| Cloud relay | Supabase Realtime |
| Profile backup / sync | Supabase Storage |
| Payments | Stripe or Lemon Squeezy (desktop license + AI Pro + lifetime deal) |
| Marketing site / purchase flow | Vercel (Next.js) |

### 13.4 AI router (inside desktop agent)

| Component | Choice |
|---|---|
| Anthropic | @anthropic-ai/sdk |
| Google Gemini | @google/generative-ai |
| DeepSeek + Qwen | openai SDK (OpenAI-compatible endpoints) |
| Key storage | keytar (OS keychain) |
| Routing logic | Custom TypeScript classifier → provider selector → fallback chain |

### 13.5 Code signing & distribution

| Platform | Requirement | Cost |
|---|---|---|
| Windows | EV code signing certificate | $300–500/year |
| macOS | Apple Developer account + notarization | $99/year |
| Distribution | Own website only (not Mac App Store / Windows Store) | Avoids 30% cut + App Sandbox restrictions |
| Mobile | App Store + Play Store (free download) | $99/year Apple + $25 one-time Google |

---

*This document is the complete design spec for the AI-Native Control Surface Platform. Discovery session complete 2026-05-13. Next step: implementation plan.*
