export interface OAuthProviderConfig {
  slug: 'twitch' | 'spotify' | 'youtube' | 'tiktok' | 'kick' | 'linear' | 'notion' | 'slack' | 'github';
  authUrl: string;
  tokenUrl: string;
  revokeUrl?: string;
  usesPkce: boolean;
  clientIdEnv: string;
  clientSecretEnv?: string;
  defaultScopes: string[];
  scopeSeparator: 'space' | 'comma';
  profileRequest?: {
    url: string;
    method: 'GET' | 'POST';
  };
}

export const OAUTH_PROVIDERS: Record<string, OAuthProviderConfig> = {
  twitch: {
    slug: 'twitch',
    authUrl: 'https://id.twitch.tv/oauth2/authorize',
    tokenUrl: 'https://id.twitch.tv/oauth2/token',
    revokeUrl: 'https://id.twitch.tv/oauth2/revoke',
    usesPkce: false,
    clientIdEnv: 'TWITCH_CLIENT_ID',
    clientSecretEnv: 'TWITCH_CLIENT_SECRET',
    defaultScopes: ['clips:edit', 'channel:manage:broadcast', 'user:write:chat'],
    scopeSeparator: 'space',
    profileRequest: { url: 'https://api.twitch.tv/helix/users', method: 'GET' },
  },
  spotify: {
    slug: 'spotify',
    authUrl: 'https://accounts.spotify.com/authorize',
    tokenUrl: 'https://accounts.spotify.com/api/token',
    usesPkce: true,
    clientIdEnv: 'SPOTIFY_CLIENT_ID',
    clientSecretEnv: 'SPOTIFY_CLIENT_SECRET',
    defaultScopes: [
      'user-read-playback-state',
      'user-modify-playback-state',
      'user-read-currently-playing',
      'user-library-modify',
    ],
    scopeSeparator: 'space',
    profileRequest: { url: 'https://api.spotify.com/v1/me', method: 'GET' },
  },
  youtube: {
    slug: 'youtube',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    revokeUrl: 'https://oauth2.googleapis.com/revoke',
    usesPkce: true,
    clientIdEnv: 'YOUTUBE_CLIENT_ID',
    clientSecretEnv: 'YOUTUBE_CLIENT_SECRET',
    defaultScopes: ['https://www.googleapis.com/auth/youtube'],
    scopeSeparator: 'space',
    profileRequest: {
      url: 'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
      method: 'GET',
    },
  },
  tiktok: {
    slug: 'tiktok',
    authUrl: 'https://www.tiktok.com/v2/auth/authorize/',
    tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/',
    revokeUrl: 'https://open.tiktokapis.com/v2/oauth/revoke/',
    usesPkce: true,
    clientIdEnv: 'TIKTOK_CLIENT_ID',
    clientSecretEnv: 'TIKTOK_CLIENT_SECRET',
    defaultScopes: ['user.info.basic'],
    scopeSeparator: 'comma',
  },
  kick: {
    slug: 'kick',
    authUrl: 'https://id.kick.com/oauth/authorize',
    tokenUrl: 'https://id.kick.com/oauth/token',
    usesPkce: true,
    clientIdEnv: 'KICK_CLIENT_ID',
    defaultScopes: ['user:read', 'channel:read'],
    scopeSeparator: 'space',
  },
  linear: {
    slug: 'linear',
    authUrl: 'https://linear.app/oauth/authorize',
    tokenUrl: 'https://api.linear.app/oauth/token',
    revokeUrl: 'https://api.linear.app/oauth/revoke',
    usesPkce: false,
    clientIdEnv: 'LINEAR_CLIENT_ID',
    clientSecretEnv: 'LINEAR_CLIENT_SECRET',
    defaultScopes: ['read', 'write'],
    scopeSeparator: 'comma',
    profileRequest: { url: 'https://api.linear.app/graphql', method: 'POST' },
  },
  notion: {
    slug: 'notion',
    authUrl: 'https://api.notion.com/v1/oauth/authorize',
    tokenUrl: 'https://api.notion.com/v1/oauth/token',
    usesPkce: false,
    clientIdEnv: 'NOTION_CLIENT_ID',
    clientSecretEnv: 'NOTION_CLIENT_SECRET',
    defaultScopes: [],
    scopeSeparator: 'space',
  },
  slack: {
    slug: 'slack',
    authUrl: 'https://slack.com/oauth/v2/authorize',
    tokenUrl: 'https://slack.com/api/oauth.v2.access',
    revokeUrl: 'https://slack.com/api/auth.revoke',
    usesPkce: false,
    clientIdEnv: 'SLACK_CLIENT_ID',
    clientSecretEnv: 'SLACK_CLIENT_SECRET',
    defaultScopes: ['chat:write', 'channels:read'],
    scopeSeparator: 'comma',
    profileRequest: { url: 'https://slack.com/api/auth.test', method: 'POST' },
  },
  github: {
    slug: 'github',
    authUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    usesPkce: false,
    clientIdEnv: 'GITHUB_CLIENT_ID',
    clientSecretEnv: 'GITHUB_CLIENT_SECRET',
    defaultScopes: ['repo', 'read:user'],
    scopeSeparator: 'space',
    profileRequest: { url: 'https://api.github.com/user', method: 'GET' },
  },
};

export function getProvider(slug: string): OAuthProviderConfig {
  const config = OAUTH_PROVIDERS[slug];
  if (!config) throw new Error(`Unknown OAuth provider: ${slug}`);
  return config;
}

export function getProviderClientId(config: OAuthProviderConfig): string {
  const value = process.env[config.clientIdEnv]?.trim();
  if (!value) throw new Error(`Missing env var ${config.clientIdEnv} for provider ${config.slug}`);
  return value;
}

export function getProviderClientSecret(config: OAuthProviderConfig): string {
  if (!config.clientSecretEnv) throw new Error(`Provider ${config.slug} has no client secret`);
  const value = process.env[config.clientSecretEnv]?.trim();
  if (!value) throw new Error(`Missing env var ${config.clientSecretEnv} for provider ${config.slug}`);
  return value;
}

export function serializeScopes(config: OAuthProviderConfig, scopes = config.defaultScopes): string {
  return scopes.join(config.scopeSeparator === 'comma' ? ',' : ' ');
}
