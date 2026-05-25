import { MediaContextProvider } from './media-context.provider';

const STUB_REQUEST = { providerId: 'media', toolId: 't1', packId: 'p1' };

describe('MediaContextProvider', () => {
  it('formats active media sessions without icon payloads', async () => {
    const provider = new MediaContextProvider({
      getSessions: jest.fn().mockResolvedValue([{ pid: 1, name: 'Game.exe', volume: 0.42, muted: false }]),
      buildMediaState: jest.fn().mockReturnValue([{
        processName: 'Game.exe',
        label: 'Game',
        iconBase64: 'large-image',
        volume: 0.42,
        muted: false,
        pinned: false,
        active: true,
      }]),
    } as never);

    const payload = await provider.read(STUB_REQUEST);

    expect(payload.providerId).toBe('media');
    expect(payload.content).toContain('app: Game');
    expect(payload.content).toContain('volume: 42%');
    expect(payload.content).not.toContain('large-image');
  });

  it('reports unavailable when no sessions exist', async () => {
    const provider = new MediaContextProvider({
      getSessions: jest.fn().mockResolvedValue([]),
      buildMediaState: jest.fn().mockReturnValue([]),
    } as never);

    const probe = await provider.probe(STUB_REQUEST);

    expect(probe.available).toBe(false);
    expect(probe.unavailableReason).toContain('no active media sessions');
  });
});
