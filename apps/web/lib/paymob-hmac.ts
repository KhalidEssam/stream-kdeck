import crypto from 'crypto';
import { getEnv } from './env';

const TRANSACTION_HMAC_FIELDS = [
  'amount_cents',
  'created_at',
  'currency',
  'error_occured',
  'has_parent_transaction',
  'id',
  'integration_id',
  'is_3d_secure',
  'is_auth',
  'is_capture',
  'is_refunded',
  'is_standalone_payment',
  'is_voided',
  'order.id',
  'owner',
  'pending',
  'source_data.pan',
  'source_data.sub_type',
  'source_data.type',
  'success',
] as const;

export function verifyPaymobHmac(payload: unknown, receivedHmac: string | null): boolean {
  if (!receivedHmac) return false;
  const calculated = calculatePaymobTransactionHmac(payload);
  const actual = Buffer.from(receivedHmac.toLowerCase(), 'hex');
  const expected = Buffer.from(calculated, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export function calculatePaymobTransactionHmac(payload: unknown): string {
  const obj = getCallbackObject(payload);
  const concatenated = TRANSACTION_HMAC_FIELDS
    .map((field) => stringifyValue(getPath(obj, field)))
    .join('');

  return crypto
    .createHmac('sha512', getEnv('PAYMOB_HMAC_SECRET'))
    .update(concatenated)
    .digest('hex');
}

function getCallbackObject(payload: unknown): unknown {
  if (isRecord(payload) && isRecord(payload.obj)) return payload.obj;
  return payload;
}

function getPath(value: unknown, path: string): unknown {
  if (isRecord(value) && path in value) {
    return value[path];
  }

  return path.split('.').reduce<unknown>((current, key) => {
    if (!isRecord(current)) return undefined;
    return current[key];
  }, value);
}

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
