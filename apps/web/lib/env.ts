export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export function getEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new ConfigError(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getOptionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value : undefined;
}

export function getSiteUrl(): string {
  return getEnv('NEXT_PUBLIC_SITE_URL', 'http://localhost:3000').replace(/\/+$/, '');
}
