import { ContextAssemblerService, ContextAssemblyError } from './context-assembler.service';
import { ContextRegistryService } from './context-registry.service';
import { ConsentStoreService } from './consent-store.service';
import { ConsentRequestService } from './consent-request.service';
import { ToolContextRequirement } from '@control-surface/shared';

function makeReq(overrides: Partial<ToolContextRequirement> = {}): ToolContextRequirement {
  return { provider: 'clipboard', required: true, reason: 'needs it', ...overrides };
}

function makePayload(providerId: string, content: string) {
  return { providerId, content, byteSize: Buffer.byteLength(content, 'utf8'), provenance: 'test' };
}

describe('ContextAssemblerService', () => {
  let service: ContextAssemblerService;
  let registry: jest.Mocked<Pick<ContextRegistryService, 'read'>>;
  let consentStore: jest.Mocked<Pick<ConsentStoreService, 'isGranted' | 'grant'>>;
  let consentRequest: jest.Mocked<Pick<ConsentRequestService, 'request'>>;
  const client = {} as any;

  beforeEach(() => {
    registry = { read: jest.fn() };
    consentStore = { isGranted: jest.fn().mockReturnValue(true), grant: jest.fn() };
    consentRequest = { request: jest.fn() };
    service = new ContextAssemblerService(
      registry as any,
      consentStore as any,
      consentRequest as any,
    );
  });

  it('returns empty string for empty requirements', async () => {
    expect(await service.assemble([], client, 'p', 't')).toBe('');
  });

  it('assembles a labeled section for an available provider', async () => {
    registry.read.mockResolvedValue(makePayload('project_files', 'README: hello world'));
    const result = await service.assemble(
      [makeReq({ provider: 'project_files' })],
      client, 'p', 't',
    );
    expect(result).toBe('### Project Files\nREADME: hello world');
  });

  it('assembles multiple sections separated by a blank line', async () => {
    registry.read
      .mockResolvedValueOnce(makePayload('project_files', 'readme content'))
      .mockResolvedValueOnce(makePayload('git', 'branch: master'));
    const result = await service.assemble(
      [makeReq({ provider: 'project_files' }), makeReq({ provider: 'git' })],
      client, 'p', 't',
    );
    expect(result).toBe('### Project Files\nreadme content\n\n### Git\nbranch: master');
  });

  it('skips optional provider when content is empty', async () => {
    registry.read.mockResolvedValue(makePayload('git', ''));
    const result = await service.assemble(
      [makeReq({ provider: 'git', required: false })],
      client, 'p', 't',
    );
    expect(result).toBe('');
  });

  it('throws ContextAssemblyError for required provider with empty content', async () => {
    registry.read.mockResolvedValue({ providerId: 'git', content: '', byteSize: 0, provenance: 'not a git repo' });
    await expect(
      service.assemble([makeReq({ provider: 'git', required: true })], client, 'p', 't'),
    ).rejects.toThrow(ContextAssemblyError);
  });

  it('error message includes provider label and provenance', async () => {
    registry.read.mockResolvedValue({ providerId: 'git', content: '', byteSize: 0, provenance: 'not a git repo' });
    await expect(
      service.assemble([makeReq({ provider: 'git', required: true })], client, 'p', 't'),
    ).rejects.toThrow('Git required but unavailable: not a git repo');
  });

  it('skips optional provider when consent denied', async () => {
    consentStore.isGranted.mockReturnValue(false);
    consentRequest.request.mockResolvedValue({ granted: false });
    const result = await service.assemble(
      [makeReq({ provider: 'clipboard', required: false })],
      client, 'p', 't',
    );
    expect(result).toBe('');
    expect(registry.read).not.toHaveBeenCalled();
  });

  it('throws ContextAssemblyError when consent denied for required provider', async () => {
    consentStore.isGranted.mockReturnValue(false);
    consentRequest.request.mockResolvedValue({ granted: false });
    await expect(
      service.assemble([makeReq({ provider: 'clipboard', required: true })], client, 'p', 't'),
    ).rejects.toThrow('Clipboard access denied by user');
  });

  it('grants consent to ConsentStore when user approves', async () => {
    consentStore.isGranted.mockReturnValue(false);
    consentRequest.request.mockResolvedValue({ granted: true, scope: 'session' });
    registry.read.mockResolvedValue(makePayload('clipboard', 'hello'));
    await service.assemble([makeReq({ provider: 'clipboard' })], client, 'pack-1', 't');
    expect(consentStore.grant).toHaveBeenCalledWith('pack-1', 'clipboard', 'session');
  });

  it('does not call consentRequest when already granted', async () => {
    consentStore.isGranted.mockReturnValue(true);
    registry.read.mockResolvedValue(makePayload('clipboard', 'hello'));
    await service.assemble([makeReq({ provider: 'clipboard' })], client, 'p', 't');
    expect(consentRequest.request).not.toHaveBeenCalled();
  });

  it('truncates content to maxBytes and appends [truncated]', async () => {
    registry.read.mockResolvedValue(makePayload('clipboard', 'a'.repeat(200)));
    const result = await service.assemble(
      [makeReq({ provider: 'clipboard', maxBytes: 50 })],
      client, 'p', 't',
    );
    expect(result).toContain('[truncated]');
    const content = result.replace('### Clipboard\n', '').replace('\n[truncated]', '');
    expect(Buffer.byteLength(content, 'utf8')).toBeLessThanOrEqual(50);
  });
});
