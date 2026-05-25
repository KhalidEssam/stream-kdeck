import { ContextAssemblerService, ContextAssemblyError } from './context-assembler.service';
import { ContextRegistryService } from './context-registry.service';
import { ConsentStoreService } from './consent-store.service';
import { ConsentRequestService } from './consent-request.service';
import { ToolContextRequirement } from '@control-surface/shared';
import { ContextEvaluatorService } from './context-evaluator.service';

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
  let evaluator: jest.Mocked<Pick<ContextEvaluatorService, 'evaluate' | 'domainForPackSlug'>>;
  const client = {} as any;

  beforeEach(() => {
    registry = { read: jest.fn() };
    consentStore = { isGranted: jest.fn().mockReturnValue(true), grant: jest.fn() };
    consentRequest = { request: jest.fn() };
    evaluator = {
      evaluate: jest.fn().mockReturnValue({ decision: 'accepted' }),
      domainForPackSlug: jest.fn().mockReturnValue('unknown'),
    };
    service = new ContextAssemblerService(
      registry as any,
      consentStore as any,
      consentRequest as any,
      evaluator as any,
    );
  });

  it('returns empty string for empty requirements', async () => {
    expect(await service.assemble([], client, 'p', 't')).toBe('');
  });

  it('skips user_input requirements without throwing', async () => {
    const result = await service.assemble(
      [{ provider: 'user_input', required: true, reason: 'intent' }],
      client, 'p', 't',
    );
    expect(result).toBe('');
    expect(registry.read).not.toHaveBeenCalled();
  });

  it('prepends User Intent section when userIntent is provided', async () => {
    registry.read.mockResolvedValue(makePayload('clipboard', 'some code'));
    const result = await service.assemble(
      [makeReq({ provider: 'clipboard' })],
      client, 'p', 't',
      'explain this to me',
    );
    expect(result).toMatch(/^### User Intent\nexplain this to me/);
    expect(result).toContain('### Clipboard\nsome code');
  });

  it('returns only User Intent section when no inferred providers have content', async () => {
    const result = await service.assemble([], client, 'p', 't', 'what is up?');
    expect(result).toBe('### User Intent\nwhat is up?');
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

  it('puts required provider before optional provider in output', async () => {
    registry.read
      .mockResolvedValueOnce(makePayload('git', 'branch: main'))
      .mockResolvedValueOnce(makePayload('clipboard', 'some code'));
    const result = await service.assemble(
      [
        makeReq({ provider: 'git', required: false }),
        makeReq({ provider: 'clipboard', required: true }),
      ],
      client, 'p', 't',
    );
    const clipPos = result.indexOf('### Clipboard');
    const gitPos = result.indexOf('### Git');
    expect(clipPos).toBeLessThan(gitPos);
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

  it('does not call grant when consent approved without scope', async () => {
    consentStore.isGranted.mockReturnValue(false);
    consentRequest.request.mockResolvedValue({ granted: true });
    registry.read.mockResolvedValue(makePayload('clipboard', 'hello'));
    await service.assemble([makeReq({ provider: 'clipboard' })], client, 'pack-1', 't');
    expect(consentStore.grant).not.toHaveBeenCalled();
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

  it('truncates multibyte content to maxBytes by bytes not chars', async () => {
    // Each Japanese char = 3 bytes in UTF-8
    const japanese = '日'.repeat(30); // 90 bytes
    registry.read.mockResolvedValue(makePayload('clipboard', japanese));
    const result = await service.assemble(
      [makeReq({ provider: 'clipboard', maxBytes: 20 })],
      client, 'p', 't',
    );
    expect(result).toContain('[truncated]');
    const raw = result.replace('### Clipboard\n', '').replace('\n[truncated]', '');
    expect(Buffer.byteLength(raw, 'utf8')).toBeLessThanOrEqual(20);
  });

  it('throws ContextAssemblyError when required provider throws', async () => {
    registry.read.mockRejectedValue(new Error('git not found'));
    await expect(
      service.assemble([makeReq({ provider: 'git', required: true })], client, 'p', 't'),
    ).rejects.toThrow(ContextAssemblyError);
  });

  it('skips optional provider when it throws', async () => {
    registry.read.mockRejectedValue(new Error('fs error'));
    const result = await service.assemble(
      [makeReq({ provider: 'git', required: false })],
      client, 'p', 't',
    );
    expect(result).toBe('');
  });

  it('skips optional provider when evaluator rejects it', async () => {
    registry.read.mockResolvedValue(makePayload('clipboard', 'function doThing() {}'));
    evaluator.domainForPackSlug.mockReturnValue('gaming');
    evaluator.evaluate.mockReturnValue({ decision: 'rejected', reason: 'domain_mismatch:software_vs_gaming' });
    const result = await service.assemble(
      [makeReq({ provider: 'clipboard', required: false })],
      client, 'p', 't', undefined, 'gamer',
    );
    expect(result).toBe('');
  });

  it('does not reject required providers even when evaluator would reject', async () => {
    registry.read.mockResolvedValue(makePayload('clipboard', 'function doThing() {}'));
    evaluator.domainForPackSlug.mockReturnValue('gaming');
    evaluator.evaluate.mockReturnValue({ decision: 'rejected', reason: 'domain_mismatch:software_vs_gaming' });
    const result = await service.assemble(
      [makeReq({ provider: 'clipboard', required: true })],
      client, 'p', 't', undefined, 'gamer',
    );
    expect(result).toContain('### Clipboard');
  });
});
