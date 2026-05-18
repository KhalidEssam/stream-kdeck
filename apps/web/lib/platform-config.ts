import { ConfigError, getOptionalEnv } from './env';
import { getSupabaseAdmin } from './supabase-admin';

export type PlatformConfigKey =
  | 'license_amount_cents'
  | 'ai_pro_monthly_amount_cents'
  | 'ai_pro_yearly_amount_cents'
  | 'desktop_monthly_ai_credits'
  | 'ai_pro_monthly_credits'
  | 'free_tier_credits';

export interface PlatformConfigRow {
  key: PlatformConfigKey;
  value: string;
  label: string;
  description: string;
  updatedAt: string | null;
}

const CONFIG_META: Record<PlatformConfigKey, { label: string; description: string; defaultValue: string; envName?: string }> = {
  license_amount_cents: {
    label: 'Desktop license price',
    description: 'One-time desktop license price in minor currency units.',
    defaultValue: '1900',
    envName: 'PAYMOB_LICENSE_AMOUNT_CENTS',
  },
  ai_pro_monthly_amount_cents: {
    label: 'AI Pro monthly price',
    description: 'Monthly AI Pro price in minor currency units.',
    defaultValue: '800',
    envName: 'PAYMOB_AI_PRO_MONTHLY_AMOUNT_CENTS',
  },
  ai_pro_yearly_amount_cents: {
    label: 'AI Pro yearly price',
    description: 'Yearly AI Pro price in minor currency units.',
    defaultValue: '5900',
    envName: 'PAYMOB_AI_PRO_YEARLY_AMOUNT_CENTS',
  },
  desktop_monthly_ai_credits: {
    label: 'Desktop monthly AI credits',
    description: 'Included monthly credits for a desktop license.',
    defaultValue: '50',
  },
  ai_pro_monthly_credits: {
    label: 'AI Pro monthly credits',
    description: 'Monthly AI credits for active AI Pro subscribers.',
    defaultValue: '500',
  },
  free_tier_credits: {
    label: 'Free tier credits',
    description: 'Reserved for future free-account onboarding.',
    defaultValue: '0',
  },
};

const CONFIG_KEYS = Object.keys(CONFIG_META) as PlatformConfigKey[];

export async function getPlatformConfig(): Promise<Record<PlatformConfigKey, string>> {
  const config = getFallbackConfig();

  try {
    const { data, error } = await getSupabaseAdmin()
      .from('platform_config')
      .select('key, value');
    if (error) throw error;

    for (const row of data ?? []) {
      if (isPlatformConfigKey(row.key) && typeof row.value === 'string') {
        config[row.key] = row.value;
      }
    }
  } catch (err) {
    if (!(err instanceof ConfigError)) {
      console.warn('[web] Falling back to local platform config', err);
    }
  }

  return config;
}

export async function getPlatformConfigRows(): Promise<PlatformConfigRow[]> {
  const values = await getPlatformConfig();
  const updatedAtByKey = new Map<PlatformConfigKey, string | null>();

  try {
    const { data, error } = await getSupabaseAdmin()
      .from('platform_config')
      .select('key, updated_at');
    if (error) throw error;
    for (const row of data ?? []) {
      if (isPlatformConfigKey(row.key)) {
        updatedAtByKey.set(row.key, typeof row.updated_at === 'string' ? row.updated_at : null);
      }
    }
  } catch (err) {
    if (!(err instanceof ConfigError)) {
      console.warn('[web] Could not load platform config timestamps', err);
    }
  }

  return CONFIG_KEYS.map((key) => ({
    key,
    value: values[key],
    label: CONFIG_META[key].label,
    description: CONFIG_META[key].description,
    updatedAt: updatedAtByKey.get(key) ?? null,
  }));
}

export async function getPlatformConfigInt(
  key: PlatformConfigKey,
  options: { allowZero?: boolean } = {},
): Promise<number> {
  const config = await getPlatformConfig();
  return parseConfigInt(key, config[key], options);
}

export function parseConfigInt(
  key: PlatformConfigKey,
  value: string,
  options: { allowZero?: boolean } = {},
): number {
  const parsed = Number.parseInt(value, 10);
  const min = options.allowZero ? 0 : 1;
  if (!Number.isFinite(parsed) || parsed < min) {
    throw new Error(`${key} must be an integer greater than or equal to ${min}.`);
  }
  return parsed;
}

export function isPlatformConfigKey(value: unknown): value is PlatformConfigKey {
  return typeof value === 'string' && value in CONFIG_META;
}

function getFallbackConfig(): Record<PlatformConfigKey, string> {
  return Object.fromEntries(
    CONFIG_KEYS.map((key) => {
      const meta = CONFIG_META[key];
      return [key, (meta.envName && getOptionalEnv(meta.envName)) ?? meta.defaultValue];
    }),
  ) as Record<PlatformConfigKey, string>;
}
