const BASE = 'https://api.spotify.com/v1';

interface SpotifyAdapterInput {
  actionId: string;
  params: Record<string, unknown>;
  accessToken: string;
}

interface SpotifyResult {
  success: boolean;
  output?: string;
  error?: string;
  safeResult?: Record<string, unknown>;
}

export const spotifyAdapter = {
  async execute(input: SpotifyAdapterInput): Promise<SpotifyResult> {
    switch (input.actionId) {
      case 'spotify.playback.toggle':
        return togglePlayback(input.accessToken);
      case 'spotify.playback.next':
        return skipNext(input.accessToken);
      case 'spotify.playback.previous':
        return skipPrevious(input.accessToken);
      case 'spotify.volume.set':
        return setVolume(input.accessToken, input.params);
      case 'spotify.shuffle.toggle':
        return toggleShuffle(input.accessToken);
      case 'spotify.track.save':
        return saveCurrentTrack(input.accessToken);
      default:
        return { success: false, error: `Unsupported Spotify action: ${input.actionId}` };
    }
  },
};

async function togglePlayback(token: string): Promise<SpotifyResult> {
  const state = await getPlayerState(token);
  if (!state) return noDevice();

  if (state.is_playing) {
    await spotifyFetch(token, '/me/player/pause', { method: 'PUT' });
    return { success: true, output: 'Paused.', safeResult: { action: 'pause' } };
  }

  await spotifyFetch(token, '/me/player/play', { method: 'PUT' });
  return { success: true, output: 'Playing.', safeResult: { action: 'play' } };
}

async function skipNext(token: string): Promise<SpotifyResult> {
  await spotifyFetch(token, '/me/player/next', { method: 'POST' });
  return { success: true, output: 'Skipped to next track.' };
}

async function skipPrevious(token: string): Promise<SpotifyResult> {
  await spotifyFetch(token, '/me/player/previous', { method: 'POST' });
  return { success: true, output: 'Went back to previous track.' };
}

async function setVolume(token: string, params: Record<string, unknown>): Promise<SpotifyResult> {
  const raw = params.volumePercent;
  const parsed = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(parsed)) return { success: false, error: 'volumePercent must be a number between 0 and 100.' };
  const clamped = Math.round(Math.max(0, Math.min(100, parsed)));

  await spotifyFetch(token, `/me/player/volume?volume_percent=${clamped}`, { method: 'PUT' });
  return { success: true, output: `Volume set to ${clamped}%.`, safeResult: { volumePercent: clamped } };
}

async function toggleShuffle(token: string): Promise<SpotifyResult> {
  const state = await getPlayerState(token);
  if (!state) return noDevice();

  const next = !state.shuffle_state;
  await spotifyFetch(token, `/me/player/shuffle?state=${next}`, { method: 'PUT' });
  return { success: true, output: next ? 'Shuffle on.' : 'Shuffle off.', safeResult: { shuffle: next } };
}

async function saveCurrentTrack(token: string): Promise<SpotifyResult> {
  const response = await fetch(`${BASE}/me/player/currently-playing`, {
    headers: spotifyHeaders(token),
  });

  if (response.status === 204) return { success: false, error: 'Nothing is currently playing.' };
  if (!response.ok) throw new Error(await spotifyError(response));

  const data = (await response.json()) as Record<string, unknown>;
  const item = isRecord(data.item) ? data.item : null;
  const trackId = typeof item?.id === 'string' ? item.id : null;
  const trackName = typeof item?.name === 'string' ? item.name : null;

  if (!trackId) return { success: false, error: 'Nothing is currently playing.' };

  await spotifyFetch(token, '/me/tracks', {
    method: 'PUT',
    body: JSON.stringify({ ids: [trackId] }),
  });

  return {
    success: true,
    output: trackName ? `Saved "${trackName}" to Liked Songs.` : 'Saved to Liked Songs.',
    safeResult: { trackId, trackName },
  };
}

// --- Helpers ---

interface PlayerState {
  is_playing: boolean;
  shuffle_state: boolean;
}

async function getPlayerState(token: string): Promise<PlayerState | null> {
  const response = await fetch(`${BASE}/me/player`, {
    headers: spotifyHeaders(token),
  });

  if (response.status === 204) return null; // no active device
  if (!response.ok) throw new Error(await spotifyError(response));

  const data = (await response.json()) as Record<string, unknown>;
  return {
    is_playing: data.is_playing === true,
    shuffle_state: data.shuffle_state === true,
  };
}

async function spotifyFetch(token: string, path: string, init: RequestInit): Promise<void> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...spotifyHeaders(token),
      'Content-Type': 'application/json',
    },
  });

  if (response.status === 204 || response.status === 200 || response.status === 201) return;
  throw new Error(await spotifyError(response));
}

function spotifyHeaders(token: string): Record<string, string> {
  return {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

async function spotifyError(response: Response): Promise<string> {
  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  const reason = isRecord(json.error) ? (json.error as Record<string, unknown>).reason : undefined;
  const message = isRecord(json.error) ? (json.error as Record<string, unknown>).message : undefined;

  if (reason === 'PREMIUM_REQUIRED') return 'Spotify Premium is required for playback control.';
  if (reason === 'NO_ACTIVE_DEVICE') return 'No active Spotify device. Open Spotify on a device first.';
  if (typeof message === 'string' && message) return message;
  return `Spotify API request failed (${response.status})`;
}

function noDevice(): SpotifyResult {
  return { success: false, error: 'No active Spotify device. Open Spotify on a device first.' };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
