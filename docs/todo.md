# KDeck — Shipping Checklist

## Features remaining before public launch

### P0 — Required for any user to use the product

| # | Feature | Status |
|---|---------|--------|
| 1 | **mDNS auto-discovery** — agent advertises on LAN, mobile finds it without manual IP | ✅ Done |
| 2 | **AI proxy Edge Function** — `GEMINI_API_KEY` moved server-side, agent calls Edge Function with JWT | ✅ Done — deploy: `supabase functions deploy ai-proxy && supabase secrets set GEMINI_API_KEY=...` |
| 3 | **electron-builder installer** — produce `.exe` / `.dmg` distributable that users double-click to install | ✅ Done — `npm run dist:win` produces `KDeck Agent Setup 0.1.0.exe` (83 MB) |

### P1 — Required before charging real money

| # | Feature | Notes |
|---|---------|-------|
| 4 | **Code signing** — Windows (EV cert via DigiCert/Sectigo) + macOS (Apple Developer Program) — unsigned apps are blocked by Gatekeeper / SmartScreen | External process, not a code task |
| 5 | **Auto-update** — `electron-updater` so installed agents receive updates without manual re-download | Depends on P0-3 |

### P2 — Polish

| # | Feature | Notes |
|---|---------|-------|
| 6 | Remove temporary JWT debug `console.log` lines in `license.service.ts` | Quick cleanup |
| 7 | DMARC record on `target-for-engineering.com` mail domain | DNS task |

---

## Architecture decisions locked in

- Agent env vars bundled in installer: only `SUPABASE_URL` + `SUPABASE_ANON_KEY` (both public)
- `GEMINI_API_KEY` lives as a Supabase secret, called through Edge Function (P0-2)
- mDNS service type: `_controlsurface._tcp` (short name `controlsurface`)
- License key format: `CS-XXXX-XXXX-XXXX-XXXX-XXXX`
