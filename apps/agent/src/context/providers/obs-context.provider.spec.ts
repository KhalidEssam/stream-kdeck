import { ObsContextProvider } from './obs-context.provider';

const STUB_REQUEST = { providerId: 'obs', toolId: 't1', packId: 'p1' };

describe('ObsContextProvider', () => {
  it('formats OBS state values and labels', async () => {
    const provider = new ObsContextProvider({
      getState: jest.fn().mockResolvedValue([
        { key: 'streaming', value: true, label: 'Live', updatedAt: 'now' },
        { key: 'scene', value: 'Gameplay', label: 'Gameplay', updatedAt: 'now' },
      ]),
    } as never);

    const payload = await provider.read(STUB_REQUEST);

    expect(payload.providerId).toBe('obs');
    expect(payload.content).toContain('streaming: true (Live)');
    expect(payload.content).toContain('scene: Gameplay (Gameplay)');
  });

  it('reports unavailable when OBS has no state', async () => {
    const provider = new ObsContextProvider({
      getState: jest.fn().mockResolvedValue([]),
    } as never);

    const probe = await provider.probe(STUB_REQUEST);

    expect(probe.available).toBe(false);
    expect(probe.unavailableReason).toContain('OBS is not connected');
  });
});
