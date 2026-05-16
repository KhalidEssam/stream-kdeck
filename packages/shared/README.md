# @control-surface/shared

Shared WebSocket message schema types used by both the desktop agent and mobile app.

## Usage

Consumers must configure a TypeScript `paths` alias to resolve this package directly from source (no build step required in development):

```json
"paths": { "@control-surface/shared": ["../../packages/shared/src/index.ts"] }
```

Run `npm run build` to compile to `dist/` for production consumers.
