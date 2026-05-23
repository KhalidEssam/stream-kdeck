import { ContextRegistryService } from './context-registry.service';
import { ContextProvider, ContextRequest, ContextPayload } from './context-provider.interface';

function makeProvider(id: string, content: string, available = true): ContextProvider {
  return {
    id,
    probe: jest.fn().mockResolvedValue({ available, unavailableReason: available ? undefined : 'not available' }),
    preview: jest.fn().mockResolvedValue({ label: id, byteSize: content.length, truncated: false }),
    read: jest.fn().mockResolvedValue({
      providerId: id,
      content,
      byteSize: Buffer.byteLength(content, 'utf8'),
      provenance: 'test',
    } satisfies ContextPayload),
  };
}

const STUB_REQUEST: Omit<ContextRequest, 'providerId'> = { toolId: 't1', packId: 'p1' };

describe('ContextRegistryService', () => {
  let registry: ContextRegistryService;

  beforeEach(() => {
    registry = new ContextRegistryService();
  });

  it('returns empty payload for unregistered provider', async () => {
    const payload = await registry.read('unknown', STUB_REQUEST);
    expect(payload.content).toBe('');
    expect(payload.providerId).toBe('unknown');
  });

  it('reads content from a registered provider', async () => {
    registry.register(makeProvider('clipboard', 'hello world'));
    const payload = await registry.read('clipboard', STUB_REQUEST);
    expect(payload.content).toBe('hello world');
    expect(payload.providerId).toBe('clipboard');
  });

  it('returns empty payload when provider is unavailable', async () => {
    registry.register(makeProvider('project_files', 'some content', false));
    const payload = await registry.read('project_files', STUB_REQUEST);
    expect(payload.content).toBe('');
    expect(payload.provenance).toMatch(/not available/);
  });

  it('get() returns the registered provider', () => {
    const provider = makeProvider('active_window', 'Code.exe');
    registry.register(provider);
    expect(registry.get('active_window')).toBe(provider);
  });

  it('get() returns undefined for unregistered id', () => {
    expect(registry.get('missing')).toBeUndefined();
  });
});
