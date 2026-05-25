import { getProvider, getProviderClientId } from '../../oauth/providers';

interface TwitchAdapterInput {
  actionId: string;
  params: Record<string, unknown>;
  accessToken: string;
  providerAccountId?: string;
}

interface TwitchAdapterResult {
  success: boolean;
  output?: string;
  error?: string;
  safeResult?: Record<string, unknown>;
}

export const twitchAdapter = {
  async execute(input: TwitchAdapterInput): Promise<TwitchAdapterResult> {
    switch (input.actionId) {
      case 'twitch.clip.create':
        return createClip(input);
      case 'twitch.marker.create':
        return createMarker(input);
      case 'twitch.channel.update':
        return updateChannel(input);
      case 'twitch.chat.send':
        return sendChatMessage(input);
      default:
        return { success: false, error: `Unsupported Twitch action: ${input.actionId}` };
    }
  },
};

async function createClip(input: TwitchAdapterInput): Promise<TwitchAdapterResult> {
  const broadcasterId = stringParam(input.params.broadcasterId) ?? input.providerAccountId;
  if (!broadcasterId) return { success: false, error: 'Twitch broadcaster ID is required' };

  const url = new URL('https://api.twitch.tv/helix/clips');
  url.searchParams.set('broadcaster_id', broadcasterId);
  if (typeof input.params.hasDelay === 'boolean') {
    url.searchParams.set('has_delay', String(input.params.hasDelay));
  }

  const json = await twitchFetch(input.accessToken, url.toString(), { method: 'POST' });
  const first = Array.isArray(json.data) ? json.data[0] : undefined;
  if (!isRecord(first)) return { success: false, error: 'Twitch did not return a clip URL' };

  const editUrl = stringParam(first.edit_url);
  return {
    success: true,
    output: editUrl ? `Clip created: ${editUrl}` : 'Clip created.',
    safeResult: {
      id: stringParam(first.id),
      editUrl,
    },
  };
}

async function createMarker(input: TwitchAdapterInput): Promise<TwitchAdapterResult> {
  const broadcasterId = stringParam(input.params.broadcasterId) ?? input.providerAccountId;
  if (!broadcasterId) return { success: false, error: 'Twitch broadcaster ID is required' };

  const json = await twitchFetch(input.accessToken, 'https://api.twitch.tv/helix/streams/markers', {
    method: 'POST',
    body: JSON.stringify({
      user_id: broadcasterId,
      description: stringParam(input.params.description),
    }),
  });
  const first = Array.isArray(json.data) ? json.data[0] : undefined;

  return {
    success: true,
    output: 'Stream marker created.',
    safeResult: isRecord(first) ? { id: stringParam(first.id), createdAt: stringParam(first.created_at) } : {},
  };
}

async function updateChannel(input: TwitchAdapterInput): Promise<TwitchAdapterResult> {
  const broadcasterId = stringParam(input.params.broadcasterId) ?? input.providerAccountId;
  if (!broadcasterId) return { success: false, error: 'Twitch broadcaster ID is required' };

  const body: Record<string, string> = {};
  const title = stringParam(input.params.title);
  const gameId = stringParam(input.params.gameId);
  if (title) body.title = title;
  if (gameId) body.game_id = gameId;
  if (Object.keys(body).length === 0) {
    return { success: false, error: 'Set a Twitch title or game ID to update.' };
  }

  const url = new URL('https://api.twitch.tv/helix/channels');
  url.searchParams.set('broadcaster_id', broadcasterId);
  await twitchFetch(input.accessToken, url.toString(), {
    method: 'PATCH',
    body: JSON.stringify(body),
  });

  return { success: true, output: 'Twitch channel updated.', safeResult: body };
}

async function sendChatMessage(input: TwitchAdapterInput): Promise<TwitchAdapterResult> {
  const broadcasterId = stringParam(input.params.broadcasterId) ?? input.providerAccountId;
  const senderId = input.providerAccountId;
  const message = stringParam(input.params.message);
  if (!broadcasterId) return { success: false, error: 'Twitch broadcaster ID is required' };
  if (!senderId) return { success: false, error: 'Twitch sender ID is required' };
  if (!message) return { success: false, error: 'Message is required' };

  const json = await twitchFetch(input.accessToken, 'https://api.twitch.tv/helix/chat/messages', {
    method: 'POST',
    body: JSON.stringify({
      broadcaster_id: broadcasterId,
      sender_id: senderId,
      message,
    }),
  });
  const first = Array.isArray(json.data) ? json.data[0] : undefined;

  return {
    success: true,
    output: 'Twitch chat message sent.',
    safeResult: isRecord(first) ? { messageId: stringParam(first.message_id), isSent: first.is_sent } : {},
  };
}

async function twitchFetch(
  accessToken: string,
  url: string,
  init: RequestInit,
): Promise<Record<string, unknown>> {
  const provider = getProvider('twitch');
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'Client-ID': getProviderClientId(provider),
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;

  if (!response.ok) {
    throw new Error(twitchErrorMessage(json, response.status));
  }

  return json;
}

function twitchErrorMessage(json: Record<string, unknown>, status: number): string {
  const message = stringParam(json.message);
  const error = stringParam(json.error);
  return message ?? error ?? `Twitch API request failed (${status})`;
}

function stringParam(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
