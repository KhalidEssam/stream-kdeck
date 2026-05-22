import { Test } from '@nestjs/testing';
import { PackRegistryService } from '../src/packs/pack-registry.service';

const mockTool = {
  id: 'tool-uuid-1',
  pack_id: 'pack-uuid-1',
  label: 'Explain Error',
  prompt: 'Explain this error.',
  output_mode: 'viewer',
  source: 'clipboard',
  icon: 'ai',
  color: '#2D1B69',
  order: 1,
  phase: 1,
  builtin_id: 'builtin-ai-explain',
};

const mockPack = {
  id: 'pack-uuid-1',
  slug: 'engineer',
  name: 'Engineer',
  description: 'For developers',
  icon: '⚙️',
  color: '#1B2631',
  order: 1,
  pack_tools: [mockTool],
};

const mockPhase2Tool = {
  id: 'tool-uuid-2',
  pack_id: 'pack-uuid-1',
  label: 'Generate Commit Msg',
  prompt: 'Generate a commit message.',
  output_mode: 'clipboard',
  source: 'clipboard',
  icon: 'ai',
  color: null,
  order: 7,
  phase: 2,
  builtin_id: null,
};

let mockSupabaseData: any[] = [mockPack];
let mockSupabaseError: object | null = null;

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        lte: jest.fn().mockResolvedValue({ data: mockSupabaseData, error: mockSupabaseError }),
      })),
    })),
  })),
}));

describe('PackRegistryService', () => {
  let service: PackRegistryService;

  beforeEach(async () => {
    mockSupabaseData = [mockPack];
    mockSupabaseError = null;
    const moduleRef = await Test.createTestingModule({
      providers: [PackRegistryService],
    }).compile();
    service = moduleRef.get(PackRegistryService);
  });

  it('loads packs from Supabase on load()', async () => {
    await service.load();
    const packs = service.getPacks();
    expect(packs).toHaveLength(1);
    expect(packs[0].slug).toBe('engineer');
    expect(packs[0].tools).toHaveLength(1);
    expect(packs[0].tools[0].label).toBe('Explain Error');
  });

  it('getById returns the correct tool after load()', async () => {
    await service.load();
    const tool = service.getById('tool-uuid-1');
    expect(tool).toBeDefined();
    expect(tool!.kind).toBe('ai');
    if (tool?.kind === 'ai') {
      expect(tool.prompt).toBe('Explain this error.');
    }
    expect(tool!.outputMode).toBe('viewer');
  });

  it('getById returns undefined for unknown toolId', async () => {
    await service.load();
    expect(service.getById('not-a-real-id')).toBeUndefined();
  });

  it('filters out phase-2 tools (agentCapability = 1)', async () => {
    mockSupabaseData = [{ ...mockPack, pack_tools: [mockTool, mockPhase2Tool] }];
    await service.load();
    const packs = service.getPacks();
    expect(packs[0].tools).toHaveLength(1);
    expect(packs[0].tools[0].label).toBe('Explain Error');
  });

  it('getPacks returns empty array before load()', () => {
    expect(service.getPacks()).toEqual([]);
  });

  it('does not throw if Supabase returns an error — logs and returns empty', async () => {
    mockSupabaseError = { message: 'network error' };
    mockSupabaseData = [];
    await expect(service.load()).resolves.not.toThrow();
    expect(service.getPacks()).toEqual([]);
  });
});
