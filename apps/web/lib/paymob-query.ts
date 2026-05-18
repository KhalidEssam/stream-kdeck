export function paymobPayloadFromSearchParams(searchParams: URLSearchParams): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  for (const [key, value] of searchParams.entries()) {
    if (key === 'hmac') continue;
    if (key === 'order') {
      payload.order = { id: value };
      continue;
    }
    if (key.includes('.')) {
      assignNested(payload, key, value);
      payload[key] = value;
      continue;
    }
    payload[key] = value;
  }

  return payload;
}

function assignNested(target: Record<string, unknown>, path: string, value: string): void {
  const parts = path.split('.');
  let current = target;

  for (const part of parts.slice(0, -1)) {
    const existing = current[part];
    if (!isRecord(existing)) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }

  current[parts[parts.length - 1]] = value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
